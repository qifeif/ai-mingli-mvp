(() => {
  if (!document.body || (!document.body.classList.contains('xy-yang-preview') && !document.body.classList.contains('xy-cloud-preview'))) return;
  if (document.querySelector('.xy-yang-bg')) return;

  const bg = document.createElement('div');
  bg.className = 'xy-yang-bg xy-video-bg';
  bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = '<video src="/nebula-taiji-bg.mp4" poster="/nebula-taiji.jpg" muted loop autoplay playsinline preload="auto"></video><span class="xy-yang-scrim"></span>';
  document.body.prepend(bg);

  const video = bg.querySelector('video');
  if (video) {
    const markReady = () => bg.classList.add('is-ready');
    video.addEventListener('loadeddata', markReady, { once: true });
    video.addEventListener('canplay', markReady, { once: true });
    if (video.readyState >= 2) markReady();
    video.play().catch(() => {
      bg.classList.add('is-paused');
      bg.classList.add('is-ready');
    });
  }
})();
