// static/js/pos.js

/* ── Live clock ── */
const clockEl = document.getElementById('liveClock');
const tick = () => { if(clockEl) clockEl.textContent = new Date().toLocaleTimeString('vi-VN'); };
tick(); setInterval(tick, 1000);

/* ── Flash dismiss ── */
document.querySelectorAll('.flash').forEach(el => {
    setTimeout(() => {
        el.style.transition = 'opacity 0.4s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
    }, 4000);
});

/* ── Menu render ── */
const grid = document.getElementById('menuGrid');
let currentFilter = 'all';

const renderMenu = () => {
    if (!grid || typeof menuItems === 'undefined') return;
    grid.innerHTML = '';
    menuItems.forEach((item, i) => {
        if (currentFilter !== 'all' && item.category !== currentFilter) return;
        const btn = document.createElement('button');
        btn.className = 'menu-item-btn';
        btn.dataset.category = item.category;
        
        let imgHtml = '';
        if (item.image_url) {
            imgHtml = `<img src="${item.image_url}" loading="lazy" decoding="async" class="pos-item-img" onerror="this.style.display='none'">`;
        }

        btn.innerHTML = `
            ${imgHtml}
            <div class="pos-item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-price">${item.price.toLocaleString('vi-VN')}đ</div>
            </div>
            <div class="add-flash">✓</div>
        `;
        btn.onclick = () => { addItem(i); flashBtn(btn); };
        grid.appendChild(btn);
    });
};

const flashBtn = (btn) => {
    const flash = btn.querySelector('.add-flash');
    if (flash) {
        flash.style.opacity = '1';
        setTimeout(() => { flash.style.opacity = '0'; }, 300);
    }
};

/* ── Tab filter ── */
document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        currentFilter = t.dataset.filter;
        renderMenu();
    });
});

/* ── Order state ── */
let order = {};
const fmt = n => n.toLocaleString('vi-VN') + 'đ';

const addItem = (idx) => {
    if (typeof menuItems === 'undefined' || !menuItems[idx]) return;
    const item = menuItems[idx];
    if (!order[idx]) order[idx] = { ...item, qty: 0 };
    order[idx].qty++;
    renderOrder();
};

const changeQty = (idx, delta) => {
    if (!order[idx]) return;
    order[idx].qty += delta;
    if (order[idx].qty <= 0) delete order[idx];
    renderOrder();
};

const renderOrder = () => {
    const list = document.getElementById('orderList');
    if (!list) return;
    const keys = Object.keys(order);
    const totalItems = keys.reduce((s, k) => s + order[k].qty, 0);

    const itemCountEl = document.getElementById('itemCount');
    if (itemCountEl) itemCountEl.textContent = `${totalItems} món đã chọn`;

    if (keys.length === 0) {
        list.innerHTML = '<div class="order-empty">Chưa có món nào — chọn từ thực đơn.</div>';
        document.getElementById('subtotal').textContent = '0đ';
        document.getElementById('total').textContent = '0đ';
        return;
    }
    let total = 0;
    list.innerHTML = keys.map(idx => {
        const it = order[idx];
        total += it.price * it.qty;
        return `<div class="order-item">
            <div class="order-item-name">${it.name}</div>
            <div class="qty-ctrl">
                <button class="qty-btn" onclick="changeQty(${idx},-1)">−</button>
                <span class="qty-val">${it.qty}</span>
                <button class="qty-btn" onclick="changeQty(${idx},1)">+</button>
            </div>
            <div class="order-item-price">${fmt(it.price * it.qty)}</div>
        </div>`;
    }).join('');
    document.getElementById('subtotal').textContent = fmt(total);
    document.getElementById('total').textContent = fmt(total);
};

const clearOrder = () => {
    order = {};
    renderOrder();
    const tableLabel = document.getElementById('tableLabel');
    if (tableLabel) tableLabel.textContent = '—';
};

