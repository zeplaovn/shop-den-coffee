/* ============================================
   DEN COFFEE — main.js (Performance Optimized)
   ============================================ */

/* ── Custom Cursor ── */
const cursor = document.getElementById('cursor');
const cursorDot = document.getElementById('cursorDot');

if (cursor && cursorDot) {
    let mouseX = 0, mouseY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, { passive: true });

    const updateCursor = () => {
        const transformValue = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
        cursor.style.transform = transformValue;
        cursorDot.style.transform = transformValue;
        requestAnimationFrame(updateCursor);
    };
    requestAnimationFrame(updateCursor);
}

/* ── Navbar & Hero Parallax ── */
const navbar = document.getElementById('navbar');
const heroContent = document.getElementById('heroContent');
let lastScrollY = window.scrollY, ticking = false;

window.addEventListener('scroll', () => {
    lastScrollY = window.scrollY;
    if (!ticking) {
        window.requestAnimationFrame(() => {
            if (navbar) navbar.classList.toggle('scrolled', lastScrollY > 40);
            if (heroContent && lastScrollY < window.innerHeight) {
                heroContent.style.transform = `translate3d(0, ${lastScrollY * 0.3}px, 0)`;
                heroContent.style.opacity = 1 - lastScrollY / (window.innerHeight * 0.8);
            }
            ticking = false;
        });
        ticking = true;
    }
}, { passive: true });

/* ── Menu Filter & Reveal ── */
const filterBtns = document.querySelectorAll('.filter-btn');
const menuCards = document.querySelectorAll('.menu-card');

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        menuCards.forEach(card => {
            if (filter === 'all' || card.dataset.category === filter) {
                card.style.display = '';
                setTimeout(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'scale(1)';
                }, 10);
            } else {
                card.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                setTimeout(() => card.style.display = 'none', 400);
            }
        });
    });
});

const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObs.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right, .menu-card').forEach(el => revealObs.observe(el));

/* ── Loader & Form UX ── */
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('loaded');
        setTimeout(() => loader.remove(), 1000);
    }
});

document.querySelectorAll('input[type="date"]').forEach(inp => {
    inp.setAttribute('min', new Date().toISOString().split('T')[0]);
});

/* ── Toast Notification System ── */
function showToast(msg, type = 'success') {
    let banner = document.querySelector('.flash-banner') || document.createElement('div');
    if (!banner.parentElement) {
        banner.className = 'flash-banner';
        document.body.appendChild(banner);
    }

    const toast = document.createElement('div');
    toast.className = `flash ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${msg}`;
    banner.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}
