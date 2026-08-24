/* Tabora — Jalali (Persian) calendar engine + official Iranian holidays */

const Jalali = {
  MONTHS_FA: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'],
  MONTHS_EN: ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'],
  DAYS_FA: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'],
  DAYS_EN: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],

  /* --- conversion (jalaali algorithm) --- */
  _div(a, b) { return ~~(a / b); },
  jalCal(jy) {
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    let bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, leap, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + Jalali._div(jump, 33) * 8 + Jalali._div(jump % 33, 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + Jalali._div(n, 33) * 8 + Jalali._div((n % 33) + 3, 4);
    if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
    const leapG = Jalali._div(gy, 4) - Jalali._div((Jalali._div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + Jalali._div(jump + 4, 33) * 33;
    leap = ((((n + 1) % 33) - 1) % 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  },
  j2d(jy, jm, jd) {
    const r = Jalali.jalCal(jy);
    return Jalali.g2d(r.gy, 3, r.march) + (jm - 1) * 31 - Jalali._div(jm, 7) * (jm - 7) + jd - 1;
  },
  d2j(jdn) {
    const gy = Jalali.d2g(jdn).gy;
    let jy = gy - 621;
    const r = Jalali.jalCal(jy);
    const jdn1f = Jalali.g2d(gy, 3, r.march);
    let jd, jm, k;
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + Jalali._div(k, 31); jd = (k % 31) + 1; return { jy, jm, jd }; }
      else k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    jm = 7 + Jalali._div(k, 30);
    jd = (k % 30) + 1;
    return { jy, jm, jd };
  },
  g2d(gy, gm, gd) {
    return Jalali._div((gy + Jalali._div(gm - 8, 6) + 100100) * 1461, 4)
      + Jalali._div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408
      - Jalali._div(Jalali._div(gy + 100100 + Jalali._div(gm - 8, 6), 100) * 3, 4) + 752;
  },
  d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + Jalali._div(Jalali._div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = Jalali._div((j % 1461), 4) * 5 + 308;
    const gd = Jalali._div(i % 153, 5) + 1;
    const gm = ((Jalali._div(i, 153) % 12) + 1);
    const gy = Jalali._div(j, 1461) - 100100 + Jalali._div(8 - gm, 6);
    return { gy, gm, gd };
  },
  toJalali(date) {
    return Jalali.d2j(Jalali.g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
  },

  /* --- official Iranian holidays (off=true = red day).
         Religious dates follow the published national calendar of each year. --- */
  HOLIDAYS: {
    1404: {
      '1/1': ['عید نوروز', 1], '1/2': ['عید نوروز', 1], '1/3': ['عید نوروز', 1], '1/4': ['عید نوروز', 1],
      '1/11': ['عید سعید فطر', 1], '1/12': ['روز جمهوری اسلامی ایران', 1], '1/13': ['روز طبیعت', 1],
      '2/4': ['شهادت امام جعفر صادق (ع)', 1],
      '3/14': ['رحلت امام خمینی (ره)', 1], '3/15': ['قیام ۱۵ خرداد', 1], '3/16': ['عید سعید قربان', 1], '3/24': ['عید سعید غدیر خم', 1],
      '4/14': ['تاسوعای حسینی', 1], '4/15': ['عاشورای حسینی', 1],
      '5/23': ['اربعین حسینی', 1], '5/31': ['رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)', 1],
      '6/2': ['شهادت امام رضا (ع)', 1], '6/10': ['شهادت امام حسن عسکری (ع)', 1], '6/19': ['میلاد پیامبر اکرم (ص) و امام صادق (ع)', 1],
      '9/3': ['شهادت حضرت فاطمه زهرا (س)', 1],
      '10/13': ['ولادت امام علی (ع) — روز پدر', 1], '10/27': ['مبعث پیامبر اکرم (ص)', 1],
      '11/15': ['ولادت حضرت قائم (عج) — نیمه شعبان', 1], '11/22': ['پیروزی انقلاب اسلامی', 1],
      '12/29': ['ملی شدن صنعت نفت ایران', 1]
    },
    1405: {
      '1/1': ['عید نوروز و عید سعید فطر', 1], '1/2': ['عید نوروز', 1], '1/3': ['عید نوروز', 1], '1/4': ['عید نوروز', 1],
      '1/12': ['روز جمهوری اسلامی ایران', 1], '1/13': ['روز طبیعت', 1],
      '1/25': ['شهادت امام جعفر صادق (ع)', 1],
      '3/14': ['رحلت امام خمینی (ره)', 1], '3/15': ['قیام ۱۵ خرداد', 1], '3/17': ['عید سعید قربان', 1], '3/25': ['عید سعید غدیر خم', 1],
      '5/7': ['تاسوعای حسینی', 1], '5/8': ['عاشورای حسینی', 1],
      '6/30': ['اربعین حسینی', 1],
      '7/13': ['رحلت پیامبر اکرم (ص)', 1], '7/14': ['شهادت امام حسن مجتبی (ع)', 1], '7/15': ['شهادت امام رضا (ع)', 1],
      '8/8': ['شهادت امام حسن عسکری (ع)', 1], '8/13': ['میلاد پیامبر اکرم (ص) و امام صادق (ع)', 1],
      '9/28': ['ولادت امام علی (ع) — روز پدر', 1],
      '10/12': ['مبعث پیامبر اکرم (ص)', 1],
      '11/4': ['ولادت حضرت قائم (عج) — نیمه شعبان', 1], '11/22': ['پیروزی انقلاب اسلامی', 1],
      '12/21': ['شهادت حضرت فاطمه زهرا (س)', 1], '12/23': ['عید سعید فطر', 1], '12/28': ['عید سعید قربان', 1], '12/29': ['ملی شدن صنعت نفت ایران', 1]
    },
    1406: {
      '1/1': ['عید نوروز', 1], '1/2': ['عید نوروز', 1], '1/3': ['عید نوروز', 1], '1/4': ['عید نوروز', 1],
      '1/6': ['عید سعید غدیر خم', 1], '1/12': ['روز جمهوری اسلامی ایران', 1], '1/13': ['روز طبیعت', 1],
      '3/25': ['تاسوعای حسینی', 1], '3/26': ['عاشورای حسینی', 1],
      '5/3': ['اربعین حسینی', 1], '5/11': ['رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)', 1], '5/13': ['شهادت امام رضا (ع)', 1],
      '5/22': ['شهادت امام حسن عسکری (ع)', 1], '5/31': ['میلاد پیامبر اکرم (ص) و امام صادق (ع)', 1],
      '8/7': ['شهادت حضرت فاطمه زهرا (س)', 1],
      '9/14': ['ولادت امام علی (ع) — روز پدر', 1], '9/28': ['مبعث پیامبر اکرم (ص)', 1],
      '10/25': ['ولادت حضرت قائم (عج) — نیمه شعبان', 1],
      '11/22': ['پیروزی انقلاب اسلامی', 1],
      '12/8': ['عید سعید فطر', 1], '12/9': ['تعطیل عید سعید فطر', 1], '12/29': ['ملی شدن صنعت نفت ایران', 1]
    }
  },

  today() {
    const now = new Date();
    const j = Jalali.toJalali(now);
    return j;
  },
  eventOf(jy, jm, jd) {
    const y = Jalali.HOLIDAYS[jy];
    if (!y) return null;
    const e = y[jm + '/' + jd];
    return e ? { name: e[0], off: !!e[1] } : null;
  },
  dayName(date) {
    /* JS getDay: 0=Sunday … 6=Saturday ; our week starts Saturday */
    const map = [1, 2, 3, 4, 5, 6, 0]; /* Sun..Sat -> index in DAYS */
    return I18n.lang === 'fa' ? Jalali.DAYS_FA[map[date.getDay()]] : Jalali.DAYS_EN[map[date.getDay()]];
  },
  nextHolidays(count) {
    const out = [];
    const now = new Date();
    let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let i = 0; i < 120 && out.length < count; i++) {
      const j = Jalali.toJalali(d);
      const e = Jalali.eventOf(j.jy, j.jm, j.jd);
      if (e && e.off) out.push({ date: new Date(d), j, name: e.name });
      d = new Date(d.getTime() + 86400000);
    }
    return out;
  },
  toFaDigits(s) {
    return String(s).replace(/\d/g, x => '۰۱۲۳۴۵۶۷۸۹'[x]);
  },
  fmt(date) {
    const j = Jalali.toJalali(date);
    const fa = I18n.lang === 'fa';
    const day = fa ? Jalali.toFaDigits(j.jd) : j.jd;
    const year = fa ? Jalali.toFaDigits(j.jy) : j.jy;
    return day + ' ' + (fa ? Jalali.MONTHS_FA[j.jm - 1] : Jalali.MONTHS_EN[j.jm - 1]) + ' ' + year;
  }
};
