/* Tabora prayer times — offline astronomical calculation (Institute of Geophysics, Univ. of Tehran method)
   + Qibla bearing/distance. No network needed. */
const Pray = (() => {
  const D = Math.PI / 180;
  const sin = a => Math.sin(a * D), cos = a => Math.cos(a * D), tan = a => Math.tan(a * D);
  const asin = x => Math.asin(x) / D, acos = x => Math.acos(x) / D;
  const atan2d = (y, x) => Math.atan2(y, x) / D;
  const fix = (a, b) => { a %= b; return a < 0 ? a + b : a; };

  /* Tehran (Geophysics) angles: Fajr 17.7°, Maghrib 4.5°, Isha 14° below horizon; Asr = Shafi (shadow factor 1) */
  const PARAMS = { fajr: 17.7, maghrib: 4.5, isha: 14, asrFactor: 1, tz: 3.5 };

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sun(jd) {
    const d = jd - 2451545.0;
    const g = fix(357.529 + 0.98560028 * d, 360);
    const q = fix(280.459 + 0.98564736 * d, 360);
    const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    const e = 23.439 - 0.00000036 * d;
    const RA = fix(atan2d(cos(e) * sin(L), cos(L)) / 15, 24);
    let eqt = q / 15 - RA;
    eqt = fix(eqt + 12, 24) - 12;               /* wrap to (-12, +12] */
    return { decl: asin(sin(e) * sin(L)), eqt };
  }
  /* hour angle (hours) for sun at given ALTITUDE (negative = below horizon). NaN = never reaches */
  function hourAngle(alt, decl, lat) {
    const x = (sin(alt) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
    if (x > 1 || x < -1) return NaN;
    return acos(x) / 15;
  }

  /* returns { fajr, sunrise, dhuhr, asr, sunset, maghrib, isha } in local hours (24h decimal) */
  function times(lat, lng, date) {
    const jd0 = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
    const tz = PARAMS.tz, off = tz - lng / 15;
    /* two-pass refinement for accuracy */
    let noon = fix(12 - sun(jd0).eqt, 24);
    let decl = sun(jd0).decl;
    for (let i = 0; i < 2; i++) {
      const s = sun(jd0 + noon / 24);
      noon = fix(12 - s.eqt, 24);
      decl = s.decl;
    }
    const dhuhr = fix(noon + off + 1 / 60, 24);      /* +1 min conventional safety */
    const mk = (alt, pm) => {
      const H = hourAngle(alt, decl, lat);
      if (isNaN(H)) return NaN;
      return fix(noon + (pm ? H : -H) + off, 24);
    };
    const asrAlt = atan2d(1, PARAMS.asrFactor + tan(Math.abs(lat - decl)));
    const asrH = hourAngle(asrAlt, decl, lat);
    return {
      fajr: mk(-PARAMS.fajr, false),
      sunrise: mk(-0.833, false),
      dhuhr,
      asr: isNaN(asrH) ? NaN : fix(noon + asrH + off, 24),
      sunset: mk(-0.833, true),
      maghrib: mk(-PARAMS.maghrib, true),
      isha: mk(-PARAMS.isha, true)
    };
  }

  const fmt = (h) => {
    if (h == null || isNaN(h)) return '--:--';
    let m = Math.round(h * 60);
    let hh = Math.floor(m / 60) % 24, mm = m % 60;
    if (I18n.lang === 'fa') return Jalali.toFaDigits(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'));
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };

  /* qibla bearing (deg from true north) + great-circle distance km */
  const KAABA = { lat: 21.4225, lng: 39.8262 };
  function qibla(lat, lng) {
    const dL = KAABA.lng - lng;                     /* degrees */
    const y = sin(dL) * cos(KAABA.lat);
    const x = cos(lat) * sin(KAABA.lat) - sin(lat) * cos(KAABA.lat) * cos(dL);
    const b = atan2d(y, x);
    const R = 6371, p1 = lat * D, p2 = KAABA.lat * D, dp = p2 - p1, dl = dL * D;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const km = Math.round(2 * R * Math.asin(Math.sqrt(a)));
    return { deg: fix(b, 360), km };
  }

  /* current city from settings (default Tehran) */
  function city() {
    const c = (Store.state.settings.city) || null;
    return c ? { n: c.n, lat: c.la, lng: c.lo } : { n: I18n.t('tehran'), lat: 35.6892, lng: 51.389 };
  }

  /* next prayer from now */
  function next() {
    const c = city();
    const t = times(c.lat, c.lng, new Date());
    const now = new Date().getHours() + new Date().getMinutes() / 60;
    const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const names = { fajr: 'pray_fajr', sunrise: 'pray_sunrise', dhuhr: 'pray_dhuhr', asr: 'pray_asr', maghrib: 'pray_maghrib', isha: 'pray_isha' };
    for (const k of order) {
      if (!isNaN(t[k]) && t[k] > now) {
        return { key: k, name: I18n.t(names[k]), time: t[k], inMin: Math.round((t[k] - now) * 60) };
      }
    }
    /* after isha → tomorrow's fajr */
    const tm = new Date(Date.now() + 864e5);
    const t2 = times(c.lat, c.lng, tm);
    return { key: 'fajr', name: I18n.t('pray_fajr'), time: t2.fajr + 24, inMin: Math.round((t2.fajr + 24 - now) * 60) };
  }

  return { times, fmt, qibla, city, next, PARAMS };
})();

/* Iranian cities preset (shared by weather + prayer times) */
const PRAY_CITIES = [
  ['تهران', 'Tehran', 35.6892, 51.3890], ['کرج', 'Karaj', 35.8400, 50.9391],
  ['مشهد', 'Mashhad', 36.2972, 59.6067], ['اصفهان', 'Isfahan', 32.6546, 51.6680],
  ['شیراز', 'Shiraz', 29.5918, 52.5837], ['تبریز', 'Tabriz', 38.0800, 46.2919],
  ['اهواز', 'Ahvaz', 31.3183, 48.6706], ['قم', 'Qom', 34.6399, 50.8759],
  ['کرمان', 'Kerman', 30.2839, 57.0834], ['یزد', 'Yazd', 31.8974, 54.3569],
  ['رشت', 'Rasht', 37.2808, 49.5832], ['ارومیه', 'Urmia', 37.5527, 45.0761],
  ['کاشان', 'Kashan', 33.9831, 51.4364], ['زاهدان', 'Zahedan', 29.4963, 60.8629],
  ['همدان', 'Hamedan', 34.7983, 48.5148], ['کرمانشاه', 'Kermanshah', 34.3142, 47.0650],
  ['اردبیل', 'Ardabil', 38.2498, 48.2933], ['گرگان', 'Gorgan', 36.8427, 54.4441],
  ['ساری', 'Sari', 36.5633, 53.0601], ['بندرعباس', 'Bandar Abbas', 27.1832, 56.2666],
  ['بوشهر', 'Bushehr', 28.9234, 50.8203], ['خرم‌آباد', 'Khorramabad', 33.4878, 48.3558],
  ['سنندج', 'Sanandaj', 35.3219, 46.9862], ['بیرجند', 'Birjand', 32.8663, 59.2211],
  ['سمنان', 'Semnan', 35.5729, 53.3971], ['زنجان', 'Zanjan', 36.6736, 48.4787],
  ['قزوین', 'Qazvin', 36.2797, 50.0049], ['شهرکرد', 'Shahrekord', 32.3256, 50.8644]
];
