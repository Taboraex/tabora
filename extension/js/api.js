/* Tabora API client — talks to the Cloudflare Worker */
const API_BASE = 'https://tabora-api.nexaextensionsir.workers.dev';

const Api = {
  _pushTimer: null,

  async req(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (Store.state.token) headers['Authorization'] = 'Bearer ' + Store.state.token;
    const r = await fetch(API_BASE + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try { data = await r.json(); } catch { }
    if (!r.ok) { const e = new Error(data.error || 'http_' + r.status); e.code = data.error; throw e; }
    return data;
  },

  async register(email, username, password, name) {
    const d = await this.req('/api/register', { body: { email, username, password, name } });
    await Store.setAuth(d.token, d.user);
    return d.user;
  },
  async login(identifier, password) {
    const d = await this.req('/api/login', { body: { identifier, password } });
    await Store.setAuth(d.token, d.user);
    return d.user;
  },
  async logout() {
    try { await this.req('/api/logout', { body: {} }); } catch { }
    await Store.setAuth('', null);
  },
  async me() { const d = await this.req('/api/me'); return d.user; },

  async saveProfile(patch) { return (await this.req('/api/me', { method: 'PATCH', body: patch })).user; },

  /* push local settings/bookmarks to the cloud (debounced) */
  pushCloud() {
    if (!Store.state.token) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(async () => {
      try {
        const u = await this.saveProfile({
          settings: Store.state.settings,
          bookmarks: Store.state.bookmarks
        });
        if (u) Store.state.user = u;
        showToast(I18n.t('cloud_synced'), 1600);
      } catch (e) { /* offline — will sync later */ }
    }, 1200);
  },

  /* pull cloud state after login */
  async pullCloud() {
    if (!Store.state.token) return;
    try {
      const u = await this.me();
      Store.state.user = u;
      let cloudSettings = {}, cloudMarks = [];
      try { cloudSettings = typeof u.settings === 'string' ? JSON.parse(u.settings) : (u.settings || {}); } catch { }
      try { cloudMarks = typeof u.bookmarks === 'string' ? JSON.parse(u.bookmarks) : (u.bookmarks || []); } catch { }
      if (cloudSettings && Object.keys(cloudSettings).length) {
        Store.state.settings = Object.assign(Store.state.settings, cloudSettings);
      }
      if (Array.isArray(cloudMarks) && cloudMarks.length) Store.state.bookmarks = cloudMarks.slice(0, 10);
      await Store.persist();
      Store.emit();
    } catch (e) { console.warn('pullCloud failed', e); }
  },

  users(q) { return this.req('/api/users?q=' + encodeURIComponent(q)); },
  friends() { return this.req('/api/friends'); },
  friendRequest(username) { return this.req('/api/friend/request', { body: { to_username: username } }); },
  friendAccept(id) { return this.req('/api/friend/accept', { body: { from_id: id } }); },
  friendDecline(id) { return this.req('/api/friend/decline', { body: { from_id: id } }); },
  friendRemove(id) { return this.req('/api/friend/remove', { body: { user_id: id } }); },
  messages(withId, after = 0) { return this.req(`/api/messages?with=${withId}&after=${after}`); },
  sendMessage(to, kind, content) { return this.req('/api/messages', { body: { to, kind, content } }); },
  setRole(userId, role) { return this.req('/api/role', { body: { user_id: userId, role } }); },

  async prices() {
    const c = Store.state.cache.prices;
    if (c && Date.now() - c.t < 15 * 60 * 1000) return c.data;
    const d = await this.req('/api/prices');
    Store.state.cache.prices = { t: Date.now(), data: d };
    Store.persist(['cache']);
    return d;
  }
};
