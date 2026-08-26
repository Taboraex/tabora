/* Tabora widgets: clock, weather, prices, smart bookmarks, quote */

/* ---------------- Smart bookmark brand database ---------------- */
const BRANDS = {
  'google.com': { fa: 'گوگل', en: 'Google', c: '#4285F4' },
  'youtube.com': { fa: 'یوتیوب', en: 'YouTube', c: '#FF0000' },
  'instagram.com': { fa: 'اینستاگرام', en: 'Instagram', c: '#E1306C' },
  'telegram.org': { fa: 'تلگرام', en: 'Telegram', c: '#26A5E4' },
  't.me': { fa: 'تلگرام', en: 'Telegram', c: '#26A5E4' },
  'web.telegram.org': { fa: 'تلگرام', en: 'Telegram', c: '#26A5E4' },
  'x.com': { fa: 'ایکس', en: 'X', c: '#111111' },
  'twitter.com': { fa: 'ایکس', en: 'X', c: '#111111' },
  'github.com': { fa: 'گیت‌هاب', en: 'GitHub', c: '#24292F' },
  'reddit.com': { fa: 'ردیت', en: 'Reddit', c: '#FF4500' },
  'wikipedia.org': { fa: 'ویکی‌پدیا', en: 'Wikipedia', c: '#5a5a5a' },
  'en.wikipedia.org': { fa: 'ویکی‌پدیا', en: 'Wikipedia', c: '#5a5a5a' },
  'fa.wikipedia.org': { fa: 'ویکی‌پدیا', en: 'Wikipedia', c: '#5a5a5a' },
  'linkedin.com': { fa: 'لینکدین', en: 'LinkedIn', c: '#0A66C2' },
  'whatsapp.com': { fa: 'واتساپ', en: 'WhatsApp', c: '#25D366' },
  'web.whatsapp.com': { fa: 'واتساپ', en: 'WhatsApp', c: '#25D366' },
  'facebook.com': { fa: 'فیسبوک', en: 'Facebook', c: '#1877F2' },
  'pinterest.com': { fa: 'پینترست', en: 'Pinterest', c: '#E60023' },
  'spotify.com': { fa: 'اسپاتیفای', en: 'Spotify', c: '#1DB954' },
  'open.spotify.com': { fa: 'اسپاتیفای', en: 'Spotify', c: '#1DB954' },
  'netflix.com': { fa: 'نتفلیکس', en: 'Netflix', c: '#E50914' },
  'twitch.tv': { fa: 'توییچ', en: 'Twitch', c: '#9146FF' },
  'discord.com': { fa: 'دیسکورد', en: 'Discord', c: '#5865F2' },
  'amazon.com': { fa: 'آمازون', en: 'Amazon', c: '#FF9900' },
  'aparat.com': { fa: 'آپارات', en: 'Aparat', c: '#ED0B58' },
  'digikala.com': { fa: 'دیجی‌کالا', en: 'Digikala', c: '#EF394E' },
  'snapp.ir': { fa: 'اسنپ', en: 'Snapp', c: '#00D170' },
  'divar.ir': { fa: 'دیوار', en: 'Divar', c: '#A62626' },
  'varzesh3.com': { fa: 'ورزش سه', en: 'Varzesh3', c: '#0095D9' },
  'chat.openai.com': { fa: 'چت‌جی‌پی‌تی', en: 'ChatGPT', c: '#10A37F' },
  'chatgpt.com': { fa: 'چت‌جی‌پی‌تی', en: 'ChatGPT', c: '#10A37F' },
  'claude.ai': { fa: 'کلاد', en: 'Claude', c: '#D97757' },
  'gemini.google.com': { fa: 'جمینای', en: 'Gemini', c: '#4E8CF9' },
  'gmail.com': { fa: 'جیمیل', en: 'Gmail', c: '#EA4335' },
  'mail.google.com': { fa: 'جیمیل', en: 'Gmail', c: '#EA4335' },
  'maps.google.com': { fa: 'گوگل مپ', en: 'Google Maps', c: '#34A853' },
  'translate.google.com': { fa: 'گوگل ترجمه', en: 'Translate', c: '#4285F4' },
  'medium.com': { fa: 'مدیوم', en: 'Medium', c: '#12100E' },
  'stackoverflow.com': { fa: 'استک‌اورفلو', en: 'StackOverflow', c: '#F48024' },
  'zoom.us': { fa: 'زوم', en: 'Zoom', c: '#2D8CFF' },
  'notion.so': { fa: 'نوشن', en: 'Notion', c: '#37352F' },
  'figma.com': { fa: 'فیگما', en: 'Figma', c: '#F24E1E' },
  'bing.com': { fa: 'بینگ', en: 'Bing', c: '#008373' },
  'yahoo.com': { fa: 'یاهو', en: 'Yahoo', c: '#6001D2' },
  'yandex.com': { fa: 'یاندکس', en: 'Yandex', c: '#FC3F1D' },
  'aliexpress.com': { fa: 'علی‌اکسپرس', en: 'AliExpress', c: '#E62E04' },
  'turbosquid.com': { fa: 'تربواسکوید', en: 'TurboSquid', c: '#0F7B6C' },
  'speedtest.net': { fa: 'اسپیدتست', en: 'Speedtest', c: '#141526' },
  'filimo.com': { fa: 'فیلیمو', en: 'Filimo', c: '#43C5FF' },
  'namava.ir': { fa: 'نماوا', en: 'Namava', c: '#E31E24' },
};
function detectBrand(url) {
  try {
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    const u = new URL(url);
    let host = u.hostname.replace(/^www\./, '');
    let b = BRANDS[host];
    let walk = host.split('.');
    while (!b && walk.length > 1) { walk.shift(); b = BRANDS[walk.join('.')]; }
    const name = b ? b[I18n.lang] : host.replace(/\.(com|ir|org|net|io|ai)$/i, '');
    return {
      url: u.href, host,
      name: b ? (I18n.lang === 'fa' ? b.fa : b.en) : name,
      color: b ? b.c : '#52525b',
      known: !!b
    };
  } catch { return null; }
}

