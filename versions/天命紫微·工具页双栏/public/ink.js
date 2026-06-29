/* 鼠标墨迹拖尾:光标移动时落下淡墨,在宣纸上晕开后淡去。
   仅在有精确指针(桌面)且未开启减弱动画时启用。 */
(function () {
  if (!window.matchMedia) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'ink-canvas';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W, H;
  function resize() {
    W = canvas.width = innerWidth * dpr;
    H = canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
  }
  resize();
  addEventListener('resize', resize);

  var dabs = [];
  var lastX = 0, lastY = 0, have = false;
  var INK = '59,42,30'; // 胡桃木墨

  function add(x, y, vx, vy) {
    var speed = Math.min(Math.hypot(vx, vy), 42);
    var n = speed > 9 ? 2 : 1;
    for (var i = 0; i < n; i++) {
      var jitter = speed * 0.14;
      dabs.push({
        x: (x + (Math.random() - 0.5) * jitter) * dpr,
        y: (y + (Math.random() - 0.5) * jitter) * dpr,
        r0: (2.4 + Math.random() * 3 + speed * 0.06) * dpr,
        grow: 1.6 + Math.random() * 1.5,
        life: 1,
        decay: 0.018 + Math.random() * 0.013,
        a: 0.09 + Math.random() * 0.05
      });
    }
    if (dabs.length > 260) dabs.splice(0, dabs.length - 260);
  }

  addEventListener('mousemove', function (e) {
    var x = e.clientX, y = e.clientY;
    if (have) {
      var dx = x - lastX, dy = y - lastY;
      if (Math.hypot(dx, dy) > 6) { add(x, y, dx, dy); lastX = x; lastY = y; }
    } else { lastX = x; lastY = y; have = true; }
  }, { passive: true });

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (var i = dabs.length - 1; i >= 0; i--) {
      var d = dabs[i];
      d.life -= d.decay;
      if (d.life <= 0) { dabs.splice(i, 1); continue; }
      var r = d.r0 * (1 + (1 - d.life) * d.grow);     // 墨在纸上扩散
      var al = d.a * d.life * d.life;                  // 尾段快速淡去
      var g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
      g.addColorStop(0, 'rgba(' + INK + ',' + al + ')');
      g.addColorStop(0.5, 'rgba(' + INK + ',' + (al * 0.45) + ')');
      g.addColorStop(1, 'rgba(' + INK + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, 6.2832);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
