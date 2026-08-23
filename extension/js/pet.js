/* Tabora Pet — a tiny animated companion living on your new tab */
const Pet = {
  root: null, lastClick: 0,

  species: [
    { id: 'cat', fa: 'گربهٔ شفق', en: 'Aurora Cat', c1: '#a78bfa', c2: '#7c3aed' },
    { id: 'fox', fa: 'روباه نئون', en: 'Neon Fox', c1: '#fdba74', c2: '#ea580c' },
    { id: 'owl', fa: 'جغد ستاره', en: 'Star Owl', c1: '#7dd3fc', c2: '#0284c7' },
    { id: 'drag', fa: 'اژدهاکوچولو', en: 'Tiny Dragon', c1: '#6ee7b7', c2: '#059669' }
  ],

  st() {
    const s = Store.state.settings.pet || {};
    return Object.assign({ enabled: true, name: '', species: 'cat', xp: 0, born: Date.now(), lastDay: '' }, s);
  },
  save(patch) {
    const cur = this.st();
    Store.setSettings({ pet: Object.assign(cur, patch) });
  },
  level(xp) { return 1 + Math.floor(xp / 25); },
  sleeping() { const h = new Date().getHours(); return h >= 23 || h < 6; },

  init() {
    this.root = document.getElementById('pet-root');
    if (!this.root) return;
    Store.onChange(() => this.render());
    this.dailyBonus();
    this.render();
  },

  dailyBonus() {
    const s = this.st();
    const today = new Date().toDateString();
    if (s.enabled && s.lastDay !== today) this.save({ lastDay: today, xp: s.xp + 5 });
  },

  sp() { return this.species.find(x => x.id === this.st().species) || this.species[0]; },

  svg(sleep) {
    const sp = this.sp();
    const ears = {
      cat: '<path d="M30 34 L26 14 L44 26 Z"/><path d="M70 34 L74 14 L56 26 Z"/>',
      fox: '<path d="M28 36 L20 10 L46 26 Z"/><path d="M72 36 L80 10 L54 26 Z"/>',
      owl: '<path d="M30 30 L24 16 L40 24 Z"/><path d="M70 30 L76 16 L60 24 Z"/>',
      drag: '<path d="M28 32 Q18 12 40 20 Z"/><path d="M72 32 Q82 12 60 20 Z"/>'
    }[sp.id];
    const horns = sp.id === 'drag' ? '<circle cx="30" cy="20" r="4" fill="#fbbf24"/><circle cx="70" cy="20" r="4" fill="#fbbf24"/>' : '';
    const tail = sp.id === 'fox'
      ? '<path d="M78 66 Q96 60 92 44 Q88 56 76 58 Z" fill="' + sp.c2 + '"/>'
      : '<path d="M78 66 Q94 66 90 50" stroke="' + sp.c2 + '" stroke-width="7" fill="none" stroke-linecap="round"/>';
    const eyes = sleep
      ? '<path d="M36 52 q6 5 12 0" stroke="#1e1b31" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M52 52 q6 5 12 0" stroke="#1e1b31" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '<g class="pet-eyes"><circle cx="42" cy="52" r="6.5" fill="#fff"/><circle cx="58" cy="52" r="6.5" fill="#fff"/><circle cx="43.5" cy="53" r="3.2" fill="#1e1b31"/><circle cx="59.5" cy="53" r="3.2" fill="#1e1b31"/><circle cx="45" cy="51.5" r="1.1" fill="#fff"/><circle cx="61" cy="51.5" r="1.1" fill="#fff"/></g>';
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="petg" cx="38%" cy="32%"><stop offset="0%" stop-color="${sp.c1}"/><stop offset="100%" stop-color="${sp.c2}"/></radialGradient></defs>
      <g fill="${sp.c2}">${ears}</g>${horns}${tail}
      <circle cx="50" cy="58" r="30" fill="url(#petg)"/>
      <ellipse cx="50" cy="70" rx="16" ry="10" fill="rgba(255,255,255,.16)"/>
      ${eyes}
      <path d="M46 62 q4 4 8 0" stroke="#1e1b31" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <circle cx="33" cy="60" r="4" fill="rgba(255,150,180,.4)"/><circle cx="67" cy="60" r="4" fill="rgba(255,150,180,.4)"/>
    </svg>`;
  },

  render() {
    if (!this.root) return;
    const s = this.st();
    if (!s.enabled) { this.root.innerHTML = ''; return; }
    const sp = this.sp();
    const sleep = this.sleeping();
    const name = s.name || (I18n.lang === 'fa' ? sp.fa : sp.en);
    const lv = this.level(s.xp);
    this.root.innerHTML = `
      <div class="pet-bubble ${sleep ? 'sleep' : ''}" id="pet-bubble" title="${name}">
        ${this.svg(sleep)}
        ${sleep ? '<span class="pet-zz">💤</span>' : ''}
        <span class="pet-lv">⭐ ${lv}</span>
      </div>
      <div class="pet-name">${name}</div>`;
    const b = this.root.querySelector('#pet-bubble');
    b.onclick = () => this.poke(b);
  },

  poke(b) {
    const now = Date.now();
    if (now - this.lastClick < 700) return;
    this.lastClick = now;
    if (this.sleeping()) {
      this.float(b, '💤');
      return;
    }
    b.classList.remove('jump'); void b.offsetWidth; b.classList.add('jump');
    const hearts = ['💜', '✨', '💖'];
    this.float(b, hearts[Math.floor(Math.random() * hearts.length)]);
    const s = this.st();
    const before = this.level(s.xp);
    this.save({ xp: s.xp + 1 });
    const after = this.level(s.xp + 1);
    if (after > before) {
      this.float(b, '🎉');
      showToast('🐾 ' + (I18n.lang === 'fa' ? 'پتت به سطح ' : 'Your pet reached level ') + after + '!', 2600);
    }
  },

  float(b, ch) {
    const h = document.createElement('span');
    h.className = 'pet-heart';
    h.textContent = ch;
    h.style.left = (30 + Math.random() * 40) + '%';
    b.appendChild(h);
    setTimeout(() => h.remove(), 1300);
  }
};
