/* Tabora store — local persistence + cloud sync glue */
const Store = {
  state: {
    token: '',
    user: null,
    settings: {
      lang: 'fa',
      font: 'vazirmatn',
      scale: 1,
      clock24: true,
      tempUnit: 'c',
      engine: 'google',
      showSearchHints: true,
      widgets: { order: ['weather', 'prices', 'bookmarks', 'quote'], hidden: [] },
      wallpaper: { type: 'builtin', id: 'aurora', url: '' },
      accent: ''
    },
    bookmarks: [],
    cache: {}
  },
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach(f => { try { f(this.state); } catch (e) { console.error(e); } }); },

  async load() {
    const d = await chrome.storage.local.get(['token', 'user', 'settings', 'bookmarks', 'cache']);
    if (d.token) this.state.token = d.token;
    if (d.user) this.state.user = d.user;
    if (d.settings) this.state.settings = Object.assign(this.state.settings, d.settings, {
      widgets: Object.assign(this.state.settings.widgets, (d.settings || {}).widgets || {}),
      wallpaper: Object.assign(this.state.settings.wallpaper, (d.settings || {}).wallpaper || {})
    });
    if (Array.isArray(d.bookmarks)) this.state.bookmarks = d.bookmarks.slice(0, 10);
    if (d.cache) this.state.cache = d.cache;
  },
  async persist(keys) {
    const s = this.state;
    const all = { token: s.token, user: s.user, settings: s.settings, bookmarks: s.bookmarks, cache: s.cache };
    await chrome.storage.local.set(keys ? Object.fromEntries(keys.map(k => [k, all[k]])) : all);
  },
  setSettings(patch) {
    Object.assign(this.state.settings, patch);
    this.persist(['settings']);
    Api.pushCloud();
    this.emit();
  },
  setBookmarks(list) {
    this.state.bookmarks = list.slice(0, 10);
    this.persist(['bookmarks']);
    Api.pushCloud();
    this.emit();
  },
  async setAuth(token, user) {
    this.state.token = token || '';
    this.state.user = user || null;
    await this.persist(['token', 'user']);
    this.emit();
  }
};
