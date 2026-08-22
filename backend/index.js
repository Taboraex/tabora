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
async function handle(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const p = url.pathname;
  const db = env.DB;
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';

  try {
    /* ---------- ping ---------- */
    if (p === '/api/ping') return json({ ok: true, service: 'tabora-api', time: Date.now() });

    /* ---------- download latest build ---------- */
    if (p === '/download') {
      /* primary: redirect to the newest public GitHub release asset (stable URL, always latest) */
      const ghUrl = 'https://github.com/Taboraex/tabora/releases/latest/download/tabora-protected.zip';
      if (url.searchParams.get('info') === '1') return json({ source: 'github-latest', url: ghUrl });
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
