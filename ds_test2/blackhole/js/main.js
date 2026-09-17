/* ============================================================================
 * main.js — 视界 HORIZON：史瓦西黑洞测地线渲染器（WebGL2）
 * 零依赖；用 file:// 双击 index.html 或任意静态服务器即可运行。
 * ==========================================================================*/
'use strict';

(function () {
  'use strict';

  /* ================= 参数默认值 ================= */
  const params = {
    rCam: 12.0, pitch: 72, yaw: 8, fov: 60,
    rIn: 6.0, rOut: 30.0, tInLog: 6.6, diskBright: 2.6,
    doppler: true, redshift: true, trueColor: true,
    quality: 0.6, resScale: 0.9,
    exposure: 0.5, bloom: 1.0, skyBright: 1.0, bgMode: 0,
    autoOrbit: false
  };

  const LIMITS = {
    rCam:      { min: 3.2, max: 60, step: 0.1 },
    fov:       { min: 12, max: 95, step: 1 },
    rIn:       { min: 2.2, max: 10, step: 0.1 },
    rOut:      { min: 8, max: 60, step: 0.5 },
    tInLog:    { min: 5.0, max: 7.5, step: 0.01 },
    diskBright:{ min: 0.1, max: 12, step: 0.05 },
    quality:   { min: 0.15, max: 2.0, step: 0.01 },
    resScale:  { min: 0.35, max: 1.5, step: 0.05 },
    exposure:  { min: -2.0, max: 3.0, step: 0.05 },
    bloom:     { min: 0.0, max: 2.5, step: 0.02 },
    skyBright: { min: 0.0, max: 4.0, step: 0.05 }
  };

  const PRESETS = {
    default:      { rCam: 12, pitch: 72, yaw: 8, fov: 60, rIn: 6, rOut: 30, tInLog: 6.6, diskBright: 2.6, quality: 0.6, exposure: 0.5 },
    interstellar: { rCam: 10.5, pitch: 81, yaw: 6, fov: 63, rIn: 6, rOut: 26, tInLog: 6.55, diskBright: 3.0, quality: 0.8, exposure: 0.65 },
    edgeon:       { rCam: 13, pitch: 89.3, yaw: 0, fov: 55, rIn: 6, rOut: 30, tInLog: 6.6, diskBright: 2.8, quality: 0.8, exposure: 0.6 },
    top:          { rCam: 17, pitch: 9, yaw: 0, fov: 50, rIn: 6, rOut: 34, tInLog: 6.6, diskBright: 2.8, quality: 0.7, exposure: 0.6 },
    close:        { rCam: 5.6, pitch: 70, yaw: 12, fov: 78, rIn: 6, rOut: 26, tInLog: 6.5, diskBright: 2.6, quality: 0.9, exposure: 0.55 }
  };
  const DEFAULT_VIEW = { rCam: 12, pitch: 72, yaw: 8, fov: 60 };

  /* ================= DOM ================= */
  const $ = (id) => document.getElementById(id);
  const canvas = $('gl');
  const loaderEl = $('loader'), errorEl = $('error'), panelEl = $('panel');
  const telemetryEls = { fps: $('t-fps'), ms: $('t-ms'), r: $('t-r'), pitch: $('t-pitch'), fov: $('t-fov'), res: $('t-res'), steps: $('t-steps') };

  /* ================= WebGL 初始化 ================= */
  let gl, hdr = false, sceneFilter = 'NEAREST';
  const programs = {}, unis = {};
  let lutTex, skyTex, lutData = null;
  let sceneTex = null, sceneFBO = null;
  let brightTex = null, brightFBO = null;
  let blurA = null, blurB = null;
  let W = 0, H = 0;      // 内部渲染分辨率
  let CW = 0, CH = 0;    // 画布（像素）分辨率

  function compileProgram(vsSrc, fsSrc) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('着色器编译失败：' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('着色器链接失败：' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  function collectUniforms(prog, names) {
    const map = {};
    for (const n of names) map[n] = gl.getUniformLocation(prog, n);
    return map;
  }

  function makeTex(w, h, internal, format, type, filter, wrapS, wrapT) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    return tex;
  }

  function makeFBO(tex) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Framebuffer 不完整');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  function resizeTargets() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    CW = Math.max(64, Math.round(canvas.clientWidth * dpr));
    CH = Math.max(64, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== CW || canvas.height !== CH) { canvas.width = CW; canvas.height = CH; }

    W = Math.max(320, Math.round(CW * params.resScale));
    H = Math.max(180, Math.round(CH * params.resScale));
    W = Math.min(W, 4096); H = Math.min(H, 4096);

    const fmt = hdr ? gl.RGBA16F : gl.RGBA8;
    const filter = hdr ? sceneFilter : gl.LINEAR;
    if (sceneTex) { gl.deleteTexture(sceneTex); gl.deleteFramebuffer(sceneFBO); }
    sceneTex = makeTex(W, H, fmt, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, filter, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    sceneFBO = makeFBO(sceneTex);

    const Wq = Math.max(64, W >> 2), Hq = Math.max(36, H >> 2);
    if (brightTex) { gl.deleteTexture(brightTex); gl.deleteFramebuffer(brightFBO); }
    brightTex = makeTex(Wq, Hq, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    brightFBO = makeFBO(brightTex);
    if (blurA) { gl.deleteTexture(blurA[0]); gl.deleteFramebuffer(blurA[1]); }
    if (blurB) { gl.deleteTexture(blurB[0]); gl.deleteFramebuffer(blurB[1]); }
    blurA = [makeTex(Wq, Hq, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE), null];
    blurB = [makeTex(Wq, Hq, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE), null];
    blurA[1] = makeFBO(blurA[0]);
    blurB[1] = makeFBO(blurB[0]);
  }

  function initGL() {
    try { gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false }); }
    catch (e) { gl = null; }
    if (!gl) throw new Error('此浏览器不支持 WebGL2。请使用最新版 Chrome / Edge / Firefox / Safari 打开。');

    try { if ('drawingBufferColorSpace' in gl) gl.drawingBufferColorSpace = 'srgb'; } catch (e) { }
    hdr = !!gl.getExtension('EXT_color_buffer_float');
    sceneFilter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST;

    programs.ray = compileProgram(Shaders.VS_FULLSCREEN, Shaders.FS_RAYTRACE);
    programs.bright = compileProgram(Shaders.VS_FULLSCREEN, Shaders.FS_BRIGHT);
    programs.blur = compileProgram(Shaders.VS_FULLSCREEN, Shaders.FS_BLUR);
    programs.comp = compileProgram(Shaders.VS_FULLSCREEN, Shaders.FS_COMPOSITE);

    unis.ray = collectUniforms(programs.ray, [
      'uResolution', 'uCamPos', 'uCamRight', 'uCamUp', 'uCamForward', 'uTanFov', 'uF0',
      'uRSky', 'uDiskIn', 'uDiskOut', 'uTIn', 'uTNorm', 'uDiskBright',
      'uStepScale', 'uStepMax', 'uDopplerOn', 'uRedshiftOn', 'uTrueColor',
      'uSkyBright', 'uBgMode', 'uLutMin', 'uLutMax', 'uSceneScale', 'uBBLUT', 'uSkyTex'
    ]);
    unis.bright = collectUniforms(programs.bright, ['uTex', 'uThresh']);
    unis.blur = collectUniforms(programs.blur, ['uTex', 'uTexel']);
    unis.comp = collectUniforms(programs.comp, ['uScene', 'uBloom', 'uBloomStrength', 'uExposure', 'uSceneInv']);

    // 全屏三角形（无 VBO）
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindVertexArray(null);
    gl._vao = vao;

    // 黑体颜色 LUT
    const lut = Physics.buildBlackbodyLUT();
    lutData = lut;
    lutTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, lut.size, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut.data);

    resizeTargets();
    console.log('[HORIZON] WebGL2 就绪，HDR 浮点缓冲：' + (hdr ? '是' : '否（RGBA8 回退）'));
  }

  function uploadSky() {
    loaderEl.querySelector('.loader-text').textContent = '生成星空背景（fBm 星云 · 银河 · 星点）…';
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const sky = Physics.buildStarfield(2048, 1024, lutData);
        skyTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, skyTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sky.w, sky.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, sky.data);
        resolve();
      });
    });
  }

  /* ================= 相机 ================= */
  const cam = { r: params.rCam, pitch: params.pitch * Math.PI / 180, yaw: params.yaw * Math.PI / 180 };
  const camTarget = { r: params.rCam, pitch: cam.pitch, yaw: cam.yaw };

  function camBasis() {
    const r = cam.r, th = cam.pitch, ph = cam.yaw;
    const st = Math.sin(th);
    const pos = [r * st * Math.cos(ph), r * st * Math.sin(ph), r * Math.cos(th)];
    const fwd = [-st * Math.cos(ph), -st * Math.sin(ph), -Math.cos(th)]; // −p̂₀
    let upRef = [0, 0, 1];
    if (Math.abs(fwd[2]) > 0.999) upRef = [0, 1, 0];
    const right = norm3(cross3(fwd, upRef));
    const up = cross3(right, fwd);
    return { pos, fwd, right, up };
  }
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /* ================= 交互（旋转/缩放/触控） ================= */
  const pointers = new Map();
  let pinchDist = 0;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchDist = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = [e.clientX, e.clientY];
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
      camTarget.yaw -= dx * 0.0045;
      camTarget.pitch = clamp(camTarget.pitch + dy * 0.0045, 0.015, Math.PI - 0.015);
    } else if (pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      if (pinchDist > 0) params.rCam = clamp(params.rCam * (pinchDist / d), LIMITS.rCam.min, LIMITS.rCam.max);
      pinchDist = d;
      syncSlider('rCam');
    }
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); pinchDist = 0; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    params.rCam = clamp(params.rCam * Math.exp(e.deltaY * 0.0012), LIMITS.rCam.min, LIMITS.rCam.max);
    syncSlider('rCam');
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { Object.assign(params, DEFAULT_VIEW); syncAllSliders(); });

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ================= UI 绑定 ================= */
  const sliderRegistry = [];
  function bindSlider(id, key, fmt) {
    const el = $(id);
    const out = el.parentElement.querySelector('output');
    const lim = LIMITS[key];
    el.min = lim.min; el.max = lim.max; el.step = lim.step;
    el.value = params[key];
    const apply = () => {
      params[key] = parseFloat(el.value);
      if (out) out.textContent = fmt ? fmt(params[key]) : el.value;
      el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100).toFixed(2) + '%');
      if (key === 'rCam') camTarget.r = params.rCam;
    };
    el.addEventListener('input', apply);
    sliderRegistry.push({ el, key, fmt, apply });
    apply();
  }
  function syncSlider(key) {
    const r = sliderRegistry.find(s => s.key === key);
    if (r) { r.el.value = params[key]; r.apply(); }
  }
  function syncAllSliders() { for (const r of sliderRegistry) { r.el.value = params[r.key]; r.apply(); } }

  function bindToggle(id, key) {
    const el = $(id);
    el.checked = params[key];
    el.addEventListener('change', () => { params[key] = el.checked; });
  }

  // 滑块
  bindSlider('rCam', 'rCam', v => v.toFixed(1) + ' M');
  bindSlider('fov', 'fov', v => Math.round(v) + '°');
  bindSlider('rIn', 'rIn', v => v.toFixed(1) + ' M');
  bindSlider('rOut', 'rOut', v => v.toFixed(1) + ' M');
  bindSlider('tInLog', 'tInLog', v => Math.pow(10, v).toExponential(1) + ' K');
  bindSlider('diskBright', 'diskBright', v => v.toFixed(2));
  bindSlider('quality', 'quality', v => v.toFixed(2));
  bindSlider('resScale', 'resScale', v => Math.round(v * 100) + '%');
  bindSlider('exposure', 'exposure', v => (v >= 0 ? '+' : '') + v.toFixed(2));
  bindSlider('bloom', 'bloom', v => v.toFixed(2));
  bindSlider('skyBright', 'skyBright', v => v.toFixed(2));
  // 开关
  bindToggle('tg-doppler', 'doppler');
  bindToggle('tg-redshift', 'redshift');
  bindToggle('tg-truecolor', 'trueColor');
  bindToggle('tg-orbit', 'autoOrbit');

  // 背景类型
  const bgBtns = document.querySelectorAll('#bgMode button');
  function syncBg() {
    for (const b of bgBtns) b.classList.toggle('active', parseInt(b.dataset.mode, 10) === params.bgMode);
  }
  for (const b of bgBtns) b.addEventListener('click', () => { params.bgMode = parseInt(b.dataset.mode, 10); syncBg(); });
  syncBg();

  // 预设
  for (const b of document.querySelectorAll('#presets button')) {
    b.addEventListener('click', () => {
      Object.assign(params, PRESETS[b.dataset.preset]);
      camTarget.r = params.rCam;
      camTarget.pitch = params.pitch * Math.PI / 180;
      camTarget.yaw = params.yaw * Math.PI / 180;
      syncAllSliders();
      for (const t of [['tg-doppler', 'doppler'], ['tg-redshift', 'redshift'], ['tg-truecolor', 'trueColor']]) $(t[0]).checked = params[t[1]];
      syncBg();
    });
  }

  // 面板与按键
  const collapseBtn = $('collapse');
  let panelVisible = true;
  function setPanel(v) {
    panelVisible = v;
    panelEl.classList.toggle('hidden', !v);
    collapseBtn.textContent = v ? '≫' : '≪';
  }
  collapseBtn.addEventListener('click', () => setPanel(!panelVisible));

  $('btn-reset').addEventListener('click', () => { Object.assign(params, DEFAULT_VIEW); camTarget.r = params.rCam; camTarget.pitch = params.pitch * Math.PI / 180; camTarget.yaw = params.yaw * Math.PI / 180; syncAllSliders(); });
  $('btn-shot').addEventListener('click', () => { needShot = true; });
  $('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
  });

  let paused = false;
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    switch (e.key.toLowerCase()) {
      case 'h': setPanel(!panelVisible); break;
      case 'r': Object.assign(params, DEFAULT_VIEW); camTarget.r = params.rCam; camTarget.pitch = params.pitch * Math.PI / 180; camTarget.yaw = params.yaw * Math.PI / 180; syncAllSliders(); break;
      case 'f': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); break;
      case ' ': paused = !paused; e.preventDefault(); break;
      case '1': case '2': case '3': case '4': case '5': {
        const names = ['default', 'interstellar', 'edgeon', 'top', 'close'];
        Object.assign(params, PRESETS[names[+e.key - 1]]);
        camTarget.r = params.rCam; camTarget.pitch = params.pitch * Math.PI / 180; camTarget.yaw = params.yaw * Math.PI / 180;
        syncAllSliders(); break;
      }
    }
  });

  /* ================= 渲染循环 ================= */
  let lastT = performance.now(), fpsEma = 60, telemetryClock = 0, needShot = false;

  function drawQuad() {
    gl.bindVertexArray(gl._vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function render(dt) {
    // 相机阻尼
    const k = 1 - Math.exp(-dt * 9);
    cam.r += (camTarget.r - cam.r) * k;
    cam.pitch += (camTarget.pitch - cam.pitch) * k;
    cam.yaw += (camTarget.yaw - cam.yaw) * k;
    if (params.autoOrbit) camTarget.yaw += 0.06 * dt;

    const basis = camBasis();
    const u = unis.ray;
    const stepMax = Math.min(6000, Math.round(350 + 1900 * params.quality));
    const stepScale = 0.0075 / params.quality;

    // Pass 1：测地线光线追踪 → 场景（HDR）
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
    gl.viewport(0, 0, W, H);
    gl.useProgram(programs.ray);
    gl.uniform2f(u.uResolution, W, H);
    gl.uniform3fv(u.uCamPos, basis.pos);
    gl.uniform3fv(u.uCamRight, basis.right);
    gl.uniform3fv(u.uCamUp, basis.up);
    gl.uniform3fv(u.uCamForward, basis.fwd);
    gl.uniform1f(u.uTanFov, Math.tan(params.fov * Math.PI / 360));
    gl.uniform1f(u.uF0, 1 - 2 / cam.r);
    gl.uniform1f(u.uRSky, 2000);
    gl.uniform1f(u.uDiskIn, params.rIn);
    gl.uniform1f(u.uDiskOut, params.rOut);
    gl.uniform1f(u.uTIn, Math.pow(10, params.tInLog));
    gl.uniform1f(u.uTNorm, Physics.NT_HAT_PEAK);
    gl.uniform1f(u.uDiskBright, params.diskBright);
    gl.uniform1f(u.uStepScale, stepScale);
    gl.uniform1f(u.uStepMax, stepMax);
    gl.uniform1f(u.uDopplerOn, params.doppler ? 1 : 0);
    gl.uniform1f(u.uRedshiftOn, params.redshift ? 1 : 0);
    gl.uniform1f(u.uTrueColor, params.trueColor ? 1 : 0);
    gl.uniform1f(u.uSkyBright, params.skyBright);
    gl.uniform1i(u.uBgMode, params.bgMode);
    gl.uniform1f(u.uLutMin, 3.4);
    gl.uniform1f(u.uLutMax, 8.6);
    gl.uniform1f(u.uSceneScale, hdr ? 1.0 : 0.35);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lutTex); gl.uniform1i(u.uBBLUT, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, skyTex); gl.uniform1i(u.uSkyTex, 1);
    drawQuad();

    // Pass 2：高光提取（1/4 分辨率）
    const Wq = Math.max(64, W >> 2), Hq = Math.max(36, H >> 2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, brightFBO);
    gl.viewport(0, 0, Wq, Hq);
    gl.useProgram(programs.bright);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(unis.bright.uTex, 0);
    gl.uniform1f(unis.bright.uThresh, 0.9);
    drawQuad();

    // Pass 3/4：可分离高斯模糊
    gl.useProgram(programs.blur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurA[1]);
    gl.viewport(0, 0, Wq, Hq);
    gl.bindTexture(gl.TEXTURE_2D, brightTex); gl.uniform1i(unis.blur.uTex, 0);
    gl.uniform2f(unis.blur.uTexel, 1 / Wq, 0);
    drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurB[1]);
    gl.bindTexture(gl.TEXTURE_2D, blurA[0]); gl.uniform1i(unis.blur.uTex, 0);
    gl.uniform2f(unis.blur.uTexel, 0, 1 / Hq);
    drawQuad();

    // Pass 5：合成 → 画布（ACES + γ + 暗角）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, CW, CH);
    gl.useProgram(programs.comp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(unis.comp.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blurB[0]); gl.uniform1i(unis.comp.uBloom, 1);
    gl.uniform1f(unis.comp.uBloomStrength, params.bloom);
    gl.uniform1f(unis.comp.uExposure, params.exposure);
    gl.uniform1f(unis.comp.uSceneInv, hdr ? 1.0 : 1 / 0.35);
    drawQuad();

    // 截图（帧内同步读取）
    if (needShot) {
      needShot = false;
      const c2 = document.createElement('canvas');
      c2.width = CW; c2.height = CH;
      c2.getContext('2d').drawImage(canvas, 0, 0);
      c2.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'horizon-blackhole-' + Date.now() + '.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    }

    // 遥测
    telemetryClock += dt;
    if (telemetryClock > 0.25) {
      telemetryClock = 0;
      telemetryEls.fps.textContent = fpsEma.toFixed(1);
      telemetryEls.ms.textContent = (1000 / fpsEma).toFixed(1);
      telemetryEls.r.textContent = cam.r.toFixed(2) + ' M';
      telemetryEls.pitch.textContent = (cam.pitch * 180 / Math.PI).toFixed(1) + '°';
      telemetryEls.fov.textContent = Math.round(params.fov) + '°';
      telemetryEls.res.textContent = W + '×' + H;
      telemetryEls.steps.textContent = stepMax;
    }
  }

  /* ================= 调试/验证钩子（window.__HORIZON） ================= */
  let statsRequest = null;
  window.__HORIZON = {
    params,
    hdrInfo: () => ({ hdr, sceneFilter, W, H, steps: Math.min(6000, Math.round(350 + 1900 * params.quality)) }),
    setView: (v) => {
      if (v.rCam != null) { params.rCam = v.rCam; camTarget.r = v.rCam; }
      if (v.pitch != null) { params.pitch = v.pitch; camTarget.pitch = v.pitch * Math.PI / 180; }
      if (v.yaw != null) { params.yaw = v.yaw; camTarget.yaw = v.yaw * Math.PI / 180; }
      if (v.fov != null) params.fov = v.fov;
    },
    /** 帧内读回合成画布并统计分区亮度（中心阴影 / 盘环左右 / 天空角落） */
    requestStats: () => new Promise((resolve) => { statsRequest = { resolve }; }),
    /** 分阶段探针：读场景纹理与默认帧缓冲的原始像素 */
    probe: () => new Promise((resolve) => { statsRequest = { resolve, probe: true }; }),
    ctxLost: () => gl.isContextLost()
  };

  function resolveStatsIfNeeded(stepMax) {
    if (!statsRequest) return;
    if (statsRequest.probe) {
      const out = { W, H, CW, CH };
      const fb = new Float32Array(4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.readPixels(Math.floor(W / 2), Math.floor(H / 2), 1, 1, gl.RGBA, gl.FLOAT, fb);
      out.sceneCenter = [fb[0], fb[1], fb[2], fb[3]];
      gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.FLOAT, fb);
      out.sceneCorner = [fb[0], fb[1], fb[2], fb[3]];
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const b = new Uint8Array(4);
      gl.readPixels(Math.floor(CW / 2), Math.floor(CH / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
      out.frameCenter = Array.from(b);
      gl.clearColor(0.0, 0.0, 0.25, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.readPixels(Math.floor(CW / 2), Math.floor(CH / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
      out.clearTest = Array.from(b);
      statsRequest.resolve(out);
      statsRequest = null;
      return;
    }
    const w = CW, h = CH;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const lum = (i) => 0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2];
    let center = 0, qTL = 0, qTR = 0, qBL = 0, qBR = 0, sky = 0;
    let nC = 0, nTL = 0, nTR = 0, nBL = 0, nBR = 0, nS = 0;
    const rrOf = (x, y) => Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2));
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const i = y * w + x;
      const rr = rrOf(x, y);
      const L = lum(i) / 255;
      if (rr < 0.30) { center += L; nC++; }
      else if (rr < 0.95) {
        const left = x < w / 2, up = y >= h / 2;   // readPixels 行 0 = 画布底部
        if (left && up) { qTL += L; nTL++; }
        else if (!left && up) { qTR += L; nTR++; }
        else if (left) { qBL += L; nBL++; }
        else { qBR += L; nBR++; }
      }
      if ((x < w * 0.13 || x > w * 0.87) && (y < h * 0.18 || y > h * 0.82)) { sky += L; nS++; }
    }
    statsRequest.resolve({
      center: center / nC,
      qTL: qTL / nTL, qTR: qTR / nTR, qBL: qBL / nBL, qBR: qBR / nBR,
      sky: sky / nS,
      rCam: cam.r, pitch: cam.pitch * 180 / Math.PI, fov: params.fov,
      doppler: params.doppler, bgMode: params.bgMode,
      steps: stepMax, W, H, hdr
    });
    statsRequest = null;
  }

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (dt > 0) fpsEma += (1 / dt - fpsEma) * 0.08;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const nw = Math.round(canvas.clientWidth * dpr), nh = Math.round(canvas.clientHeight * dpr);
    const nW = clamp(Math.round(nw * params.resScale), 320, 4096);
    const nH = clamp(Math.round(nh * params.resScale), 180, 4096);
    if (nw !== CW || nh !== CH || Math.abs(nW - W) > 1 || Math.abs(nH - H) > 1) {
      resizeTargets();
    }
    if (!paused) render(dt);
    if (!paused) resolveStatsIfNeeded(Math.min(6000, Math.round(350 + 1900 * params.quality)));
    requestAnimationFrame(frame);
  }

  /* ================= 自检模式（?selftest） ================= */
  function runSelfTestUI() {
    const res = Physics.runSelfTest();
    window.__SELFTEST_RESULTS = res;
    console.log('[HORIZON] 物理自检结果\n' + res.summary + '\n全部通过：' + res.allPass);
    const el = $('selftest');
    el.hidden = false;
    const rows = res.results.map(r =>
      '<tr class="' + (r.pass ? 'pass' : 'fail') + '"><td class="mark">' + (r.pass ? '✔' : '✘') + '</td><td>' + r.name + '</td><td class="mono">' + r.detail + '</td></tr>'
    ).join('');
    el.innerHTML =
      '<div class="st-head"><span class="st-title">物理自检 PHYSICS SELF-TEST</span><span class="st-badge ' + (res.allPass ? 'ok' : 'bad') + '">' + (res.allPass ? 'ALL PASS' : 'FAILED') + '</span></div>' +
      '<table>' + rows + '</table>' +
      '<div class="st-foot">测地线积分（Binet 方程 RK4）与解析/局域洛伦兹结果交叉验证 · G=c=M=1</div>';
  }

  /* ================= 启动 ================= */
  function boot() {
    try {
      initGL();
    } catch (err) {
      console.error(err);
      loaderEl.hidden = true;
      errorEl.hidden = false;
      errorEl.querySelector('.err-msg').textContent = String(err.message || err);
      return;
    }
    uploadSky().then(() => {
      loaderEl.classList.add('done');
      setTimeout(() => { loaderEl.hidden = true; }, 450);
      if (new URLSearchParams(location.search).has('selftest')) runSelfTestUI();
      requestAnimationFrame(frame);
    });
  }

  // 上下文丢失恢复
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('[HORIZON] WebGL 上下文丢失'); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  // 全局错误 → 错误卡片
  window.addEventListener('error', (e) => {
    console.error(e.message);
    if (errorEl.hidden) {
      errorEl.hidden = false;
      errorEl.querySelector('.err-msg').textContent = e.message;
    }
  });

  // 输出物理常数（便于在控制台核对）
  console.log('[HORIZON] 物理常数（G=c=M=1）：视界 2M · 光子球 3M · ISCO 6M · 临界碰撞参数 3√3M=' +
    Physics.B_CRIT.toFixed(10) + ' · NT 温度峰值 1.3611 r_in');

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
