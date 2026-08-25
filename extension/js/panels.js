/* Tabora Panels — auth, profile (+71 animated avatars), wallpapers, settings, bookmarks */
const FONTS = [
  { id: 'vazirmatn', name: 'Vazirmatn', css: "'Vazirmatn','Inter',sans-serif" },
  { id: 'lalezar', name: 'Lalezar', css: "'Lalezar','Vazirmatn',sans-serif" },
  { id: 'inter', name: 'Inter', css: "'Inter','Vazirmatn',sans-serif" },
  { id: 'grotesk', name: 'Space Grotesk', css: "'Space Grotesk','Vazirmatn',sans-serif" },
  { id: 'poppins', name: 'Poppins', css: "'Poppins','Vazirmatn',sans-serif" }
];

const Panels = {
  extVersion() {
    try { return chrome.runtime.getManifest().version; } catch { return '1.2.0'; }
  },
  applyFontSafe() { try { App.applyFont(); App.applyAccent(); } catch (e) { } },
  open(id) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    const p = document.getElementById(id);
    if (p) { p.classList.add('open'); document.getElementById('backdrop').classList.add('show'); }
    if (id === 'panel-friends') Social.renderFriendsPanel();
    if (id === 'panel-profile') this.renderProfile();
    if (id === 'panel-wallpapers') this.renderWallpapers();
    if (id === 'panel-support') this.renderSupport();
    if (id === 'panel-settings') this.renderSettings();
    if (id === 'panel-events') this.renderEventsManager();
    if (id === 'panel-pray') this.renderPray();
    if (id === 'panel-city') this.renderCity();
  },
  closeAll() {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    document.getElementById('backdrop').classList.remove('show');
    Social.closeChat();
  },

  /* ================= AUTH ================= */
  openAuth(mode) {
    this.open('panel-auth');
    this.authMode(mode);
  },
  authMode(mode) {
    document.getElementById('auth-login').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('auth-register').style.display = mode === 'register' ? 'block' : 'none';
    const rec = document.getElementById('auth-recover');
    if (rec) rec.style.display = mode === 'recover' ? 'block' : 'none';
  },
  async doLogin() {
    const idf = document.getElementById('login-id').value.trim();
    const pw = document.getElementById('login-pw').value;
    try {
      await Api.login(idf, pw);
      await Api.pullCloud();
      showToast('👋 ' + I18n.t('login_title'));
      this.closeAll();
      App.refreshIdentity();
    } catch (e) { showToast(I18n.t('err_' + (e.code || 'generic'))); }
  },
  async doRegister() {
    const email = document.getElementById('reg-email').value.trim();
    const uname = document.getElementById('reg-uname').value.trim();
    const pw = document.getElementById('reg-pw').value;
    const name = document.getElementById('reg-name').value.trim();
    try {
      const d = await Api.register(email, uname, pw, name);
      if (d && d.recovery) this.showCodeModal(d.recovery);
      await Api.pullCloud();
      showToast('🎉 ' + I18n.t('register_title'));
      this.closeAll();
      App.refreshIdentity();
    } catch (e) { showToast(I18n.t('err_' + (e.code || 'generic'))); }
  },
  async doRecover() {
    const idf = document.getElementById('rec-id').value.trim();
    const code = document.getElementById('rec-code').value.trim();
    const pw = document.getElementById('rec-pw').value;
    try {
      await Api.recover(idf, code, pw);
      showToast(I18n.t('recovered_ok'), 4200);
      this.authMode('login');
      document.getElementById('login-id').value = idf;
    } catch (e) { showToast(I18n.t('err_' + (e.code || 'generic')), 3200); }
  },
  showCodeModal(code) {
    const ov = document.createElement('div');
    ov.className = 'code-modal';
    ov.innerHTML = `<div class="code-box">
      <h3>${I18n.t('reg_code_title')}</h3>
      <p class="muted">${I18n.t('reg_code_hint')}</p>
      <div class="code-val" dir="ltr">${code}</div>
      <div class="row-btns"><button class="btn primary" id="copy-code">${I18n.t('copy_code')}</button><button class="btn" id="close-code">✕</button></div>
    </div>`;
    document.body.appendChild(ov);
    const copyTxt = () => {
      const done = () => showToast(I18n.t('copied_code'), 2000);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done).catch(done);
      else done();
    };
    ov.querySelector('#copy-code').onclick = copyTxt;
    ov.querySelector('#close-code').onclick = () => ov.remove();
  },
  async doLogout() {
    await Api.logout();
    this.closeAll();
    App.refreshIdentity();
    showToast('👋');
  },

  /* ================= PROFILE ================= */
  renderProfile() {
    const box = document.getElementById('profile-body');
    if (!Store.state.token) {
      box.innerHTML = `<div class="need-auth">${I18n.t('auth_hint')}<br><br>
        <button class="btn primary" onclick="Panels.openAuth('login')">${I18n.t('login')}</button>
        <button class="btn" onclick="Panels.openAuth('register')">${I18n.t('register')}</button></div>`;
      return;
    }
    const u = Store.state.user || {};
    box.innerHTML = `
      <div class="pf-hero glass">
        <div class="pf-avatar-wrap" id="pf-avatar-wrap">${Social.avatarHTML(u, 'pf-avatar')}</div>
        <button class="btn small" id="pf-pick-avatar">🎭 ${I18n.t('choose_avatar')}</button>
        <div class="pf-id">
          <h3>${Social.escapeHtml(u.name || '')} ${Social.badgeHTML(u.role)}</h3>
          <span class="muted">@${u.username}</span>
        </div>
      </div>
      <label class="fld"><span>${I18n.t('display_name')}</span><input id="pf-name" maxlength="40" value="${Social.escapeHtml(u.name || '')}"></label>
      <label class="fld"><span>${I18n.t('username')}</span><input id="pf-uname" maxlength="20" value="${u.username || ''}"></label>
      <label class="fld"><span>${I18n.t('bio')}</span><textarea id="pf-bio" maxlength="200" rows="3">${Social.escapeHtml(u.bio || '')}</textarea></label>
      <div class="row-btns">
        <button class="btn primary" id="pf-save">💾 ${I18n.t('save')}</button>
        <button class="btn danger" id="pf-logout">${I18n.t('logout')}</button>
      </div>`;
    document.getElementById('pf-pick-avatar').onclick = () => this.openAvatarPicker();
    document.getElementById('pf-save').onclick = async () => {
      try {
        const u2 = await Api.saveProfile({
          name: document.getElementById('pf-name').value,
          username: document.getElementById('pf-uname').value,
          bio: document.getElementById('pf-bio').value
        });
        Store.state.user = u2; await Store.persist(['user']);
        showToast(I18n.t('profile_saved'));
        App.refreshIdentity();
      } catch (e) { showToast(I18n.t('err_' + (e.code || 'generic'))); }
    };
    document.getElementById('pf-logout').onclick = () => this.doLogout();
  },

  /* ================= AVATAR PICKER (redesigned) ================= */
  avCat: 'all',
  openAvatarPicker() {
    const ov = document.getElementById('avatar-overlay');
    ov.classList.add('open');
    this.renderAvatarChips();
    this.renderAvatarGrid();
    this.bindAvatarTabs();
  },

  avatarCategoryOf(id) {
    const n = parseInt(id.slice(3), 10);
    if ([32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56].includes(n)) return 'animals';
    if ([15,16,17,18,19,30,31,70,71].includes(n)) return 'art';
    if ([4,10,11,12,13,14,63,64].includes(n)) return 'fun';
    return 'anime';
  },
  avTagEmoji(cat) { return { animals: '🐾', art: '🎨', fun: '🎲', anime: '🌸' }[cat] || '🌸'; },

  renderAvatarChips() {
    const chips = document.getElementById('av-chips');
    if (!chips) return;
    const counts = { all: 71, animals: 0, anime: 0, art: 0, fun: 0 };
    for (let i = 1; i <= 71; i++) counts[this.avatarCategoryOf('av-' + String(i).padStart(3, '0'))]++;
    const defs = [['all', 'av_all'], ['animals', 'av_animals'], ['anime', 'av_anime'], ['art', 'av_art'], ['fun', 'av_fun']];
    chips.innerHTML = '';
    defs.forEach(([id, key]) => {
      const b = document.createElement('button');
      b.className = 'ao-chip' + (this.avCat === id ? ' active' : '');
      b.innerHTML = (id === 'all' ? '✨ ' : this.avTagEmoji(id) + ' ') + I18n.t(key) + '<b>' + counts[id] + '</b>';
      b.onclick = () => { this.avCat = id; this.renderAvatarChips(); this.renderAvatarGrid(); };
      chips.appendChild(b);
    });
  },

  renderAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;
    const current = Store.state.user ? Store.state.user.avatar : '';
    grid.innerHTML = '';
    let shown = 0;
    for (let i = 1; i <= 71; i++) {
      const id = 'av-' + String(i).padStart(3, '0');
      if (this.avCat !== 'all' && this.avatarCategoryOf(id) !== this.avCat) continue;
      shown++;
      const cell = document.createElement('button');
      cell.className = 'av-cell' + (current === 'bundle:' + id ? ' selected' : '');
      cell.dataset.av = id;
      cell.style.animationDelay = (Math.min(shown, 24) * 22) + 'ms';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = 'assets/avatars/' + id + '.gif';
      img.alt = id;
      img.onload = () => img.classList.add('ready');
      cell.appendChild(img);
      const tag = document.createElement('span');
      tag.className = 'av-tag';
      tag.textContent = this.avTagEmoji(this.avatarCategoryOf(id));
      cell.appendChild(tag);
      const check = document.createElement('span');
      check.className = 'av-check';
      check.textContent = '✓';
      cell.appendChild(check);
      cell.onclick = () => this.pickAvatar('bundle:' + id);
      grid.appendChild(cell);
    }
    const rnd = document.getElementById('av-random');
    if (rnd) {
      rnd.onclick = () => {
        const cells = [...grid.querySelectorAll('.av-cell')];
        if (!cells.length) return;
        rnd.classList.add('rolling');
        setTimeout(() => rnd.classList.remove('rolling'), 650);
        const pick = cells[Math.floor(Math.random() * cells.length)];
        pick.classList.add('flash');
        setTimeout(() => this.pickAvatar('bundle:' + pick.dataset.av), 420);
      };
    }
  },

  bindAvatarTabs() {
    const tabs = document.querySelectorAll('.ao-tab');
    if (!tabs.length || tabs[0].dataset.bound) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.atab === 'gallery'));
      return;
    }
    tabs.forEach(t => {
      t.dataset.bound = '1';
      t.onclick = () => {
        tabs.forEach(x => x.classList.toggle('active', x === t));
        ['gallery', 'upload', 'url'].forEach(v => {
          const p = document.getElementById('avtab-' + v);
          if (p) p.style.display = t.dataset.atab === v ? 'block' : 'none';
        });
      };
    });
    /* upload tab */
    const drop = document.getElementById('av-drop');
    if (drop && !drop.dataset.bound) {
      drop.dataset.bound = '1';
      const filePick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            const sc = Math.min(1, 240 / Math.max(img.width, img.height));
            c.width = img.width * sc; c.height = img.height * sc;
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            const data = c.toDataURL('image/png');
            const pv = document.getElementById('av-up-preview');
            pv.innerHTML = ''; const im = document.createElement('img'); im.src = data; pv.appendChild(im);
            const saveBtn = document.getElementById('av-up-save');
            saveBtn.disabled = false;
            saveBtn.onclick = () => this.pickAvatar(data);
          };
          img.src = URL.createObjectURL(f);
        };
        inp.click();
      };
      drop.onclick = filePick;
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('hover'); };
      drop.ondragleave = () => drop.classList.remove('hover');
      drop.ondrop = (e) => {
        e.preventDefault(); drop.classList.remove('hover');
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith('image/')) {
          const dt = new DataTransfer(); dt.items.add(f);
          const fake = { files: dt.files };
          const inp = { files: fake.files, onchange: null };
          /* reuse same pipeline */
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            const sc = Math.min(1, 240 / Math.max(img.width, img.height));
            c.width = img.width * sc; c.height = img.height * sc;
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            const data = c.toDataURL('image/png');
            const pv = document.getElementById('av-up-preview');
            pv.innerHTML = ''; const im = document.createElement('img'); im.src = data; pv.appendChild(im);
            const saveBtn = document.getElementById('av-up-save');
            saveBtn.disabled = false;
            saveBtn.onclick = () => this.pickAvatar(data);
          };
          img.src = URL.createObjectURL(f);
        }
      };
    }
    /* url tab */
    const urlPrev = document.getElementById('av-url-prev');
    if (urlPrev && !urlPrev.dataset.bound) {
      urlPrev.dataset.bound = '1';
      const show = () => {
        const v = document.getElementById('av-url').value.trim();
        const pv = document.getElementById('av-url-preview');
        pv.innerHTML = '';
        if (!v.startsWith('http')) return;
        const im = document.createElement('img');
        im.src = v;
        im.onerror = () => { pv.textContent = '⚠️'; };
        pv.appendChild(im);
      };
      urlPrev.onclick = show;
      document.getElementById('av-url-save').onclick = () => {
        const v = document.getElementById('av-url').value.trim();
        if (v.startsWith('http')) this.pickAvatar(v);
      };
      document.getElementById('av-url').onkeydown = (e) => { if (e.key === 'Enter') show(); };
    }
  },
  async pickAvatar(val) {
    try {
      const u = await Api.saveProfile({ avatar: val, avatar_kind: val.startsWith('bundle:') ? 'bundle' : 'custom' });
      Store.state.user = u; await Store.persist(['user']);
      document.getElementById('avatar-overlay').classList.remove('open');
      showToast(I18n.t('profile_saved'));
      this.renderProfile();
      App.refreshIdentity();
    } catch (e) { showToast(I18n.t('err_generic')); }
  },

  /* ================= WALLPAPERS ================= */
  favWalls() { return Store.state.settings.favWalls || []; },
  setFavWalls(list) { Store.setSettings({ favWalls: list.slice(0, 20) }); },
  favHas(f) { return this.favWalls().some(x => x.id === f.id && x.url === f.url); },
  toggleFav(f) {
    let list = this.favWalls();
    if (this.favHas(f)) list = list.filter(x => !(x.id === f.id && x.url === f.url));
    else list.push(f);
    this.setFavWalls(list);
    showToast(this.favHas(f) ? I18n.t('wp_fav_added') : I18n.t('wp_fav_removed'), 1800);
    this.renderWallpapers();
  },
  wallName(wp) {
    if (wp.type === 'builtin' || !wp.type) {
      const w = Wallpapers.list.find(x => x.id === wp.id);
      return w ? (I18n.lang === 'fa' ? w.fa : w.en) : (wp.id || '?');
    }
    const ext = (typeof EXT_WALLPAPERS !== 'undefined' ? EXT_WALLPAPERS : []).find(x => x.id === wp.id);
    return wp.name || (ext && ext.name) || (wp.id || '🖼️');
  },

  renderWallpapers() {
    const box = document.getElementById('wallpapers-body');
    const cur = Store.state.settings.wallpaper;
    const s = Store.state.settings;
    const favs = this.favWalls();
    let html = `<div class="sec-label">🔄 ${I18n.t('wp_rotate')}</div>
    <div class="wp-custom glass wp-rot-row">
      <select id="wp-rotate">
        <option value="off">${I18n.t('rot_off')}</option>
        <option value="6h">${I18n.t('rot_6h')}</option>
        <option value="daily">${I18n.t('rot_daily')}</option>
      </select>
      <button class="btn" id="wp-fav-cur" title="${I18n.t('wp_fav_added')}">❤️ ${I18n.t('wp_favs').replace('❤️ ', '')}</button>
    </div>
    <div class="sec-label">${I18n.t('wp_favs')}</div>
    <div class="wp-favs">${favs.map((f, i) => `<span class="fav-chip"><button class="fav-apply" data-fi="${i}">${f.name || f.id || '🖼️'}</button><button class="fav-x" data-fr="${i}">✕</button></span>`).join('') || `<div class="tip">💡 ${I18n.t('wp_fav_empty')}</div>`}</div>
    <div class="sec-label">${I18n.t('wp_builtin')}</div><div class="wp-grid">`;
    Wallpapers.list.forEach(w => {
      html += `<button class="wp-card ${cur.type === 'builtin' && cur.id === w.id ? 'active' : ''}" data-wp="${w.id}">
        <canvas class="wp-thumb" data-id="${w.id}" width="150" height="86"></canvas>
        <span class="wp-name">${I18n.lang === 'fa' ? w.fa : w.en}</span>
      </button>`;
    });
    html += `</div>
    <div class="sec-label">🌐 ${I18n.t('wp_web')}</div>
    <div class="wp-grid">`;
    (typeof EXT_WALLPAPERS !== 'undefined' ? EXT_WALLPAPERS : []).forEach(w => {
      const active = (cur.type === 'video' && cur.id === w.id) ? 'active' : '';
      const favd = favs.some(f => f.id === w.id) ? 'on' : '';
      html += `<button class="wp-card ${active}" data-ext="${w.id}" title="${w.name}">
        <span class="wp-heart ${favd}" data-heart="${w.id}">♥</span>
        <img class="wp-thumb" loading="lazy" src="${w.thumb}" alt="${w.name}">
        <span class="wp-src">${w.src}</span>
        <span class="wp-name">${w.name}</span>
      </button>`;
    });
    html += `</div>
    <div class="tip">💡 ${I18n.t('wp_web_credit')}</div>
    <div class="sec-label">${I18n.t('wp_custom_url')}</div>
    <div class="wp-custom glass">
      <input id="wp-url" placeholder="https://… .mp4 / .webm / .jpg / .png">
      <button class="btn primary" id="wp-url-apply">${I18n.t('save')}</button>
    </div>
    <div class="sec-label">${I18n.t('wp_upload')}</div>
    <div class="wp-custom glass"><button class="btn" id="wp-file-btn">📁 ${I18n.t('wp_upload')}</button></div>
    <div class="tip">💡 ${I18n.t('smart_theme_applied')}</div>`;
    box.innerHTML = html;
    box.querySelectorAll('.wp-card[data-wp]').forEach(c => {
      c.onclick = () => {
        Store.setSettings({ wallpaper: { type: 'builtin', id: c.dataset.wp, url: '' } });
        Wallpapers.apply();
        showToast(I18n.t('smart_theme_applied'), 2200);
        this.renderWallpapers();
      };
    });
    box.querySelectorAll('.wp-card[data-ext]').forEach(c => {
      c.onclick = (e) => {
        const heart = e.target.closest('.wp-heart');
        const w = (typeof EXT_WALLPAPERS !== 'undefined' ? EXT_WALLPAPERS : []).find(x => x.id === c.dataset.ext);
        if (!w) return;
        if (heart) { /* favorite toggle — don't change wallpaper */
          this.toggleFav({ type: 'video', id: w.id, url: w.video, accent: w.accent, name: w.name });
          return;
        }
        Store.setSettings({ wallpaper: { type: 'video', id: w.id, url: w.video, accent: w.accent } });
        Wallpapers.apply();
        showToast('🌐 ' + w.name + ' — ' + I18n.t('smart_theme_applied'), 2600);
        this.renderWallpapers();
      };
    });
    /* rotation + favorites controls */
    const rot = box.querySelector('#wp-rotate');
    if (rot) {
      rot.value = s.wpRotate || 'off';
      rot.onchange = () => {
        Store.setSettings({ wpRotate: rot.value, wpNext: rot.value === 'off' ? 0 : Date.now() + (rot.value === '6h' ? 6 * 3600000 : 24 * 3600000) });
        showToast('🔄 ' + rot.options[rot.selectedIndex].textContent, 1600);
      };
    }
    const favCur = box.querySelector('#wp-fav-cur');
    if (favCur) favCur.onclick = () => {
      const f = Object.assign({}, cur, { name: this.wallName(cur) });
      if (!f.id && !f.url) return;
      if (this.favHas(f)) { showToast(I18n.t('wp_fav_added'), 1500); return; }
      this.setFavWalls([...this.favWalls(), f]);
      showToast(I18n.t('wp_fav_added'), 1800);
      this.renderWallpapers();
    };
    box.querySelectorAll('.fav-apply').forEach(b => {
      b.onclick = () => {
        const f = this.favWalls()[+b.dataset.fi];
        if (!f) return;
        Store.setSettings({ wallpaper: f });
        Wallpapers.apply();
        this.closeAll();
        showToast('🖼️ ' + (f.name || ''), 1800);
      };
    });
    box.querySelectorAll('.fav-x').forEach(b => {
      b.onclick = () => {
        const list = this.favWalls();
        list.splice(+b.dataset.fr, 1);
        this.setFavWalls(list);
        this.renderWallpapers();
      };
    });
    box.querySelector('#wp-url-apply').onclick = () => {
      const v = box.querySelector('#wp-url').value.trim();
      if (!v.startsWith('http')) return;
      const isVideo = /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(v);
      Store.setSettings({ wallpaper: { type: isVideo ? 'video' : 'image', id: '', url: v } });
      Wallpapers.apply();
    };
    box.querySelector('#wp-file-btn').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*,video/*';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const url = URL.createObjectURL(f);
        const isVideo = f.type.startsWith('video');
        Store.setSettings({ wallpaper: { type: isVideo ? 'video' : 'image', id: '', url } });
        Wallpapers.apply();
        showToast(I18n.t('smart_theme_applied'), 2200);
      };
      inp.click();
    };
    this.startThumbs();
  },
  startThumbs() {
    document.querySelectorAll('.wp-thumb').forEach(cv => {
      const id = cv.dataset.id, ctx = cv.getContext('2d');
      const painter = Wallpapers.painters[id];
      const state = Wallpapers.stateFor(id);
      let t = Math.random() * 10;
      const tick = () => {
        if (!document.getElementById('panel-wallpapers').classList.contains('open')) return;
        t += 1 / 30;
        painter(ctx, cv.width, cv.height, t, state);
        setTimeout(() => requestAnimationFrame(tick), 66);
      };
      tick();
    });
  },

  /* ================= BOOKMARKS MANAGER ================= */
  openBookmarks() {
    this.open('panel-bookmarks');
    this.renderBookmarksManager();
  },
  renderBookmarksManager() {
    const box = document.getElementById('bookmarks-body');
    const marks = Store.state.bookmarks;
    box.innerHTML = `
      <div class="tip">🧠 ${I18n.t('bookmarks_smart')}</div>
      <div class="bm-form glass">
        <input id="bm-url" data-i18n-ph="bookmark_url" placeholder="${I18n.t('bookmark_url')}">
        <input id="bm-name" data-i18n-ph="bookmark_name" placeholder="${I18n.t('bookmark_name')}">
        <button class="btn primary" id="bm-add">${I18n.t('add_bookmark')}</button>
        <div id="bm-detect" class="muted"></div>
      </div>
      <div class="bm-list">${marks.map((m, i) => {
        const b = detectBrand(m.url);
        return `<div class="fr-row glass">
          <span class="bm-dot" style="background:${b ? b.color : '#555'}"></span>
          <div class="fr-info"><b>${m.name || (b && b.name) || '?'}</b><span class="muted"> ${m.url}</span></div>
          <div class="fr-actions"><button class="btn small danger" data-i="${i}">✕</button></div>
        </div>`;
      }).join('') || `<div class="muted pad">${I18n.t('bookmarks_empty')}</div>`}</div>`;
    const urlInp = box.querySelector('#bm-url');
    urlInp.oninput = () => {
      const b = detectBrand(urlInp.value.trim());
      box.querySelector('#bm-detect').innerHTML = b && b.known
        ? `✅ ${I18n.t('bookmark_detected')}: <b style="color:${b.color}">${b.name}</b>`
        : (b ? '🌐 ' + b.host : '');
    };
    box.querySelector('#bm-add').onclick = () => {
      const url = urlInp.value.trim(), name = box.querySelector('#bm-name').value.trim();
      const b = detectBrand(url);
      if (!b) return showToast(I18n.t('err_generic'));
      if (marks.length >= 10) return showToast('🔟 ' + I18n.t('bookmarks_full'));
      marks.push({ url: b.url, name });
      Store.setBookmarks(marks);
      Widgets.renderBookmarks();
      this.renderBookmarksManager();
      showToast('🔖 ✨');
    };
    box.querySelectorAll('.bm-list button[data-i]').forEach(b => {
      b.onclick = () => {
        marks.splice(+b.dataset.i, 1);
        Store.setBookmarks(marks);
        Widgets.renderBookmarks();
        this.renderBookmarksManager();
      };
    });
  },

  /* ================= PERSONAL EVENTS (Jalali) ================= */
  openEvents() {
    const j = Jalali.today();
    if (!this.evYear) { this.evYear = j.jy; this.evMonth = j.jm; this.evDay = j.jd; }
    this.open('panel-events');
    this.renderEventsManager();
  },
  evSortTs(e) {
    const p = String(e.d).split('/').map(Number);
    return Jalali.toGregorian(p[0], p[1], p[2]).getTime();
  },
  renderEventsManager() {
    const box = document.getElementById('events-body');
    if (!box) return;
    const fa = I18n.lang === 'fa';
    const months = fa ? Jalali.MONTHS_FA : Jalali.MONTHS_EN;
    const days = fa ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] : ['S', 'S', 'M', 'T', 'W', 'T', 'F'];
    const y = this.evYear, m = this.evMonth;
    const len = Jalali.monthLength(y, m);
    const firstIdx = Jalali.weekIndexOf(y, m, 1);
    const today = Jalali.today();
    const todayKey = Jalali.key(today.jy, today.jm, today.jd);
    let grid = '';
    for (let i = 0; i < firstIdx; i++) grid += '<span class="ev-blank"></span>';
    for (let dd = 1; dd <= len; dd++) {
      const k = Jalali.key(y, m, dd);
      const cls = ['ev-day'];
      if (k === todayKey) cls.push('today');
      if (this.evDay === dd && this.evMonth === m && this.evYear === y) cls.push('sel');
      const hasEv = Widgets.myEvents().some(e => e.d === k);
      grid += `<button class="${cls.join(' ')}" data-d="${dd}">${fa ? Jalali.toFaDigits(dd) : dd}${hasEv ? '<i></i>' : ''}</button>`;
    }
    const events = Widgets.myEvents().slice().sort((a, b) => this.evSortTs(a) - this.evSortTs(b));
    const nowTs = Date.now();
    box.innerHTML = `
      <div class="ev-picker glass">
        <div class="ev-head">
          <button class="icon-btn" id="ev-prev">›</button>
          <b>${months[m - 1]} ${fa ? Jalali.toFaDigits(y) : y}</b>
          <button class="icon-btn" id="ev-next">‹</button>
        </div>
        <div class="ev-week">${days.map(x => '<span>' + x + '</span>').join('')}</div>
        <div class="ev-grid">${grid}</div>
      </div>
      <div class="ev-form glass">
        <input id="ev-title" maxlength="60" data-i18n-ph="ev_title_ph" placeholder="${I18n.t('ev_title_ph')}">
        <button class="btn primary" id="ev-save">${I18n.t('ev_save')}</button>
      </div>
      <div class="sec-label">📌 ${I18n.t('widget_events')} (${events.length})</div>
      <div class="ev-list">${events.map((e, i) => {
        const p = String(e.d).split('/').map(Number);
        const past = this.evSortTs(e) < nowTs - 86400000;
        return `<div class="ev-row ${past ? 'past' : ''}">
          <span class="ev-date">${Jalali.fmt(Jalali.toGregorian(p[0], p[1], p[2]))}${past ? ' · ' + I18n.t('ev_past') : ''}</span>
          <b class="ev-name">${String(e.t).replace(/</g, '&lt;')}</b>
          <button class="btn small danger" data-i="${i}">✕</button>
        </div>`;
      }).join('') || `<div class="muted pad">${I18n.t('ev_empty')}</div>`}</div>`;
    box.querySelector('#ev-prev').onclick = () => {
      this.evMonth--; if (this.evMonth < 1) { this.evMonth = 12; this.evYear--; }
      this.evDay = Math.min(this.evDay, Jalali.monthLength(this.evYear, this.evMonth));
      this.renderEventsManager();
    };
    box.querySelector('#ev-next').onclick = () => {
      this.evMonth++; if (this.evMonth > 12) { this.evMonth = 1; this.evYear++; }
      this.evDay = Math.min(this.evDay, Jalali.monthLength(this.evYear, this.evMonth));
      this.renderEventsManager();
    };
    box.querySelectorAll('.ev-day').forEach(b => {
      b.onclick = () => { this.evDay = +b.dataset.d; this.renderEventsManager(); };
    });
    box.querySelector('#ev-save').onclick = () => {
      const t = box.querySelector('#ev-title').value.trim();
      if (!t) return;
      const list = Widgets.myEvents();
      if (list.length >= 30) { showToast(I18n.t('ev_full')); return; }
      const k = Jalali.key(this.evYear, this.evMonth, this.evDay);
      if (list.some(e => e.d === k && e.t === t)) { showToast('✔'); return; }
      list.push({ t, d: k, c: Date.now() });
      Store.setSettings({ events: list });
      showToast(I18n.t('ev_added'), 2000);
      box.querySelector('#ev-title').value = '';
      Widgets.renderCalendar();
      this.renderEventsManager();
    };
    box.querySelectorAll('.ev-row button[data-i]').forEach(b => {
      b.onclick = () => {
        const sorted = Widgets.myEvents().slice().sort((a, b2) => this.evSortTs(a) - this.evSortTs(b2));
        const victim = sorted[+b.dataset.i];
        Store.setSettings({ events: Widgets.myEvents().filter(e => e !== victim && !(e.d === victim.d && e.t === victim.t && e.c === victim.c)) });
        showToast(I18n.t('ev_deleted'), 1800);
        Widgets.renderCalendar();
        this.renderEventsManager();
      };
    });
  },

  /* ================= SUPPORT (Telegram bot) ================= */
  renderSupport() {
    const box = document.getElementById('support-body');
    const T = k => I18n.t(k);
    const BOT = 'NexaExtensionsbot';
    const plane = `<svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M2.7 11.2 20.6 3.6c.9-.4 1.8.4 1.5 1.3l-3.1 14.6c-.2.9-1.2 1.2-1.9.7l-4.2-3.1-2.2 2.2c-.5.5-1.4.3-1.6-.4l-1.2-4.2-4.9-1.9c-.9-.4-.9-1.6-.3-2z"/></svg>`;
    const chips = [
      { ico: '🐞', label: T('sup_bug'), start: 'bug' },
      { ico: '💡', label: T('sup_idea'), start: 'idea' },
      { ico: '📖', label: T('sup_help'), start: 'help' },
      { ico: '🤝', label: T('sup_biz'), start: 'biz' }
    ];
    let faqs = '';
    for (let i = 1; i <= 6; i++) {
      faqs += `<details class="faq"><summary>${T('faq_q' + i)}</summary><p>${T('faq_a' + i)}</p></details>`;
    }
    box.innerHTML = `
      <div class="tg-card">
        <div class="tg-top">
          <div class="tg-avatar">${plane}</div>
          <div class="tg-idbox">
            <b>Tabora Support Bot</b>
            <button class="tg-handle" id="sup-copy-handle" dir="ltr">@${BOT} ⧉</button>
          </div>
          <span class="tg-status"><i></i>${T('sup_online')}</span>
        </div>
        <a class="btn primary tg-open" target="_blank" rel="noreferrer" href="https://t.me/${BOT}">✈️ ${T('sup_open')}</a>
      </div>
      <div class="sec-label">${T('sup_quick')}</div>
      <div class="sup-chips">
        ${chips.map(c => `<a class="sup-chip" target="_blank" rel="noreferrer" href="https://t.me/${BOT}?start=${c.start}"><span>${c.ico}</span>${c.label}</a>`).join('')}
      </div>
      <button class="btn sup-diag" id="sup-diag">🩺 ${T('sup_diag')}</button>
      <div class="sec-label">${T('sup_faq')}</div>
      <div class="faq-list">${faqs}</div>
      <div class="tip">💜 ${T('sup_note')}</div>`;
    const copy = (txt, msg) => {
      const done = () => showToast(msg, 2400);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(done);
      else { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); done(); }
    };
    box.querySelector('#sup-copy-handle').onclick = () => copy('@' + BOT, T('sup_handle_copied'));
    box.querySelector('#sup-diag').onclick = () => {
      const s = Store.state, w = s.settings.wallpaper || {};
      const u = s.user;
      const info = [
        'Tabora v' + (chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : 'preview'),
        'lang=' + I18n.lang,
        'wallpaper=' + w.type + (w.id ? ':' + w.id : ''),
        'user=' + (u && u.username ? '@' + u.username : 'guest'),
        'ua=' + navigator.userAgent
      ].join(' | ');
      copy(info, T('sup_diag_copied'));
    };
  },

  /* ================= PRAYER TIMES + QIBLA ================= */
  renderPray() {
    const body = document.getElementById('pray-body');
    if (!body || typeof Pray === 'undefined') return;
    const fa = I18n.lang === 'fa';
    const num = (x) => fa ? Jalali.toFaDigits(String(x)) : String(x);
    const c = Pray.city();
    const t = Pray.times(c.lat, c.lng, new Date());
    const nx = Pray.next();
    const q = Pray.qibla(c.lat, c.lng);
    const rows = [
      ['fajr', 'pray_fajr', '🌅', t.fajr], ['sunrise', 'pray_sunrise', '🌄', t.sunrise],
      ['dhuhr', 'pray_dhuhr', '☀️', t.dhuhr], ['asr', 'pray_asr', '🌤️', t.asr],
      ['maghrib', 'pray_maghrib', '🌇', t.maghrib], ['isha', 'pray_isha', '🌙', t.isha]
    ];
    let marks = '';
    for (let a = 0; a < 360; a += 15) {
      const r1 = a % 90 === 0 ? 44 : 50, r2 = 54;
      const rd = (ang) => (ang - 90) * Math.PI / 180;
      marks += `<line x1="${60 + r1 * Math.cos(rd(a))}" y1="${60 + r1 * Math.sin(rd(a))}" x2="${60 + r2 * Math.cos(rd(a))}" y2="${60 + r2 * Math.sin(rd(a))}" class="pt-tick${a % 90 === 0 ? ' big' : ''}"/>`;
    }
    body.innerHTML = `
      <div class="pt-city glass">📍 <b>${c.n}</b><button class="btn sm" id="pt-city-btn">${I18n.t('city_change')}</button></div>
      <div class="pt-next glass">
        <div class="pt-next-t">${I18n.t('pray_next')}</div>
        <div class="pt-next-v">${nx.name} · <b>${Pray.fmt(nx.time)}</b></div>
        <div class="pt-next-c">${num(nx.inMin)} ${I18n.t('min_later')}</div>
      </div>
      <div class="pt-grid">${rows.map(r => `<div class="pt-row${nx.key === r[0] ? ' on' : ''}"><span>${r[2]} ${I18n.t(r[1])}</span><b>${Pray.fmt(r[3])}</b></div>`).join('')}</div>
      <div class="pt-qibla glass">
        <div class="sec-label">🧭 ${I18n.t('pray_qibla')}</div>
        <div class="pt-compass-wrap">
          <svg viewBox="0 0 120 120" class="pt-compass">
            <circle cx="60" cy="60" r="56" class="pt-c-bg"/>
            ${marks}
            <text x="60" y="14" class="pt-c-n" text-anchor="middle">N</text>
            <g class="pt-rose" transform="rotate(${q.deg.toFixed(1)} 60 60)">
              <polygon points="60,18 54,62 60,54 66,62" class="pt-needle"/>
              <circle cx="60" cy="60" r="4" class="pt-dot"/>
            </g>
          </svg>
          <div class="pt-q-info">
            <b class="pt-q-deg">${num(Math.round(q.deg))}°</b>
            <span>${I18n.t('pray_from_north')}</span>
            <span>📏 ${I18n.t('pray_dist')}: ${num(q.km.toLocaleString(fa ? 'fa-IR' : 'en-US'))} km</span>
            <span class="muted" style="font-size:.66rem">${I18n.t('pray_qibla_hint')}</span>
          </div>
        </div>
      </div>`;
    body.querySelector('#pt-city-btn').onclick = () => this.open('panel-city');
  },

  /* ================= CITY PICKER (weather + prayers) ================= */
  renderCity() {
    const body = document.getElementById('city-body');
    if (!body) return;
    const fa = I18n.lang === 'fa';
    const cur = Store.state.settings.city;
    body.innerHTML = `
      ${cur ? `<div class="city-cur glass">📍 <b>${cur.n}</b><button class="btn sm danger" id="city-clear">✖ ${I18n.t('city_auto')}</button></div>` : ''}
      <div class="city-search"><input id="city-q" placeholder="${I18n.t('city_search_ph')}"><button class="btn sm" id="city-go">🔍</button></div>
      <div id="city-res"></div>
      <div class="sec-label" style="margin-top:18px">⭐ ${I18n.t('city_quick')}</div>
      <div class="city-chips">${PRAY_CITIES.slice(0, 16).map(c => `<button class="chip-btn" data-n="${c[fa ? 0 : 1]}" data-la="${c[2]}" data-lo="${c[3]}">${c[fa ? 0 : 1]}</button>`).join('')}</div>
      <button class="btn" id="city-gps" style="margin-top:18px">📡 ${I18n.t('city_gps')}</button>`;
    const pick = (n, la, lo) => {
      Store.setSettings({ city: { n, la, lo } });
      Widgets.renderWeather();
      Widgets.renderCalendar();
      if (typeof Pray !== 'undefined') this.renderPray();
      showToast('📍 ' + n, 1800);
      this.renderCity();
    };
    body.querySelectorAll('.chip-btn').forEach(b => b.onclick = () => pick(b.dataset.n, +b.dataset.la, +b.dataset.lo));
    const clr = body.querySelector('#city-clear');
    if (clr) clr.onclick = () => { Store.setSettings({ city: null }); Widgets.renderWeather(); Widgets.renderCalendar(); this.renderCity(); showToast(I18n.t('city_auto'), 1800); };
    body.querySelector('#city-gps').onclick = () => {
      navigator.geolocation.getCurrentPosition(p => pick(I18n.t('my_location'), +p.coords.latitude.toFixed(4), +p.coords.longitude.toFixed(4)), () => showToast(I18n.t('err_generic'), 2000), { timeout: 6000 });
    };
    const doSearch = async () => {
      const q = body.querySelector('#city-q').value.trim();
      const res = body.querySelector('#city-res');
      if (!q) return;
      res.innerHTML = '<div class="muted">⏳</div>';
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=${fa ? 'fa' : 'en'}`);
        const d = await r.json();
        res.innerHTML = (d.results || []).map((c, i) => `<button class="city-res-row" data-i="${i}"><b>${c.name}</b><span class="muted">${[c.admin1, c.country].filter(Boolean).join(' · ')}</span></button>`).join('') || `<div class="muted">${I18n.t('city_none')}</div>`;
        res.querySelectorAll('.city-res-row').forEach(b => b.onclick = () => {
          const c = d.results[+b.dataset.i];
          pick(c.name, +c.latitude, +c.longitude);
        });
      } catch { res.innerHTML = `<div class="muted">${I18n.t('err_generic')}</div>`; }
    };
    body.querySelector('#city-go').onclick = doSearch;
    body.querySelector('#city-q').onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };
  },

  /* ================= SETTINGS ================= */
  renderSettings() {
    const s = Store.state.settings;
    const box = document.getElementById('settings-body');
    box.innerHTML = `
    ${Store.state.token ? `<div class="set-sec glass">
      <div class="sec-label">🛡️ ${I18n.t('account_sec')}</div>
      <button class="btn" id="gen-recovery">🔐 ${I18n.t('gen_recovery')}</button>
    </div>` : ''}
    <div class="set-sec glass">
      <div class="sec-label">🎨 ${I18n.t('set_accent')}</div>
      <div class="ac-row" id="ac-row"></div>
    </div>
    <div class="set-sec glass">
      <div class="sec-label">🌐 ${I18n.t('set_language')}</div>
      <div class="seg">
        <button data-lang="fa" class="${s.lang === 'fa' ? 'active' : ''}">فارسی</button>
        <button data-lang="en" class="${s.lang === 'en' ? 'active' : ''}">English</button>
      </div>
    </div>
    <div class="set-sec glass">
      <div class="sec-label">🔤 ${I18n.t('set_font')}</div>
      <div class="font-grid">${FONTS.map(f => `<button class="font-opt ${s.font === f.id ? 'active' : ''}" data-font="${f.id}" style="font-family:${f.css}">${f.name}</button>`).join('')}</div>
    </div>
    <div class="set-sec glass">
      <div class="sec-label">📐 ${I18n.t('set_widget_size')} — <span id="scale-val">${Math.round((s.scale || 1) * 100)}%</span></div>
      <input type="range" id="set-scale" min="0.75" max="1.3" step="0.05" value="${s.scale || 1}">
      <div class="sec-label" style="margin-top:14px">🧩 ${I18n.t('set_widgets')} <small class="muted">(${I18n.t('drag_hint')})</small></div>
      <div id="widget-toggles"></div>
    </div>
    <div class="set-sec glass">
      <div class="sec-label">⚙️</div>
      <label class="sw-row"><span>🕐 ${I18n.t('set_clock24')}</span><input type="checkbox" id="set-clock24" ${s.clock24 ? 'checked' : ''}></label>
      <label class="sw-row"><span>🌡️ ${I18n.t('set_temp_unit')}</span>
        <select id="set-temp"><option value="c" ${s.tempUnit === 'c' ? 'selected' : ''}>°C</option><option value="f" ${s.tempUnit === 'f' ? 'selected' : ''}>°F</option></select></label>
      <label class="sw-row"><span>🔎 ${I18n.t('set_engine')}</span>
        <select id="set-engine">${Object.entries(ENGINES).map(([id, e]) => `<option value="${id}" ${s.engine === id ? 'selected' : ''}>${e.name}</option>`).join('')}</select></label>
      <label class="sw-row"><span>🔋 ${I18n.t('set_lowpower')}</span><input type="checkbox" id="set-lowpower" ${s.lowPower ? 'checked' : ''}></label>
    </div>
    <div class="set-sec glass">
      <div class="sec-label">🖼️ ${I18n.t('set_wallpaper')}</div>
      <button class="btn" id="set-wp">🎨 ${I18n.t('change_wallpaper')}</button>
    </div>
    ${(window.FLAGS || {}).blocker === false ? '' : `
    <div class="set-sec glass">
      <div class="sec-label">🚫 ${I18n.t('set_blocker')} <small class="muted">(${I18n.t('block_hint')})</small></div>
      <div class="td-add"><input id="blk-in" placeholder="instagram.com" dir="ltr"><button id="blk-add">+</button></div>
      <div class="seg" style="margin-top:10px">
        <button data-bm="focus" class="${(s.blockMode || 'focus') === 'focus' ? 'active' : ''}">⏱️ ${I18n.t('block_mode_focus')}</button>
        <button data-bm="always" class="${s.blockMode === 'always' ? 'active' : ''}">🔒 ${I18n.t('block_always')}</button>
      </div>
      <div class="blk-chips" id="blk-chips"></div>
    </div>`}
    <div class="set-sec glass">
      <div class="sec-label">💾 ${I18n.t('set_backup').replace('📦 ', '')}</div>
      <div class="row-btns">
        <button class="btn" id="set-backup">${I18n.t('set_backup')}</button>
        <button class="btn" id="set-restore">${I18n.t('set_restore')}</button>
      </div>
    </div>
    <div class="set-sec glass">
      <div class="sec-label">☁️ ${I18n.t('set_account')}</div>
      ${Store.state.token
        ? `<div class="muted">${I18n.t('logged_in_as')}: <b>@${(Store.state.user || {}).username}</b> ${Social.badgeHTML((Store.state.user || {}).role)}</div>
           <div class="row-btns"><button class="btn" id="set-sync">🔄 ${I18n.t('sync_now')}</button><button class="btn danger" id="set-logout">${I18n.t('logout')}</button></div>`
        : `<div class="row-btns"><button class="btn primary" id="set-login">${I18n.t('login')}</button><button class="btn" id="set-register">${I18n.t('register')}</button></div>`}
    </div>
    <div class="set-sec glass about">
      <div class="sec-label">💜 ${I18n.t('about')}</div>
      <div>${I18n.t('version')} ${this.extVersion()} — ${I18n.t('members_legend')}</div>
      <div class="muted">${I18n.t('made_with')}</div>
    </div>`;

    box.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { Store.setSettings({ lang: b.dataset.lang }); App.applyLang(); this.renderSettings(); });
    box.querySelectorAll('[data-font]').forEach(b => b.onclick = () => { Store.setSettings({ font: b.dataset.font }); App.applyFont(); this.renderSettings(); });
    box.querySelector('#set-scale').oninput = (e) => {
      const v = +e.target.value;
      document.getElementById('scale-val').textContent = Math.round(v * 100) + '%';
      document.getElementById('widgets-row').style.transform = `scale(${v})`;
      Store.setSettings({ scale: v });
    };
    box.querySelector('#set-clock24').onchange = (e) => { Store.setSettings({ clock24: e.target.checked }); Widgets.renderClock(); };
    box.querySelector('#set-temp').onchange = (e) => { Store.setSettings({ tempUnit: e.target.value }); Widgets.renderWeather(); };
    box.querySelector('#set-engine').onchange = (e) => Store.setSettings({ engine: e.target.value });
    box.querySelector('#set-lowpower').onchange = (e) => { Store.setSettings({ lowPower: e.target.checked }); Wallpapers.apply(null, true); };
    box.querySelector('#set-backup').onclick = () => {
      const st = Store.state.settings;
      const data = {
        app: 'tabora-backup', v: 1, at: new Date().toISOString(),
        settings: st, bookmarks: Store.state.bookmarks
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tabora-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      showToast(I18n.t('backup_done'), 2200);
    };
    box.querySelector('#set-restore').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const d = JSON.parse(rd.result);
            if (!d || d.app !== 'tabora-backup' || typeof d.settings !== 'object') throw new Error('bad');
            Store.state.settings = Object.assign(Store.state.settings, d.settings);
            if (Array.isArray(d.bookmarks)) Store.state.bookmarks = d.bookmarks.slice(0, 10);
            Store.persist();
            Api.pushCloud();
            Store.emit();
            Widgets.renderAll();
            Wallpapers.apply();
            this.applyFontSafe();
            showToast(I18n.t('restore_done'), 2400);
          } catch (e) { showToast(I18n.t('restore_bad'), 2600); }
        };
        rd.readAsText(f);
      };
      inp.click();
    };
    const gr = box.querySelector('#gen-recovery');
    if (gr) gr.onclick = async () => {
      try { const d = await Api.regenRecovery(); if (d && d.code) this.showCodeModal(d.code); }
      catch (e) { showToast(I18n.t('err_' + (e.code || 'generic'))); }
    };
    const acr = box.querySelector('#ac-row');
    if (acr) {
      acr.innerHTML = Object.keys(ACCENTS).map(id => '<button class="ac-dot' + ((Store.state.settings.accent || 'cyan') === id ? ' on' : '') + '" data-ac="' + id + '" style="background:' + ACCENTS[id] + '" title="' + id + '"></button>').join('');
      acr.querySelectorAll('.ac-dot').forEach(d => d.onclick = () => { Store.setSettings({ accent: d.dataset.ac }); App.applyAccent(); this.renderSettings(); });
    }
    box.querySelector('#set-wp').onclick = () => this.open('panel-wallpapers');
    /* site blocker */
    const blkChips = () => {
      const chips = box.querySelector('#blk-chips');
      if (!chips) return;
      const l = Blocker ? Blocker.list() : [];
      chips.innerHTML = l.length
        ? l.map(d => `<span class="blk-chip">${d} <b data-del="${d}">✕</b></span>`).join('')
        : `<div class="muted" style="font-size:.72rem">${I18n.t('block_none')}</div>`;
      chips.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Blocker.remove(b.dataset.del); blkChips(); });
      const bd = document.getElementById('fz-block');
      if (bd && Blocker) bd.style.display = Blocker.active() && Blocker.focusOn() ? '' : 'none';
    };
    const blkAdd = box.querySelector('#blk-add');
    if (blkAdd) {
      blkChips();
      blkAdd.onclick = () => {
        const r = Blocker.add(box.querySelector('#blk-in').value);
        if (r.err) showToast(I18n.t(r.err), 2200);
        else { box.querySelector('#blk-in').value = ''; showToast('🚫 ' + r.dom, 1800); }
        blkChips();
      };
      box.querySelector('#blk-in').onkeydown = (e) => { if (e.key === 'Enter') blkAdd.onclick(); };
      box.querySelectorAll('[data-bm]').forEach(b => b.onclick = () => {
        Blocker.setMode(b.dataset.bm);
        box.querySelectorAll('[data-bm]').forEach(x => x.classList.toggle('active', x === b));
        blkChips();
        showToast(b.dataset.bm === 'always' ? '🔒 ' + I18n.t('block_always') : '⏱️ ' + I18n.t('block_mode_focus'), 1800);
      });
    }
    const sy = box.querySelector('#set-sync');
    if (sy) sy.onclick = async () => { await Api.pullCloud(); Widgets.renderAll(); showToast(I18n.t('cloud_synced')); };
    const lo = box.querySelector('#set-logout'); if (lo) lo.onclick = () => this.doLogout();
    const li = box.querySelector('#set-login'); if (li) li.onclick = () => this.openAuth('login');
    const rg = box.querySelector('#set-register'); if (rg) rg.onclick = () => this.openAuth('register');
    this.renderWidgetToggles();
  },

  renderWidgetToggles() {
    const box = document.getElementById('widget-toggles');
    const s = Store.state.settings;
    const names = { calendar: '🗓️ ' + I18n.t('widget_calendar'), weather: '🌤️ ' + I18n.t('widget_weather'), prices: '💱 ' + I18n.t('widget_prices'), bookmarks: '🔖 ' + I18n.t('widget_bookmarks'), quote: '💫 ' + I18n.t('widget_quote'), focus: '⏱️ ' + I18n.t('widget_focus'), todo: '✅ ' + I18n.t('widget_todo') };
    box.innerHTML = s.widgets.order.map(id => `
      <div class="wt-row" draggable="true" data-wid="${id}">
        <span class="wt-grip">⠿</span><span class="wt-name">${names[id] || id}</span>
        <label class="switch"><input type="checkbox" ${s.widgets.hidden.includes(id) ? '' : 'checked'} data-wid="${id}"><i></i></label>
      </div>`).join('');
    box.querySelectorAll('input[data-wid]').forEach(inp => {
      inp.onchange = () => {
        const id = inp.dataset.wid;
        let hid = [...s.widgets.hidden];
        hid = inp.checked ? hid.filter(x => x !== id) : [...hid, id];
        Store.setSettings({ widgets: { order: s.widgets.order, hidden: hid } });
        Widgets.renderAll();
      };
    });
    let dragId = null;
    box.querySelectorAll('.wt-row').forEach(r => {
      r.ondragstart = () => { dragId = r.dataset.wid; r.classList.add('drag'); };
      r.ondragend = () => r.classList.remove('drag');
      r.ondragover = (e) => e.preventDefault();
      r.ondrop = () => {
        if (!dragId || dragId === r.dataset.wid) return;
        const order = [...s.widgets.order];
        const from = order.indexOf(dragId), to = order.indexOf(r.dataset.wid);
        order.splice(from, 1); order.splice(to, 0, dragId);
        Store.setSettings({ widgets: { order, hidden: s.widgets.hidden } });
        this.renderWidgetToggles();
        Widgets.renderAll();
      };
    });
  }
};
