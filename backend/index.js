/* ============================================================
   TABORA API — Cloudflare Worker + D1
   Auth / Profiles / Friends / Chat / Prices
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
function err(message, status = 400) { return json({ error: message }, status); }

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function rid() { return crypto.randomUUID(); }
function newToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNAME_RE = /^[a-z0-9_.]{3,20}$/;

/* ---------- rate limit (best effort, in-memory) ---------- */
const RL = new Map();
function rateLimit(ip, key, max, windowMs) {
  const now = Date.now();
  const k = ip + ':' + key;
  const e = RL.get(k) || { t: now, c: 0 };
  if (now - e.t > windowMs) { e.t = now; e.c = 0; }
  e.c++;
  RL.set(k, e);
  return e.c <= max;
}

/* ---------- helpers ---------- */
async function body(req) {
  try { return await req.json(); } catch { return {}; }
}
async function kvGet(db, key) {
  const r = await db.prepare('SELECT value FROM kv WHERE key=?').bind(key).first();
  return r ? r.value : null;
}
async function kvSet(db, key, value) {
  await db.prepare('CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT)').run();
  await db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, String(value)).run();
}
function publicUser(u) {
  if (!u) return null;
  const { pass, ...rest } = u;
  return rest;
}
async function sessionUser(db, req) {
  const h = req.headers.get('Authorization') || '';
  const t = h.replace(/^Bearer\s+/i, '').trim();
  if (!t) return null;
  const s = await db.prepare('SELECT user_id, expires FROM sessions WHERE token=?').bind(t).first();
  if (!s) return null;
  if (s.expires < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token=?').bind(t).run();
    return null;
  }
  const u = await db.prepare('SELECT * FROM users WHERE id=?').bind(s.user_id).first();
  if (u) u._token = t;
  return u || null;
}

/* ---------- prices (tgju mirror, cached 5 min) ---------- */
let PRICE_CACHE = { t: 0, data: null };
async function getPrices() {
  if (PRICE_CACHE.data && Date.now() - PRICE_CACHE.t < 300000) return PRICE_CACHE.data;
  const wanted = {
    price_dollar_rl: 'دلار آمریکا',
    price_eur: 'یورو',
    price_gbp: 'پوند انگلیس',
    price_aed: 'درهم امارات',
    price_try: 'لیر ترکیه',
    price_chf: 'فرانک سوئیس',
    price_cny: 'یوان چین',
    price_jpy: 'ین ژاپن (۱۰۰ ین)'
  };
  const goldWanted = {
    price_gold_18: 'طلای ۱۸ عیار (گرم)',
    price_coin_new: 'سکه امامی',
    price_half_coin: 'نیم سکه',
    price_quarter_coin: 'ربع سکه'
  };
  const items = [];
  try {
    const r1 = await fetch('https://tgju.amirhossein.info/api/price/currency');
    const cur = await r1.json();
    for (const c of cur) {
      if (!wanted[c.key]) continue;
      const rial = parseInt(String(c.price).replace(/[^0-9]/g, ''), 10);
      if (!rial) continue;
      items.push({
        key: c.key, title: wanted[c.key],
        toman: Math.round(rial / 10),
        low: Math.round(parseInt(String(c.low_price).replace(/[^0-9]/g, '') || 0, 10) / 10),
        high: Math.round(parseInt(String(c.high_price).replace(/[^0-9]/g, '') || 0, 10) / 10),
        status: c.status
      });
    }
  } catch (e) { /* source down */ }
  try {
    const r2 = await fetch('https://tgju.amirhossein.info/api/price/gold');
    const gold = await r2.json();
    for (const g of gold) {
      if (!goldWanted[g.key]) continue;
      const rial = parseInt(String(g.price).replace(/[^0-9]/g, ''), 10);
      if (!rial) continue;
      items.push({ key: g.key, title: goldWanted[g.key], toman: rial, status: g.status });
    }
  } catch (e) { /* ignore */ }
  const data = { ts: Date.now(), items };
  if (items.length) PRICE_CACHE = { t: Date.now(), data };
  return data;
}

/* ============================================================ */
const PANEL_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tabora Admin Panel</title>
<style>
*{box-sizing:border-box;margin:0;font-family:Vazirmatn,Segoe UI,Tahoma,sans-serif}
body{min-height:100vh;background:#070b1c;color:#e8ecff;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;background:
 radial-gradient(60% 40% at 15% 10%,rgba(34,211,238,.14),transparent 60%),
 radial-gradient(50% 40% at 85% 20%,rgba(139,92,246,.16),transparent 60%),
 radial-gradient(60% 50% at 50% 100%,rgba(244,114,182,.10),transparent 60%);pointer-events:none}
