/* ---------------------------------------------------------------------------
   12-touch.js — touch controls for phones and tablets.

   Added for the web build. It never runs on a mouse-and-keyboard machine, and it
   touches no game logic: movement writes the same `keys.KeyW/A/S/D` flags the
   keyboard handler writes, look nudges `P.yaw` / `P.pitch` exactly like the mouse
   handler does, and the action buttons dispatch real keydown/keyup events so
   jump buffering, the weapon wheel and reload behave identically.
--------------------------------------------------------------------------- */
(function () {
  var started = false;
  function coarseNow() {
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
  }
  /* Boot now on a touch device, otherwise wait for the first real touch — covers
     tablets that report a fine pointer until a finger lands, and desktop browsers
     put into device-emulation after load. */
  if (coarseNow()) boot();
  else addEventListener('touchstart', boot, { passive: true, once: true });

  function boot() {
    if (started) return;
    started = true;
    setup();
  }

  function setup() {

  var css = document.createElement('style');
  css.textContent = [
    'html,body{overscroll-behavior:none}',
    'body.touching{touch-action:none;-webkit-user-select:none;user-select:none}',
    '#tui{position:fixed;inset:0;z-index:70;pointer-events:none;display:none;font-family:ui-monospace,Menlo,monospace}',
    '#tui.on{display:block}',
    '#tui .btn{position:absolute;pointer-events:auto;display:grid;place-items:center;',
    'border:1px solid rgba(255,255,255,.28);background:rgba(10,14,20,.42);color:#dff6ff;',
    'border-radius:50%;font-size:10px;letter-spacing:.06em;text-transform:uppercase;',
    'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);user-select:none}',
    '#tui .btn:active,#tui .btn.held{background:rgba(61,245,255,.30);border-color:#3DF5FF;color:#04060B}',
    '#tui .fire{right:18px;bottom:92px;width:96px;height:96px;font-size:12px;border-width:2px}',
    '#tui .jump{right:126px;bottom:118px;width:62px;height:62px}',
    '#tui .ads{right:130px;bottom:44px;width:56px;height:56px}',
    '#tui .rel{right:24px;bottom:22px;width:56px;height:56px}',
    '#tui .nade{right:92px;bottom:190px;width:52px;height:52px}',
    '#tui .abil{right:20px;bottom:200px;width:52px;height:52px}',
    '#tui .swap{right:158px;bottom:186px;width:52px;height:52px}',
    '#tui .pause{top:14px;right:14px;width:44px;height:44px;border-radius:12px}',
    '#tui .stick{position:absolute;left:22px;bottom:34px;width:132px;height:132px;border-radius:50%;',
    'border:1px solid rgba(255,255,255,.22);background:rgba(10,14,20,.3);pointer-events:auto}',
    '#tui .knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;',
    'border-radius:50%;background:rgba(61,245,255,.34);border:1px solid rgba(61,245,255,.7)}',
    '#tui .hint{position:absolute;left:0;right:0;bottom:6px;text-align:center;color:rgba(255,255,255,.42);font-size:9px;letter-spacing:.14em;text-transform:uppercase}',
    '@media (min-width:820px){#tui .fire{width:110px;height:110px}}',
    /* short landscape (most phones held sideways): tighten the cluster so it
       clears the HUD and the ammo counter */
    '@media (max-height:460px){',
    '#tui .stick{left:14px;bottom:14px;width:104px;height:104px}',
    '#tui .knob{width:44px;height:44px;margin:-22px 0 0 -22px}',
    '#tui .fire{right:14px;bottom:60px;width:74px;height:74px;font-size:10px}',
    '#tui .jump{right:96px;bottom:78px;width:50px;height:50px}',
    '#tui .ads{right:100px;bottom:20px;width:44px;height:44px}',
    '#tui .rel{right:18px;bottom:16px;width:44px;height:44px}',
    '#tui .nade{right:70px;bottom:136px;width:42px;height:42px}',
    '#tui .abil{right:16px;bottom:142px;width:42px;height:42px}',
    '#tui .swap{right:124px;bottom:132px;width:42px;height:42px}',
    '#tui .hint{display:none}',
    '}',
    /* landscape gate — an FPS is not playable in portrait on a phone */
    '#trot{position:fixed;inset:0;z-index:200;display:none;place-items:center;text-align:center;',
    'background:#04060B;color:#dff6ff;font-family:ui-monospace,Menlo,monospace;padding:26px}',
    '#trot.on{display:grid}',
    '#trot .ph{width:54px;height:92px;border:2px solid #3DF5FF;border-radius:9px;margin:0 auto 22px;',
    'animation:trotSpin 2.1s ease-in-out infinite;transform-origin:50% 50%}',
    '@keyframes trotSpin{0%,32%{transform:rotate(0)}62%,100%{transform:rotate(-90deg)}}',
    '#trot b{display:block;font-size:17px;letter-spacing:.06em;margin-bottom:10px}',
    '#trot span{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.6;line-height:1.7}',
    '#trot button{margin-top:22px;background:#3DF5FF;color:#04060B;border:0;border-radius:4px;',
    'padding:13px 20px;font:inherit;font-size:11px;letter-spacing:.14em;text-transform:uppercase}',
    '#tfs{position:fixed;left:12px;top:12px;z-index:120;display:none;background:rgba(10,14,20,.5);',
    'border:1px solid rgba(255,255,255,.25);color:#dff6ff;border-radius:8px;padding:9px 12px;',
    'font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase}',
    'body.tcoarse #tfs{display:block}'
  ].join('');
  document.head.appendChild(css);

  var ui = document.createElement('div');
  ui.id = 'tui';
  ui.innerHTML =
    '<div class="stick" id="tStick"><div class="knob" id="tKnob"></div></div>' +
    '<div class="btn fire" data-act="fire">Fire</div>' +
    '<div class="btn jump" data-act="jump">Jump</div>' +
    '<div class="btn ads"  data-act="ads">ADS</div>' +
    '<div class="btn rel"  data-act="reload">R</div>' +
    '<div class="btn nade" data-act="nade">Nade</div>' +
    '<div class="btn abil" data-act="abil">Skill</div>' +
    '<div class="btn swap" data-act="swap">Swap</div>' +
    '<div class="btn pause" data-act="pause">II</div>' +
    '<div class="hint">Left stick moves · drag anywhere right to look</div>';
  document.body.appendChild(ui);

  /* ---- landscape gate + fullscreen ---- */
  document.body.classList.add('tcoarse');
  var rot = document.createElement('div');
  rot.id = 'trot';
  rot.innerHTML = '<div><div class="ph"></div><b>Rotate your phone</b>' +
    '<span>Neon Runner is a first-person shooter —<br>it needs landscape to play</span>' +
    '<button type="button" id="tGoFs">Go fullscreen</button></div>';
  document.body.appendChild(rot);

  var fsBtn = document.createElement('button');
  fsBtn.id = 'tfs'; fsBtn.type = 'button'; fsBtn.textContent = 'Fullscreen';
  document.body.appendChild(fsBtn);

  function goFullscreen() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { try { var r = req.call(el); if (r && r.catch) r.catch(function(){}); } catch (e) {} }
    /* Android honours this; iOS Safari has no orientation lock, so the gate below carries it. */
    try {
      if (screen.orientation && screen.orientation.lock) {
        var l = screen.orientation.lock('landscape');
        if (l && l.catch) l.catch(function(){});
      }
    } catch (e) {}
  }
  fsBtn.addEventListener('click', goFullscreen);
  document.getElementById('tGoFs').addEventListener('click', goFullscreen);
  /* any tap that starts a run also asks for fullscreen + landscape */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#play, #deployBtn, [data-view="deploy"]');
    if (t) goFullscreen();
  }, true);

  var portraitPaused = false;
  function orientationCheck() {
    var portrait = (window.matchMedia && matchMedia('(orientation: portrait)').matches) || innerHeight > innerWidth;
    var playing = (typeof state !== 'undefined') && (state === 'play');
    rot.classList.toggle('on', portrait && playing);
    if (portrait && playing && !portraitPaused) { portraitPaused = true; tap('Escape'); }
    if (!portrait) portraitPaused = false;
  }
  addEventListener('resize', orientationCheck);
  addEventListener('orientationchange', orientationCheck);

  function key(code, down) {
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: code, bubbles: true }));
    dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: code, bubbles: true }));
  }
  function tap(code, hold) {
    key(code, true);
    setTimeout(function () { key(code, false); }, hold || 60);
  }

  /* ---- left stick: writes the same flags the WASD handler writes ---- */
  var stick = document.getElementById('tStick'), knob = document.getElementById('tKnob');
  var stickId = null, sx = 0, sy = 0, R = 52;
  function clearMove() {
    keys.KeyW = keys.KeyS = keys.KeyA = keys.KeyD = false;
    keys.ShiftLeft = false;
    knob.style.transform = '';
  }
  function moveFrom(dx, dy) {
    var len = Math.hypot(dx, dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; len = R; }
    knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    var nx = dx / R, ny = dy / R, dead = 0.22;
    keys.KeyW = ny < -dead;
    keys.KeyS = ny > dead;
    keys.KeyA = nx < -dead;
    keys.KeyD = nx > dead;
    keys.ShiftLeft = len / R > 0.86;      /* push the stick to the rim to sprint */
  }
  stick.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0], r = stick.getBoundingClientRect();
    stickId = t.identifier; sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    moveFrom(t.clientX - sx, t.clientY - sy);
    e.preventDefault();
  }, { passive: false });

  /* ---- look: same maths as the mouse handler, driven by a drag ---- */
  var lookId = null, lx = 0, ly = 0;
  document.addEventListener('touchstart', function (e) {
    if (!ui.classList.contains('on')) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === stickId) continue;
      if (t.target && t.target.closest && t.target.closest('#tui .btn, #tui .stick')) continue;
      if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!ui.classList.contains('on')) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === stickId) { moveFrom(t.clientX - sx, t.clientY - sy); e.preventDefault(); continue; }
      if (t.identifier === lookId) {
        var dx = t.clientX - lx, dy = t.clientY - ly;
        lx = t.clientX; ly = t.clientY;
        var s = (CFG.sens || 0.0022) * 1.5 * (P.ads ? (OPT.adsSens || 0.7) : 1);
        P.yaw -= dx * s;
        P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - dy * s * (OPT.invertY ? -1 : 1)));
        e.preventDefault();
      }
    }
  }, { passive: false });

  function endTouch(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var id = e.changedTouches[i].identifier;
      if (id === stickId) { stickId = null; clearMove(); }
      if (id === lookId) lookId = null;
    }
  }
  document.addEventListener('touchend', endTouch, { passive: true });
  document.addEventListener('touchcancel', endTouch, { passive: true });

  /* ---- action buttons ---- */
  ui.querySelectorAll('.btn').forEach(function (b) {
    var act = b.dataset.act;
    b.addEventListener('touchstart', function (e) {
      e.preventDefault(); e.stopPropagation();
      b.classList.add('held');
      if (act === 'fire') { keys.fire = true; keys.fireEdge = true; }
      else if (act === 'jump') { key('Space', true); }
      else if (act === 'swap') { key('KeyQ', true); }
      else if (act === 'ads') {
        P.ads = !P.ads;
        document.body.classList.toggle('ads', P.ads);
        b.classList.toggle('on', P.ads);
      }
      else if (act === 'reload') tap('KeyR');
      else if (act === 'nade') tap('KeyG');
      else if (act === 'abil') tap('KeyF');
      else if (act === 'pause') tap('Escape');
    }, { passive: false });
    b.addEventListener('touchend', function (e) {
      e.preventDefault(); e.stopPropagation();
      b.classList.remove('held');
      if (act === 'fire') keys.fire = false;
      else if (act === 'jump') key('Space', false);
      else if (act === 'swap') key('KeyQ', false);
    }, { passive: false });
  });

  /* ---- show the pad only while a run is live ---- */
  var wasOn = false;
  (function watch() {
    var on = (typeof state !== 'undefined') && state === 'play';
    if (on !== wasOn) {
      wasOn = on;
      ui.classList.toggle('on', on);
      document.body.classList.toggle('touching', on);
      orientationCheck();
      if (!on) { clearMove(); keys.fire = false; stickId = lookId = null; }
    }
    requestAnimationFrame(watch);
  })();
  }
})();
