const fmt = new Intl.NumberFormat('fa-IR');
let CURRENT_ROLE = null;
let LAST_TX = [];
let LAST_BANKS = [];

function buildJalaliPicker(container, initialIso) {
  container.innerHTML = '';
  container.dir = 'ltr';
  const today = Jalali.todayJalali();
  const initial = initialIso ? Jalali.isoToJalali(initialIso) : today;

  const yearSel = document.createElement('select');
  const monthSel = document.createElement('select');
  const daySel = document.createElement('select');

  for (let y = today.jy - 5; y <= today.jy + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = Jalali.toFaDigits(y);
    yearSel.appendChild(opt);
  }
  Jalali.MONTHS_FA.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = name;
    monthSel.appendChild(opt);
  });

  function rebuildDays() {
    const jy = Number(yearSel.value);
    const jm = Number(monthSel.value);
    const len = Jalali.jalaaliMonthLength(jy, jm);
    const prevDay = Number(daySel.value) || initial.jd;
    daySel.innerHTML = '';
    for (let d = 1; d <= len; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = Jalali.toFaDigits(d);
      daySel.appendChild(opt);
    }
    daySel.value = Math.min(prevDay, len);
  }

  yearSel.value = initial.jy;
  monthSel.value = initial.jm;
  rebuildDays();
  daySel.value = initial.jd;

  yearSel.addEventListener('change', rebuildDays);
  monthSel.addEventListener('change', rebuildDays);

  container.appendChild(yearSel);
  container.appendChild(monthSel);
  container.appendChild(daySel);

  return {
    getIso() {
      return Jalali.jalaliToIso(Number(yearSel.value), Number(monthSel.value), Number(daySel.value));
    },
    setIso(iso) {
      const j = Jalali.isoToJalali(iso);
      yearSel.value = j.jy;
      monthSel.value = j.jm;
      rebuildDays();
      daySel.value = j.jd;
    },
  };
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function api(path, options) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'خطای ناشناخته');
    err.status = res.status;
    throw err;
  }
  return data;
}

let fromPicker, toPicker, txDatePicker;

async function init() {
  const session = await api('/api/session');
  if (!session.role) {
    window.location.href = '/index.html';
    return;
  }
  CURRENT_ROLE = session.role;
  document.body.classList.add('role-' + CURRENT_ROLE);
  document.getElementById('modeBadge').textContent = CURRENT_ROLE === 'editor' ? 'دسترسی ویرایش' : 'دسترسی مشاهده';
  document.getElementById('app').classList.remove('app-hidden');

  await renderLastUpdate();

  fromPicker = buildJalaliPicker(document.getElementById('fromPicker'), isoDaysAgo(30));
  toPicker = buildJalaliPicker(document.getElementById('toPicker'), todayIso());
  txDatePicker = buildJalaliPicker(document.getElementById('txDatePicker'), todayIso());

  await refresh();
  wireEvents();
}

async function renderLastUpdate() {
  const el = document.getElementById('lastUpdateText');
  if (CURRENT_ROLE === 'editor') {
    const now = new Date();
