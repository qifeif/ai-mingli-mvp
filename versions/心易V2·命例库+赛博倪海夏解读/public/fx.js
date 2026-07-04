/* 心易 · 墨韵动效引擎(设计真源:design-system/MASTER.md)
   纯增强层:页面无相应元素时全部静默 no-op;prefers-reduced-motion 下只保留即时状态。 */
(() => {
  'use strict';
  const rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- 滚动显现(.reveal / .reveal-group 子级差) ----
  document.querySelectorAll('.reveal-group').forEach((g) => {
    Array.from(g.children).forEach((c, i) => {
      c.classList.add('reveal');
      c.style.setProperty('--d', `${Math.min(i, 8) * 70}ms`);
    });
  });
  const revealEls = document.querySelectorAll('.reveal');
  if (rm || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('in'));
  } else if (revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach((el) => io.observe(el));
  }

  // ---- 按钮墨晕涟漪(仅 opt-in 的三类按钮) ----
  if (!rm) {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.btn-ink, .btn-paper, .btn-ghost2');
      if (!btn || btn.classList.contains('loading')) return;
      const r = btn.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 2.2;
      const s = document.createElement('span');
      s.className = 'ink-ripple';
      s.style.width = s.style.height = `${d}px`;
      s.style.left = `${e.clientX - r.left - d / 2}px`;
      s.style.top = `${e.clientY - r.top - d / 2}px`;
      btn.appendChild(s);
      s.addEventListener('animationend', () => s.remove(), { once: true });
    }, { passive: true });
  }

  // ---- nav 玻璃霜化滚动态 ----
  const nav = document.querySelector('.nav-frost');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }

  // ---- 结果区出现时整块显现(供页面 JS 手动调用:window.inkReveal(el)) ----
  window.inkReveal = (el) => {
    if (!el || rm) return;
    el.classList.add('reveal');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  };
})();
