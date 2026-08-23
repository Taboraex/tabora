/* Tabora Pet v3 — a roaming living companion.
   Walks across the new tab with legs & arms, sits, hops, sleeps on the spot.
   Stable care panel (built once, bars update in place). */
const Pet = {
  root: null, walker: null, act: 'idle', pose: 'stand', face: 1, x: 200, target: null,
  busy: false, lastClick: 0, panelOpen: false, _key: '', _say: '',

  species: [
    { id: 'cat', fa: 'گربهٔ شفق', en: 'Aurora Cat', c1: '#a78bfa', c2: '#7c3aed',
      snd: ['پیشیشیش 😺', 'purr 😺'], foods: [['🐟', 'ماهی', 26, 1], ['🍗', 'مرغ', 22, 0], ['🥛', 'شیر', 18, 0], ['🍪', 'بیسکویت', 12, 0]] },
    { id: 'fox', fa: 'روباه نئون', en: 'Neon Fox', c1: '#fdba74', c2: '#ea580c',
      snd: ['ییپ! 🦊', 'yip! 🦊'], foods: [['🍖', 'گوشت', 26, 1], ['🧀', 'پنیر', 20, 0], ['🫐', 'بلوبری', 16, 0], ['🍪', 'بیسکویت', 12, 0]] },
    { id: 'owl', fa: 'جغد ستاره', en: 'Star Owl', c1: '#7dd3fc', c2: '#0284c7',
      snd: ['هو هو 🦉', 'hoo 🦉'], foods: [['🐭', 'موش', 26, 1], ['🌰', 'بلوط', 20, 0], ['🫐', 'بلوبری', 18, 0], ['🍇', 'انگور', 14, 0]] },
    { id: 'drag', fa: 'اژدهاکوچولو', en: 'Tiny Dragon', c1: '#6ee7b7', c2: '#059669',
      snd: ['خرخر 🔥', 'grr 🔥'], foods: [['🌶️', 'فلفل', 26, 1], ['🥩', 'استیک', 22, 0], ['🍬', 'آبنبات', 14, 0], ['🍇', 'انگور', 14, 0]] }
  ],

  L(fa, en) { return I18n.lang === 'fa' ? fa : en; },

  st() {
    const s = Store.state.settings.pet || {};
    return Object.assign({
      enabled: true, name: '', species: 'cat', xp: 0, born: Date.now(), lastDay: '',
      stats: { full: 80, energy: 90, clean: 90, mood: 85 }, lastTick: Date.now()
    }, s);
  },
  save(patch) {
    const cur = this.st();
    Store.setSettings({ pet: Object.assign(cur, patch) });
  },
  level(xp) { return 1 + Math.floor(xp / 25); },
  hour() { return new Date().getHours(); },
  nightTime() { const h = this.hour(); return h >= 22 || h < 7; },
  sp() { return this.species.find(x => x.id === this.st().species) || this.species[0]; },

  /* ---------- lifecycle ---------- */
  init() {
    this.root = document.getElementById('pet-root');
    if (!this.root) return;
    this.applyOffline();
    Store.onChange(() => this.refresh());
    this.dailyBonus();
    this.x = Math.round(window.innerWidth * (0.2 + Math.random() * 0.6));
    this.refresh();
    setInterval(() => this.tick(), 5000);
    setInterval(() => this.ambient(), 9000);
    setInterval(() => this.move(), 50);
    window.addEventListener('resize', () => this.clampX());
  },

  clampX() {
    const max = Math.max(20, window.innerWidth - 120);
    this.x = Math.min(Math.max(this.x, 10), max);
    if (this.walker) this.walker.style.left = this.x + 'px';
  },

  applyOffline() {
    const s = this.st();
    const mins = Math.min(Math.max((Date.now() - (s.lastTick || Date.now())) / 60000, 0), 480);
    if (mins < 2) return;
    const st = s.stats;
    if (this.nightTime() || (this.hour() >= 7 && this.hour() < 12 && st.energy < 40)) {
      st.energy = Math.min(100, st.energy + mins * 1.1);
      st.full = Math.max(8, st.full - mins * 0.1);
    } else {
      st.full = Math.max(5, st.full - Math.min(40, mins * 0.5));
      st.energy = Math.max(10, st.energy - Math.min(30, mins * 0.3));
      st.clean = Math.max(15, st.clean - Math.min(20, mins * 0.2));
    }
    s.lastTick = Date.now();
    this.save({ stats: st, lastTick: s.lastTick });
  },

  tick() {
    if (!this.root) return;
    const s = this.st();
    if (!s.enabled) return;
    const st = s.stats;
    if (this.act === 'sleep') {
      st.energy = Math.min(100, st.energy + 1.1);
      st.full = Math.max(4, st.full - 0.12);
      if (!this.nightTime() && st.energy >= 65) { this.act = 'idle'; this.pose = 'stand'; this.say(this.L('پر انرژی! ⚡', 'Charged! ⚡')); }
    } else {
      st.full = Math.max(3, st.full - 0.045);
      st.energy = Math.max(3, st.energy - 0.035);
      st.clean = Math.max(5, st.clean - 0.02);
      if (this.hour() >= 22) { this.act = 'sleep'; this.pose = 'sit'; this.stopWalk(); this.say(this.L('شب بخیر 💤', 'Night night 💤')); }
      if (st.energy < 10 && this.act === 'idle') { this.act = 'sleep'; this.pose = 'sit'; this.stopWalk(); this.say(this.L('خوابم برد 😴', 'Dozing off 😴')); }
    }
    let m = (st.full + st.energy + st.clean) / 3;
    if (Math.min(st.full, st.energy, st.clean) < 20) m = Math.min(m, 25);
    st.mood = Math.round(m);
    this.save({ stats: st, lastTick: Date.now() });
  },

  dailyBonus() {
    const s = this.st();
    const today = new Date().toDateString();
    if (s.enabled && s.lastDay !== today) this.save({ lastDay: today, xp: s.xp + 5 });
  },

  /* ---------- roaming ---------- */
  move() {
    if (!this.walker || this.act === 'sleep' || this.busy) return;
    if (this.pose === 'walk') {
      const sp = 1.7;
      this.x += sp * this.face;
      if (this.target !== null) {
        if ((this.face === 1 && this.x >= this.target) || (this.face === -1 && this.x <= this.target)) {
          this.x = this.target; this.target = null;
          this.pose = Math.random() < 0.5 ? 'sit' : 'stand';
          this.refresh();
        }
      }
      this.clampX();
      this.walker.style.left = this.x + 'px';
      if (this.panelOpen) this.placePanel();
    }
  },

  stopWalk() { this.target = null; },

  wander() {
    if (this.act === 'sleep' || this.busy) return;
    const r = Math.random();
    const max = Math.max(20, window.innerWidth - 120);
    if (r < 0.6) { // stroll to a random spot
      const t = Math.round(10 + Math.random() * max);
      this.face = t >= this.x ? 1 : -1;
      this.target = t;
      this.pose = 'walk';
      this.applyFace();
      this.refresh();
    } else if (r < 0.8) { this.pose = 'sit'; this.refresh(); }
    else { // happy hop
      const b = this.root.querySelector('#pet-bubble');
      if (b) { b.classList.remove('jump'); void b.offsetWidth; b.classList.add('jump'); }
    }
  },

  applyFace() {
    const fig = this.root && this.root.querySelector('.pet-fig');
    if (fig) fig.style.transform = 'scaleX(' + this.face + ')';
  },

  /* ---------- svg ---------- */
  vis() {
    if (this.act === 'sleep') return 'sleep';
    if (this.act === 'eat') return 'eat';
    if (this.act === 'yawn') return 'yawn';
    const st = this.st().stats;
    if (st.full < 25) return 'sad';
    if (st.clean < 30) return 'dirty';
    if (st.mood > 75) return 'happy';
    return 'idle';
  },

  svg(v) {
    const sp = this.sp();
    const ears = {
      cat: '<path d="M30 34 L26 14 L44 26 Z"/><path d="M70 34 L74 14 L56 26 Z"/>',
      fox: '<path d="M28 36 L20 10 L46 26 Z"/><path d="M72 36 L80 10 L54 26 Z"/>',
      owl: '<path d="M30 30 L24 16 L40 24 Z"/><path d="M70 30 L76 16 L60 24 Z"/>',
      drag: '<path d="M28 32 Q18 12 40 20 Z"/><path d="M72 32 Q82 12 60 20 Z"/>'
    }[sp.id];
    const horns = sp.id === 'drag' ? '<circle cx="30" cy="20" r="4" fill="#fbbf24"/><circle cx="70" cy="20" r="4" fill="#fbbf24"/>' : '';
    const tail = sp.id === 'fox'
      ? '<path class="p-tail" d="M78 62 Q96 56 92 40 Q88 52 76 54 Z" fill="' + sp.c2 + '"/>'
      : '<path class="p-tail" d="M78 62 Q94 62 90 46" stroke="' + sp.c2 + '" stroke-width="7" fill="none" stroke-linecap="round"/>';
    const ink = '#1e1b31';
    let eyes;
    if (v === 'sleep') eyes = '<path d="M36 50 q6 5 12 0" stroke="' + ink + '" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M52 50 q6 5 12 0" stroke="' + ink + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    else if (v === 'happy') eyes = '<path d="M36 51 q6 -7 12 0" stroke="' + ink + '" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M52 51 q6 -7 12 0" stroke="' + ink + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    else if (v === 'sad') eyes = '<g class="pet-eyes"><circle cx="42" cy="50" r="6" fill="#fff"/><circle cx="58" cy="50" r="6" fill="#fff"/><circle cx="43" cy="52" r="3" fill="' + ink + '"/><circle cx="59" cy="52" r="3" fill="' + ink + '"/></g><circle cx="33" cy="56" r="2.6" fill="#7dd3fc"><animate attributeName="cy" values="56;64" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.4s" repeatCount="indefinite"/></circle>';
    else eyes = '<g class="pet-eyes"><circle cx="42" cy="50" r="6.5" fill="#fff"/><circle cx="58" cy="50" r="6.5" fill="#fff"/><circle cx="43.5" cy="51" r="3.2" fill="' + ink + '"/><circle cx="59.5" cy="51" r="3.2" fill="' + ink + '"/><circle cx="45" cy="49.5" r="1.1" fill="#fff"/><circle cx="61" cy="49.5" r="1.1" fill="#fff"/></g>';
    let mouth;
    if (v === 'yawn') mouth = '<g class="p-yawn"><ellipse cx="50" cy="62" rx="5.5" ry="7" fill="' + ink + '"/><ellipse cx="50" cy="65" rx="3" ry="3" fill="#fb7185"/></g>';
    else if (v === 'eat') mouth = '<g class="p-chew"><path d="M45 61 q5 5 10 0" stroke="' + ink + '" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>';
    else if (v === 'sad') mouth = '<path d="M46 63 q4 -4 8 0" stroke="' + ink + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    else mouth = '<path d="M46 60 q4 4 8 0" stroke="' + ink + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    const dirt = v === 'dirty' ? '<circle cx="38" cy="70" r="3.4" fill="rgba(90,60,20,.5)"/><circle cx="60" cy="74" r="2.6" fill="rgba(90,60,20,.45)"/><circle cx="66" cy="42" r="2.2" fill="rgba(90,60,20,.4)"/>' : '';
    // limbs
    const limb = sp.c2;
    const legs = this.pose === 'sit' || this.act === 'sleep'
      ? '<ellipse cx="40" cy="86" rx="7" ry="4.5" fill="' + limb + '"/><ellipse cx="60" cy="86" rx="7" ry="4.5" fill="' + limb + '"/>'
      : '<g class="p-leg l"><rect x="36" y="78" width="9" height="14" rx="4.5" fill="' + limb + '"/></g><g class="p-leg r"><rect x="55" y="78" width="9" height="14" rx="4.5" fill="' + limb + '"/></g>';
    const arms = this.act === 'sleep'
      ? ''
      : '<g class="p-arm l"><rect x="20" y="56" width="7" height="13" rx="3.5" fill="' + limb + '"/></g><g class="p-arm r"><rect x="73" y="56" width="7" height="13" rx="3.5" fill="' + limb + '"/></g>';
    const bodyY = this.pose === 'sit' || this.act === 'sleep' ? 60 : 56;
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><radialGradient id="petg" cx="38%" cy="32%"><stop offset="0%" stop-color="' + sp.c1 + '"/><stop offset="100%" stop-color="' + sp.c2 + '"/></radialGradient></defs>' +
      '<g fill="' + sp.c2 + '" class="p-ears">' + ears + '</g>' + horns + tail + arms +
      '<circle cx="50" cy="' + bodyY + '" r="30" fill="url(#petg)"/>' +
      '<ellipse cx="50" cy="' + (bodyY + 12) + '" rx="16" ry="10" fill="rgba(255,255,255,.16)"/>' + legs + dirt + eyes + mouth +
      '<circle cx="33" cy="' + (bodyY + 2) + '" r="4" fill="rgba(255,150,180,.4)"/><circle cx="67" cy="' + (bodyY + 2) + '" r="4" fill="rgba(255,150,180,.4)"/>' +
      '</svg>';
  },

  /* ---------- stable rendering ---------- */
  refresh() {
    if (!this.root) return;
    const s = this.st();
    if (!s.enabled) { if (this.root.innerHTML) this.root.innerHTML = ''; this._key = ''; this.walker = null; return; }
    if (!this.root.querySelector('#pet-walker')) {
      this.root.innerHTML = '<div id="pet-walker"><div id="pet-stage"></div></div>';
      this.walker = this.root.querySelector('#pet-walker');
      this.walker.style.left = this.x + 'px';
    }
    this.walker = this.root.querySelector('#pet-walker');
    const lv = this.level(s.xp);
    const key = [s.species, s.name, lv, this.vis(), this.pose, this.face].join('|');
    if (key !== this._key) { this._key = key; this.renderStage(s, lv); }
    let p = this.root.querySelector('#pet-panel');
    if (this.panelOpen) { if (!p) p = this.buildPanel(s); this.updateHUD(s, lv); this.placePanel(); }
    else if (p) p.remove();
  },

  renderStage(s, lv) {
    const stage = this.root.querySelector('#pet-stage');
    if (!stage) return;
    const sp = this.sp();
    const v = this.vis();
    const name = s.name || (I18n.lang === 'fa' ? sp.fa : sp.en);
    const scale = 1 + Math.min(lv, 12) * 0.016;
    stage.innerHTML =
      '<div class="pet-scale" style="transform:scale(' + scale.toFixed(2) + ')">' +
      '<div class="pet-bubble a-' + v + ' ps-' + this.pose + '" id="pet-bubble" title="' + name + '">' +
      (this._say ? '<div class="pet-talk">' + this._say + '</div>' : '') +
      '<div class="pet-fig" style="transform:scaleX(' + this.face + ')">' + this.svg(v) + '</div>' +
      '<div class="pet-shadow"></div>' +
      (v === 'sleep' ? '<span class="pet-zz">💤</span>' : '') +
      (v === 'dirty' ? '<span class="pet-zz stink">💨</span>' : '') +
      '<span class="pet-lv">⭐ ' + lv + '</span>' +
      '<button class="pet-care" id="pet-care" title="' + this.L('مراقبت', 'Care') + '">🎒</button>' +
      '</div></div>' +
      '<div class="pet-name">' + name + '</div>';
    stage.querySelector('#pet-bubble').onclick = () => this.stroke();
    stage.querySelector('#pet-care').onclick = (e) => { e.stopPropagation(); this.panelOpen = !this.panelOpen; this.refresh(); };
  },

  placePanel() {
    const p = this.root.querySelector('#pet-panel');
    if (!p) return;
    const vw = window.innerWidth;
    p.style.left = Math.min(Math.max(this.x - 60, 8), Math.max(8, vw - 262)) + 'px';
  },

  /* ---------- care panel ---------- */
  buildPanel(s) {
    const p = document.createElement('div');
    p.className = 'pet-panel';
    p.id = 'pet-panel';
    const bar = (ico, label, col) =>
      '<div class="pp-row"><span class="pp-ico">' + ico + '</span><span class="pp-lbl">' + label + '</span>' +
      '<div class="pp-bar"><i style="background:' + col + '"></i></div><b class="pp-val"></b></div>';
    p.innerHTML =
      '<div class="pp-head"><b class="pp-name"></b><span class="pp-meta"></span></div>' +
      bar('🍖', this.L('سیری', 'Food'), 'linear-gradient(90deg,#fb923c,#f43f5e)') +
      bar('⚡', this.L('انرژی', 'Energy'), 'linear-gradient(90deg,#facc15,#84cc16)') +
      bar('💜', this.L('حال', 'Mood'), 'linear-gradient(90deg,#a78bfa,#f472b6)') +
      bar('🫧', this.L('تمیزی', 'Clean'), 'linear-gradient(90deg,#22d3ee,#3b82f6)') +
      '<div class="pp-actions">' +
      '<button data-pa="feed">🍽 ' + this.L('غذا', 'Feed') + '</button>' +
      '<button data-pa="play">🎾 ' + this.L('بازی', 'Play') + '</button>' +
      '<button data-pa="stroke">🤗 ' + this.L('نوازش', 'Pet') + '</button>' +
      '<button data-pa="bath">🛁 ' + this.L('حموم', 'Bath') + '</button>' +
      '<button data-pa="sleep" class="pp-sleep"></button>' +
      '</div><div class="pp-tray" id="pp-tray"></div>';
    this.root.appendChild(p);
    p.addEventListener('click', (e) => e.stopPropagation());
    p.querySelectorAll('[data-pa]').forEach(btn => {
      btn.onclick = () => {
        const a = btn.getAttribute('data-pa');
        if (a === 'feed') this.toggleTray();
        if (a === 'play') this.play();
        if (a === 'stroke') this.stroke();
        if (a === 'bath') this.bath();
        if (a === 'sleep') this.toggleSleep();
      };
    });
    return p;
  },

  updateHUD(s, lv) {
    const p = this.root.querySelector('#pet-panel');
    if (!p) return;
    const st = s.stats;
    const vals = [st.full, st.energy, st.mood, st.clean];
    const bars = p.querySelectorAll('.pp-bar i');
    const nums = p.querySelectorAll('.pp-val');
    vals.forEach((v, i) => {
      if (bars[i]) bars[i].style.width = Math.round(v) + '%';
      if (nums[i]) nums[i].textContent = Math.round(v);
    });
    const days = Math.max(0, Math.floor((Date.now() - s.born) / 86400000));
    p.querySelector('.pp-name').textContent = s.name || this.sp().fa;
    p.querySelector('.pp-meta').textContent = '⭐ ' + lv + ' · ' + this.L(days + ' روز', days + 'd');
    p.querySelector('.pp-sleep').innerHTML = this.act === 'sleep'
      ? '⏰ ' + this.L('بیدارش کن', 'Wake up') : '💤 ' + this.L('بخوابون', 'Sleep');
  },

  toggleTray() {
    const tray = this.root.querySelector('#pp-tray');
    if (!tray) return;
    if (tray.innerHTML) { tray.innerHTML = ''; return; }
    tray.innerHTML = this.sp().foods.map((f, i) =>
      '<button class="pp-food' + (f[3] ? ' fav' : '') + '" data-f="' + i + '">' + f[0] + '<small>' + f[1] + (f[3] ? ' ❤' : '') + '</small></button>').join('');
    tray.querySelectorAll('.pp-food').forEach(b => {
      b.onclick = () => this.feed(parseInt(b.getAttribute('data-f'), 10));
    });
  },

  /* ---------- actions ---------- */
  wakeGuard() {
    if (this.act === 'sleep') {
      this.act = 'idle'; this.pose = 'stand';
      const st = this.st().stats;
      st.mood = Math.max(5, st.mood - 6);
      this.save({ stats: st });
      this.say(this.L('خوابم بود! 😾', 'I was sleeping! 😾'));
      this.refresh();
      return true;
    }
    return false;
  },

  feed(i) {
    if (this.busy || this.wakeGuard()) return;
    const f = this.sp().foods[i];
    if (this.st().stats.full > 92) { this.say(this.L('سیرم 😋', 'Full 😋')); return; }
    this.busy = true;
    this.stopWalk();
    this.pose = 'sit';
    this.act = 'eat';
    this.say(this.L('نوم نوم 😋', 'Nom nom 😋'));
    this.refresh();
    const b = this.root.querySelector('#pet-bubble');
    let n = 0;
    const cr = setInterval(() => { this.float(b, ['✨', '😋', f[0]][n++ % 3]); }, 380);
    setTimeout(() => {
      clearInterval(cr);
      const st = this.st().stats;
      st.full = Math.min(100, st.full + f[2]);
      st.clean = Math.max(5, st.clean - 3);
      st.mood = Math.min(100, st.mood + (f[3] ? 10 : 5));
      this.act = 'idle'; this.busy = false;
      this.save({ stats: st });
      this.gainXp(2);
      if (f[3]) this.say(this.L('عالی! 💜', 'Yum! 💜'));
      this.refresh();
    }, 1700);
  },

  play() {
    if (this.busy || this.wakeGuard()) return;
    if (this.st().stats.energy < 15) { this.say(this.L('خسته‌ام 🥱', 'Tired 🥱')); return; }
    this.busy = true;
    this.say(this.L('توپ! 🎾', 'Ball! 🎾'));
    const b = this.root.querySelector('#pet-bubble');
    if (b) { b.classList.remove('jump'); void b.offsetWidth; b.classList.add('jump'); this.float(b, '🎾'); }
    setTimeout(() => {
      const st = this.st().stats;
      st.energy = Math.max(3, st.energy - 12);
      st.clean = Math.max(5, st.clean - 4);
      st.full = Math.max(3, st.full - 4);
      st.mood = Math.min(100, st.mood + 8);
      this.busy = false;
      this.save({ stats: st });
      this.gainXp(2);
      this.refresh();
    }, 900);
  },

  stroke() {
    if (this.busy || this.wakeGuard()) return;
    const now = Date.now();
    if (now - this.lastClick < 700) return;
    this.lastClick = now;
    this.stopWalk();
    const b = this.root.querySelector('#pet-bubble');
    if (b) { b.classList.remove('jump'); void b.offsetWidth; b.classList.add('jump'); }
    this.float(b, ['💜', '✨', '💖'][Math.floor(Math.random() * 3)]);
    if (Math.random() < 0.3) this.say(this.L('اییش 💜', 'Purr 💜'));
    const st = this.st().stats;
    st.mood = Math.min(100, st.mood + 3);
    this.save({ stats: st });
    this.gainXp(1);
  },

  bath() {
    if (this.busy || this.wakeGuard()) return;
    this.busy = true;
    this.stopWalk();
    this.say(this.L('قلقلک! 🫧', 'Tickles! 🫧'));
    const b = this.root.querySelector('#pet-bubble');
    let n = 0;
    const bb = setInterval(() => { this.float(b, ['🫧', '', '✨'][n++ % 3]); }, 300);
    setTimeout(() => {
      clearInterval(bb);
      const st = this.st().stats;
      st.clean = 100;
      st.mood = Math.min(100, st.mood + 4);
      this.busy = false;
      this.save({ stats: st });
      this.gainXp(1);
      this.say(this.L('تمیز! ✨', 'Fresh! ✨'));
      this.refresh();
    }, 1600);
  },

  toggleSleep() {
    if (this.act === 'sleep') { this.wakeGuard(); return; }
    this.act = 'sleep'; this.pose = 'sit'; this.stopWalk();
    this.say(this.L('شب بخیر 💤', 'Night 💤'));
    this.refresh();
  },

  gainXp(n) {
    const s = this.st();
    const before = this.level(s.xp);
    const xp = s.xp + n;
    this.save({ xp });
    const after = this.level(xp);
    if (after > before) {
      const b = this.root && this.root.querySelector('#pet-bubble');
      if (b) { this.float(b, '🎉'); this.float(b, '🎊'); }
      showToast('🐾 ' + this.L('سطح ', 'Level ') + after + '!', 2600);
    }
  },

  /* ---------- ambient life ---------- */
  ambient() {
    if (!this.root || this.busy) return;
    const s = this.st();
    if (!s.enabled) return;
    if (this.act === 'sleep') { if (Math.random() < 0.4) this.float(this.root.querySelector('#pet-bubble'), '💤'); return; }
    const st = s.stats;
    const r = Math.random();
    if (st.energy < 32 && r < 0.5) {
      this.act = 'yawn'; this.stopWalk();
      this.say(this.L('هـااا 🥱', 'Yawn 🥱'));
      this.refresh();
      setTimeout(() => { if (this.act === 'yawn') { this.act = 'idle'; this.refresh(); } }, 2200);
      return;
    }
    if (st.full < 30 && r < 0.55) { this.say(this.L('گشنمه 🥺', 'Hungry 🥺')); return; }
    if (st.clean < 30 && r < 0.5) { this.say(this.L('حموم؟ 🛁', 'Bath? 🛁')); return; }
    if (r < 0.45) this.wander();
    else if (r < 0.6) this.say(this.sp().snd[I18n.lang === 'fa' ? 0 : 1]);
  },

  say(t) {
    this._say = t;
    const b = this.root && this.root.querySelector('#pet-bubble');
    if (b) {
      let el = b.querySelector('.pet-talk');
      if (!el) { el = document.createElement('div'); el.className = 'pet-talk'; b.appendChild(el); }
      el.textContent = t;
    }
    clearTimeout(this._sayT);
    this._sayT = setTimeout(() => {
      this._say = '';
      const e = this.root && this.root.querySelector('.pet-talk');
      if (e) e.remove();
    }, 2600);
  },

  float(b, ch) {
    if (!b) return;
    const h = document.createElement('span');
    h.className = 'pet-heart';
    h.textContent = ch;
    h.style.left = (20 + Math.random() * 60) + '%';
    b.appendChild(h);
    setTimeout(() => h.remove(), 1300);
  }
};
