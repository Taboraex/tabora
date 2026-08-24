/* Tabora — boot & glue */
const ACCENTS = { cyan: '#22d3ee', rose: '#fb7185', lime: '#a3e635', violet: '#a78bfa' };
const App = {
  async boot() {
    await Store.load();
    I18n.lang = Store.state.settings.lang || 'fa';
    Wallpapers.init();
    Wallpapers.rotate(); /* auto wallpaper rotation (if enabled) */
    Wallpapers.apply();
    this.applyLang();
    this.applyFont();
    this.applyAccent();
    this.streak();
    this.beat();
    setInterval(() => this.beat(), 300000);
    /* remote feature flags → may hide widgets/panels; re-render when they land */
    Api.flags().then(f => {
      window.FLAGS = f || {};
      this.applyFlags();
      Widgets.renderAll();
    });
    this.checkUpdate();
    Widgets.renderAll();
    Social.renderDrawers();
    this.bindUI();
    this.bindXk();
    this.refreshIdentity();
    if (Store.state.token) {
      Api._pullDone = false; /* block pushes until the cloud pull lands */
      Api.pullCloud().then(() => {
        I18n.lang = Store.state.settings.lang || 'fa';
        this.applyLang(); this.applyFont();
        Widgets.renderAll(); this.refreshIdentity();
      });
    }
    Store.onChange(() => { });
  },

  applyLang() {
    I18n.applyLang(Store.state.settings.lang);
    Widgets.renderAll();
    this.refreshIdentity();
  },
  applyFont() {
    const f = FONTS.find(x => x.id === Store.state.settings.font) || FONTS[0];
    document.body.style.fontFamily = f.css;
  },
  applyAccent() {
    const id = Store.state.settings.accent || 'cyan';
    const hex = ACCENTS[id] || ACCENTS.cyan;
    const r = document.documentElement.style;
    r.setProperty('--accent', hex);
    r.setProperty('--accent-soft', hex + '2e');
    r.setProperty('--accent-glow', hex + '55');
  },
  streak() {
    const s = Store.state.settings;
    const today = new Date().toDateString();
    const yest = new Date(Date.now() - 86400000).toDateString();
    let sk = s.streak || { d: '', n: 0 };
    if (sk.d !== today) { sk = { d: today, n: sk.d === yest ? sk.n + 1 : 1 }; Store.setSettings({ streak: sk }); }
    const b = document.getElementById('streak');
    if (b) { b.textContent = '🔥 ' + sk.n; b.title = I18n.t('streak_tip'); }
  },
  beat() {
    const s = Store.state.settings;
    if (!s.uid) Store.setSettings({ uid: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()) });
    fetch(API_BASE + '/api/beat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: Store.state.settings.uid }) }).catch(() => { });
  },

  /* ---------- update check ---------- */
  semver(v) { return String(v || '0').split('.').map(x => parseInt(x, 10) || 0); },
  isNewer(a, b) {
    const x = this.semver(a), y = this.semver(b);
    for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; }
    return false;
  },
  async checkUpdate() {
    try {
      let cur = '0.0.0';
      try { cur = chrome.runtime.getManifest().version; } catch { }
      const d = await Api.latestVersion();
      if (!d || !d.ok || !d.version || !this.isNewer(d.version, cur)) return;
      const s = Store.state.settings;
      if (s.updDismissed === d.tag) return;
      const b = document.createElement('div');
      b.className = 'announce gold upd-banner';
      b.innerHTML = '';
      const msg = document.createElement('span');
      msg.textContent = '🎉 ' + I18n.t('upd_new') + ' (v' + d.version + ')';
      const dl = document.createElement('a');
      dl.className = 'btn primary sm upd-dl'; dl.href = d.url || (API_BASE + '/download'); dl.target = '_blank'; dl.rel = 'noopener';
      dl.textContent = I18n.t('upd_dl');
      const later = document.createElement('button');
      later.className = 'btn sm upd-later'; later.textContent = I18n.t('upd_later');
      later.onclick = () => { Store.setSettings({ updDismissed: d.tag }); b.remove(); };
      const x = document.createElement('button'); x.className = 'ann-x'; x.textContent = '✕'; x.onclick = () => b.remove();
      b.append(msg, dl, later, x);
      document.body.prepend(b);
    } catch (e) { /* offline */ }
  },

  /* ---------- remote feature flags ---------- */
  applyFlags() {
    const F = window.FLAGS || {};
    const hide = (id, off) => { const d = document.getElementById(id); if (d) d.style.display = off ? 'none' : ''; };
    hide('dock-friends', F.chat === false);
    hide('dock-wallpapers', F.wallpapers === false);
  },

  /* ---------- command palette ---------- */
  bindXk() {
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        const x = document.getElementById('xk');
        if (x.classList.contains('open')) this.xkClose(); else this.xkOpen();
      } else if (e.key === 'Escape') this.xkClose();
    });
    const inp = document.getElementById('xk-in');
    if (inp) inp.addEventListener('input', () => this.xkRender(inp.value));
  },
  xkCmds(q) {
    const out = [
      ['⚙️ ' + I18n.t('xk_settings'), () => Panels.open('panel-settings')],
      ['🌌 ' + I18n.t('xk_wall'), () => Panels.open('panel-wallpapers')],
      ['🌐 ' + I18n.t('xk_lang'), () => { Store.setSettings({ lang: Store.state.settings.lang === 'fa' ? 'en' : 'fa' }); this.applyLang(); }],
      ['⏱️ ' + I18n.t('xk_focus'), () => { const f = Widgets.fzState(); f.run = !f.run; Widgets.renderFocus(); }],
      ['🔖 ' + I18n.t('xk_bm'), () => Panels.openBookmarks()],
      ['🎨 ' + I18n.t('xk_accent'), () => { const ids = Object.keys(ACCENTS); const cur = ids.indexOf(Store.state.settings.accent || 'cyan'); Store.setSettings({ accent: ids[(cur + 1) % ids.length] }); this.applyAccent(); }]
    ];
    return q ? out.filter(c => c[0].includes(q)) : out;
  },
  xkOpen() {
    const x = document.getElementById('xk');
    x.classList.add('open');
    const inp = document.getElementById('xk-in');
    inp.value = '';
    this.xkRender('');
    inp.focus();
  },
  xkClose() { const x = document.getElementById('xk'); if (x) x.classList.remove('open'); },
  xkRender(q) {
    this._xk = this.xkCmds(q);
    const list = document.getElementById('xk-list');
    list.innerHTML = this._xk.map((c, i) => '<div data-i="' + i + '" class="' + (i === 0 ? 'sel' : '') + '">' + c[0] + '</div>').join('');
    list.querySelectorAll('div').forEach(d => {
      d.onclick = () => { this._xk[parseInt(d.dataset.i, 10)][1](); this.xkClose(); };
    });
    const inp = document.getElementById('xk-in');
    inp.onkeydown = e => { if (e.key === 'Enter') { const s = list.querySelector('.sel'); if (s) s.click(); } };
  },

  refreshIdentity() {
    const chip = document.getElementById('identity');
    const u = Store.state.user;
    if (Store.state.token && u) {
      chip.innerHTML = `${Social.avatarHTML(u, 'chip-avatar')}<span class="chip-name">${Social.escapeHtml(u.name || u.username)}</span>${Social.badgeHTML(u.role)}`;
      chip.onclick = () => Panels.open('panel-profile');
    } else {
      chip.innerHTML = `<span class="chip-avatar avatar-fallback">👤</span><span class="chip-name">${I18n.t('login')}</span>`;
      chip.onclick = () => Panels.openAuth('login');
    }
  },

  bindUI() {
    /* top bar */
    document.getElementById('lang-toggle').onclick = () => {
      Store.setSettings({ lang: Store.state.settings.lang === 'fa' ? 'en' : 'fa' });
      this.applyLang();
      document.querySelectorAll('.panel.open').forEach(p => { /* re-render open panel */ });
    };

    /* search */
    document.getElementById('searchbar').onclick = () => Search.open();
    document.getElementById('search-input').addEventListener('input', (e) => Search.suggest(e.target.value));
    document.getElementById('search-input').addEventListener('keydown', (e) => Search.onKey(e));
    document.getElementById('search-close').onclick = () => Search.close();

    /* dock */
    document.getElementById('dock-search').onclick = () => Search.open();
    document.getElementById('dock-wallpapers').onclick = () => Panels.open('panel-wallpapers');
    document.getElementById('dock-bookmarks').onclick = () => Panels.openBookmarks();
    document.getElementById('dock-friends').onclick = () => Panels.open('panel-friends');
    document.getElementById('dock-support').onclick = () => Panels.open('panel-support');
    document.getElementById('dock-settings').onclick = () => Panels.open('panel-settings');

    /* backdrop / esc */
    document.getElementById('backdrop').onclick = () => Panels.closeAll();
    document.querySelectorAll('.panel-close').forEach(b => b.onclick = () => Panels.closeAll());
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { Panels.closeAll(); document.getElementById('avatar-overlay').classList.remove('open'); Search.close(); }
    });

    /* auth forms */
    document.getElementById('auth-to-register').onclick = () => Panels.authMode('register');
    document.getElementById('auth-to-login').onclick = () => Panels.authMode('login');
    document.getElementById('auth-to-recover').onclick = () => Panels.authMode('recover');
    document.getElementById('recover-to-login').onclick = () => Panels.authMode('login');
    document.getElementById('recover-btn').onclick = () => Panels.doRecover();
    document.getElementById('login-btn').onclick = () => Panels.doLogin();
    document.getElementById('register-btn').onclick = () => Panels.doRegister();
    document.querySelectorAll('.eye').forEach(b => {
      b.onclick = () => {
        const inp = document.getElementById(b.dataset.for);
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.classList.toggle('on', show);
        inp.focus();
      };
    });

    /* announcement banner pushed from the admin panel */
    (async () => {
      try {
        const r = await fetch(API_BASE + '/api/announce');
        const d = await r.json();
        if (d && d.text) {
          const b = document.createElement('div');
          b.className = 'announce ' + (d.level || 'info');
          const s = document.createElement('span'); s.textContent = d.text;
          const x = document.createElement('button'); x.className = 'ann-x'; x.textContent = '✕';
          x.onclick = () => b.remove();
          b.append(s, x);
          document.body.prepend(b);
        }
      } catch (e) { /* offline */ }
    })();
    document.getElementById('auth-guest').onclick = () => Panels.closeAll();

    /* friends panel */
    let userSearchTimer = 0;
    document.getElementById('user-search').addEventListener('input', (e) => {
      clearTimeout(userSearchTimer);
      userSearchTimer = setTimeout(() => Social.searchUsers(e.target.value), 350);
    });

    /* chat */
    document.getElementById('chat-back').onclick = () => Social.closeChat();
    document.getElementById('chat-send').onclick = () => Social.sendText();
    document.getElementById('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') Social.sendText(); });
    document.getElementById('photo-btn').onclick = () => Social.pickPhoto();
    document.getElementById('voice-btn').onclick = () => Social.toggleVoice();
    document.getElementById('sticker-btn').onclick = () => Social.openStickers();
    document.getElementById('gif-btn').onclick = () => Social.openGifs();

    /* avatar overlay close */
    document.getElementById('avatar-close').onclick = () => document.getElementById('avatar-overlay').classList.remove('open');

    /* widget drag & drop on the new tab */
    let dragW = null;
    const row = document.getElementById('widgets-row');
    row.addEventListener('dragstart', (e) => {
      const w = e.target.closest('.widget'); if (!w) return;
      dragW = w.dataset.wid; w.classList.add('dragging');
    });
    row.addEventListener('dragend', (e) => { const w = e.target.closest('.widget'); if (w) w.classList.remove('dragging'); });
    row.addEventListener('dragover', (e) => e.preventDefault());
    row.addEventListener('drop', (e) => {
      const target = e.target.closest('.widget');
      if (!target || !dragW || target.dataset.wid === dragW) return;
      const s = Store.state.settings.widgets;
      const order = [...s.order];
      const from = order.indexOf(dragW), to = order.indexOf(target.dataset.wid);
      order.splice(from, 1); order.splice(to, 0, dragW);
      Store.setSettings({ widgets: { order, hidden: s.hidden } });
      Widgets.renderAll();
    });
    /* make widgets draggable */
    new MutationObserver(() => {
      row.querySelectorAll('.widget').forEach(w => w.draggable = true);
    }).observe(row, { childList: true });
    row.querySelectorAll('.widget').forEach(w => w.draggable = true);
  }
};

/* toast */
let toastTimer = 0;
function showToast(msg, ms = 2200) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

document.addEventListener('DOMContentLoaded', () => App.boot());
