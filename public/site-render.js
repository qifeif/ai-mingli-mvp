(() => {
  if (!document.body || (!document.body.classList.contains('xy-yang-preview') && !document.body.classList.contains('xy-cloud-preview'))) return;
  if (document.querySelector('.xy-yang-bg')) return;

  const bg = document.createElement('div');
  bg.className = 'xy-yang-bg xy-video-bg';
  bg.setAttribute('aria-hidden', 'true');
  const mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  const src = mobile ? '/xinyi-taiji-bg.mp4' : '/nebula-taiji-bg.mp4';
  bg.innerHTML = `<video src="${src}" poster="/nebula-taiji.jpg" muted loop autoplay playsinline webkit-playsinline preload="auto"></video><span class="xy-yang-scrim"></span>`;
  document.body.prepend(bg);

  const video = bg.querySelector('video');
  if (video) {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    const markReady = () => bg.classList.add('is-ready');
    const tryPlay = () => video.play().then(markReady).catch(() => {
      bg.classList.add('is-paused');
      bg.classList.add('is-ready');
    });
    video.addEventListener('loadeddata', markReady, { once: true });
    video.addEventListener('canplay', markReady, { once: true });
    video.addEventListener('canplay', tryPlay, { once: true });
    if (video.readyState >= 2) markReady();
    tryPlay();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && video.paused) tryPlay();
    });
    window.addEventListener('touchstart', () => {
      if (video.paused) tryPlay();
    }, { once: true, passive: true });
  }
})();
