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
function genCode() {
  const a = rid().replace(/-/g, '').slice(0, 8).toUpperCase();
  return 'TBRA-' + a.slice(0, 4) + '-' + a.slice(4, 8);
}
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
async function ensureRecoveryCol(db) {
  try { await db.prepare('ALTER TABLE users ADD COLUMN recovery TEXT').run(); } catch (e) { /* exists */ }
}
async function ensureUserCols(db) {
  try { await db.prepare('ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0').run(); } catch (e) { /* exists */ }
  try { await db.prepare('ALTER TABLE users ADD COLUMN last_seen INTEGER DEFAULT 0').run(); } catch (e) { /* exists */ }
}
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
async function kvDel(db, key) {
  await db.prepare('DELETE FROM kv WHERE key=?').bind(key).run();
}
async function log(db, type, msg) {
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, type TEXT, msg TEXT)').run();
    await db.prepare('INSERT INTO logs(ts, type, msg) VALUES(?,?,?)').bind(Date.now(), String(type).slice(0, 24), String(msg).slice(0, 400)).run();
  } catch (e) { /* never break a request because of logging */ }
}
async function ghFetch(env, path, method, bodyObj) {
  const r = await fetch('https://api.github.com/repos/Taboraex/tabora/releases' + path, {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + (env.GITHUB_TOKEN || ''),
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'TaboraAdminPanel',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, data: d };
}
function genResetToken() {
  const a = rid().replace(/-/g, '').slice(0, 8).toUpperCase();
  return 'RST-' + a.slice(0, 4) + '-' + a.slice(4, 8);
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
  if (!u) return null;
  if (u.blocked) {
    try { await db.prepare('DELETE FROM sessions WHERE token=?').bind(t).run(); } catch (e) { }
    return null;
  }
  u._token = t;
  return u;
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
input:focus,textarea:focus{outline:none;border-color:var(--g1)}
.btn{border:none;cursor:pointer;border-radius:12px;padding:10px 16px;font-size:.82rem;font-family:inherit;color:#fff;background:linear-gradient(135deg,var(--g1),var(--g2));transition:.2s}
.btn:hover{filter:brightness(1.15)}
.btn.gray{background:rgba(255,255,255,.1)}
.btn.red{background:linear-gradient(135deg,#f43f5e,#b91c1c)}
.btn.sm{padding:6px 10px;font-size:.72rem;border-radius:9px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.stat{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:14px;text-align:center}
.stat b{font-size:1.5rem;display:block;background:linear-gradient(135deg,var(--g1),var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent}
.stat span{font-size:.7rem;opacity:.6}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.tabs button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e8ecff;border-radius:999px;padding:8px 16px;cursor:pointer;font-size:.8rem;font-family:inherit}
.tabs button.on{background:linear-gradient(135deg,var(--g1),var(--g2));border-color:transparent}
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
.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--g1),var(--g2));transition:width .2s}
.hide{display:none}
body::before,body::after{content:'';position:fixed;width:46vw;height:46vw;border-radius:50%;filter:blur(110px);opacity:.14;z-index:-1;animation:aur 14s ease-in-out infinite alternate;pointer-events:none}
body::before{background:#7c3aed;top:-12%;left:-10%}
body::after{background:#0891b2;bottom:-14%;right:-8%;animation-delay:-7s}
@keyframes aur{to{transform:translate(6vw,4vh) scale(1.15)}}
.card{transition:transform .25s,box-shadow .25s}
.card:hover{transform:translateY(-3px);box-shadow:0 14px 40px rgba(0,0,0,.4)}
.bar-row{display:grid;grid-template-columns:56px 1fr 34px;gap:8px;align-items:center;margin:7px 0;font-size:.7rem}
.bar{height:9px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--g1),var(--g2));border-radius:99px;animation:grow .9s cubic-bezier(.2,.8,.3,1)}
@keyframes grow{from{width:0}}
.feed-row{display:flex;gap:8px;align-items:flex-start;padding:7px 4px;border-bottom:1px dashed rgba(255,255,255,.08);font-size:.72rem}
.feed-row small{display:block;opacity:.5;font-size:.62rem;margin-top:2px}
#cmdk{position:fixed;inset:0;background:rgba(3,5,15,.6);backdrop-filter:blur(6px);z-index:99;display:flex;justify-content:center;padding-top:12vh}
#cmdk.hide{display:none}
.ck-box{width:min(520px,92vw);height:max-content;background:rgba(12,15,32,.96);border:1px solid rgba(139,92,246,.4);border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
#ck-in{width:100%;background:none;border:none;outline:none;color:#fff;padding:14px 16px;font-size:.9rem;border-bottom:1px solid rgba(255,255,255,.08)}
#ck-list div{padding:10px 16px;font-size:.78rem;cursor:pointer}
#ck-list div:hover,#ck-list div.sel{background:rgba(139,92,246,.18)}
.ck-hint{font-size:.6rem;opacity:.5;border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:2px 7px;margin-inline-start:8px}
:root{--g1:#22d3ee;--g2:#8b5cf6;--g3:#f472b6}
body.th-rose{--g1:#fb7185;--g2:#e11d48;--g3:#fbbf24}
body.th-lime{--g1:#a3e635;--g2:#059669;--g3:#22d3ee}
body.th-violet{--g1:#a78bfa;--g2:#6d28d9;--g3:#f472b6}
.themes{display:inline-flex;gap:6px;margin-inline-start:10px;vertical-align:middle}
.themes button{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.25);cursor:pointer;padding:0}
.themes button.on{border-color:#fff;transform:scale(1.2)}
.themes .t-cyan{background:linear-gradient(135deg,#22d3ee,#8b5cf6)}
.themes .t-rose{background:linear-gradient(135deg,#fb7185,#e11d48)}
.themes .t-lime{background:linear-gradient(135deg,#a3e635,#059669)}
.themes .t-violet{background:linear-gradient(135deg,#a78bfa,#6d28d9)}
.ch-line{width:100%;height:110px}
.ch-line .area{fill:url(#chg);opacity:.35}
.ch-line .ln{fill:none;stroke:var(--g1);stroke-width:2.5;stroke-linecap:round}
.ch-line .dot{fill:var(--g3)}
.ch-line text{fill:rgba(255,255,255,.5);font-size:9px}
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
    <button class="on" onclick="tab('dash',this)">📊 نمای کلی</button><span class="ck-hint">Ctrl+K</span><span class="themes" id="themes"></span>
    <button onclick="tab('users',this)">👥 کاربران</button>
    <button onclick="tab('release',this)"> انتشار</button>
    <button onclick="tab('rels',this)">🚀 نسخه‌ها</button>
    <button onclick="tab('ann',this)">📢 اطلاعیه</button>
    <button onclick="tab('flags',this)">🚩 قابلیت‌ها</button>
    <button onclick="tab('danger',this)">⚠️ منطقه خطر</button>
  </div>
  <div class="msg" id="msg"></div>

  <div id="v-dash">
    <div class="grid" id="stats"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
      <div class="card"><h2>⬇️ دانلود به تفکیک نسخه</h2><div id="ch-dl"></div></div>
      <div class="card"><h2>🕘 رویدادهای اخیر</h2><div id="feed" style="max-height:260px;overflow-y:auto"></div></div>
    </div>
    <div class="card" style="margin-top:14px"><h2>📈 روند کل دانلودها</h2><svg id="ch-line" class="ch-line" viewBox="0 0 300 90" preserveAspectRatio="none"></svg></div>
    <div class="card" style="margin-top:14px"><h2>👥 کاربران فعال روزانه (۱۴ روز اخیر)</h2><div id="ch-dau"></div></div>
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

  <div id="v-rels" class="hide">
    <div class="grid" id="rel-stats" style="margin-bottom:14px"></div>
    <div class="card"><h2>⏳ در انتظار تایید شما (پیش‌نویس)</h2>
      <label class="row" style="font-size:.72rem;opacity:.85;margin-bottom:10px"><input type="checkbox" id="ann-onpub" checked style="width:auto"> بعد از تایید، اطلاعیهٔ «نسخهٔ جدید» به همهٔ کاربران اکستنشن بره 📢</label>
      <div id="rels-pend"></div></div>
    <div class="card"><h2>✅ منتشرشده‌ها</h2><div id="rels-live"></div></div>
  </div>

  <div id="v-ann" class="hide">
    <div class="card"><h2>📢 اطلاعیه به همه کاربران اکستنشن</h2>
      <span class="lbl">متن اطلاعیه (خالی = غیرفعال)</span>
      <textarea id="anntxt" rows="3" placeholder="مثلاً: نسخه ۱.۰.۸ منتشر شد! از منوی پشتیبانی آپدیت کنید 💜"></textarea>
      <span class="lbl">سطح</span>
      <select id="annlvl"><option value="info">info — عادی</option><option value="warn">warn — مهم</option><option value="gold">gold — ویژه</option></select>
      <span class="lbl">⏰ شروع نمایش (اختیاری — خالی = همین حالا)</span>
      <input type="datetime-local" id="annat">
      <span class="lbl">🏁 پایان نمایش (اختیاری — خالی = تا حذف دستی)</span>
      <input type="datetime-local" id="annend">
      <div class="row" style="margin-top:12px">
        <button class="btn" onclick="saveAnn()">انتشار اطلاعیه 📢</button>
        <button class="btn gray" onclick="clearAnn()">حذف اطلاعیه</button>
      </div>
    </div>
  </div>

  <div id="v-flags" class="hide">
    <div class="card"><h2>🚩 فیچرفلگ‌ها — کنترل قابلیت‌ها از راه دور</h2>
      <p style="font-size:.72rem;opacity:.55;margin-bottom:10px">غیرفعال‌کردن هر مورد، آن بخش را در نیوتبِ بعدیِ همهٔ کاربران پنهان می‌کند — بدون انتشار نسخهٔ جدید.</p>
      <div id="flags-list"></div>
      <button class="btn" style="margin-top:12px" onclick="saveFlags()">💾 ذخیره فیچرفلگ‌ها</button>
    </div>
  </div>

  <div id="v-danger" class="hide">
    <div class="card"><h2>⚠️ منطقه خطر</h2>
      <div class="row">
        <button class="btn gray" onclick="dlExport()">📦 دریافت پشتیبان کامل دیتابیس (JSON)</button>
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
function tab(id,btn){['dash','users','release','rels','ann','flags','danger'].forEach(function(t){document.getElementById('v-'+t).classList.toggle('hide',t!==id);});document.querySelectorAll('.tabs button').forEach(function(b){b.classList.remove('on');});btn.classList.add('on');if(id==='dash')loadDash();if(id==='users')loadUsers();if(id==='release')loadRel();if(id==='rels')loadRels();if(id==='ann')loadAnn();if(id==='flags')loadFlags();}
function mb(n){return (n/1048576).toFixed(1)+' MB';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');}
function loadRels(){Promise.all([api('/admin/gh/releases'),api('/admin/gh/health')]).then(function(res){var d=res[0],h=res[1];var tot=0,lc=0,dc=0,pend='',live='';d.releases.forEach(function(r){var dl=0,prot='',psz=0;r.assets.forEach(function(a){dl+=a.downloads||0;if(a.name==='tabora-protected.zip'){prot=a.url;psz=a.size;}});tot+=dl;if(r.draft)dc++;else lc++;var notes=r.body?'<details style="margin-top:8px"><summary style="cursor:pointer;font-size:.68rem;opacity:.6">📝 یادداشت نسخه</summary><pre style="margin-top:6px">'+esc(r.body)+'</pre></details>':'';var acts='',card='';if(r.draft){acts='<button class="btn sm" onclick="pubRel('+r.id+',\\''+r.tag+'\\')">✅ تایید و انتشار</button> <button class="btn sm gray" onclick="editRel('+r.id+',\\''+r.tag+'\\')">✏️</button> <button class="btn sm red" onclick="delRel('+r.id+')">🗑</button>';card='<div style="border:1px solid rgba(250,204,21,.35);background:rgba(250,204,21,.06);border-radius:14px;padding:12px;margin-bottom:10px"><div class="row" style="justify-content:space-between;align-items:center"><div><b dir="ltr">'+r.tag+'</b> '+esc(r.name)+'<br><span style="font-size:.66rem;opacity:.55">پیش‌نویس — '+new Date(r.created_at).toLocaleString('fa-IR')+' · '+mb(psz)+'</span>'+notes+'</div><div class="row">'+acts+'</div></div></div>';pend+=card;}else{acts='<span class="badge b-owner">live</span>'+(r.prerelease?' <span class="badge b-admin">pre</span>':'')+(prot?' <button class="btn sm gray" onclick="pinRel(\\''+prot+'\\')">📌 دانلود</button>':'')+' <button class="btn sm gray" onclick="editRel('+r.id+',\\''+r.tag+'\\')">✏️</button> <button class="btn sm gray" onclick="togglePre('+r.id+','+(!r.prerelease)+')">🏷 '+ (r.prerelease?'پیش‌انتشار: بله':'پیش‌انتشار: نه') +'</button> <button class="btn sm red" onclick="delRel('+r.id+')">🗑</button>';card='<div style="border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px;margin-bottom:10px"><div class="row" style="justify-content:space-between;align-items:center"><div><b dir="ltr">'+r.tag+'</b> '+esc(r.name)+'<br><span style="font-size:.66rem;opacity:.55">منتشرشده: '+new Date(r.published_at).toLocaleString('fa-IR')+' · '+mb(psz)+' · ⬇️ '+(dl||0).toLocaleString('fa-IR')+' دانلود</span>'+notes+'</div><div class="row">'+acts+'</div></div></div>';live+=card;}});document.getElementById('rel-stats').innerHTML='<div class="stat"><b>'+tot.toLocaleString('fa-IR')+'</b><span>مجموع دانلودها</span></div><div class="stat"><b>'+lc.toLocaleString('fa-IR')+'</b><span>نسخه منتشرشده</span></div><div class="stat"><b>'+dc.toLocaleString('fa-IR')+'</b><span>در انتظار تایید</span></div><div class="stat"><b>'+(h.ok?'✔':'✖')+'</b><span>سلامت لینک'+(h.ok?' '+mb(h.size):'')+'</span></div>';document.getElementById('rels-pend').innerHTML=pend||'<p style="opacity:.5;font-size:.75rem">هیچ نسخه‌ای منتظر تایید نیست ✔</p>';document.getElementById('rels-live').innerHTML=live||'';}).catch(function(e){msg('خطا: '+e.message);});}
function pubRel(id,tag){if(!confirm('نسخه '+tag+' منتشر و به‌عنوان latest تنظیم شود؟'))return;api('/admin/gh/publish',{id:id}).then(function(){var annEl=document.getElementById('ann-onpub');var ann=annEl?annEl.checked:true;var done=function(){msg('نسخه '+tag+' منتشر شد 🚀',true);loadRels();};if(ann){api('/admin/settings',{settings:{announce_text:'🎉 نسخه '+tag+' منتشر شد! از لینک پایدار آپدیت کنید 💜',announce_level:'info'}}).then(done).catch(done);}else{done();}}).catch(function(e){msg(e.message);});}
function editRel(id,tag){var n=prompt('نام نمایشی نسخه ('+tag+'):',tag);if(n===null)return;var b=prompt('یادداشت/توضیحات نسخه:','');if(b===null)return;api('/admin/gh/patch',{id:id,name:n,body:b}).then(function(){msg('ذخیره شد ✏️',true);loadRels();}).catch(function(e){msg(e.message);});}
function togglePre(id,v){api('/admin/gh/patch',{id:id,prerelease:v}).then(function(){msg('تغییر کرد 🏷',true);loadRels();}).catch(function(e){msg(e.message);});}
function delRel(id){if(!confirm('این ریلیز برای همیشه حذف شود؟'))return;api('/admin/gh/delete',{id:id}).then(function(){msg('حذف شد',true);loadRels();}).catch(function(e){msg(e.message);});}
function pinRel(url){api('/admin/settings',{settings:{download_url:url}}).then(function(){msg('لینک دانلود روی این نسخه قفل شد 📌',true);}).catch(function(e){msg(e.message);});}
function loadDash(){api('/admin/stats').then(function(s){document.getElementById('stats').innerHTML='<div class="stat"><b>'+s.users+'</b><span>کاربران</span></div><div class="stat"><b>'+s.staff+'</b><span>Owner/Admin</span></div><div class="stat"><b>'+s.sessions+'</b><span>نشست فعال</span></div><div class="stat"><b>'+s.dau+'</b><span>فعال (۲۴ ساعت)</span></div><div class="stat"><b>'+(s.d1_file?'✔':'—')+'</b><span>زیپ D1</span></div>';var daily=s.daily||[];var dh='';if(daily.length){var mx=1;daily.forEach(function(x){if(x.u>mx)mx=x.u;});daily.forEach(function(x){dh+='<div class="bar-row"><span dir="ltr">'+x.day.slice(5)+'</span><div class="bar"><i style="width:'+Math.max(4,Math.round(x.u/mx*100))+'%"></i></div><b>'+x.u.toLocaleString('fa-IR')+'</b></div>';});}var dauEl=document.getElementById('ch-dau');if(dauEl)dauEl.innerHTML=dh||'<p style="opacity:.5;font-size:.75rem">هنوز داده‌ای نیست — هر نیوتب یک نقطه ✨</p>';});Promise.all([api('/admin/gh/releases'),api('/admin/logs')]).then(function(res){var rels=res[0].releases.filter(function(r){return !r.draft;}).slice(0,8);var max=1;var data=rels.map(function(r){var dl=0;r.assets.forEach(function(x){dl+=x.downloads||0;});if(dl>max)max=dl;return {tag:r.tag,dl:dl};});var html='';data.forEach(function(d){html+='<div class="bar-row"><span dir="ltr">'+d.tag+'</span><div class="bar"><i style="width:'+Math.max(4,Math.round(d.dl/max*100))+'%"></i></div><b>'+d.dl.toLocaleString('fa-IR')+'</b></div>';});document.getElementById('ch-dl').innerHTML=html||'<p style="opacity:.5;font-size:.75rem">—</p>';var icons={publish:'🚀',del:'🗑',delete:'🗑',patch:'✏️',settings:'⚙️',pin:'📌'};var fh='';res[1].logs.forEach(function(l){fh+='<div class="feed-row"><span>'+(icons[l.type]||'•')+'</span><div><b>'+esc(l.msg)+'</b><small>'+new Date(l.ts).toLocaleString('fa-IR')+'</small></div></div>';});document.getElementById('feed').innerHTML=fh||'<p style="opacity:.5;font-size:.75rem">هنوز رویدادی ثبت نشده — اولین کنش‌ها همین‌جا می‌افتن ✨</p>';}).catch(function(){});loadHist();loadTheme();}
var USERS=[];
function loadUsers(){api('/admin/users').then(function(d){USERS=d.users;var t=document.getElementById('utable');t.innerHTML='<tr><th>کاربر</th><th>ایمیل</th><th>نقش</th><th>آخرین فعالیت</th><th>وضعیت</th><th>عملیات</th></tr>';USERS.forEach(function(u){var tr=document.createElement('tr');var ls=u.last_seen?new Date(u.last_seen).toLocaleString('fa-IR'):'—';var st=u.blocked?'<span class="badge" style="background:rgba(244,63,94,.18);color:#fda4af">🚫 مسدود</span>':'<span class="badge b-user">فعال</span>';tr.innerHTML='<td><b>'+u.username+'</b><br><span style="opacity:.5;font-size:.66rem">'+u.name+'</span></td><td dir="ltr" style="text-align:right">'+u.email+'</td><td><span class="badge b-'+u.role+'">'+u.role+'</span></td><td style="font-size:.66rem;opacity:.6">'+ls+'</td><td>'+st+'</td><td><select onchange="setRole(\\''+u.username+'\\',this.value)" style="width:auto;padding:4px 8px;font-size:.7rem"><option'+(u.role==='user'?' selected':'')+'>user</option><option'+(u.role==='admin'?' selected':'')+'>admin</option><option'+(u.role==='owner'?' selected':'')+'>owner</option></select> <button class="btn sm gray" onclick="setPass(\\''+u.username+'\\')">🔑</button> <button class="btn sm gray" onclick="viewU(\\''+u.username+'\\')">👁</button> <button class="btn sm '+(u.blocked?'gray':'red')+'" onclick="blockU(\\''+u.username+'\\','+(u.blocked?0:1)+')">'+(u.blocked?'✅ رفع':'🚫')+'</button> <button class="btn sm red" onclick="delU(\\''+u.username+'\\')">🗑</button></td>';t.appendChild(tr);});});}
function blockU(u,v){if(!confirm(v?'کاربر '+u+' مسدود شود؟ دیگر نمی‌تواند وارد شود.':'مسدودی '+u+' رفع شود؟'))return;api('/admin/block',{username:u,blocked:v?1:0}).then(function(){msg(v?'🚫 مسدود شد':'✅ رفع مسدودی شد',true);loadUsers();}).catch(function(e){msg(e.message);});}
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
function ckOpen(){var k=document.getElementById('cmdk');k.classList.remove('hide');var inp=document.getElementById('ck-in');inp.value='';ckRender('');inp.focus();}
function ckClose(){document.getElementById('cmdk').classList.add('hide');}
function ckCmds(q){var tabs=['📊 نمای کلی','👥 کاربران','🛍 انتشار',' نسخه‌ها',' اطلاعیه','🚩 قابلیت‌ها','⚠️ منطقه خطر'];var out=[];tabs.forEach(function(t,i){out.push([t,function(){document.querySelectorAll('.tabs button')[i].click();}]);});out.push(['🔗 کپی آدرس پنل',function(){navigator.clipboard.writeText(location.href);}]);out.push(['📦 کپی لینک دانلود پایدار',function(){navigator.clipboard.writeText(location.origin+'/download');}]);out.push(['🐙 بازکردن گیت‌هاب',function(){window.open('https://github.com/Taboraex/tabora');}]);if(q)out=out.filter(function(c){return c[0].indexOf(q)>-1;});return out;}
var CKCUR=[];function ckRender(q){CKCUR=ckCmds(q);var h='';CKCUR.slice(0,8).forEach(function(c,i){h+='<div data-i="'+i+'" class="'+(i===0?'sel':'')+'">'+c[0]+'</div>';});var list=document.getElementById('ck-list');list.innerHTML=h;for(var i=0;i<list.children.length;i++){list.children[i].onclick=function(){CKCUR[parseInt(this.getAttribute('data-i'),10)][1]();ckClose();};}}
document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();if(document.getElementById('cmdk').classList.contains('hide'))ckOpen();else ckClose();}else if(e.key==='Escape'){ckClose();}else if(e.key==='Enter'&&!document.getElementById('cmdk').classList.contains('hide')){var sel=document.querySelector('#ck-list .sel');if(sel)sel.click();}});
document.getElementById('ck-in').addEventListener('input',function(){ckRender(this.value);});
function applyTheme(t){document.body.classList.remove('th-rose','th-lime','th-violet');if(t&&t!=='cyan')document.body.classList.add('th-'+t);var box=document.getElementById('themes');if(box){box.innerHTML=['cyan','rose','lime','violet'].map(function(x){return '<button class="t-'+x+(x===(t||'cyan')?' on':'')+'" onclick="setTheme(\\''+x+'\\')" title="'+x+'"></button>';}).join('');}}
function setTheme(t){api('/admin/settings',{settings:{theme:t==='cyan'?null:t}}).then(function(){applyTheme(t);}).catch(function(e){msg(e.message);});}
function loadTheme(){api('/admin/settings').then(function(s){applyTheme(s.settings.theme||'cyan');}).catch(function(){});}
function loadHist(){api('/admin/history').then(function(d){var h=d.hist||[];var svg=document.getElementById('ch-line');if(!svg)return;if(h.length<2){svg.outerHTML='<p style="opacity:.5;font-size:.75rem">دادهٔ کافی نیست — هر روز یه نقطه اضافه می‌شه 📈</p>';return;}var max=Math.max.apply(null,h.map(function(x){return x.total;}));var min=Math.min.apply(null,h.map(function(x){return x.total;}));var W=300,H=90,P=10;var pts=h.map(function(x,i){var px=P+i*(W-2*P)/(h.length-1);var py=H-P-((x.total-min)/((max-min)||1))*(H-2*P);return [px,py];});var line=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1);}).join(' ');var area=line+' L'+pts[pts.length-1][0].toFixed(1)+' '+H+' L'+pts[0][0].toFixed(1)+' '+H+' Z';var dots=pts.map(function(p){return '<circle class="dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.6"/>';}).join('');svg.innerHTML='<defs><linearGradient id="chg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--g1)"/><stop offset="1" stop-color="transparent"/></linearGradient></defs><path class="area" d="'+area+'"/><path class="ln" d="'+line+'"/>'+dots+'<text x="'+P+'" y="'+(H-1)+'">'+h[0].day.slice(5)+'</text><text x="'+(W-P)+'" y="'+(H-1)+'" text-anchor="end">'+h[h.length-1].day.slice(5)+' · '+h[h.length-1].total.toLocaleString('fa-IR')+' ⬇</text>';}).catch(function(){});}
function loadAnn(){api('/admin/settings').then(function(s){document.getElementById('anntxt').value=s.settings.announce_text||'';document.getElementById('annlvl').value=s.settings.announce_level||'info';var toLocal=function(ms){return ms?new Date(parseInt(ms,10)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';};var at=document.getElementById('annat');if(at)at.value=toLocal(s.settings.announce_start||s.settings.announce_at);var en=document.getElementById('annend');if(en)en.value=toLocal(s.settings.announce_end);});}
function saveAnn(){var at=document.getElementById('annat').value;var ms=at?new Date(at).getTime():0;var enEl=document.getElementById('annend');var mE=enEl&&enEl.value?new Date(enEl.value).getTime():0;api('/admin/settings',{settings:{announce_text:document.getElementById('anntxt').value.trim()||null,announce_level:document.getElementById('annlvl').value,announce_at:ms>Date.now()?ms:null,announce_start:ms?ms:null,announce_end:mE?mE:null}}).then(function(){msg(ms>Date.now()?'اطلاعیه زمان‌بندی شد ⏰':'اطلاعیه منتشر شد 📢',true);}).catch(function(e){msg(e.message);});}
function loadFlags(){api('/admin/settings').then(function(s){var f=(s.settings&&s.settings.flags)||{};var defs=[['prices','💱 ویجت قیمت ارز و طلا'],['weather','🌤️ ویجت آب‌وهوا'],['quotes','💫 جملهٔ روز'],['chat','💬 چت و دوستان'],['wallpapers','🖼️ پنل والپیپرها']];var h='';defs.forEach(function(d){h+='<label style="display:flex;gap:10px;align-items:center;margin:9px 0;font-size:.8rem;cursor:pointer"><input type="checkbox" style="width:auto" data-flag="'+d[0]+'"'+(f[d[0]]===false?'':' checked')+'><span>'+d[1]+'</span></label>';});document.getElementById('flags-list').innerHTML=h;}).catch(function(e){msg(e.message);});}
function saveFlags(){var f={};document.querySelectorAll('#flags-list input[data-flag]').forEach(function(i){f[i.getAttribute('data-flag')]=i.checked;});api('/admin/settings',{settings:{flags:f}}).then(function(){msg('فیچرفلگ‌ها ذخیره شد 🚩 (در نیوتب بعدی کاربران اعمال می‌شود)',true);}).catch(function(e){msg(e.message);});}
function dlExport(){msg('در حال آماده‌سازی پشتیبان…');fetch('/admin/export',{headers:{'x-admin-key':K()}}).then(function(r){if(!r.ok)throw new Error(r.status);return r.blob();}).then(function(b){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='tabora-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();msg('پشتیبان کامل دانلود شد 📦',true);}).catch(function(e){msg('خطا در پشتیبان: '+e.message);});}
if(K()){api('/admin/stats').then(enter).catch(function(){});}
</script>
<div id="cmdk" class="hide"><div class="ck-box"><input id="ck-in" placeholder="🔍 دستور یا بخش... (Esc = بستن)"><div id="ck-list"></div></div></div>
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
    const panelPass = env.PANEL_PASS || '';
    const sentKey = req.headers.get('x-admin-key') || '';
    const hasKey = sentKey && ((adminKey && sentKey === adminKey) || (panelPass && sentKey === panelPass));

    if (p === '/admin/migrate' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      await db.prepare('CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, name TEXT, ord INTEGER, data TEXT)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_files ON files(key, ord)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS hist(day TEXT PRIMARY KEY, total INTEGER)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS beat_days(day TEXT, uid TEXT, PRIMARY KEY(day, uid))').run();
      await ensureUserCols(db);
      await log(db, 'migrate', 'schema checked');
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

    if (p === '/admin/logs' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      await db.prepare('CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, type TEXT, msg TEXT)').run();
      const rows = await db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 30').all();
      return json({ logs: rows.results || [] });
    }
    if (p === '/admin/history' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      await db.prepare('CREATE TABLE IF NOT EXISTS hist(day TEXT PRIMARY KEY, total INTEGER)').run();
      try {
        const g = await ghFetch(env, '', 'GET');
        if (g.status === 200) {
          const rels = await g.json();
          let tot = 0;
          rels.forEach(r => (r.assets || []).forEach(x => { tot += x.download_count || 0; }));
          const day = new Date().toISOString().slice(0, 10);
          await db.prepare('INSERT INTO hist(day,total) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET total=excluded.total').bind(day, tot).run();
        }
      } catch (e) { }
      const hr = await db.prepare('SELECT day,total FROM hist ORDER BY day DESC LIMIT 30').all();
      return json({ hist: (hr.results || []).reverse() });
    }
    if (p === '/admin/stats' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      const users = await db.prepare('SELECT COUNT(*) AS c FROM users').first();
      const staff = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role IN ('owner','admin')").first();
      const sess = await db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE expires > ?').bind(Date.now()).first();
      const files = await db.prepare("SELECT COUNT(*) AS c, MAX(name) AS n FROM files WHERE key='latest'").first();
      await db.prepare('CREATE TABLE IF NOT EXISTS beats(uid TEXT PRIMARY KEY, last INTEGER)').run();
      const dau = await db.prepare('SELECT COUNT(*) AS c FROM beats WHERE last > ?').bind(Date.now() - 86400000).first();
      let daily = [];
      try {
        const days = await db.prepare('SELECT day, COUNT(*) AS u FROM beat_days WHERE day >= ? GROUP BY day ORDER BY day ASC')
          .bind(new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10)).all();
        daily = days.results || [];
      } catch (e) { }
      return json({ users: users.c, staff: staff.c, sessions: sess.c, d1_file: files.n || null, dau: dau.c, daily, time: Date.now() });
    }

    if (p === '/admin/users' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      await ensureUserCols(db);
      const rows = await db.prepare('SELECT id,email,username,name,role,avatar_kind,settings,bookmarks,blocked,last_seen,created_at FROM users ORDER BY created_at ASC').all();
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

    if (p === '/admin/block' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      await ensureUserCols(db);
      const idf = String(b.username || '').toLowerCase();
      const u = await db.prepare('SELECT id, username FROM users WHERE username=? OR email=?').bind(idf, idf).first();
      if (!u) return err('user_not_found', 404);
      const blocked = b.blocked ? 1 : 0;
      await db.prepare('UPDATE users SET blocked=? WHERE id=?').bind(blocked, u.id).run();
      if (blocked) await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
      await log(db, blocked ? 'block' : 'unblock', 'user ' + u.username + (blocked ? ' blocked' : ' unblocked'));
      return json({ ok: true, blocked });
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

    /* ---------- github release control (proxy — token never leaves the worker) ---------- */
    if (p === '/admin/gh/releases' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      const g = await ghFetch(env, '?per_page=14');
      if (g.status !== 200 || !Array.isArray(g.data)) return json({ error: 'github_' + g.status }, 502);
      return json({
        releases: g.data.map(r => ({
          id: r.id, tag: r.tag_name, name: r.name, draft: !!r.draft, prerelease: !!r.prerelease,
          published_at: r.published_at, created_at: r.created_at, body: r.body || '',
          assets: (r.assets || []).map(a => ({ name: a.name, size: a.size, url: a.browser_download_url, downloads: a.download_count || 0 }))
        }))
      });
    }
    if (p === '/admin/gh/patch' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      const payload = {};
      if (typeof b.name === 'string') payload.name = b.name.slice(0, 120);
      if (typeof b.body === 'string') payload.body = b.body.slice(0, 20000);
      if (typeof b.prerelease === 'boolean') payload.prerelease = b.prerelease;
      const g = await ghFetch(env, '/' + parseInt(b.id, 10), 'PATCH', payload);
      if (g.status === 200) await log(db, 'patch', 'edit release #' + b.id);
      return json({ ok: g.status === 200, status: g.status });
    }
    if (p === '/admin/gh/health' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      try {
        const r = await fetch('https://github.com/Taboraex/tabora/releases/latest/download/tabora-protected.zip', { method: 'HEAD', redirect: 'follow' });
        return json({ ok: r.status === 200, status: r.status, size: parseInt(r.headers.get('content-length') || '0', 10) });
      } catch (e) { return json({ ok: false, status: 0 }); }
    }
    if (p === '/admin/gh/publish' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      const g = await ghFetch(env, '/' + parseInt(b.id, 10), 'PATCH', { draft: false, make_latest: 'true' });
      if (g.status === 200) await log(db, 'publish', 'publish release #' + b.id);
      return json({ ok: g.status === 200, status: g.status });
    }
    if (p === '/admin/gh/delete' && req.method === 'POST') {
      if (!hasKey) return err('forbidden', 403);
      const b = await body(req);
      const g = await ghFetch(env, '/' + parseInt(b.id, 10), 'DELETE');
      if (g.status === 204 || g.status === 200) await log(db, 'delete', 'delete release #' + b.id);
      return json({ ok: g.status === 204 || g.status === 200, status: g.status });
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
      await log(db, 'settings', 'panel settings changed');
      return json({ ok: true, settings: s });
    }

    if (p === '/admin/export' && req.method === 'GET') {
      if (!hasKey) return err('forbidden', 403);
      const out = { exported_at: new Date().toISOString(), service: 'tabora-api' };
      const dump = async (key, sql) => { try { const r = await db.prepare(sql).all(); out[key] = r.results || []; } catch (e) { out[key] = null; } };
      await dump('users', 'SELECT id,email,username,name,bio,avatar_kind,role,blocked,last_seen,created_at FROM users ORDER BY created_at ASC');
      await dump('sessions', 'SELECT user_id, expires FROM sessions');
      await dump('friends', 'SELECT * FROM friends');
      await dump('messages', 'SELECT * FROM messages ORDER BY id DESC LIMIT 5000');
      await dump('beats', 'SELECT * FROM beats');
      await dump('beat_days', 'SELECT day, COUNT(*) AS u FROM beat_days GROUP BY day ORDER BY day DESC LIMIT 90');
      await dump('hist', 'SELECT * FROM hist ORDER BY day DESC LIMIT 90');
      let s = {};
      try { s = JSON.parse((await kvGet(db, 'settings')) || '{}'); } catch (e) { }
      out.settings = s;
      await log(db, 'export', 'database exported by admin');
      return new Response(JSON.stringify(out, null, 1), {
        headers: { ...CORS, 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="tabora-backup-' + new Date().toISOString().slice(0, 10) + '.json"' }
      });
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

    /* ---------- latest published release (update check) ---------- */
    if (p === '/api/version') {
      let cached = {};
      try { cached = JSON.parse((await kvGet(db, 'version_cache')) || '{}'); } catch (e) { }
      if (!cached.tag || Date.now() - (cached.t || 0) > 15 * 60000) {
        try {
          const g = await ghFetch(env, '/latest');
          if (g.status === 200 && g.data && g.data.tag_name) {
            const prot = (g.data.assets || []).find(a => a.name === 'tabora-protected.zip') || (g.data.assets || [])[0];
            cached = {
              t: Date.now(), tag: g.data.tag_name,
              version: String(g.data.tag_name).replace(/^v/, ''),
              name: g.data.name || g.data.tag_name,
              url: prot ? prot.browser_download_url : '',
              size: prot ? prot.size : 0,
              published_at: g.data.published_at
            };
            await kvSet(db, 'version_cache', JSON.stringify(cached));
          }
        } catch (e) { }
      }
      return json({ ok: !!cached.tag, version: cached.version || null, tag: cached.tag || null, url: cached.url || '', name: cached.name || null, published_at: cached.published_at || null });
    }

    /* ---------- remote feature flags ---------- */
    if (p === '/api/flags') {
      let s = {};
      try { s = JSON.parse((await kvGet(db, 'settings')) || '{}'); } catch (e) { }
      return json({ flags: (s.flags && typeof s.flags === 'object') ? s.flags : {} });
    }

    /* ---------- public announcement (set from admin panel) ---------- */
    if (p === '/api/beat' && req.method === 'POST') {
      const b = await body(req);
      const uid = String(b.uid || '').slice(0, 64);
      if (uid) {
        await db.prepare('CREATE TABLE IF NOT EXISTS beats(uid TEXT PRIMARY KEY, last INTEGER)').run();
        await db.prepare('INSERT INTO beats(uid,last) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET last=excluded.last').bind(uid, Date.now()).run();
        try {
          const day = new Date().toISOString().slice(0, 10);
          await db.prepare('CREATE TABLE IF NOT EXISTS beat_days(day TEXT, uid TEXT, PRIMARY KEY(day, uid))').run();
          await db.prepare('INSERT OR IGNORE INTO beat_days(day, uid) VALUES(?,?)').bind(day, uid).run();
          if (Math.random() < 0.03) {
            await db.prepare('DELETE FROM beat_days WHERE day < ?').bind(new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)).run();
          }
        } catch (e) { }
      }
      return json({ ok: true });
    }
    if (p === '/api/announce') {
      let s = {};
      try { s = JSON.parse((await kvGet(db, 'settings')) || '{}'); } catch (e) { }
      const now = Date.now();
      const start = parseInt(s.announce_start || s.announce_at || 0, 10);
      const end = parseInt(s.announce_end || 0, 10);
      if (now < start || (end && now > end)) return json({ text: '', level: 'info' });
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
      const rcode = genCode();
      await ensureRecoveryCol(db);
      await db.prepare(
        'INSERT INTO users(id,email,username,pass,name,bio,avatar,avatar_kind,role,settings,bookmarks,created_at,recovery) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(id, email, username, hash, name || username, '', '', 'none', role, '{}', '[]', Date.now(), await sha256('rc::' + normCode(rcode))).run();
      const token = newToken();
      await db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)')
        .bind(token, id, Date.now() + 90 * 86400000).run();
      const u = await db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
      return json({ token, user: publicUser(u), recovery: rcode });
    }

    /* ---------- login ---------- */
    if (p === '/api/login' && req.method === 'POST') {
      if (!rateLimit(ip, 'login', 20, 3600000)) return err('rate_limited', 429);
      const b = await body(req);
      const idf = String(b.identifier || b.email || '').toLowerCase().trim();
      const password = String(b.password || '');
      await ensureUserCols(db);
      const u = await db.prepare('SELECT * FROM users WHERE email=? OR username=?').bind(idf, idf).first();
      if (!u) return err('user_not_found', 404);
      if (u.blocked) return err('blocked', 403);
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

    /* ---------- password recovery via recovery code OR one-time bot token ---------- */
    if (p === '/api/recover' && req.method === 'POST') {
      if (!rateLimit(ip, 'recover', 10, 3600000)) return err('rate_limited', 429);
      const b = await body(req);
      const idf = String(b.identifier || b.email || '').toLowerCase().trim();
      const code = normCode(b.code);
      const password = String(b.password || '');
      if (password.length < 6) return err('bad_password');
      if (!code) return err('bad_code', 401);
      await ensureRecoveryCol(db);
      const u = await db.prepare('SELECT * FROM users WHERE email=? OR username=?').bind(idf, idf).first();
      if (!u) return err('bad_code', 401);
      let ok = false, usedTokenKey = null, usedSup = false;
      if (u.recovery && u.recovery === await sha256('rc::' + code)) ok = true;
      if (!ok) {
        const tk = await db.prepare("SELECT value FROM kv WHERE key=?").bind('rst:' + await sha256('rc::' + code)).first();
        if (tk) {
          let meta = {};
          try { meta = JSON.parse(tk.value); } catch (e) { }
          if (meta.uid === u.id && meta.exp > Date.now()) { ok = true; usedTokenKey = 'rst:' + await sha256('rc::' + code); }
        }
      }
      if (!ok && env.SUPDB) {
        /* accept one-time tokens issued by the Telegram support bot (its own D1) */
        try {
          const raw = String(b.code || '').trim().toUpperCase();
          const brow = await env.SUPDB.prepare('SELECT expires_at, used_at FROM reset_tokens WHERE UPPER(token)=?').bind(raw).first();
          if (brow && !brow.used_at && Number(brow.expires_at) > Date.now()) { ok = true; usedSup = true; }
        } catch (e) { }
      }
      if (!ok) return err(u.recovery ? 'bad_code' : 'no_recovery', 401);
      if (usedTokenKey) await kvDel(db, usedTokenKey); /* one-time */
      if (usedSup) {
        try { await env.SUPDB.prepare('UPDATE reset_tokens SET used_at=? WHERE UPPER(token)=?').bind(Date.now(), String(b.code || '').trim().toUpperCase()).run(); } catch (e) { }
      }
      const salt = rid();
      await db.prepare('UPDATE users SET pass=? WHERE id=?').bind(salt + ':' + await sha256(salt + '::' + password), u.id).run();
      await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
      return json({ ok: true });
    }

    /* ---------- telegram bot: issue one-time password-reset token ---------- */
    if (p === '/api/bot/reset-token' && req.method === 'POST') {
      const sec = env.BOT_SECRET || '';
      if (!sec || req.headers.get('x-bot-secret') !== sec) return err('forbidden', 403);
      if (!rateLimit(ip, 'botrt', 60, 3600000)) return err('rate_limited', 429);
      const b = await body(req);
      const idf = String(b.identifier || '').toLowerCase().trim();
      const u = await db.prepare('SELECT id, username FROM users WHERE email=? OR username=?').bind(idf, idf).first();
      if (!u) return err('user_not_found', 404);
      const token = genResetToken();
      await kvSet(db, 'rst:' + await sha256('rc::' + normCode(token)), JSON.stringify({ uid: u.id, exp: Date.now() + 10 * 60000 }));
      return json({ token, expires_in: 600, username: u.username });
    }

    /* ---------- everything below needs auth ---------- */
    const me = await sessionUser(db, req);

    if (p === '/api/logout' && req.method === 'POST') {
      if (me) await db.prepare('DELETE FROM sessions WHERE token=?').bind(me._token).run();
      return json({ ok: true });
    }

    if (!me) return err('unauthorized', 401);

    if (p === '/api/recovery' && req.method === 'POST') {
      const code = genCode();
      await ensureRecoveryCol(db);
      await db.prepare('UPDATE users SET recovery=? WHERE id=?').bind(await sha256('rc::' + normCode(code)), me.id).run();
      return json({ code });
    }

    if (p === '/api/me' && req.method === 'GET') {
      try { await db.prepare('UPDATE users SET last_seen=? WHERE id=?').bind(Date.now(), me.id).run(); } catch (e) { }
      return json({ user: publicUser(me) });
    }

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
