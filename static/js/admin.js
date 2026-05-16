// static/js/admin.js
// Toàn bộ logic JS cho trang Admin — không có Jinja2 inline.

/* ── Date display ── */
const dateEl = document.getElementById('currentDate');
if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('vi-VN', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

/* ── Auto-dismiss flash messages ── */
document.querySelectorAll('.flash').forEach(el => {
    setTimeout(() => {
        el.style.transition = 'opacity 0.5s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 500);
    }, 4000);
});

/* ══════════════════════════════════════════════
   VIEW SWITCHING
   ══════════════════════════════════════════════ */
const VIEWS = {
    dashboard: 'view-dashboard',
    bookings:  'view-bookings',
    menu:      'view-menu'
};
const NAV_IDS = {
    dashboard: 'nav-dashboard',
    bookings:  'nav-bookings',
    menu:      'nav-menu'
};
const TITLES = {
    dashboard: ['Dashboard',    'Quản lý đặt bàn và hoạt động ĐEN Coffee'],
    bookings:  ['Đặt Bàn',     'Danh sách tất cả yêu cầu đặt bàn'],
    menu:      ['Thực Đơn',    'Thêm, sửa, xoá các món trong thực đơn']
};

function switchView(view, event) {
    if (event) event.preventDefault();
    Object.keys(VIEWS).forEach(k => {
        const viewEl = document.getElementById(VIEWS[k]);
        const navEl  = document.getElementById(NAV_IDS[k]);
        if (viewEl) viewEl.style.display = k === view ? '' : 'none';
        if (navEl)  navEl.classList.toggle('active', k === view);
    });
    const titleEl = document.getElementById('topbar-title');
    const subEl   = document.getElementById('topbar-sub');
    if (titleEl) titleEl.textContent = TITLES[view][0];
    if (subEl)   subEl.textContent   = TITLES[view][1];
    history.replaceState(null, '', '#' + view);
}

/* Initial view — read URL hash, then check Jinja bootstrap signal */
(function initView() {
    const hash = location.hash.replace('#', '');
    const targetView = VIEWS[hash] ? hash : 'dashboard';
    switchView(targetView);

    // Nếu server flash có "món" → chuyển thẳng sang tab menu
    // Tín hiệu được inject bởi Jinja vào data attribute của #adminBootstrap
    const bootstrap = document.getElementById('adminBootstrap');
    if (bootstrap && bootstrap.dataset.redirectMenu === '1') {
        switchView('menu');
    }
})();

/* ══════════════════════════════════════════════
   EDIT MODAL
   ══════════════════════════════════════════════ */
function openEditModal(id, name, category, price, description, imageUrl) {
    document.getElementById('editForm').action      = '/admin/menu/edit/' + id;
    document.getElementById('edit-name').value      = name;
    document.getElementById('edit-category').value  = category;
    document.getElementById('edit-price').value     = price;
    document.getElementById('edit-description').value = description;
    document.getElementById('edit-image_url').value = imageUrl;
    previewImg('edit');
    document.getElementById('editModal').classList.add('open');
}

function closeEditModalOutside(event) {
    if (event.target === document.getElementById('editModal')) closeEditModalDirect();
}

function closeEditModalDirect() {
    document.getElementById('editModal').classList.remove('open');
}

/* ══════════════════════════════════════════════
   ADD MODAL
   ══════════════════════════════════════════════ */
function openAddModal() {
    const form = document.getElementById('addMenuForm');
    if (form) form.reset();

    const prev = document.getElementById('addImgPreview');
    const ph   = document.getElementById('addImgPlaceholder');
    if (prev) prev.style.display = 'none';
    if (ph)   ph.style.display   = 'flex';

    document.getElementById('addModal').classList.add('open');
    setTimeout(() => {
        const nameInput = document.getElementById('add-name');
        if (nameInput) nameInput.focus();
    }, 80);
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('open');
}

function closeAddModalOutside(event) {
    if (event.target === document.getElementById('addModal')) closeAddModal();
}

/* ══════════════════════════════════════════════
   IMAGE PREVIEW (Add & Edit modal)
   ══════════════════════════════════════════════ */
function previewImg(prefix) {
    const urlInput = document.getElementById(prefix + '-image_url');
    const img      = document.getElementById(prefix + 'ImgPreview');
    const ph       = document.getElementById(prefix + 'ImgPlaceholder');
    if (!img || !ph) return;

    const url = urlInput ? urlInput.value.trim() : '';
    if (url) {
        img.src = url;
        img.style.display = 'block';
        ph.style.display  = 'none';
        img.onerror = () => {
            img.style.display = 'none';
            ph.style.display  = 'flex';
        };
    } else {
        img.style.display = 'none';
        ph.style.display  = 'flex';
    }
}

/* ══════════════════════════════════════════════
   MENU CARD FILTER + SEARCH
   ══════════════════════════════════════════════ */
let activeCat = 'all';

function setCatFilter(cat, btn) {
    activeCat = cat;
    document.querySelectorAll('.mcat-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    filterMenuCards();
}

function filterMenuCards() {
    const searchEl = document.getElementById('menuSearch');
    const q = searchEl ? searchEl.value.toLowerCase().trim() : '';

    // ── Card grid ──
    const cards = document.querySelectorAll('.menu-card');
    let visible = 0;
    cards.forEach(card => {
        const catMatch  = activeCat === 'all' || card.dataset.cat === activeCat;
        const nameMatch = !q || (card.dataset.name || '').includes(q);
        const show = catMatch && nameMatch;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
    });

    // ── Table rows ──
    document.querySelectorAll('.menu-tbl tbody tr').forEach(row => {
        const panel    = row.closest('[data-cat-panel]');
        const catKey   = panel ? panel.dataset.catPanel : '';
        const catMatch = activeCat === 'all' || catKey === activeCat;
        const nameMatch = !q || (row.dataset.name || '').includes(q);
        row.style.display = catMatch && nameMatch ? '' : 'none';
    });

    // Hide table panels that have no visible rows
    document.querySelectorAll('[data-cat-panel]').forEach(panel => {
        const catKey     = panel.dataset.catPanel;
        const panelMatch = activeCat === 'all' || catKey === activeCat;
        const hasVisible = [...panel.querySelectorAll('tbody tr')]
            .some(r => r.style.display !== 'none');
        panel.style.display = panelMatch && hasVisible ? '' : 'none';
    });

    // Show/hide empty-search state
    const emptyEl = document.getElementById('menuEmptySearch');
    if (emptyEl) emptyEl.style.display = visible === 0 && q ? '' : 'none';
}

/* ══════════════════════════════════════════════
   VIEW MODE TOGGLE  (card ↔ table)
   ══════════════════════════════════════════════ */
let currentMenuView = 'card';

function setView(mode) {
    currentMenuView = mode;
    const cardGrid  = document.getElementById('menuCardGrid');
    const tableView = document.getElementById('menuTableView');
    const vtCard    = document.getElementById('vt-card');
    const vtTable   = document.getElementById('vt-table');

    if (cardGrid)  cardGrid.style.display  = mode === 'card'  ? '' : 'none';
    if (tableView) tableView.style.display = mode === 'table' ? '' : 'none';
    if (vtCard)    vtCard.classList.toggle('active',  mode === 'card');
    if (vtTable)   vtTable.classList.toggle('active', mode === 'table');

    filterMenuCards(); // re-apply filters after view switch
}

/* ══════════════════════════════════════════════
   CONFIRM HELPERS
   ══════════════════════════════════════════════ */
function confirmDelete(form) {
    const name = form.getAttribute('data-customer');
    return confirm('Xoá yêu cầu của ' + name + '?');
}

function confirmDeleteItem(form) {
    const name = form.getAttribute('data-item');
    return confirm('Xoá món "' + name + '"?');
}