/* ---------------- quotes ---------------- */
const QUOTES_FA = [
  'هر روز یک قدم کوچک، تو را به رویاهایت نزدیک می‌کند.',
  'زندگی یا یک ماجراجویی جسورانه است یا هیچ.',
  'بهترین زمان برای شروع، همین الان است.',
  'ذهنت باغ توست؛ فقط گل بکار.',
  'سخت‌کوشی، شانس را می‌سازد.',
  'آرام باش؛ تو داری بهتر از چیزی می‌شوی که فکر می‌کنی.',
  'رویاهات رو بنویس، بعد براشون برنامه بریز.',
  'هر متخصصی، روزی یک مبتدی بوده است.',
  'موفقیت مجموعه‌ای از تلاش‌های کوچک روزانه است.',
  'امروز همان روزی است که دیروز منتظرش بودی.'
];
const QUOTES_EN = [
  'One small step every day brings you closer to your dreams.',
  'Life is either a daring adventure or nothing at all.',
  'The best time to start is right now.',
  'Your mind is a garden — plant only flowers.',
  'Hard work builds luck.',
  'Stay calm; you are becoming better than you think.',
  'Write your dreams, then plan for them.',
  'Every expert was once a beginner.',
  'Success is the sum of small efforts, repeated daily.',
  'Today is the day you were waiting for.'
];

/* ---------------- helpers ---------------- */
const fmtNum = (n) => new Intl.NumberFormat(I18n.lang === 'fa' ? 'fa-IR' : 'en-US').format(n);
function el(tag, cls, html) { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }

