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
    const iso = now.toISOString().slice(0, 10);
    const time = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    el.textContent = `${Jalali.formatIsoLong(iso)} ساعت ${Jalali.toFaDigits(time)}`;
  } else {
    try {
      const meta = await api('/api/meta');
      if (!meta.lastUpdate) {
        el.textContent = 'هنوز به‌روزرسانی ثبت نشده است';
        return;
      }
      const d = new Date(meta.lastUpdate);
      const iso = d.toISOString().slice(0, 10);
      const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      el.textContent = `${Jalali.formatIsoLong(iso)} ساعت ${Jalali.toFaDigits(time)}`;
    } catch (e) {
      el.textContent = '—';
    }
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function refresh() {
  const from = fromPicker.getIso();
  const to = toPicker.getIso();
  document.getElementById('activeRangeText').textContent =
    `بازهٔ فعال: ${Jalali.formatIsoToJalali(from)} تا ${Jalali.formatIsoToJalali(to)}`;

  const [summary, transactions, banks] = await Promise.all([
    api(`/api/summary?from=${from}&to=${to}`),
    api(`/api/transactions?from=${from}&to=${to}`),
    api('/api/banks'),
  ]);

  LAST_TX = transactions;
  LAST_BANKS = banks;

  renderKpis(summary);
  renderBanks(banks);
  renderTransactions(transactions);
}

function renderKpis(summary) {
  document.getElementById('kpiRatio').textContent = Jalali.toFaDigits(summary.ratio) + '٪';
  document.getElementById('kpiExpense').textContent = fmt.format(summary.expense) + ' تومان';
  document.getElementById('kpiIncome').textContent = fmt.format(summary.income) + ' تومان';
  document.getElementById('kpiBalance').textContent = fmt.format(summary.banksTotal) + ' تومان';

  const pct = Math.min(summary.ratio, 100);
  document.getElementById('pulsePercent').textContent = Jalali.toFaDigits(summary.ratio) + '٪';
  document.getElementById('pulseBarFill').style.width = pct + '%';
}

function renderBanks(banks) {
  const body = document.getElementById('banksBody');
  body.innerHTML = '';
  let total = 0;
  for (const b of banks) {
    total += b.balance;
    const tr = document.createElement('tr');
    const lastUpdate = b.lastUpdate ? Jalali.formatIsoToJalali(b.lastUpdate.slice(0, 10)) : '—';
    tr.innerHTML = `
      <td>${escapeHtml(b.name)}</td>
      <td>
        ${CURRENT_ROLE === 'editor'
          ? `<input class="bank-balance-input" type="number" value="${b.balance}" data-id="${b.id}" />`
          : `${fmt.format(b.balance)} تومان`}
      </td>
      <td>${lastUpdate}</td>
      <td class="editor-only-col"><button class="row-delete" data-bank-id="${b.id}">حذف</button></td>
    `;
    body.appendChild(tr);
  }
  document.getElementById('banksTotal').textContent = fmt.format(total) + ' تومان';

  if (CURRENT_ROLE === 'editor') {
    body.querySelectorAll('.bank-balance-input').forEach((input) => {
      input.addEventListener('change', async () => {
        try {
          await api(`/api/banks/${input.dataset.id}`, {
            method: 'PUT',
            body: JSON.stringify({ balance: Number(input.value) }),
          });
          await refresh();
          await renderLastUpdate();
        } catch (e) {
          alert(e.message);
        }
      });
    });
    body.querySelectorAll('[data-bank-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('این بانک حذف شود؟')) return;
        await api(`/api/banks/${btn.dataset.bankId}`, { method: 'DELETE' });
        await refresh();
        await renderLastUpdate();
      });
    });
  }
}

