/* Tabora — boot & glue */
const App = {
  async boot() {
    await Store.load();
    I18n.lang = Store.state.settings.lang || 'fa';
    Wallpapers.init();
    Wallpapers.apply();
    this.applyLang();
    this.applyFont();
    Widgets.renderAll();
    Social.renderDrawers();
    this.bindUI();
    this.refreshIdentity();
    if (Store.state.token) {
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
    document.getElementById('login-btn').onclick = () => Panels.doLogin();
    document.getElementById('register-btn').onclick = () => Panels.doRegister();
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
