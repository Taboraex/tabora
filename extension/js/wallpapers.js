/* Tabora Live Wallpaper Engine — procedural animated wallpapers + smart theming */
const Wallpapers = {
  canvas: null, ctx: null, raf: 0, t0: Date.now(), running: false,

  list: [
    { id: 'aurora',   fa: 'شفق قطبی', en: 'Aurora',     accent: '#22d3ee', dark: true },
    { id: 'starfield',fa: 'کهکشان',  en: 'Starfield',  accent: '#8b9cff', dark: true },
    { id: 'sakura',   fa: 'شکوفه',   en: 'Sakura',     accent: '#f9a8d4', dark: true },
    { id: 'neonrain', fa: 'باران نئونی', en: 'Neon Rain', accent: '#34d399', dark: true },
    { id: 'ocean',    fa: 'اقیانوس', en: 'Ocean',      accent: '#38bdf8', dark: true },
    { id: 'sunset',   fa: 'غروب',   en: 'Sunset',     accent: '#fb923c', dark: true },
    { id: 'fireflies',fa: 'کرم شب‌تاب', en: 'Fireflies', accent: '#fbbf24', dark: true },
    { id: 'cybergrid',fa: 'سایبرگرید', en: 'Cyber Grid', accent: '#c084fc', dark: true },
    { id: 'nebula',   fa: 'سحابی',  en: 'Nebula',     accent: '#a78bfa', dark: true },
    { id: 'particles',fa: 'ذرات معلق', en: 'Particles', accent: '#a5b4fc', dark: true },
    { id: 'rainy',    fa: 'پنجره بارونی', en: 'Rainy Window', accent: '#60a5fa', dark: true },
    { id: 'mesh',     fa: 'موج رنگ', en: 'Color Mesh', accent: '#f472b6', dark: true }
  ],

  init() {
    this.canvas = document.getElementById('wp-canvas');
    this.ctx = this.canvas.getContext('2d');
    const rs = () => { this.canvas.width = innerWidth; this.canvas.height = innerHeight; };
    addEventListener('resize', rs); rs();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop(); else this.apply(Store.state.settings.wallpaper, true);
    });
  },

  stop() { cancelAnimationFrame(this.raf); this.running = false; },

  lowPower() { return !!Store.state.settings.lowPower; },

  /* ---------- auto rotation (favorites first, then builtin shuffle) ---------- */
  rotate() {
    const s = Store.state.settings;
    const mode = s.wpRotate || 'off';
    if (mode === 'off') return;
    const interval = mode === '6h' ? 6 * 3600000 : 24 * 3600000;
    if (s.wpNext && Date.now() < s.wpNext) return;
    const cur = s.wallpaper || {};
    const favs = (s.favWalls || []).filter(f => f && (f.url || f.id));
    let pick;
    if (favs.length) {
      const idx = favs.findIndex(f => f.id === cur.id && f.url === cur.url);
      pick = favs[(idx + 1) % favs.length];
    } else {
      const i = this.list.findIndex(w => w.id === cur.id);
      const step = 1 + Math.floor(Math.random() * (this.list.length - 1));
      const nx = this.list[((i < 0 ? 0 : i) + step) % this.list.length];
      pick = { type: 'builtin', id: nx.id, url: '' };
    }
    Store.setSettings({ wallpaper: pick, wpNext: Date.now() + interval });
    showToast(I18n.t('wp_rotated'), 1800);
  },

  apply(wp, silent) {
    wp = wp || Store.state.settings.wallpaper;
    const layerVideo = document.getElementById('wp-video');
    const layerImg = document.getElementById('wp-img');
    this.stop();
    layerVideo.style.display = 'none'; layerImg.style.display = 'none';
    this.canvas.style.display = 'none';
    layerVideo.pause(); layerVideo.removeAttribute('src'); layerVideo.load();

    if (wp.type === 'builtin' || !wp.type) {
      this.canvas.style.display = 'block';
      const def = this.list.find(w => w.id === (wp.id || 'aurora')) || this.list[0];
      if (this.lowPower()) {
        /* static single frame — no animation loop */
        const draw = this.painters[wp.id || 'aurora'] || this.painters.aurora;
        draw(this.ctx, this.canvas.width, this.canvas.height, 2, this.stateFor(wp.id || 'aurora'));
      } else {
        this.running = true;
        this.loop(wp.id || 'aurora');
      }
      Theme.set(def.accent, true);
    } else if (wp.type === 'video' && wp.url) {
      layerVideo.src = wp.url;
      layerVideo.style.display = 'block';
      if (this.lowPower()) {
        /* freeze on first frame instead of playing */
        layerVideo.onloadeddata = () => { try { layerVideo.pause(); } catch (e) { } };
      } else layerVideo.play().catch(() => { });
      if (wp.accent) {
        Theme.set(wp.accent, true);
      } else {
        layerVideo.onloadeddata = () => { if (!silent) Theme.extractFromVideo(layerVideo); else Theme.set(Store.state.settings.accent || '#8b5cf6', true); };
        Theme.set(Store.state.settings.accent || '#8b5cf6', true);
      }
    } else if ((wp.type === 'image' || wp.type === 'custom') && wp.url) {
      layerImg.src = wp.url;
      layerImg.style.display = 'block';
      layerImg.onload = () => Theme.extractFromImage(layerImg);
      Theme.set(Store.state.settings.accent || '#8b5cf6', true);
    }
    if (!silent) { }
  },

  loop(id) {
    const draw = this.painters[id] || this.painters.aurora;
    const state = this.stateFor(id);
    const step = () => {
      if (!this.running) return;
      const t = (Date.now() - this.t0) / 1000;
      draw(this.ctx, this.canvas.width, this.canvas.height, t, state);
      this.raf = requestAnimationFrame(step);
    };
    step();
  },

  stateFor(id) {
    this._s = this._s || {};
    if (this._s[id]) return this._s[id];
    const s = {};
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (id === 'starfield') s.stars = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), z: rnd(.2, 1) }));
    if (id === 'sakura') s.p = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(4, 9), v: rnd(.02, .05), ph: rnd(0, 6) }));
    if (id === 'neonrain') s.cols = Array.from({ length: 80 }, () => ({ y: Math.random(), v: rnd(.15, .5), c: Math.random() }));
    if (id === 'fireflies') s.f = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), a: rnd(0, 6), v: rnd(.01, .03) }));
    if (id === 'rainy') s.d = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), v: rnd(.4, 1), l: rnd(10, 26) }));
    if (id === 'particles') s.p = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(1.5, 4), v: rnd(.008, .02), ph: rnd(0, 6) }));
    this._s[id] = s;
    return s;
  },

  painters: {
    aurora(ctx, w, h, t) {
      ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        const g = ctx.createLinearGradient(0, 0, w, h);
        const hue = 160 + i * 40 + Math.sin(t * .2 + i) * 25;
        g.addColorStop(0, `hsla(${hue},90%,55%,0)`);
        g.addColorStop(.5, `hsla(${hue},90%,60%,.16)`);
        g.addColorStop(1, `hsla(${hue + 40},90%,55%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 14) {
          const y = h * .35 + Math.sin(x * .002 + t * (.4 + i * .1) + i * 2) * 90 + i * 46;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.lineTo(w, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      }
    },
    starfield(ctx, w, h, t, s) {
      ctx.fillStyle = 'rgba(4,6,20,.5)'; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      s.stars.forEach(st => {
        st.z -= .0016; if (st.z <= .05) { st.z = 1; st.x = Math.random(); st.y = Math.random(); }
        const x = cx + (st.x - .5) * w / st.z, y = cy + (st.y - .5) * h / st.z;
        const r = (1 - st.z) * 2.2;
        ctx.fillStyle = `rgba(200,210,255,${(1 - st.z) * .9})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      });
    },
    sakura(ctx, w, h, t, s) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1a0b2e'); g.addColorStop(1, '#3b1140');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      s.p.forEach(p => {
        p.y += p.v / 100 * 4; p.x += Math.sin(t + p.ph) * .001;
        if (p.y > 1.05) { p.y = -.05; p.x = Math.random(); }
        ctx.save();
        ctx.translate(p.x * w, p.y * h);
        ctx.rotate(Math.sin(t * .8 + p.ph) * .9);
        ctx.fillStyle = `rgba(249,168,212,${.5 + Math.sin(p.ph) * .3})`;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, 7); ctx.fill();
        ctx.restore();
      });
    },
    neonrain(ctx, w, h, t, s) {
      ctx.fillStyle = 'rgba(2,8,10,.28)'; ctx.fillRect(0, 0, w, h);
      const cw = w / s.cols.length;
      s.cols.forEach((c, i) => {
        c.y += c.v / 60;
        if (c.y > 1.2) { c.y = -.2; c.v = .15 + Math.random() * .35; }
        const x = i * cw + cw / 2, y = c.y * h;
        const grad = ctx.createLinearGradient(x, y - 120, x, y);
        const col = c.c > .85 ? '255,120,220' : '52,211,153';
        grad.addColorStop(0, `rgba(${col},0)`); grad.addColorStop(1, `rgba(${col},.85)`);
        ctx.strokeStyle = grad; ctx.lineWidth = Math.max(1.5, cw * .16);
        ctx.beginPath(); ctx.moveTo(x, y - 120); ctx.lineTo(x, y); ctx.stroke();
      });
    },
    ocean(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#02121f'); g.addColorStop(1, '#04395e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const base = h * (.55 + i * .1);
        for (let x = 0; x <= w; x += 10) {
          const y = base + Math.sin(x * .004 + t * (1 + i * .2) + i * 3) * (18 - i * 2);
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        ctx.fillStyle = `rgba(56,189,248,${.05 + i * .04})`; ctx.fill();
      }
    },
    sunset(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      const sh = Math.sin(t * .1) * 10;
      g.addColorStop(0, `hsl(${265 + sh},60%,14%)`);
      g.addColorStop(.55, `hsl(${330 + sh},70%,30%)`);
      g.addColorStop(1, `hsl(${25 + sh},90%,52%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const sy = h * .68 + Math.sin(t * .2) * 6;
      const sg = ctx.createRadialGradient(w / 2, sy, 10, w / 2, sy, 190);
      sg.addColorStop(0, 'rgba(255,220,150,.95)'); sg.addColorStop(1, 'rgba(255,150,80,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(w / 2, sy, 190, 0, 7); ctx.fill();
    },
    fireflies(ctx, w, h, t, s) {
      ctx.fillStyle = '#04070d'; ctx.fillRect(0, 0, w, h);
      s.f.forEach(p => {
        p.a += .02;
        p.x += Math.cos(p.a) * p.v / 10; p.y += Math.sin(p.a * .8) * p.v / 10;
        const x = ((p.x % 1) + 1) % 1 * w, y = ((p.y % 1) + 1) % 1 * h;
        const gl = .4 + Math.sin(t * 2 + p.a * 3) * .35;
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 14);
        gg.addColorStop(0, `rgba(251,191,36,${gl})`); gg.addColorStop(1, 'rgba(251,191,36,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill();
      });
    },
    cybergrid(ctx, w, h, t) {
      ctx.fillStyle = '#0b0416'; ctx.fillRect(0, 0, w, h);
      const hor = h * .55;
      const sky = ctx.createLinearGradient(0, 0, 0, hor);
      sky.addColorStop(0, '#1b0637'); sky.addColorStop(1, '#5b1e8f');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hor);
      const sun = ctx.createRadialGradient(w / 2, hor, 0, w / 2, hor, h * .35);
      sun.addColorStop(0, 'rgba(255,110,199,.9)'); sun.addColorStop(1, 'rgba(255,110,199,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, w, hor);
      ctx.strokeStyle = 'rgba(192,132,252,.5)'; ctx.lineWidth = 1.2;
      const speed = (t * 40) % 60;
      for (let i = 0; i < 22; i++) {
        const z = (i * 60 + speed);
        const y = hor + (z * z) / 900;
        if (y > h) continue;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let i = -12; i <= 12; i++) {
        ctx.beginPath(); ctx.moveTo(w / 2 + i * 30, hor); ctx.lineTo(w / 2 + i * w * .12, h); ctx.stroke();
      }
    },
    nebula(ctx, w, h, t) {
      ctx.fillStyle = '#070312'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        const x = w * (.2 + i * .16) + Math.sin(t * .15 + i * 2) * 90;
        const y = h * (.3 + (i % 3) * .2) + Math.cos(t * .12 + i) * 60;
        const r = 200 + i * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const hue = 265 + i * 18 + Math.sin(t * .1) * 12;
        g.addColorStop(0, `hsla(${hue},80%,55%,.14)`); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      for (let i = 0; i < 40; i++) {
        const x = (i * 97 % w), y = (i * 53 % h);
        ctx.fillStyle = `rgba(255,255,255,${.3 + Math.sin(t * 2 + i) * .25})`;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    },
    particles(ctx, w, h, t, s) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#0d1024'); g.addColorStop(1, '#1a1440');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      s.p.forEach((p, i) => {
        p.y -= p.v / 4; if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
        const x = p.x * w + Math.sin(t + p.ph) * 18, y = p.y * h;
        ctx.fillStyle = `rgba(165,180,252,${.35 + Math.sin(t * 1.5 + i) * .25})`;
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, 7); ctx.fill();
      });
      s.p.forEach((p, i) => {
        s.p.slice(i + 1, i + 4).forEach(q => {
          const dx = (p.x - q.x) * w, dy = (p.y - q.y) * h, d = Math.hypot(dx, dy);
          if (d < 130) {
            ctx.strokeStyle = `rgba(165,180,252,${(1 - d / 130) * .12})`;
            ctx.beginPath(); ctx.moveTo(p.x * w, p.y * h); ctx.lineTo(q.x * w, q.y * h); ctx.stroke();
          }
        });
      });
    },
    rainy(ctx, w, h, t, s) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a1220'); g.addColorStop(1, '#101d33');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      s.d.forEach(d => {
        d.y += d.v / 40; if (d.y > 1.05) { d.y = -.05; d.x = Math.random(); }
        const x = d.x * w, y = d.y * h;
        ctx.strokeStyle = 'rgba(96,165,250,.35)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + d.l); ctx.stroke();
      });
      ctx.fillStyle = 'rgba(255,255,255,.015)';
      for (let i = 0; i < 6; i++) ctx.fillRect(0, (t * 8 + i * h / 6) % h, w, 2);
    },
    mesh(ctx, w, h, t) {
      ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, w, h);
      const blobs = [[.25, .3, '#f472b6'], [.75, .35, '#8b5cf6'], [.5, .8, '#38bdf8'], [.15, .75, '#f59e0b']];
      blobs.forEach(([bx, by, c], i) => {
        const x = (bx + Math.sin(t * .18 + i * 2) * .12) * w;
        const y = (by + Math.cos(t * .15 + i * 3) * .12) * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * .38);
        g.addColorStop(0, c + '33'); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      });
    }
  }
};

/* ---------- Smart Theme ---------- */
const Theme = {
  set(accent, dark) {
    const r = document.documentElement.style;
    r.setProperty('--accent', accent);
    r.setProperty('--accent-soft', accent + '2e');
    r.setProperty('--accent-glow', accent + '55');
    Store.state.settings.accent = accent;
  },
  extractFromImage(img) {
    try {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
      const d = x.getImageData(0, 0, 32, 32).data;
      let r = 0, g = 0, b = 0, sat = [], n = 0;
      for (let i = 0; i < d.length; i += 16) {
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        if (mx - mn > 40 && mx > 60) sat.push([d[i], d[i + 1], d[i + 2]]);
      }
      let pick;
      if (sat.length > 8) {
        let sr = 0, sg = 0, sb = 0; sat.forEach(p => { sr += p[0]; sg += p[1]; sb += p[2]; });
        pick = [sr / sat.length, sg / sat.length, sb / sat.length];
      } else pick = [r / n, g / n, b / n];
      const boost = (v) => Math.min(255, v * 1.25 + 30);
      const hex = '#' + pick.map(boost).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      this.set(hex, true);
      Store.persist(['settings']);
      showToast(I18n.t('smart_theme_applied'), 2600);
    } catch (e) { this.set('#8b5cf6', true); }
  },
  extractFromVideo(v) {
    try {
      const c = document.createElement('canvas'); c.width = 32; c.height = 18;
      c.getContext('2d').drawImage(v, 0, 0, 32, 18);
      const d = c.getContext('2d').getImageData(0, 0, 32, 18).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 8) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      const hex = '#' + [r / n, g / n, b / n].map(v => Math.round(Math.min(255, v * 1.3 + 25)).toString(16).padStart(2, '0')).join('');
      this.set(hex, true);
      Store.persist(['settings']);
      showToast(I18n.t('smart_theme_applied'), 2600);
    } catch (e) { this.set('#8b5cf6', true); }
  }
};