.wrap{max-width:1060px;margin:0 auto;padding:26px 18px 60px;position:relative}
.hd{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.hd .lg{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:1.2rem;background:linear-gradient(135deg,#22d3ee,#8b5cf6,#f472b6);color:#fff;box-shadow:0 4px 22px rgba(139,92,246,.5)}
.hd h1{font-size:1.15rem}
.hd small{opacity:.55;display:block;font-size:.7rem}
.hd .out{margin-inline-start:auto}
.card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:18px;backdrop-filter:blur(10px);margin-bottom:16px}
h2{font-size:.95rem;margin-bottom:12px;opacity:.9}
.lbl{font-size:.72rem;opacity:.6;display:block;margin:10px 0 5px}
input,select,textarea{width:100%;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);color:#e8ecff;border-radius:12px;padding:10px 12px;font-size:.85rem;font-family:inherit}
input:focus,textarea:focus{outline:none;border-color:#22d3ee}
.btn{border:none;cursor:pointer;border-radius:12px;padding:10px 16px;font-size:.82rem;font-family:inherit;color:#fff;background:linear-gradient(135deg,#22d3ee,#8b5cf6);transition:.2s}
.btn:hover{filter:brightness(1.15)}
.btn.gray{background:rgba(255,255,255,.1)}
.btn.red{background:linear-gradient(135deg,#f43f5e,#b91c1c)}
.btn.sm{padding:6px 10px;font-size:.72rem;border-radius:9px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.stat{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:14px;text-align:center}
.stat b{font-size:1.5rem;display:block;background:linear-gradient(135deg,#22d3ee,#f472b6);-webkit-background-clip:text;background-clip:text;color:transparent}
.stat span{font-size:.7rem;opacity:.6}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.tabs button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e8ecff;border-radius:999px;padding:8px 16px;cursor:pointer;font-size:.8rem;font-family:inherit}
.tabs button.on{background:linear-gradient(135deg,#22d3ee,#8b5cf6);border-color:transparent}
table{width:100%;border-collapse:collapse;font-size:.78rem}
th,td{padding:9px 8px;text-align:right;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:middle}
th{opacity:.55;font-size:.68rem}
.badge{border-radius:999px;padding:3px 10px;font-size:.66rem}
.b-owner{background:rgba(250,204,21,.18);color:#fde047}
.b-admin{background:rgba(34,211,238,.15);color:#67e8f9}
.b-user{background:rgba(255,255,255,.08);color:#cbd5e1}
.msg{border-radius:12px;padding:10px 14px;font-size:.8rem;margin:10px 0;display:none}
.msg.ok{display:block;background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.3)}
.msg.er{display:block;background:rgba(244,63,94,.12);color:#fda4af;border:1px solid rgba(244,63,94,.3)}
pre{background:rgba(0,0,0,.4);border-radius:12px;padding:12px;font-size:.7rem;overflow:auto;max-height:300px;direction:ltr;text-align:left}
.loginbox{max-width:380px;margin:12vh auto;text-align:center}
.loginbox .lg{width:70px;height:70px;font-size:2rem;margin:0 auto 16px;border-radius:20px}
.bar{height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin:10px 0}
.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#22d3ee,#8b5cf6);transition:width .2s}
.hide{display:none}
</style>
</head>
<body>
<div class="wrap">
<div id="login" class="loginbox">
  <div class="lg">T</div>
  <h1 style="margin-bottom:6px">پنل مدیریت تبورا</h1>
  <p style="font-size:.75rem;opacity:.6;margin-bottom:18px">Tabora Admin Panel — دسترسی فقط با کلید ادمین</p>
  <div class="card" style="text-align:right">
    <span class="lbl">کلید ادمین (ADMIN_KEY)</span>
    <input id="key" type="password" placeholder="••••••••••••••••" dir="ltr">
    <div class="msg" id="lmsg"></div>
    <button class="btn" style="width:100%;margin-top:12px" onclick="doLogin()">ورود به پنل 🔐</button>
  </div>
</div>
<div id="app" class="hide">
  <div class="hd">
    <div class="lg">T</div>
    <div><h1>پنل مدیریت تبورا</h1><small id="who">admin</small></div>
    <button class="btn gray sm out" onclick="logout()">خروج ↩</button>
  </div>
  <div class="tabs">
    <button class="on" onclick="tab('dash',this)">📊 نمای کلی</button>
    <button onclick="tab('users',this)">👥 کاربران</button>
    <button onclick="tab('release',this)"> انتشار</button>
    <button onclick="tab('ann',this)">📢 اطلاعیه</button>
    <button onclick="tab('danger',this)">⚠️ منطقه خطر</button>
  </div>
  <div class="msg" id="msg"></div>

  <div id="v-dash">
    <div class="grid" id="stats"></div>
    <div class="card" style="margin-top:14px">
      <h2>🔗 دسترسی سریع</h2>
      <div class="row">
        <a class="btn sm gray" target="_blank" href="/api/ping">/api/ping</a>
        <a class="btn sm gray" target="_blank" href="/api/prices">/api/prices</a>
        <a class="btn sm gray" target="_blank" href="/download?info=1">/download info</a>
        <a class="btn sm gray" target="_blank" href="/api/announce">/api/announce</a>
      </div>
    </div>
  </div>

  <div id="v-users" class="hide">
    <div class="card"><h2>👥 مدیریت کاربران</h2><div style="overflow-x:auto"><table id="utable">
      <tr><th>کاربر</th><th>ایمیل</th><th>نقش</th><th>تاریخ</th><th>عملیات</th></tr>
    </table></div></div>
    <div class="card hide" id="udetail"><h2>🔎 جزئیات کاربر</h2><pre id="upre"></pre></div>
  </div>

  <div id="v-release" class="hide">
    <div class="card"><h2>📦 منبع دانلود فعلی</h2>
      <pre id="relinfo"></pre>
      <span class="lbl">جایگزینی URL دانلود (اختیاری — خالی یعنی گیت‌هاب)</span>
      <div class="row">
        <input id="ovurl" dir="ltr" placeholder="https://…/custom.zip">
        <button class="btn sm" onclick="saveOv()">ذخیره</button>
        <button class="btn sm gray" onclick="clearOv()">حذف جایگزینی</button>
      </div>
    </div>
    <div class="card"><h2>⬆️ آپلود مستقیم زیپ در D1 (پشتیبان /download?direct=1)</h2>
      <input type="file" id="zipfile" accept=".zip">
      <div class="bar"><i id="prog"></i></div>
      <div class="row"><button class="btn" onclick="uploadZip()">آپلود زیپ پشتیبان</button><span id="uptxt" style="font-size:.72rem;opacity:.6"></span></div>
    </div>
  </div>

  <div id="v-ann" class="hide">
    <div class="card"><h2>📢 اطلاعیه به همه کاربران اکستنشن</h2>
      <span class="lbl">متن اطلاعیه (خالی = غیرفعال)</span>
      <textarea id="anntxt" rows="3" placeholder="مثلاً: نسخه ۱.۰.۸ منتشر شد! از منوی پشتیبانی آپدیت کنید 💜"></textarea>
      <span class="lbl">سطح</span>
      <select id="annlvl"><option value="info">info — عادی</option><option value="warn">warn — مهم</option><option value="gold">gold — ویژه</option></select>
      <div class="row" style="margin-top:12px">
        <button class="btn" onclick="saveAnn()">انتشار اطلاعیه 📢</button>
        <button class="btn gray" onclick="clearAnn()">حذف اطلاعیه</button>
      </div>
    </div>
  </div>

  <div id="v-danger" class="hide">
    <div class="card"><h2>⚠️ منطقه خطر</h2>
      <div class="row">
        <button class="btn red" onclick="purgeSessions()">🔥 باطل‌کردن همه نشست‌ها</button>
        <button class="btn red" onclick="resetUsers()">☠️ حذف همه کاربران</button>
      </div>
      <p style="font-size:.7rem;opacity:.5;margin-top:10px">هر دو عمل غیرقابل بازگشت‌اند و بلافاصله روی همه کاربران اثر می‌گذارند.</p>
    </div>
  </div>
</div>
</div>
<script>
function K(){return sessionStorage.getItem('tk')||'';}
function msg(t,ok){var m=document.getElementById('msg');m.className='msg '+(ok?'ok':'er');m.textContent=t;if(ok)setTimeout(function(){m.className='msg';},4000);}
function api(path,body){return fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-admin-key':K()},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||r.status);return d;});});}
function doLogin(){var k=document.getElementById('key').value.trim();if(!k)return;sessionStorage.setItem('tk',k);api('/admin/stats').then(function(){enter();}).catch(function(e){var m=document.getElementById('lmsg');m.className='msg er';m.textContent='کلید اشتباه است: '+e.message;sessionStorage.removeItem('tk');});}
function logout(){sessionStorage.removeItem('tk');location.reload();}
function enter(){document.getElementById('login').classList.add('hide');document.getElementById('app').classList.remove('hide');loadDash();}
function tab(id,btn){['dash','users','release','ann','danger'].forEach(function(t){document.getElementById('v-'+t).classList.toggle('hide',t!==id);});document.querySelectorAll('.tabs button').forEach(function(b){b.classList.remove('on');});btn.classList.add('on');if(id==='dash')loadDash();if(id==='users')loadUsers();if(id==='release')loadRel();if(id==='ann')loadAnn();}
function loadDash(){api('/admin/stats').then(function(s){document.getElementById('stats').innerHTML='<div class="stat"><b>'+s.users+'</b><span>کاربران</span></div><div class="stat"><b>'+s.staff+'</b><span>Owner/Admin</span></div><div class="stat"><b>'+s.sessions+'</b><span>نشست فعال</span></div><div class="stat"><b>'+(s.d1_file?'✔':'—')+'</b><span>زیپ D1</span></div>';});}
var USERS=[];
function loadUsers(){api('/admin/users').then(function(d){USERS=d.users;var t=document.getElementById('utable');t.innerHTML='<tr><th>کاربر</th><th>ایمیل</th><th>نقش</th><th>تاریخ</th><th>عملیات</th></tr>';USERS.forEach(function(u){var tr=document.createElement('tr');tr.innerHTML='<td><b>'+u.username+'</b><br><span style="opacity:.5;font-size:.66rem">'+u.name+'</span></td><td dir="ltr" style="text-align:right">'+u.email+'</td><td><span class="badge b-'+u.role+'">'+u.role+'</span></td><td style="font-size:.66rem;opacity:.6">'+new Date(u.created_at).toLocaleDateString('fa-IR')+'</td><td><select onchange="setRole(\\''+u.username+'\\',this.value)" style="width:auto;padding:4px 8px;font-size:.7rem"><option'+(u.role==='user'?' selected':'')+'>user</option><option'+(u.role==='admin'?' selected':'')+'>admin</option><option'+(u.role==='owner'?' selected':'')+'>owner</option></select> <button class="btn sm gray" onclick="setPass(\\''+u.username+'\\')">🔑</button> <button class="btn sm gray" onclick="viewU(\\''+u.username+'\\')">👁</button> <button class="btn sm red" onclick="delU(\\''+u.username+'\\')">🗑</button></td>';t.appendChild(tr);});});}
function setRole(u,r){api('/admin/role',{username:u,role:r}).then(function(){msg('نقش '+u+' → '+r,true);loadUsers();}).catch(function(e){msg(e.message);});}
function setPass(u){var pw=prompt('رمز جدید برای '+u+' (حداقل ۶ کاراکتر):');if(!pw)return;api('/admin/set-pass',{username:u,password:pw}).then(function(){msg('رمز '+u+' تغییر کرد 🔑',true);}).catch(function(e){msg(e.message);});}
function delU(u){if(!confirm('کاربر '+u+' برای همیشه حذف شود؟'))return;api('/admin/del-user',{username:u}).then(function(){msg(u+' حذف شد',true);loadUsers();}).catch(function(e){msg(e.message);});}
function viewU(u){var x=USERS.filter(function(i){return i.username===u;})[0];if(!x)return;var d=document.getElementById('udetail');d.classList.remove('hide');document.getElementById('upre').textContent=JSON.stringify(x,null,2);d.scrollIntoView({behavior:'smooth'});}
function loadRel(){fetch('/download?info=1').then(function(r){return r.json();}).then(function(d){document.getElementById('relinfo').textContent=JSON.stringify(d,null,2);});api('/admin/settings').then(function(s){document.getElementById('ovurl').value=s.settings.download_url||'';});}
function saveOv(){api('/admin/settings',{settings:{download_url:document.getElementById('ovurl').value.trim()||null}}).then(function(){msg('منبع دانلود ذخیره شد 📦',true);loadRel();}).catch(function(e){msg(e.message);});}
function clearOv(){api('/admin/settings',{settings:{download_url:null}}).then(function(){msg('جایگزینی حذف شد — گیت‌هاب',true);loadRel();}).catch(function(e){msg(e.message);});}
function uploadZip(){var f=document.getElementById('zipfile').files[0];if(!f)return msg('اول فایل زیپ را انتخاب کن');var rd=new FileReader();rd.onload=function(){var b64=rd.result.split(',')[1];var CH=500000;document.getElementById('uptxt').textContent='در حال آپلود…';api('/admin/file',{reset:true}).then(function(){var i=0,ord=0;function next(){if(i>=b64.length){document.getElementById('uptxt').textContent='✔ آپلود کامل شد ('+f.name+')';document.getElementById('prog').style.width='100%';return;}var chunk=b64.substr(i,CH);i+=CH;api('/admin/file',{name:f.name,startOrd:ord,chunks:[chunk]}).then(function(){ord++;document.getElementById('prog').style.width=Math.min(100,Math.round(i/b64.length*100))+'%';next();}).catch(function(e){msg(e.message);});}next();}).catch(function(e){msg(e.message);});};rd.readAsDataURL(f);}
function loadAnn(){api('/admin/settings').then(function(s){document.getElementById('anntxt').value=s.settings.announce_text||'';document.getElementById('annlvl').value=s.settings.announce_level||'info';});}
function saveAnn(){api('/admin/settings',{settings:{announce_text:document.getElementById('anntxt').value.trim()||null,announce_level:document.getElementById('annlvl').value}}).then(function(){msg('اطلاعیه منتشر شد 📢',true);}).catch(function(e){msg(e.message);});}
function clearAnn(){api('/admin/settings',{settings:{announce_text:null}}).then(function(){msg('اطلاعیه حذف شد',true);loadAnn();}).catch(function(e){msg(e.message);});}
function purgeSessions(){if(!confirm('همه نشست‌ها باطل شود؟ همه کاربران باید دوباره وارد شوند.'))return;api('/admin/purge-sessions',{ }).then(function(){msg('نشست‌ها باطل شد 🔥',true);loadDash();}).catch(function(e){msg(e.message);});}
function resetUsers(){if(!confirm('همه کاربران حذف شوند؟ این عمل غیرقابل بازگشت است!'))return;api('/admin/reset-users',{ }).then(function(){msg('همه کاربران حذف شدند ☠️',true);loadUsers();}).catch(function(e){msg(e.message);});}
if(K()){api('/admin/stats').then(enter).catch(function(){});}
</script>
</body>
</html>`;

/* ============================================================ */
async function handle(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const p = url.pathname;
  const db = env.DB;

  /* ---------- admin panel UI ---------- */
  if (p === '/Taaborapanel' || p === '/Taaborapanel/') {
    return new Response(PANEL_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';

  try {
    /* ---------- ping ---------- */
    if (p === '/api/ping') return json({ ok: true, service: 'tabora-api', time: Date.now() });

    /* ---------- download latest build ---------- */
    if (p === '/download') {
      /* primary: admin override URL, else newest public GitHub release asset (stable URL, always latest) */
      const override = await kvGet(db, 'download_url');
      const ghUrl = override || 'https://github.com/Taboraex/tabora/releases/latest/download/tabora-protected.zip';
      if (url.searchParams.get('info') === '1') return json({ source: override ? 'admin-override' : 'github-latest', url: ghUrl });
      if (url.searchParams.get('direct') !== '1') return Response.redirect(ghUrl, 302);
      /* fallback: copy stored in D1 */
      if (url.searchParams.get('info') === '1') {
        const meta = await db.prepare("SELECT name, COUNT(*) AS chunks FROM files WHERE key='latest' GROUP BY name").first();
        return json(meta ? { source: 'd1', file: meta.name, chunks: meta.chunks } : { file: null });
      }
      const rows = await db.prepare("SELECT name, data FROM files WHERE key='latest' ORDER BY ord ASC").all();
      if (!rows.results || !rows.results.length) return err('no_file_uploaded_yet', 404);
      let bin = '';
      for (const r2 of rows.results) bin += r2.data;
      const bytes = Uint8Array.from(atob(bin), c => c.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          ...CORS,
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="' + rows.results[0].name + '"',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    /* ---------- internal admin (key-gated) ---------- */
    const adminKey = env.ADMIN_KEY || '';
    const hasKey = adminKey && req.headers.get('x-admin-key') === adminKey;

    if (p === '/admin/migrate' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      await db.prepare('CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, name TEXT, ord INTEGER, data TEXT)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_files ON files(key, ord)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT)').run();
      return json({ ok: true });
    }
    if (p === '/admin/file' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      if (b.reset) await db.prepare("DELETE FROM files WHERE key='latest'").run();
      if (Array.isArray(b.chunks)) {
        for (let i = 0; i < b.chunks.length; i++) {
          await db.prepare("INSERT INTO files(key,name,ord,data) VALUES('latest',?,?,?)").bind(String(b.name || 'tabora.zip'), (b.startOrd || 0) + i, b.chunks[i]).run();
        }
      }
      return json({ ok: true });
    }
    if (p === '/admin/set-pass' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      const uname = String(b.username || '').toLowerCase().trim();
      const password = String(b.password || '');
      if (password.length < 6) return err('bad_password');
      const u = await db.prepare('SELECT id FROM users WHERE username=? OR email=?').bind(uname, uname).first();
      if (!u) return err('user_not_found', 404);
      const salt = rid();
      const hash = salt + ':' + await sha256(salt + '::' + password);
      await db.prepare('UPDATE users SET pass=? WHERE id=?').bind(hash, u.id).run();
      return json({ ok: true });
    }

    if (p === '/admin/stats' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      const users = await db.prepare('SELECT COUNT(*) AS c FROM users').first();
      const staff = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role IN ('owner','admin')").first();
      const sess = await db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE expires > ?').bind(Date.now()).first();
      const files = await db.prepare("SELECT COUNT(*) AS c, MAX(name) AS n FROM files WHERE key='latest'").first();
      return json({ users: users.c, staff: staff.c, sessions: sess.c, d1_file: files.n || null, time: Date.now() });
    }

    if (p === '/admin/users' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      const rows = await db.prepare('SELECT id,email,username,name,role,avatar_kind,settings,bookmarks,created_at FROM users ORDER BY created_at ASC').all();
      return json({ users: rows.results || [] });
    }

    if (p === '/admin/role' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      const role = String(b.role || '');
      if (!['user', 'admin', 'owner'].includes(role)) return err('bad_role');
      const r = await db.prepare('UPDATE users SET role=? WHERE username=? OR email=?').bind(role, String(b.username || '').toLowerCase(), String(b.username || '').toLowerCase()).run();
      return json({ ok: true, changed: r.meta && r.meta.changes });
    }

    if (p === '/admin/del-user' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      const u = await db.prepare('SELECT id FROM users WHERE username=? OR email=?').bind(String(b.username || '').toLowerCase(), String(b.username || '').toLowerCase()).first();
      if (!u) return err('user_not_found', 404);
      await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
      await db.prepare('DELETE FROM users WHERE id=?').bind(u.id).run();
      return json({ ok: true });
    }

    if (p === '/admin/purge-sessions' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      await db.prepare('DELETE FROM sessions').run();
      return json({ ok: true });
    }

    if (p === '/admin/settings' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      let s = {};
      try { s = JSON.parse((await kvGet(db, 'settings')) || '{}'); } catch (e) { }
      return json({ settings: s });
    }

    if (p === '/admin/settings' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      let s = {};
      try { s = JSON.parse((await kvGet(db, 'settings')) || '{}'); } catch (e) { }
      if (b.settings && typeof b.settings === 'object') {
        for (const k in b.settings) {
          if (b.settings[k] === null || b.settings[k] === '') delete s[k]; else s[k] = b.settings[k];
        }
      }
      await kvSet(db, 'settings', JSON.stringify(s));
      return json({ ok: true, settings: s });
    }

    if (p === '/admin/reset-users' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      await db.prepare('DELETE FROM messages').run();
      await db.prepare('DELETE FROM friends').run();
      await db.prepare('DELETE FROM sessions').run();
      await db.prepare('DELETE FROM users').run();
      return json({ ok: true });
    }

    /* ---------- prices ---------- */
    if (p === '/api/prices') return json(await getPrices());

    /* ---------- public announcement (set from admin panel) ---------- */
    if (p === '/api/announce') {
      let s = {};
      try { s = JSON.parse((await kvGet(db, 'settings')) || '{}'); } catch (e) { }
      return json({ text: String(s.announce_text || ''), level: String(s.announce_level || 'info') });
    }

    /* ---------- register ---------- */
    if (p === '/api/register' && req.method === 'POST') {
      if (!rateLimit(ip, 'reg', 8, 3600000)) return err('rate_limited', 429);
      const b = await body(req);
      const email = String(b.email || '').toLowerCase().trim();
      const username = String(b.username || '').toLowerCase().trim();
      const password = String(b.password || '');
      const name = String(b.name || '').slice(0, 40);
      if (!EMAIL_RE.test(email)) return err('bad_email');
      if (!UNAME_RE.test(username)) return err('bad_username');
      if (password.length < 6) return err('bad_password');
      const ex1 = await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
      if (ex1) return err('email_taken');
      const ex2 = await db.prepare('SELECT id FROM users WHERE username=?').bind(username).first();
      if (ex2) return err('username_taken');
      const cnt = await db.prepare('SELECT COUNT(*) AS c FROM users').first();
      let role = 'user';
      const ownerEmail = String(env.OWNER_EMAIL || '').toLowerCase();
      if ((cnt && cnt.c === 0) || (ownerEmail && email === ownerEmail)) role = 'owner';
      const id = rid();
      const salt = rid();
      const hash = salt + ':' + await sha256(salt + '::' + password);
      await db.prepare(
        'INSERT INTO users(id,email,username,pass,name,bio,avatar,avatar_kind,role,settings,bookmarks,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(id, email, username, hash, name || username, '', '', 'none', role, '{}', '[]', Date.now()).run();
      const token = newToken();
      await db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)')
        .bind(token, id, Date.now() + 90 * 86400000).run();
      const u = await db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
      return json({ token, user: publicUser(u) });
    }

    /* ---------- login ---------- */
    if (p === '/api/login' && req.method === 'POST') {
      if (!rateLimit(ip, 'login', 20, 3600000)) return err('rate_limited', 429);
      const b = await body(req);
      const idf = String(b.identifier || b.email || '').toLowerCase().trim();
      const password = String(b.password || '');
      const u = await db.prepare('SELECT * FROM users WHERE email=? OR username=?').bind(idf, idf).first();
      if (!u) return err('user_not_found', 404);
      const [salt, stored] = u.pass.split(':');
      const candidates = [
        await sha256(salt + '::' + password),
        await sha256(salt + ':' + password),
        await sha256(password + ':' + salt),
        await sha256(salt + password),
        await sha256(password + salt),
        await sha256(password)
      ];
      if (!candidates.includes(stored)) return err('invalid_credentials', 401);
      if (stored !== candidates[0]) {
        /* transparently upgrade legacy hashes to the current scheme */
        await db.prepare('UPDATE users SET pass=? WHERE id=?').bind(salt + ':' + candidates[0], u.id).run();
      }
      const token = newToken();
      await db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)')
        .bind(token, u.id, Date.now() + 90 * 86400000).run();
      return json({ token, user: publicUser(u) });
    }

    /* ---------- everything below needs auth ---------- */
    const me = await sessionUser(db, req);

    if (p === '/api/logout' && req.method === 'POST') {
      if (me) await db.prepare('DELETE FROM sessions WHERE token=?').bind(me._token).run();
      return json({ ok: true });
    }

    if (!me) return err('unauthorized', 401);

    if (p === '/api/me' && req.method === 'GET') return json({ user: publicUser(me) });

    /* ---------- update profile ---------- */
    if (p === '/api/me' && req.method === 'PATCH') {
      const b = await body(req);
      const upd = {};
      if (typeof b.name === 'string') upd.name = b.name.slice(0, 40);
      if (typeof b.bio === 'string') upd.bio = b.bio.slice(0, 200);
      if (typeof b.avatar === 'string') {
        if (b.avatar.length > 1500000) return err('avatar_too_large');
        upd.avatar = b.avatar;
      }
      if (typeof b.avatar_kind === 'string') upd.avatar_kind = b.avatar_kind.slice(0, 20);
      if (b.settings && typeof b.settings === 'object') upd.settings = JSON.stringify(b.settings).slice(0, 60000);
      if (Array.isArray(b.bookmarks)) {
        if (b.bookmarks.length > 10) return err('bookmarks_limit');
        upd.bookmarks = JSON.stringify(b.bookmarks).slice(0, 20000);
      }
      if (typeof b.username === 'string') {
        const un = b.username.toLowerCase().trim();
        if (!UNAME_RE.test(un)) return err('bad_username');
        const ex = await db.prepare('SELECT id FROM users WHERE username=? AND id!=?').bind(un, me.id).first();
        if (ex) return err('username_taken');
        upd.username = un;
      }
      const keys = Object.keys(upd);
      if (!keys.length) return json({ user: publicUser(me) });
      const set = keys.map(k => k + '=?').join(',');
      await db.prepare(`UPDATE users SET ${set} WHERE id=?`).bind(...keys.map(k => upd[k]), me.id).run();
      const u2 = await db.prepare('SELECT * FROM users WHERE id=?').bind(me.id).first();
      return json({ user: publicUser(u2) });
    }

    /* ---------- search users ---------- */
    if (p === '/api/users' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      if (!q) return json({ users: [] });
      const rows = await db.prepare(
        'SELECT id,email,username,name,bio,avatar,avatar_kind,role,created_at FROM users WHERE (username LIKE ? OR name LIKE ?) AND id!=? ORDER BY role DESC LIMIT 20'
      ).bind('%' + q + '%', '%' + q + '%', me.id).all();
      return json({ users: rows.results || [] });
    }

    /* ---------- friends ---------- */
    if (p === '/api/friends' && req.method === 'GET') {
      const acc = await db.prepare(
        `SELECT u.id,u.username,u.name,u.avatar,u.avatar_kind,u.role,u.bio FROM friends f JOIN users u
         ON u.id = CASE WHEN f.a=? THEN f.b ELSE f.a END
         WHERE (f.a=? OR f.b=?) AND f.status='accepted'`
      ).bind(me.id, me.id, me.id).all();
      const inc = await db.prepare(
        `SELECT u.id,u.username,u.name,u.avatar,u.avatar_kind,u.role FROM friends f JOIN users u ON u.id=f.a
         WHERE f.b=? AND f.status='pending'`
      ).bind(me.id).all();
      const out = await db.prepare(
        `SELECT u.id,u.username,u.name,u.avatar,u.avatar_kind,u.role FROM friends f JOIN users u ON u.id=f.b
         WHERE f.a=? AND f.status='pending'`
      ).bind(me.id).all();
      return json({ friends: acc.results || [], incoming: inc.results || [], outgoing: out.results || [] });
    }

    if (p === '/api/friend/request' && req.method === 'POST') {
      if (!rateLimit(ip, 'freq', 40, 3600000)) return err('rate_limited', 429);
      const b = await body(req);
      const uname = String(b.to_username || '').toLowerCase().trim();
      const target = await db.prepare('SELECT id FROM users WHERE username=?').bind(uname).first();
      if (!target) return err('user_not_found', 404);
      if (target.id === me.id) return err('self');
      const rev = await db.prepare("SELECT * FROM friends WHERE a=? AND b=? AND status='pending'").bind(target.id, me.id).first();
      if (rev) { // they already asked us → auto accept
        await db.prepare("UPDATE friends SET status='accepted' WHERE a=? AND b=?").bind(target.id, me.id).run();
        return json({ ok: true, accepted: true });
      }
      const dup = await db.prepare('SELECT * FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(me.id, target.id, target.id, me.id).first();
      if (dup) return err(dup.status === 'accepted' ? 'already_friends' : 'already_requested');
      await db.prepare("INSERT INTO friends(a,b,status,created_at) VALUES(?,?, 'pending', ?)").bind(me.id, target.id, Date.now()).run();
      return json({ ok: true });
    }

    if (p === '/api/friend/accept' && req.method === 'POST') {
      const b = await body(req);
      await db.prepare("UPDATE friends SET status='accepted' WHERE a=? AND b=? AND status='pending'").bind(String(b.from_id), me.id).run();
      return json({ ok: true });
    }
    if (p === '/api/friend/decline' && req.method === 'POST') {
      const b = await body(req);
      await db.prepare("DELETE FROM friends WHERE a=? AND b=? AND status='pending'").bind(String(b.from_id), me.id).run();
      return json({ ok: true });
    }
    if (p === '/api/friend/remove' && req.method === 'POST') {
      const b = await body(req);
      await db.prepare('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(me.id, String(b.user_id), String(b.user_id), me.id).run();
      return json({ ok: true });
    }

    /* ---------- chat ---------- */
    if (p === '/api/messages' && req.method === 'GET') {
      const withId = url.searchParams.get('with');
      const after = parseInt(url.searchParams.get('after') || '0', 10);
      const rows = await db.prepare(
        `SELECT * FROM messages
         WHERE ((sender=? AND receiver=?) OR (sender=? AND receiver=?)) AND id>?
         ORDER BY id ASC LIMIT 200`
      ).bind(me.id, withId, withId, me.id, after).all();
      return json({ messages: rows.results || [] });
    }

    if (p === '/api/messages' && req.method === 'POST') {
      const b = await body(req);
      const to = String(b.to || '');
      const kind = ['text', 'image', 'voice', 'gif', 'sticker'].includes(b.kind) ? b.kind : 'text';
      let content = String(b.content || '');
      if (kind === 'text' && content.length > 2000) return err('too_long');
      if (kind !== 'text' && content.length > 1200000) return err('media_too_large');
      if (!content) return err('empty');
      const fr = await db.prepare("SELECT * FROM friends WHERE ((a=? AND b=?) OR (a=? AND b=?)) AND status='accepted'").bind(me.id, to, to, me.id).first();
      if (!fr) return err('not_friends', 403);
      const r = await db.prepare('INSERT INTO messages(sender,receiver,kind,content,created_at) VALUES(?,?,?,?,?)')
        .bind(me.id, to, kind, content, Date.now()).run();
      return json({ ok: true, id: r.meta && r.meta.last_row_id });
    }

    /* ---------- owner: manage roles ---------- */
    if (p === '/api/role' && req.method === 'POST') {
      if (me.role !== 'owner') return err('forbidden', 403);
      const b = await body(req);
      const role = ['admin', 'user'].includes(b.role) ? b.role : 'user';
      await db.prepare('UPDATE users SET role=? WHERE id=? AND role!=?').bind(role, String(b.user_id), 'owner').run();
      return json({ ok: true });
    }

    return err('not_found', 404);
  } catch (e) {
    return err('server_error: ' + (e && e.message ? e.message : String(e)), 500);
  }
}

export default { fetch: handle };