function renderTransactions(transactions) {
  const body = document.getElementById('txBody');
  const empty = document.getElementById('emptyState');
  body.innerHTML = '';
  empty.style.display = transactions.length ? 'none' : 'block';

  for (const t of transactions) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(t.title)}</td>
      <td><span class="tag">${escapeHtml(t.category)}</span></td>
      <td>${Jalali.formatIsoToJalali(t.date)}</td>
      <td class="amount-cell ${t.type}">${t.type === 'income' ? '+' : '−'} ${fmt.format(t.amount)} تومان</td>
      <td class="editor-only-col"><button class="row-delete" data-tx-id="${t.id}">حذف</button></td>
    `;
    body.appendChild(tr);
  }

  if (CURRENT_ROLE === 'editor') {
    body.querySelectorAll('[data-tx-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('این تراکنش حذف شود؟')) return;
        await api(`/api/transactions/${btn.dataset.txId}`, { method: 'DELETE' });
        await refresh();
        await renderLastUpdate();
      });
    });
  }
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function wireEvents() {
  document.getElementById('applyFilterBtn').addEventListener('click', refresh);

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    window.location.href = '/index.html';
  });

  const txForm = document.getElementById('txForm');
  document.getElementById('openTxFormBtn').addEventListener('click', () => openModal('modalBackdrop'));
  document.getElementById('openTxFormBtn2').addEventListener('click', () => openModal('modalBackdrop'));
  document.getElementById('closeFormBtn').addEventListener('click', () => closeModal('modalBackdrop'));
  document.getElementById('cancelFormBtn').addEventListener('click', () => closeModal('modalBackdrop'));
  txForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(txForm);
    try {
      await api('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          title: fd.get('title'),
          amount: Number(fd.get('amount')),
          type: fd.get('type'),
          category: fd.get('category') || 'سایر',
          date: txDatePicker.getIso(),
        }),
      });
      closeModal('modalBackdrop');
      txForm.reset();
      await refresh();
      await renderLastUpdate();
    } catch (err) {
      alert(err.message);
    }
  });

  const bankForm = document.getElementById('bankForm');
  document.getElementById('addBankBtn').addEventListener('click', () => {
    document.getElementById('bankModalTitle').textContent = 'افزودن بانک';
    bankForm.reset();
    openModal('bankModalBackdrop');
  });
  document.getElementById('closeBankFormBtn').addEventListener('click', () => closeModal('bankModalBackdrop'));
  document.getElementById('cancelBankFormBtn').addEventListener('click', () => closeModal('bankModalBackdrop'));
  bankForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(bankForm);
    try {
      await api('/api/banks', {
        method: 'POST',
        body: JSON.stringify({ name: fd.get('name'), balance: Number(fd.get('balance')) }),
      });
      closeModal('bankModalBackdrop');
      bankForm.reset();
      await refresh();
      await renderLastUpdate();
    } catch (err) {
      alert(err.message);
    }
  });

  const pwForm = document.getElementById('pwForm');
  const pwError = document.getElementById('pwFormError');
  const pwSuccess = document.getElementById('pwFormSuccess');
  document.getElementById('changePwBtn').addEventListener('click', () => {
    pwForm.reset();
    pwError.hidden = true;
    pwSuccess.hidden = true;
    openModal('pwModalBackdrop');
  });
  document.getElementById('closePwFormBtn').addEventListener('click', () => closeModal('pwModalBackdrop'));
  document.getElementById('cancelPwFormBtn').addEventListener('click', () => closeModal('pwModalBackdrop'));
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwError.hidden = true;
    pwSuccess.hidden = true;
    const fd = new FormData(pwForm);
    const newPassword = fd.get('newPassword');
    const confirmPassword = fd.get('confirmPassword');
    if (newPassword !== confirmPassword) {
      pwError.textContent = 'رمز جدید و تکرار آن یکسان نیستند';
      pwError.hidden = false;
      return;
    }
    try {
      await api('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: fd.get('oldPassword'), newPassword }),
      });
      pwSuccess.hidden = false;
      pwForm.reset();
      setTimeout(() => closeModal('pwModalBackdrop'), 1400);
    } catch (err) {
      pwError.textContent = err.message;
      pwError.hidden = false;
    }
  });

  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('exportBtn').addEventListener('click', exportExcel);
}

function exportExcel() {
  const wb = XLSX.utils.book_new();

  const bankRows = [['نام بانک', 'موجودی (تومان)', 'آخرین ثبت']];
  LAST_BANKS.forEach((b) => {
    bankRows.push([b.name, b.balance, b.lastUpdate ? Jalali.formatIsoToJalali(b.lastUpdate.slice(0, 10)) : '']);
  });
  const wsBanks = XLSX.utils.aoa_to_sheet(bankRows);
  XLSX.utils.book_append_sheet(wb, wsBanks, 'موجودی بانک‌ها');

  const txRows = [['شرح تراکنش', 'دسته‌بندی', 'تاریخ', 'نوع', 'مبلغ (تومان)']];
  LAST_TX.forEach((t) => {
    txRows.push([t.title, t.category, Jalali.formatIsoToJalali(t.date), t.type === 'income' ? 'درآمد' : 'هزینه', t.amount]);
  });
  const wsTx = XLSX.utils.aoa_to_sheet(txRows);
  XLSX.utils.book_append_sheet(wb, wsTx, 'تراکنش‌ها');

  XLSX.writeFile(wb, 'گزارش-مالی-پترو-صنعت-جنوب.xlsx');
}

init();
