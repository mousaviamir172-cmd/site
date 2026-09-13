// تبدیل تقویم میلادی <-> شمسی (الگوریتم استاندارد جلالی، بدون وابستگی خارجی)
(function (global) {
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }

  var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy) {
    var bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump, leap, leapG, march, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }

  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5)
      + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    var j, i, gd, gm, gy;
    j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    i = div(mod(j, 1461), 4) * 5 + 308;
    gd = div(mod(i, 153), 5) + 1;
    gm = mod(div(i, 153), 12) + 1;
    gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }

  function j2d(jy, jm, jd) {
    var r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy), jdn1f = g2d(gy, 3, r.march), jd, jm, k;
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + div(k, 31);
        jd = mod(k, 31) + 1;
        return { jy: jy, jm: jm, jd: jd };
      }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }

  function toJalaali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toGregorian(jy, jm, jd) { var g = d2g(j2d(jy, jm, jd)); return g; }
  function isLeapJalaaliYear(jy) { return jalCal(jy).leap === 0; }
  function jalaaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaaliYear(jy) ? 30 : 29;
  }

  var MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var DIGITS_FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function toFaDigits(input) {
    return String(input).replace(/[0-9]/g, function (d) { return DIGITS_FA[d]; });
  }

  function isoToJalali(iso) {
    var parts = iso.split('-').map(Number);
    return toJalaali(parts[0], parts[1], parts[2]);
  }

  function jalaliToIso(jy, jm, jd) {
    var g = toGregorian(jy, jm, jd);
    var mm = String(g.gm).padStart(2, '0');
    var dd = String(g.gd).padStart(2, '0');
    return g.gy + '-' + mm + '-' + dd;
  }

  function formatIsoToJalali(iso) {
    var j = isoToJalali(iso);
    var s = j.jy + '/' + String(j.jm).padStart(2, '0') + '/' + String(j.jd).padStart(2, '0');
    return toFaDigits(s);
  }

  function formatIsoLong(iso) {
    var j = isoToJalali(iso);
    return toFaDigits(j.jd) + ' ' + MONTHS_FA[j.jm - 1] + ' ' + toFaDigits(j.jy);
  }

  function todayJalali() {
    var now = new Date();
    return toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  global.Jalali = {
    toJalaali: toJalaali,
    toGregorian: toGregorian,
    isLeapJalaaliYear: isLeapJalaaliYear,
    jalaaliMonthLength: jalaaliMonthLength,
    MONTHS_FA: MONTHS_FA,
    toFaDigits: toFaDigits,
    isoToJalali: isoToJalali,
    jalaliToIso: jalaliToIso,
    formatIsoToJalali: formatIsoToJalali,
    formatIsoLong: formatIsoLong,
    todayJalali: todayJalali,
  };
})(window);
