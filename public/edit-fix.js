(function () {
  'use strict';

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      ...options
    });

    let data = null;
    try {
      data = await res.json();
    } catch (_) {}

    if (!res.ok) {
      throw new Error((data && data.error) || 'خطا در ذخیره اطلاعات');
    }

    return data;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function closeModal() {
    const old = document.getElementById('editFixModal');
    if (old) old.remove();
  }

  async function getTransaction(id) {
    const rows = await api('/api/transactions');
    return rows.find(x => String(x.id) === String(id));
  }

  function openTransactionEditor(row) {
    closeModal();

    const modal = document.createElement('div');
    modal.id = 'editFixModal';

    modal.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.55);
      z-index:99999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
    `;

    modal.innerHTML = `
      <form id="editFixForm"
        style="
          width:min(500px,100%);
          background:white;
          border-radius:18px;
          padding:25px;
          direction:rtl;
          box-shadow:0 20px 60px rgba(0,0,0,.3);
        ">

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:20px;
        ">
          <h3 style="margin:0">ویرایش تراکنش</h3>

          <button
            type="button"
            id="editFixClose"
            style="
              border:0;
              background:none;
              font-size:20px;
              cursor:pointer;
            "
          >✕</button>
        </div>

        <label style="display:block;margin-bottom:14px">
          <span>شرح تراکنش</span>
          <input
            name="title"
            value="${esc(row.title)}"
            required
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              margin-top:6px;
              border:1px solid #ddd;
              border-radius:10px;
            "
          >
        </label>

        <label style="display:block;margin-bottom:14px">
          <span>مبلغ</span>
          <input
            name="amount"
            type="number"
            value="${row.amount}"
            required
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              margin-top:6px;
              border:1px solid #ddd;
              border-radius:10px;
            "
          >
        </label>

        <label style="display:block;margin-bottom:14px">
          <span>دسته‌بندی</span>
          <input
            name="category"
            value="${esc(row.category || '')}"
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              margin-top:6px;
              border:1px solid #ddd;
              border-radius:10px;
            "
          >
        </label>

        <label style="display:block;margin-bottom:14px">
          <span>نوع تراکنش</span>

          <select
            name="type"
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              margin-top:6px;
              border:1px solid #ddd;
              border-radius:10px;
            "
          >
            <option value="expense" ${row.type === 'expense' ? 'selected' : ''}>
              هزینه
            </option>

            <option value="income" ${row.type === 'income' ? 'selected' : ''}>
              درآمد
            </option>
          </select>
        </label>

        <label style="display:block;margin-bottom:14px">
          <span>تاریخ</span>

          <input
            name="date"
            type="date"
            value="${esc(row.date)}"
            required
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              margin-top:6px;
              border:1px solid #ddd;
              border-radius:10px;
            "
          >
        </label>

        <div
          id="editFixError"
          style="color:#b42318;margin-bottom:10px"
        ></div>

        <div style="display:flex;gap:10px">

          <button
            type="button"
            id="editFixCancel"
            class="btn-ghost"
          >
            انصراف
          </button>

          <button
            type="submit"
            class="btn btn-primary"
          >
            ذخیره تغییرات
          </button>

        </div>

      </form>
    `;

    document.body.appendChild(modal);

    document.getElementById('editFixClose').onclick = closeModal;
    document.getElementById('editFixCancel').onclick = closeModal;

    document.getElementById('editFixForm').onsubmit = async function (e) {
      e.preventDefault();

      const fd = new FormData(e.currentTarget);

      const body = {
        title: fd.get('title'),
        amount: Number(fd.get('amount')),
        category: fd.get('category') || 'سایر',
        type: fd.get('type'),
        date: fd.get('date')
      };

      try {
        await api('/api/transactions/' + row.id, {
          method: 'PUT',
          body: JSON.stringify(body)
        });

        closeModal();

        // بارگذاری دوباره صفحه برای نمایش اطلاعات جدید
        location.reload();

      } catch (err) {
        document.getElementById('editFixError').textContent =
          err.message;
      }
    };
  }

  async function attachEditButtons() {
    const body = document.getElementById('txBody');

    if (!body) return;

    const buttons = body.querySelectorAll('[data-tx-id]');

    buttons.forEach(button => {

      if (button.dataset.editAdded === '1') return;

      button.dataset.editAdded = '1';

      const editButton = document.createElement('button');

      editButton.type = 'button';
      editButton.className = 'row-delete';
      editButton.textContent = 'ویرایش';

      editButton.style.marginLeft = '6px';

      editButton.addEventListener('click', async () => {

        try {
          const row = await getTransaction(button.dataset.txId);

          if (!row) {
            alert('تراکنش پیدا نشد');
            return;
          }

          openTransactionEditor(row);

        } catch (err) {
          alert(err.message);
        }

      });

      button.parentElement.insertBefore(
        editButton,
        button
      );
    });
  }

  function start() {

    attachEditButtons();

    const body = document.getElementById('txBody');

    if (body) {

      const observer = new MutationObserver(() => {
        attachEditButtons();
      });

      observer.observe(body, {
        childList: true,
        subtree: true
      });

    }

  }

  window.addEventListener('load', () => {
    setTimeout(start, 500);
  });

})();