/* ================================================================ */
const Widgets = {
  clockTimer: 0, weatherTimer: 0,

  /* remote feature flags (window.FLAGS fetched from /api/flags) */
  flagOff(widgetId) {
    const F = window.FLAGS || {};
    const map = { weather: 'weather', prices: 'prices', quote: 'quotes', fal: 'fal', pray: 'pray' };
    const k = map[widgetId];
    return k && F[k] === false;
  },

  renderAll() {
    this.renderClock();
    const row = document.getElementById('widgets-row');
    row.innerHTML = '';
    const s = Store.state.settings;
    const def = ['calendar', 'weather', 'prices', 'bookmarks', 'quote', 'focus', 'todo'];
    let order = (s.widgets && s.widgets.order) || def;
    def.forEach(id => { if (!order.includes(id)) order.push(id); });
    const hidden = (s.widgets && s.widgets.hidden) || [];
    let i = 0;
    order.forEach(id => {
      if (hidden.includes(id)) return;
      if (this.flagOff(id)) return;
      const w = this.build(id);
      if (w) { w.classList.add('w-in'); w.style.animationDelay = (i++ * 80) + 'ms'; row.appendChild(w); }
    });
    this.fitRow();
    if (!this._fitBound) {
      this._fitBound = true;
      addEventListener('resize', () => this.fitRow());
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.fitRow()).catch(() => {});
      new ResizeObserver(() => this.fitRow()).observe(row);   /* refit when async content (weather/prices) changes row height */
      row.addEventListener('wheel', e => {
        if (row.scrollWidth <= row.clientWidth + 2) return;
        const rtl = getComputedStyle(row).direction === 'rtl';
        row.scrollLeft += (rtl ? -1 : 1) * (e.deltaY || e.deltaX);
      }, { passive: true });
    }
    if (!this._spot) {
      this._spot = true;
      row.addEventListener('mousemove', e => {
        row.querySelectorAll('.widget').forEach(w => {
          const r = w.getBoundingClientRect();
          w.style.setProperty('--mx', (e.clientX - r.left) + 'px');
          w.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
      });
    }
    this.renderCalendar();
    this.renderWeather();
    this.renderPrices();
    this.renderBookmarks();
    this.renderQuote();
    this.renderFocus();
    this.renderTodo();
    if (typeof I18n !== 'undefined') I18n.applyLang(I18n.lang);
  },

  /* Smart fit: cards share the row proportionally; layout width compensates for zoom
     so the visual row always fills the screen edge-to-edge — zooming never overflows. */
  fitRow() {
    const row = document.getElementById('widgets-row');
    if (!row || !row.children.length) return;
    const avail = row.parentElement.clientWidth - 48;        /* wrap padding */
    const sb = document.querySelector('.searchbar');
    const sbBottom = sb ? sb.getBoundingClientRect().bottom : innerHeight * .45;
    const roomH = innerHeight - 112 - sbBottom;               /* dock offset + breathing room */
    let z = Store.state.settings.scale || 1;
    for (let i = 0; i < 3; i++) {
      row.style.width = (avail / z) + 'px';
      const H = row.offsetHeight;
      if (H * z <= roomH + 1) break;                          /* fits vertically — done */
      z = Math.max(.7, Math.min(z, roomH / Math.max(H, 1)));  /* never collide with the clock */
    }
    row.style.transform = `scale(${z})`;
    row.classList.toggle('of', row.scrollWidth > row.clientWidth + 2);
  },

  build(id) {
    const card = el('div', 'widget glass', null);
    card.dataset.wid = id;
    card.draggable = false;
    if (id === 'calendar') {
      card.id = 'w-calendar';
      card.innerHTML = `<div class="w-title"><span>🗓️</span><b data-i18n="widget_calendar"></b><span class="w-badge" id="cal-off-badge"></span><button class="bm-add" title="${I18n.t('widget_events')}">+</button></div>
        <div class="cal-main"><div class="cal-day" id="cal-day">--</div>
          <div class="cal-side"><b id="cal-month"></b><span id="cal-greg" class="muted"></span></div></div>
        <div class="cal-ev" id="cal-ev"></div>
        <div class="cal-my" id="cal-my"></div>
        <div class="cal-pray" id="cal-pray" style="display:none"></div>
        <div class="cal-next" id="cal-next"></div>`;
      card.querySelector('.bm-add').onclick = () => Panels.openEvents();
    } else if (id === 'weather') {
      card.id = 'w-weather';
      card.innerHTML = `<div class="w-title"><span>🌤️</span><b data-i18n="widget_weather"></b><button class="bm-add" id="wx-city-btn" title="${I18n.t('city_title')}">📍</button></div><div class="wx-scene"></div><div class="wx-body"><div class="wx-temp">--°</div><div class="wx-meta"></div></div><div class="wx-days" id="wx-days"></div>`;
      card.querySelector('#wx-city-btn').onclick = () => Panels.open('panel-city');
    } else if (id === 'prices') {
      card.id = 'w-prices';
      card.innerHTML = `<div class="w-title"><span>💱</span><b data-i18n="widget_prices"></b><span class="w-badge" data-i18n="toman"></span></div><div class="pr-list"><div class="pr-loading" data-i18n="loading"></div></div>`;
    } else if (id === 'bookmarks') {
      card.id = 'w-bookmarks';
      card.innerHTML = `<div class="w-title"><span>🔖</span><b data-i18n="widget_bookmarks"></b><button class="bm-add" title="${I18n.t('add_bookmark')}">+</button></div><div class="bm-grid"></div>`;
      card.querySelector('.bm-add').onclick = () => Panels.openBookmarks();
    } else if (id === 'quote') {
      card.id = 'w-quote';
      card.innerHTML = `<div class="w-title"><span>💫</span><b data-i18n="widget_quote"></b></div><div class="q-text"></div>`;
    } else if (id === 'focus') {
      card.id = 'w-focus';
      card.innerHTML = `<div class="w-title"><span>⏱️</span><b data-i18n="widget_focus"></b><span class="w-badge" id="fz-mode"></span><span class="w-badge" id="fz-block" style="display:none">🔒</span></div>
        <div class="fz-wrap"><svg viewBox="0 0 100 100" class="fz-ring"><circle cx="50" cy="50" r="42" class="fz-bg"/><circle cx="50" cy="50" r="42" class="fz-fg" id="fz-fg"/></svg>
        <div class="fz-mid"><b id="fz-time" dir="ltr">25:00</b><small id="fz-st"></small></div></div>
        <div class="fz-btns"><button id="fz-go" class="btn primary sm"></button><button id="fz-re" class="btn sm" title="↺">↺</button></div>`;
    } else if (id === 'todo') {
      card.id = 'w-todo';
      card.innerHTML = `<div class="w-title"><span>✅</span><b data-i18n="widget_todo"></b><span class="w-badge" id="td-count"></span></div>
        <div class="td-add"><input id="td-in" maxlength="42"><button id="td-add">+</button></div>
        <div class="td-list" id="td-list"></div>`;
    } else return null;
    return card;
  },

  /* ---------- Jalali calendar + Iranian holidays ---------- */
  renderCalendar() {
    const card = document.getElementById('w-calendar');
    if (!card) return;
    const now = new Date();
    const j = Jalali.toJalali(now);
    const fa = I18n.lang === 'fa';
    const months = fa ? Jalali.MONTHS_FA : Jalali.MONTHS_EN;
    card.querySelector('#cal-day').textContent = fa ? Jalali.toFaDigits(j.jd) : j.jd;
    card.querySelector('#cal-month').textContent = months[j.jm - 1] + ' ' + (fa ? Jalali.toFaDigits(j.jy) : j.jy);
    card.querySelector('#cal-greg').textContent = Jalali.dayName(now) + ' · ' +
      new Intl.DateTimeFormat(fa ? 'fa-IR-u-nu-latn' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(now);
    const ev = Jalali.eventOf(j.jy, j.jm, j.jd);
    const badge = card.querySelector('#cal-off-badge');
    const evBox = card.querySelector('#cal-ev');
    if (ev) {
      badge.textContent = '🔴 ' + I18n.t('cal_off');
      evBox.innerHTML = '<span class="cal-ev-name off">' + ev.name + '</span>';
    } else {
      badge.textContent = '';
      evBox.innerHTML = '<span class="cal-ev-name muted">' + I18n.t('cal_none') + '</span>';
    }
    /* today's personal events */
    const tkey = Jalali.key(j.jy, j.jm, j.jd);
    const myToday = this.myEvents().filter(e => e.d === tkey);
    card.querySelector('#cal-my').innerHTML = myToday.length
      ? '<div class="cal-next-title">' + I18n.t('ev_today') + '</div>' +
        myToday.slice(0, 2).map(e => '<div class="cal-next-row my"><span class="cal-next-name">📌 ' + String(e.t).replace(/</g, '&lt;') + '</span></div>').join('') +
        (myToday.length > 2 ? '<div class="cal-next-row my"><span class="cal-next-name" style="opacity:.55">+' + (I18n.lang === 'fa' ? Jalali.toFaDigits(String(myToday.length - 2)) : (myToday.length - 2)) + ' …</span></div>' : '')
      : '';
    /* upcoming: merge official holidays + personal events (next 45 days) */
    const upcoming = [];
    let d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const my = this.myEvents();
    for (let i = 0; i < 45 && upcoming.length < 3; i++) {
      const hj = Jalali.toJalali(d);
      const k = Jalali.key(hj.jy, hj.jm, hj.jd);
      const off = Jalali.eventOf(hj.jy, hj.jm, hj.jd);
      if (off && off.off) upcoming.push({ date: new Date(d), name: off.name, kind: 'off' });
      my.filter(e => e.d === k).forEach(e => upcoming.push({ date: new Date(d), name: e.t, kind: 'my' }));
      d = new Date(d.getTime() + 86400000);
    }
    card.querySelector('#cal-next').innerHTML = upcoming.length
      ? '<div class="cal-next-title">' + I18n.t('cal_upcoming') + '</div>' + upcoming.slice(0, 3).map(u =>
          '<div class="cal-next-row"><span class="cal-next-date">' + Jalali.fmt(u.date) + '</span><span class="cal-next-name">' +
          (u.kind === 'off' ? '🔴 ' : '📌 ') + String(u.name).replace(/</g, '&lt;') + '</span></div>').join('')
      : '';
    /* next prayer line (feature-flagged) */
    const pl = card.querySelector('#cal-pray');
    if (pl) {
      if (typeof Pray !== 'undefined' && !this.flagOff('pray')) {
        try {
          const nx = Pray.next();
          const mins = I18n.lang === 'fa' ? Jalali.toFaDigits(String(nx.inMin)) : String(nx.inMin);
          pl.innerHTML = '🕌 ' + nx.name + ' · <b>' + Pray.fmt(nx.time) + '</b> <small>(' + mins + ' ' + I18n.t('min_later') + ')</small>';
          pl.style.display = '';
        } catch { pl.style.display = 'none'; }
      } else pl.style.display = 'none';
    }
  },

  myEvents() { return Store.state.settings.events || []; },

  /* ---------- clock ---------- */
  renderClock() {
    clearInterval(this.clockTimer);
    const tick = () => {
      const now = new Date();
      const s = Store.state.settings;
      const h = now.getHours(), m = now.getMinutes();
      let hh = h, ampm = '';
      if (!s.clock24) { ampm = h >= 12 ? (I18n.lang === 'fa' ? 'بعدازظهر' : 'PM') : (I18n.lang === 'fa' ? 'صبح' : 'AM'); hh = h % 12 || 12; }
      const tEl = document.getElementById('clock-time');
      if (tEl) tEl.innerHTML = `${String(hh).padStart(2, '0')}<span class="clock-colon">:</span>${String(m).padStart(2, '0')}${ampm ? `<span class="clock-ampm">${ampm}</span>` : ''}`;
      const dEl = document.getElementById('clock-date');
      if (dEl) dEl.textContent = new Intl.DateTimeFormat(I18n.lang === 'fa' ? 'fa-IR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
      const gEl = document.getElementById('greeting');
      if (gEl) {
        const h4 = now.getHours();
        const key = h4 < 12 ? 'greeting_morning' : h4 < 17 ? 'greeting_afternoon' : h4 < 21 ? 'greeting_evening' : 'greeting_night';
        const name = Store.state.user ? (Store.state.user.name || Store.state.user.username) : '';
        gEl.textContent = I18n.t(key) + (name ? '، ' + name : '') + ' 👋';
      }
    };
    tick();
    this.clockTimer = setInterval(tick, 1000);
  },

  /* ---------- weather (Open-Meteo, live scenes) ---------- */
  async renderWeather() {
    const scene = document.querySelector('#w-weather .wx-scene');
    if (!scene) return;
    try {
      const sc = Store.state.settings.city;
      let loc;
      if (sc && sc.n && sc.la != null) {
        loc = { lat: sc.la, lon: sc.lo, name: sc.n, t: Date.now() };
      } else {
        loc = Store.state.cache.loc;
      }
      if (!loc || Date.now() - loc.t > 3600000) {
        loc = await new Promise((res) => {
          let done = false;
          const to = setTimeout(() => { if (!done) { done = true; res({ lat: 35.6892, lon: 51.389, name: I18n.t('my_location') }); } }, 4000);
          try {
            navigator.geolocation.getCurrentPosition(
              (p) => { if (!done) { done = true; clearTimeout(to); res({ lat: p.coords.latitude, lon: p.coords.longitude, name: I18n.t('my_location') }); } },
              () => { if (!done) { done = true; clearTimeout(to); res({ lat: 35.6892, lon: 51.389, name: 'Tehran' }); } },
              { timeout: 3500 }
            );
          } catch { if (!done) { done = true; res({ lat: 35.6892, lon: 51.389, name: 'Tehran' }); } }
        });
        loc.t = Date.now();
        Store.state.cache.loc = loc;
        Store.persist(['cache']);
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`;
      const r = await fetch(url);
      const d = await r.json();
      const cur = d.current, daily = d.daily;
      const code = cur.weather_code, day = !!cur.is_day;
      const unit = Store.state.settings.tempUnit === 'f' ? '°F' : '°C';
      const conv = (c) => unit === '°F' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
      this.paintScene(scene, code, day);
      document.querySelector('#w-weather .wx-temp').textContent = `${conv(cur.temperature_2m)}${unit}`;
      document.querySelector('#w-weather .wx-meta').innerHTML =
        `<div class="wx-city">${loc.name || ''}</div>
         <div class="wx-sub">${I18n.t('feels')}: ${conv(cur.apparent_temperature)}${unit} · ${I18n.t('humidity')} ${fmtNum(cur.relative_humidity_2m)}٪</div>
         <div class="wx-sub">${I18n.t('high_low')}: ${conv(daily.temperature_2m_max[0])}° / ${conv(daily.temperature_2m_min[0])}°</div>`;
      this.renderWxDays(daily);
    } catch (e) {
      scene.innerHTML = '<div class="wx-err">⛅</div>';
    }
  },

  wxIcon(code) {
    const m = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌦️', 56: '🌨️', 57: '🌨️', 61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌨️', 67: '🌨️', 71: '🌨️', 73: '❄️', 75: '❄️', 77: '🌨️', 80: '🌦️', 81: '🌧️', 82: '🌧️', 85: '🌨️', 86: '❄️', 95: '⛈️', 96: '⛈️', 99: '⛈️' };
    return m[code] || '🌤️';
  },

  renderWxDays(daily) {
    const box = document.getElementById('wx-days');
    if (!box || !daily || !daily.time) return;
    const fa = I18n.lang === 'fa';
    const conv = (c) => Store.state.settings.tempUnit === 'f' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
    const names = [];
    for (let i = 0; i < Math.min(4, daily.time.length); i++) {
      if (i === 0) names.push(I18n.t('wx_today'));
      else if (i === 1) names.push(I18n.t('wx_tomorrow'));
      else {
        const d = new Date(daily.time[i] + 'T12:00:00');
        names.push(d.toLocaleDateString(fa ? 'fa-IR' : 'en-US', { weekday: 'short' }));
      }
    }
    box.innerHTML = daily.time.slice(0, 4).map((t, i) =>
      `<div class="wx-d${i === 0 ? ' now' : ''}"><span class="wx-dn">${names[i]}</span><span class="wx-di">${this.wxIcon(daily.weather_code[i])}</span><span class="wx-dt">${conv(daily.temperature_2m_max[i])}° <i>${conv(daily.temperature_2m_min[i])}°</i></span></div>`
    ).join('');
  },

  paintScene(scene, code, day) {
    scene.className = 'wx-scene';
    scene.innerHTML = '';
    const mk = (cls, n) => {
      for (let i = 0; i < n; i++) {
        const s = el('span', cls);
        if (cls === 'wx-drop' || cls === 'wx-flake') s.style.left = (Math.random() * 98) + '%';
        if (cls === 'wx-star') { s.style.left = (Math.random() * 96) + '%'; s.style.top = (Math.random() * 60) + '%'; }
        if (cls === 'wx-cloud') s.style.animationDelay = (-Math.random() * 8) + 's';
        if (cls === 'wx-fogband') s.style.top = (15 + i * 28) + '%';
        scene.appendChild(s);
      }
    };
    if (code === 0 || code === 1) {
      scene.classList.add(day ? 'wx-clear-day' : 'wx-clear-night');
      scene.appendChild(el('span', day ? 'wx-sun' : 'wx-moon'));
      if (!day) mk('wx-star', 14);
    } else if (code === 2) {
      scene.classList.add(day ? 'wx-partial-day' : 'wx-clear-night');
      scene.appendChild(el('span', day ? 'wx-sun' : 'wx-moon'));
      mk('wx-cloud', 2);
    } else if (code === 3) {
      scene.classList.add('wx-overcast');
      mk('wx-cloud', 3);
    } else if (code === 45 || code === 48) {
      scene.classList.add('wx-fog');
      mk('wx-fogband', 3);
    } else if ((code >= 51 && code <= 57) || (code >= 80 && code <= 82)) {
      scene.classList.add('wx-drizzle');
      mk('wx-cloud', 2); mk('wx-drop', 14);
    } else if (code >= 61 && code <= 67) {
      scene.classList.add('wx-rain');
      mk('wx-cloud', 2); mk('wx-drop', 22);
    } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
      scene.classList.add('wx-snow');
      mk('wx-cloud', 2); mk('wx-flake', 16);
    } else if (code >= 95) {
      scene.classList.add('wx-storm');
      mk('wx-cloud', 2); mk('wx-drop', 18);
      scene.appendChild(el('span', 'wx-flash'));
    } else {
      scene.classList.add('wx-overcast');
      mk('wx-cloud', 2);
    }
  },

  /* ---------- prices (toman) ---------- */
  async renderPrices() {
    const list = document.querySelector('#w-prices .pr-list');
    if (!list) return;
    try {
      const d = await Api.prices();
      const pick = ['price_dollar_rl', 'price_eur', 'price_gbp', 'price_aed', 'price_try', 'price_gold_18', 'price_coin_new'];
      const names = {
        price_dollar_rl: ['دلار آمریکا', 'US Dollar'], price_eur: ['یورو', 'Euro'],
        price_gbp: ['پوند انگلیس', 'British Pound'], price_aed: ['درهم امارات', 'UAE Dirham'],
        price_try: ['لیر ترکیه', 'Turkish Lira'], price_gold_18: ['طلای ۱۸ عیار', 'Gold 18K'],
        price_coin_new: ['سکه امامی', 'Emami Coin']
      };
      const items = (d.items || []).filter(i => pick.includes(i.key));
      list.innerHTML = items.map(i => {
        const nm = (names[i.key] || [i.title, i.title])[I18n.lang === 'fa' ? 0 : 1];
        return `
        <div class="pr-row">
          <span class="pr-name">${nm}</span>
          <span class="pr-val">${fmtNum(i.toman)} <small data-i18n="toman">${I18n.t('toman')}</small></span>
        </div>`;
      }).join('') || `<div class="pr-loading">${I18n.t('err_generic')}</div>`;
      list.insertAdjacentHTML('beforeend', `<div class="pr-src">${I18n.t('prices_src')}</div>`);
    } catch (e) {
      list.innerHTML = `<div class="pr-loading">${I18n.t('err_generic')}</div>`;
    }
  },

  /* ---------- smart bookmarks ---------- */
  renderBookmarks() {
    const grid = document.querySelector('#w-bookmarks .bm-grid');
    if (!grid) return;
    const marks = Store.state.bookmarks;
    if (!marks.length) {
      grid.innerHTML = `<div class="bm-empty">${I18n.t('bookmarks_empty')}<br><small>${I18n.t('bookmarks_smart')}</small></div>`;
      return;
    }
    grid.innerHTML = '';
    marks.forEach((m, idx) => {
      const b = detectBrand(m.url);
      const tile = el('a', 'bm-tile');
      tile.href = m.url; tile.target = '_blank'; tile.rel = 'noopener';
      const label = m.name || (b ? b.name : '?');
      const color = b ? b.color : '#52525b';
      const logo = el('span', 'bm-logo');
      logo.style.background = color;
      const img = document.createElement('img');
      img.src = 'https://icons.duckduckgo.com/ip3/' + ((b && b.host) || 'site') + '.ico';
      img.onerror = () => { const t = document.createElement('b'); t.textContent = (label[0] || '?').toUpperCase(); img.replaceWith(t); };
      logo.appendChild(img);
      tile.appendChild(logo);
      tile.appendChild(el('span', 'bm-name', label));
      tile.title = label + ' — ' + m.url;
      grid.appendChild(tile);
    });
  },

  /* ---------- quote ---------- */
  renderQuote() {
    const q = document.querySelector('#w-quote .q-text');
    if (!q) return;
    const list = I18n.lang === 'fa' ? QUOTES_FA : QUOTES_EN;
    const day = Math.floor(Date.now() / 86400000);
    q.textContent = '«' + list[day % list.length] + '»';
  },

  /* ---------- focus (pomodoro) ---------- */
  fzState() {
    if (!this.fz) this.fz = { left: 1500, total: 1500, run: false, mode: 'work' };
    return this.fz;
  },
  renderFocus() {
    const card = document.getElementById('w-focus');
    if (!card) { clearInterval(this.fzTimer); return; }
    const f = this.fzState();
    const go = card.querySelector('#fz-go');
    go.textContent = f.run ? I18n.t('focus_pause') : I18n.t('focus_start');
    go.onclick = () => {
      f.run = !f.run;
      if (f.run && !this.fzTimer) this.fzTick();
      if (Blocker) Blocker.apply();
      this.renderFocus();
    };
    card.querySelector('#fz-re').onclick = () => {
      f.left = f.total; f.run = false;
      if (Blocker) Blocker.apply();
      this.renderFocus();
    };
    clearInterval(this.fzTimer);
    if (f.run) this.fzTimer = setInterval(() => this.fzTick(), 1000);
    this.fzPaint();
  },
  fzTick() {
    const f = this.fzState();
    if (!f.run) return;
    f.left--;
    if (f.left <= 0) {
      f.run = false;
      const wasWork = f.mode === 'work';
      f.mode = wasWork ? 'break' : 'work';
      f.total = f.mode === 'work' ? 1500 : 300;
      f.left = f.total;
      if (Blocker) Blocker.apply();
      showToast(wasWork ? '☕ ' + I18n.t('focus_break') : '🎯 ' + I18n.t('focus_work'), 2600);
    }
    this.fzPaint();
  },
  fzPaint() {
    const f = this.fzState();
    const t = document.getElementById('fz-time');
    if (!t) return;
    const m = Math.floor(f.left / 60), s = f.left % 60;
    t.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    const fg = document.getElementById('fz-fg');
    if (fg) fg.style.strokeDashoffset = Math.round(264 * (1 - f.left / f.total));
    const mode = document.getElementById('fz-mode');
    if (mode) mode.textContent = f.mode === 'work' ? '🎯' : '☕';
    const st = document.getElementById('fz-st');
    if (st) st.textContent = f.run ? (f.mode === 'work' ? I18n.t('focus_work') : I18n.t('focus_break')) : I18n.t('focus_ready');
    const go = document.getElementById('fz-go');
    if (go) go.textContent = f.run ? I18n.t('focus_pause') : I18n.t('focus_start');
  },

  /* ---------- todo ---------- */
  todos() { const s = Store.state.settings; return (s.todos || []); },
  saveTodos(t) { Store.setSettings({ todos: t.slice(0, 8) }); },
  renderTodo() {
    const card = document.getElementById('w-todo');
    if (!card) return;
    const list = card.querySelector('#td-list');
    const items = this.todos();
    const cnt = card.querySelector('#td-count');
    if (cnt) cnt.textContent = items.filter(x => !x.done).length + '/' + items.length;
    list.innerHTML = '';
    if (!items.length) list.innerHTML = '<div class="td-empty">' + I18n.t('todo_empty') + '</div>';
    items.forEach((it, i) => {
      const row = el('div', 'td-row' + (it.done ? ' done' : ''));
      const cb = el('button', 'td-cb', it.done ? '✓' : '');
      cb.onclick = () => { const t = this.todos(); t[i].done = !t[i].done; this.saveTodos(t); this.renderTodo(); };
      const tx = el('span', 'td-tx', it.t.replace(/</g, '&lt;'));
      const del = el('button', 'td-del', '×');
      del.onclick = () => { const t = this.todos(); t.splice(i, 1); this.saveTodos(t); this.renderTodo(); };
      row.append(cb, tx, del);
      list.appendChild(row);
    });
    const inp = card.querySelector('#td-in');
    const add = () => {
      const v = inp.value.trim();
      if (!v) return;
      const t = this.todos();
      if (t.length >= 8) { showToast(I18n.t('todo_full')); return; }
      t.push({ t: v, done: false });
      this.saveTodos(t);
      inp.value = '';
      this.renderTodo();
    };
    card.querySelector('#td-add').onclick = add;
    inp.onkeydown = e => { if (e.key === 'Enter') add(); };
    inp.placeholder = I18n.t('todo_ph');
  }
};
