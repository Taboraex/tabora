/* Tabora — Site blocker 🚫 (declarativeNetRequest session rules; active during focus or always) */
const Blocker = {
  BASE_ID: 9000,
  flagOff() { const F = window.FLAGS || {}; return F.blocker === false; },
  list() { const b = Store.state.settings.blockList; return Array.isArray(b) ? b.slice(0, 15) : []; },
  mode() { return Store.state.settings.blockMode === 'always' ? 'always' : 'focus'; },
  /* focus session considered "on" when timer running in work mode */
  focusOn() { try { const f = Widgets.fzState(); return f.run && f.mode === 'work'; } catch { return false; } },
  active() { return !this.flagOff() && this.list().length > 0 && (this.mode() === 'always' || this.focusOn()); },

  paintBadge() {
    const badge = document.getElementById('fz-block');
    if (badge) badge.style.display = (this.list().length && this.mode() === 'focus' && this.focusOn()) ? '' : 'none';
  },

  async apply() {
    this.paintBadge();
    const dnr = (typeof chrome !== 'undefined' && chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateSessionRules)
      ? chrome.declarativeNetRequest : null;
    if (!dnr) return;                        /* browser preview shim — no-op */
    try {
      const old = await dnr.getSessionRules();
      await dnr.updateSessionRules({
        removeRuleIds: old.map(r => r.id),
        addRules: this.active() ? this.list().map((dom, i) => ({
          id: this.BASE_ID + i,
          priority: 1,
          action: { type: 'redirect', redirect: { url: chrome.runtime.getURL('blocked.html') + '?d=' + encodeURIComponent(dom) } },
          condition: { urlFilter: dom, resourceTypes: ['main_frame'] }
        })) : []
      });
    } catch (e) { /* rule limit / permission issue — ignore */ }
  },

  normalize(v) {
    return v.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '')
      .replace(/\/.*$/, '').slice(0, 60);
  },

  add(v) {
    const dom = this.normalize(v);
    if (!dom || !dom.includes('.')) return { err: 'err_block_invalid' };
    const l = this.list();
    if (l.includes(dom)) return { err: 'err_block_dup' };
    if (l.length >= 15) return { err: 'err_block_full' };
    l.push(dom);
    Store.setSettings({ blockList: l });
    this.apply();
    return { ok: true, dom };
  },

  remove(dom) {
    Store.setSettings({ blockList: this.list().filter(x => x !== dom) });
    this.apply();
  },

  setMode(m) { Store.setSettings({ blockMode: m }); this.apply(); }
};
