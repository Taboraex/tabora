/* Tabora — Fall-e Hafez 📜 offline (495 ghazals + interpretations, assets/hafez.json, MIT dataset by Kaveh Bakhtiyari) */
const Hafez = {
  data: null, last: 0,

  async load() {
    if (this.data) return this.data;
    try {
      const r = await fetch(chrome.runtime ? chrome.runtime.getURL('assets/hafez.json') : 'assets/hafez.json');
      this.data = await r.json();
    } catch { this.data = []; }
    return this.data;
  },

  async open() {
    Panels.open('panel-fal');
    const body = document.getElementById('fal-body');
    if (!body) return;
    body.innerHTML = `<div class="fal-intro">
      <div class="fal-book">📖</div>
      <div class="fal-sub" data-i18n="fal_sub"></div>
      <button class="btn primary fal-take" id="fal-take">🔮 ${I18n.t('fal_btn')}</button>
    </div>`;
    if (window.I18n) I18n.applyLang(I18n.lang);
    body.querySelector('#fal-take').onclick = () => this.take();
  },

  async take() {
    const body = document.getElementById('fal-body');
    if (!body) return;
    const d = await this.load();
    if (!d.length) { body.innerHTML = '<div class="fal-err">😔</div>'; return; }
    let i;
    do { i = Math.floor(Math.random() * d.length); } while (i === this.last && d.length > 1);
    this.last = i;
    const g = d[i];
    body.innerHTML = `<div class="fal-card">
      <div class="fal-head">
        <span class="fal-orn">✦</span>
        <b data-i18n="fal_title"></b>
        <span class="fal-orn">✦</span>
      </div>
      <div class="fal-shuffle" id="fal-shuffle">🎲</div>
      <div class="fal-poem" id="fal-poem" style="display:none"></div>
      <div class="fal-interp glass" id="fal-interp" style="display:none">
        <div class="fal-interp-t">🔮 ${I18n.t('fal_interp')}</div>
        <div class="fal-interp-b" id="fal-interp-b"></div>
      </div>
      <div class="fal-btns">
        <button class="btn" id="fal-again">🎲 ${I18n.t('fal_another')}</button>
        <button class="btn" id="fal-niyy">ℹ️ ${I18n.t('fal_hint')}</button>
      </div>
    </div>`;
    const poem = body.querySelector('#fal-poem');
    poem.innerHTML = g.p.map(v => `<div class="fal-verse">${v}</div>`).join('');
    body.querySelector('#fal-interp-b').textContent = g.t;
    body.querySelector('#fal-again').onclick = () => this.take();
    body.querySelector('#fal-niyy').onclick = () => showToast(I18n.t('fal_niyy'), 4200);
    /* shuffle animation → reveal */
    const sh = body.querySelector('#fal-shuffle');
    let n = 0;
    const spin = setInterval(() => {
      sh.style.transform = `rotate(${++n * 40}deg) scale(${1 + 0.08 * Math.sin(n / 2)})`;
      sh.textContent = ['🎲', '📖', '✨', '🔮'][n % 4];
    }, 110);
    setTimeout(() => {
      clearInterval(spin);
      sh.style.display = 'none';
      poem.style.display = '';
      poem.classList.add('fal-reveal');
      setTimeout(() => {
        const ip = body.querySelector('#fal-interp');
        ip.style.display = '';
        ip.classList.add('fal-reveal');
      }, 650);
    }, 1400);
  }
};
