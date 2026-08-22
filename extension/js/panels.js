/* Tabora Panels — auth, profile (+71 animated avatars), wallpapers, settings, bookmarks */
const FONTS = [
  { id: 'vazirmatn', name: 'Vazirmatn', css: "'Vazirmatn','Inter',sans-serif" },
  { id: 'lalezar', name: 'Lalezar', css: "'Lalezar','Vazirmatn',sans-serif" },
  { id: 'inter', name: 'Inter', css: "'Inter','Vazirmatn',sans-serif" },
  { id: 'grotesk', name: 'Space Grotesk', css: "'Space Grotesk','Vazirmatn',sans-serif" },
  { id: 'poppins', name: 'Poppins', css: "'Poppins','Vazirmatn',sans-serif" }
];

const Panels = {
  open(id) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    const p = document.getElementById(id);
    if (p) { p.classList.add('open'); document.getElementById('backdrop').classList.add('show'); }
    if (id === 'panel-friends') Social.renderFriendsPanel();
    if (id === 'panel-profile') this.renderProfile();
    if (id === 'panel-wallpapers') this.renderWallpapers();
    if (id === 'panel-support') this.renderSupport();
    if (id === 'panel-settings') this.renderSettings();
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

  renderAvatarChips() {
    const chips = document.getElementById('av-chips');
    if (!chips) return;
    const defs = [['all', 'av_all'], ['animals', 'av_animals'], ['anime', 'av_anime'], ['art', 'av_art'], ['fun', 'av_fun']];
    chips.innerHTML = '';
    defs.forEach(([id, key]) => {
      const b = document.createElement('button');
      b.className = 'ao-chip' + (this.avCat === id ? ' active' : '');
      b.textContent = id === 'all' ? '✨ ' + I18n.t(key) : I18n.t(key);
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
  renderWallpapers() {
    const box = document.getElementById('wallpapers-body');
    const cur = Store.state.settings.wallpaper;
    let html = `<div class="sec-label">${I18n.t('wp_builtin')}</div><div class="wp-grid">`;
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
      html += `<button class="wp-card ${active}" data-ext="${w.id}" title="${w.name}">
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
      c.onclick = () => {
        const w = (typeof EXT_WALLPAPERS !== 'undefined' ? EXT_WALLPAPERS : []).find(x => x.id === c.dataset.ext);
        if (!w) return;
        Store.setSettings({ wallpaper: { type: 'video', id: w.id, url: w.video, accent: w.accent } });
        Wallpapers.apply();
        showToast('🌐 ' + w.name + ' — ' + I18n.t('smart_theme_applied'), 2600);
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
    </div>
    <div class="set-sec glass">
      <div class="sec-label">🖼️ ${I18n.t('set_wallpaper')}</div>
      <button class="btn" id="set-wp">🎨 ${I18n.t('change_wallpaper')}</button>
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
      <div>${I18n.t('version')} 1.1.0 — ${I18n.t('members_legend')}</div>
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
    const gr = box.querySelector('#gen-recovery');
    if (gr) gr.onclick = async () => {
      try { const d = await Api.regenRecovery(); if (d && d.code) this.showCodeModal(d.code); }
      catch (e) { showToast(I18n.t('err_' + (e.code || 'generic'))); }
    };
    box.querySelector('#set-wp').onclick = () => this.open('panel-wallpapers');
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
    const names = { weather: '🌤️ ' + I18n.t('widget_weather'), prices: '💱 ' + I18n.t('widget_prices'), bookmarks: '🔖 ' + I18n.t('widget_bookmarks'), quote: '💫 ' + I18n.t('widget_quote') };
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
