/* Tabora Search — multi-engine with live suggestions */
const ENGINES = {
  google:      { name: 'Google',      icon: '🔍', url: q => 'https://www.google.com/search?q=' + encodeURIComponent(q) },
  bing:        { name: 'Bing',        icon: '🅱️', url: q => 'https://www.bing.com/search?q=' + encodeURIComponent(q) },
  duckduckgo:  { name: 'DuckDuckGo',  icon: '🦆', url: q => 'https://duckduckgo.com/?q=' + encodeURIComponent(q) },
  youtube:     { name: 'YouTube',     icon: '▶️', url: q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) },
  ecosia:      { name: 'Ecosia',      icon: '🌱', url: q => 'https://www.ecosia.org/search?q=' + encodeURIComponent(q) },
  wikipedia:   { name: 'Wikipedia',   icon: '📚', url: q => 'https://' + (I18n.lang === 'fa' ? 'fa' : 'en') + '.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(q) }
};

const Search = {
  engine: 'google',
  suggTimer: 0,
  suggIndex: -1,
  suggList: [],

  open() {
    this.engine = Store.state.settings.engine || 'google';
    const ov = document.getElementById('search-overlay');
    ov.classList.add('open');
    this.renderEngines();
    this.renderRecents();
    setTimeout(() => document.getElementById('search-input').focus(), 60);
  },
  close() {
    document.getElementById('search-overlay').classList.remove('open');
    document.getElementById('search-input').value = '';
    document.getElementById('search-sugg').innerHTML = '';
  },

  renderEngines() {
    const bar = document.getElementById('search-engines');
    bar.innerHTML = '';
    Object.entries(ENGINES).forEach(([id, e]) => {
      const b = el('button', 'se-chip' + (id === this.engine ? ' active' : ''), `${e.icon} ${e.name}`);
      b.onclick = () => { this.engine = id; this.renderEngines(); Store.setSettings({ engine: id }); };
      bar.appendChild(b);
    });
  },

  renderRecents() {
    const box = document.getElementById('search-sugg');
    const rec = Store.state.cache.recentSearches || [];
    if (!rec.length) { box.innerHTML = `<div class="sg-hint">${I18n.t('search_hint')}</div>`; return; }
    box.innerHTML = `<div class="sg-label">${I18n.t('recent_searches')}</div>` +
      rec.slice(0, 6).map(q => `<div class="sg-item" data-q="${q.replace(/"/g, '&quot;')}">🕘 ${q}</div>`).join('');
    this.bindSugg();
  },

  async suggest(q) {
    clearTimeout(this.suggTimer);
    if (!q.trim()) { this.renderRecents(); return; }
    this.suggTimer = setTimeout(async () => {
      let items = [];
      try {
        const hl = I18n.lang === 'fa' ? 'fa' : 'en';
        const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=${hl}&q=${encodeURIComponent(q)}`);
        const d = await r.json();
        items = d[1] || [];
      } catch {
        try {
          const r2 = await fetch('https://duckduckgo.com/ac/?q=' + encodeURIComponent(q) + '&type=list');
          const d2 = await r2.json();
          items = d2[1] || [];
        } catch { items = []; }
      }
      this.suggList = items.slice(0, 8);
      this.suggIndex = -1;
      const box = document.getElementById('search-sugg');
      box.innerHTML = this.suggList.length
        ? this.suggList.map((s, i) => `<div class="sg-item" data-i="${i}"><span class="sg-ico">🔎</span>${s}</div>`).join('')
        : `<div class="sg-hint">${I18n.t('search_hint')}</div>`;
      this.bindSugg();
    }, 220);
  },

  bindSugg() {
    document.querySelectorAll('#search-sugg .sg-item').forEach(it => {
      it.onmousedown = (e) => { e.preventDefault(); this.go(it.dataset.q != null ? it.dataset.q : this.suggList[+it.dataset.i]); };
    });
  },

  go(q) {
    q = (q || document.getElementById('search-input').value).trim();
    if (!q) return;
    const rec = (Store.state.cache.recentSearches || []).filter(x => x !== q);
    rec.unshift(q);
    Store.state.cache.recentSearches = rec.slice(0, 10);
    Store.persist(['cache']);
    const url = ENGINES[this.engine].url(q);
    if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url });
    else window.open(url, '_blank');
    this.close();
  },

  onKey(e) {
    const items = [...document.querySelectorAll('#search-sugg .sg-item[data-i]')];
    if (e.key === 'ArrowDown') { this.suggIndex = Math.min(this.suggIndex + 1, items.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { this.suggIndex = Math.max(this.suggIndex - 1, -1); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (this.suggIndex >= 0 && items[this.suggIndex]) this.go(this.suggList[+items[this.suggIndex].dataset.i]);
      else this.go();
      return;
    } else if (e.key === 'Escape') { this.close(); return; }
    items.forEach((it, i) => it.classList.toggle('hl', i === this.suggIndex));
    if (this.suggIndex >= 0 && items[this.suggIndex]) document.getElementById('search-input').value = this.suggList[+items[this.suggIndex].dataset.i];
  }
};
