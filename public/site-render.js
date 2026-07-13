(() => {
  if (!document.body || !document.body.classList.contains('xy-yang-preview')) return;
  if (document.querySelector('.xy-yang-bg')) return;

  const bg = document.createElement('div');
  bg.className = 'xy-yang-bg';
  bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = '<video src="/nebula-taiji-bg.mp4" muted loop autoplay playsinline preload="auto"></video><span class="xy-yang-scrim"></span>';
  document.body.prepend(bg);

  const video = bg.querySelector('video');
  if (video) {
    video.play().catch(() => {
      bg.classList.add('is-paused');
    });
  }
})();