/* ── Payment with receipt modal ── */
const handlePayment = () => {
    const keys = Object.keys(order);
    if (keys.length === 0) {
        alert('Vui lòng chọn ít nhất một món!');
        return;
    }
    const total = Object.values(order).reduce((s, it) => s + it.price * it.qty, 0);

    document.getElementById('receiptTime').textContent =
        new Date().toLocaleString('vi-VN', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    document.getElementById('receiptItems').innerHTML = keys.map(idx => {
        const it = order[idx];
        return `<div class="receipt-item">
            <span><span class="receipt-item-qty">${it.qty}×</span>${it.name}</span>
            <span class="receipt-item-price">${fmt(it.price * it.qty)}</span>
        </div>`;
    }).join('');

    document.getElementById('receiptTotal').textContent = fmt(total);
    document.getElementById('receiptModal').classList.add('open');
};

const closeReceipt = () => {
    document.getElementById('receiptModal').classList.remove('open');
    clearOrder();
};

const receiptModal = document.getElementById('receiptModal');
if (receiptModal) {
    receiptModal.addEventListener('click', function(e) {
        if (e.target === this) closeReceipt();
    });
}

/* ── LOGIC XEM CHI TIẾT VÀ IMPORT ĐƠN ── */

// BUG FIX #3: openDetailModal now receives pre-escaped data from manager.html
// via | tojson on all three arguments, so names with apostrophes won't break JS.
function openDetailModal(name, phone, note) {
    document.getElementById('detName').textContent = name;
    document.getElementById('detPhone').textContent = phone;
    document.getElementById('detNoteBlock').textContent = note ? note : 'Không có ghi chú món ăn.';

    document.getElementById('btnImportFromModal').onclick = function() {
        importToPOS(note, name);
        closeDetailModal();
    };

    document.getElementById('detailModal').classList.add('open');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('open');
}

function importToPOS(noteText, customerName) {
    if (!noteText) {
        alert("Ghi chú trống, không có món để nhập!");
        return;
    }

    // BUG FIX #2: Added \! to stripped characters, and \r?\n to handle
    // Windows-style CRLF line endings in addition to Unix LF.
    let cleanText = noteText
        .replace(/món dự kiến khi đến quán:/i, "")
        .replace(/ghi chú:/i, "")
        .replace(/[\.\?\!]/g, "")
        .trim();

    let itemsArray = cleanText
        .split(/,|\r?\n|-/)
        .map(i => i.trim().toLowerCase())
        .filter(i => i.length > 0);

    let matchedCount = 0;
    let missedItems = [];

    itemsArray.forEach(customerItemName => {
        let foundIdx = menuItems.findIndex(m => {
            let menuName = m.name.toLowerCase().trim();
            return menuName === customerItemName ||
                   menuName.includes(customerItemName) ||
                   customerItemName.includes(menuName);
        });

        if (foundIdx !== -1) {
            addItem(foundIdx);
            matchedCount++;
        } else {
            missedItems.push(customerItemName);
        }
    });

    if (matchedCount > 0) {
        document.getElementById('tableLabel').textContent = "Khách: " + customerName;
        if (missedItems.length > 0) {
            alert(`Đã nhập ${matchedCount} món.\n⚠️ Không tìm thấy món: ${missedItems.join(', ')}`);
        } else {
            alert(`Đã nhập toàn bộ món của khách "${customerName}" vào POS!`);
        }
    } else {
        alert(`Không tìm thấy món khớp với ghi chú: "${noteText}"`);
    }
}

const detailModal = document.getElementById('detailModal');
if (detailModal) {
    detailModal.addEventListener('click', function(e) {
        if (e.target === this) closeDetailModal();
    });
}

// BUG FIX #1: Removed DOMContentLoaded wrapper.
// pos.js is loaded at the bottom of <body>, after the inline menuItems array,
// so the DOM and data are already available — no event listener needed.
renderMenu();
