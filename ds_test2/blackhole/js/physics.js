/* ============================================================================
 * physics.js — 史瓦西黑洞的“物理内核”（CPU 侧）
 * ----------------------------------------------------------------------------
 * 单位制：几何单位 G = c = M = 1（黑洞质量 M = 1）。
 *   r = 2M   ：事件视界
 *   r = 3M   ：光子球
 *   r = 6M   ：最内稳定圆轨道 ISCO
 *   b_c = 3√3M ≈ 5.19615 ：临界碰撞参数（阴影边界）
 *
 * 内容：
 *   1) 零测地线数值积分（Binet 方程 u'' + u = 3Mu²，RK4）——自检用
 *   2) Novikov–Thorne 薄盘温度剖面 T(r)
 *   3) 相对论多普勒 + 引力红移因子 g
 *   4) 黑体辐射颜色 LUT（Planck 定律 × CIE 1931 色匹配函数 → sRGB）
 *   5) 程序化星空背景生成（fBm 星云 + 银河带 + 星点）
 *   6) 物理自检（?selftest 时运行，验证测地线积分的正确性）
 * ==========================================================================*/
'use strict';

const Physics = (function () {

  /* ---------- 常数（几何单位，M = 1） ---------- */
  const M = 1.0;
  const HORIZON = 2.0 * M;          // 事件视界 r_s = 2M
  const PHOTON_SPHERE = 3.0 * M;    // 光子球
  const ISCO = 6.0 * M;             // 最内稳定圆轨道
  const B_CRIT = 3.0 * Math.sqrt(3.0) * M;   // 3√3 M ≈ 5.19615（光子球临界碰撞参数）

  /* ---------- 伪随机数 ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 3D 值噪声 / fBm（星空背景） ---------- */
  function hash3(ix, iy, iz) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1440662683)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise3(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const n000 = hash3(ix, iy, iz), n100 = hash3(ix + 1, iy, iz);
    const n010 = hash3(ix, iy + 1, iz), n110 = hash3(ix + 1, iy + 1, iz);
    const n001 = hash3(ix, iy, iz + 1), n101 = hash3(ix + 1, iy, iz + 1);
    const n011 = hash3(ix, iy + 1, iz + 1), n111 = hash3(ix + 1, iy + 1, iz + 1);
    const nx0 = n000 + (n100 - n000) * u, nx1 = n010 + (n110 - n010) * u;
    const nx2 = n001 + (n101 - n001) * u, nx3 = n011 + (n111 - n011) * u;
    const ny0 = nx0 + (nx1 - nx0) * v, ny1 = nx2 + (nx3 - nx2) * v;
    return ny0 + (ny1 - ny0) * w;
  }
  function fbm3(x, y, z, oct) {
    let a = 0.5, f = 1.0, s = 0.0, norm = 0.0;
    for (let i = 0; i < oct; i++) {
      s += a * vnoise3(x * f, y * f, z * f);
      norm += a; a *= 0.5; f *= 2.03;
    }
    return s / norm;
  }

  /* ============================================================================
   * 1) 零测地线积分 —— Binet 方程
   *    光子轨道方程：u'' + u = 3Mu²，u = 1/r，' = d/dφ
   *    （Schwarzschild 零测地线的精确形式，源自测地线方程 + E、L 守恒）
   * ==========================================================================*/
  function binetDeriv(s) {
    return [s[1], -s[0] + 3.0 * M * s[0] * s[0]];
  }
  function rk4Step(s, h) {
    const k1 = binetDeriv(s);
    const k2 = binetDeriv([s[0] + 0.5 * h * k1[0], s[1] + 0.5 * h * k1[1]]);
    const k3 = binetDeriv([s[0] + 0.5 * h * k2[0], s[1] + 0.5 * h * k2[1]]);
    const k4 = binetDeriv([s[0] + h * k3[0], s[1] + h * k3[1]]);
    return [
      s[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      s[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    ];
  }
  /**
   * 积分一条光子轨道。
   * @param {number} u0   初始 u = 1/r0
   * @param {number} up0  初始 u' = du/dφ
   * @param {number} h    固定步长（φ 弧度）
   * @param {number} maxSteps 最大步数
   * @param {number} rSky 逃逸半径（r 超过则视为逃到无穷远）
   * @returns {{status:'captured'|'escaped'|'exhausted', phi:number, r:number}}
   */
  function integrateBinet(u0, up0, h, maxSteps, rSky) {
    let s = [u0, up0], phi = 0;
    for (let i = 0; i < maxSteps; i++) {
      const r = 1 / s[0];
      if (r <= HORIZON) return { status: 'captured', phi, r, u: s[0], up: s[1] };
      if (r >= rSky) return { status: 'escaped', phi, r, u: s[0], up: s[1] };
      s = rk4Step(s, h);
      phi += h;
    }
    return { status: 'exhausted', phi, r: 1 / s[0], u: s[0], up: s[1] };
  }

  /* ============================================================================
   * 2) Novikov–Thorne 薄盘温度剖面（零力矩内边界）
   *    T(r) ∝ r^(-3/4) [1 − √(r_in/r)]^(1/4)
   *    峰值位于 x = √(r_in/r) = 6/7，即 r_p = (49/36) r_in ≈ 1.3611 r_in；
   *    T 归一化到峰值为 T_in。
   *    （Page & Thorne 1974 的 Schwarzschild 零力矩情形，G=c=1）
   * ==========================================================================*/
  const NT_X_PEAK = 6 / 7;                             // 峰值处 √(r_in/r)
  const NT_HAT_PEAK = Math.pow(36 / 49, 0.75) * Math.pow(1 / 7, 0.25); // T̂(r_p)
  const NT_NORM = 1 / NT_HAT_PEAK;                     // 归一化常数

  function diskTemperature(r, rIn, tIn) {
    if (r <= rIn) return 0;
    const x = Math.sqrt(rIn / r);
    return tIn * Math.pow(rIn / r, 0.75) * Math.pow(1 - x, 0.25) * NT_NORM;
  }

  /* ============================================================================
   * 3) 相对论多普勒 + 引力红移因子
   *    g = ν_obs / ν_emit = √(1 − 3M/r) / [ √(1 − 2M/r₀) · (1 − b_z Ω) ]
   *    其中 Ω = √(M/r³)（开普勒角速度），b_z = b·(轨道平面法向 · ẑ)，
   *    b = L/E 为光子碰撞参数，r₀ 为相机半径。
   *    导出：ν_emit = −k·U（U = 圆轨道 4 速度），ν_obs = E/√(1−2M/r₀)（静态观测者）。
   *    分解：g = √(f_emit/f₀) · [√(1−3M/r)/√f_emit] · 1/(1−b_zΩ)   （引力 × 时间膨胀 × 多普勒）
   * ==========================================================================*/
  function redshiftFactor(r, r0, bz, opts) {
    const fem = 1 - 2 * M / r;
    const f0 = 1 - 2 * M / r0;
    let g = 1;
    if (opts.redshift) g *= Math.sqrt(fem / f0);                     // 引力红移
    if (opts.doppler) {
      const Om = Math.pow(r, -1.5);                                  // Ω = √(M/r³)
      g *= Math.sqrt(1 - 3 * M / r) / (Math.sqrt(fem) * (1 - bz * Om)); // 轨道时间膨胀 × 多普勒
    }
    return g;
  }

  /* ============================================================================
   * 4) 黑体辐射颜色 LUT —— Planck 定律 × CIE 1931
   *    B_λ(T) = 2hc²/λ⁵ · [exp(hc/λkT) − 1]⁻¹
   *    XYZ  = Σ B_λ · (x̄, ȳ, z̄) Δλ   （CIE 1931 2° 标准观察者，380–780nm @5nm）
   *    归一化 Y=1（只保留色度），XYZ→sRGB（D65 白点），γ 编码后存 8bit。
   * ==========================================================================*/
  const CIE_LAMBDA = [380, 385, 390, 395, 400, 405, 410, 415, 420, 425, 430, 435, 440, 445, 450, 455, 460, 465, 470, 475, 480, 485, 490, 495, 500, 505, 510, 515, 520, 525, 530, 535, 540, 545, 550, 555, 560, 565, 570, 575, 580, 585, 590, 595, 600, 605, 610, 615, 620, 625, 630, 635, 640, 645, 650, 655, 660, 665, 670, 675, 680, 685, 690, 695, 700, 705, 710, 715, 720, 725, 730, 735, 740, 745, 750, 755, 760, 765, 770, 775, 780];
  const CIE_X = [0.0014, 0.0022, 0.0042, 0.0076, 0.0143, 0.0232, 0.0435, 0.0776, 0.1344, 0.2148, 0.2839, 0.3285, 0.3483, 0.3481, 0.3362, 0.3187, 0.2908, 0.2511, 0.1954, 0.1421, 0.0956, 0.0580, 0.0320, 0.0147, 0.0049, 0.0024, 0.0093, 0.0291, 0.0633, 0.1096, 0.1655, 0.2257, 0.2904, 0.3597, 0.4334, 0.5121, 0.5945, 0.6784, 0.7621, 0.8425, 0.9163, 0.9786, 1.0263, 1.0567, 1.0622, 1.0456, 1.0026, 0.9384, 0.8544, 0.7514, 0.6424, 0.5419, 0.4479, 0.3608, 0.2835, 0.2187, 0.1649, 0.1212, 0.0874, 0.0636, 0.0468, 0.0329, 0.0227, 0.0158, 0.0114, 0.0081, 0.0058, 0.0041, 0.0029, 0.0020, 0.0014, 0.0010, 0.0007, 0.0005, 0.0003, 0.0002, 0.0002, 0.0002, 0.0001, 0.0001, 0.0001, 0.0000];
  const CIE_Y = [0.0000, 0.0001, 0.0001, 0.0002, 0.0004, 0.0006, 0.0012, 0.0022, 0.0040, 0.0073, 0.0116, 0.0168, 0.0230, 0.0298, 0.0380, 0.0480, 0.0600, 0.0739, 0.0910, 0.1126, 0.1390, 0.1693, 0.2080, 0.2586, 0.3230, 0.4073, 0.5030, 0.6082, 0.7100, 0.7932, 0.8620, 0.9149, 0.9540, 0.9803, 0.9950, 1.0000, 0.9950, 0.9786, 0.9520, 0.9154, 0.8700, 0.8163, 0.7570, 0.6949, 0.6310, 0.5668, 0.5030, 0.4412, 0.3810, 0.3210, 0.2650, 0.2170, 0.1750, 0.1382, 0.1070, 0.0816, 0.0610, 0.0446, 0.0320, 0.0232, 0.0170, 0.0119, 0.0082, 0.0057, 0.0041, 0.0029, 0.0021, 0.0015, 0.0010, 0.0007, 0.0005, 0.0004, 0.0002, 0.0001, 0.0001, 0.0001, 0.0001, 0.0000, 0.0000, 0.0000, 0.0000];
  const CIE_Z = [0.0065, 0.0105, 0.0201, 0.0362, 0.0679, 0.1102, 0.2074, 0.3713, 0.6456, 1.0391, 1.3856, 1.6230, 1.7471, 1.7826, 1.7721, 1.7441, 1.6692, 1.5281, 1.2876, 1.0419, 0.8130, 0.6162, 0.4652, 0.3533, 0.2720, 0.2123, 0.1582, 0.1117, 0.0782, 0.0573, 0.0422, 0.0298, 0.0203, 0.0134, 0.0087, 0.0057, 0.0039, 0.0027, 0.0021, 0.0018, 0.0017, 0.0014, 0.0011, 0.0010, 0.0008, 0.0006, 0.0003, 0.0002, 0.0002, 0.0001, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000];

  const C2_NM = 1.438776877e7;   // hc/k，单位 nm·K

  function blackbodyXYZ(T) {
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < CIE_LAMBDA.length; i++) {
      const lam = CIE_LAMBDA[i];
      const x = C2_NM / (lam * T);
      if (x > 709) continue;                       // exp 溢出保护
      const B = 1.0 / (Math.pow(lam, 5) * (Math.exp(x) - 1.0));
      X += B * CIE_X[i];
      Y += B * CIE_Y[i];
      Z += B * CIE_Z[i];
    }
    return { X, Y, Z };
  }
  /** 黑体色度 → sRGB（线性，未 γ 编码）。Y 归一化为 1。 */
  function blackbodyToLinearRGB(T) {
    const { X, Y, Z } = blackbodyXYZ(T);
    if (Y <= 0) return [0, 0, 0];
    const xn = X / Y, yn = 1.0, zn = Z / Y;         // 归一化色度（Y=1）
    // XYZ(D65) → sRGB 线性
    let r = 3.2406 * xn - 1.5372 * yn - 0.4986 * zn;
    let g = -0.9689 * xn + 1.8758 * yn + 0.0415 * zn;
    let b = 0.0557 * xn - 0.2040 * yn + 1.0570 * zn;
    return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
  }

  const LUT_SIZE = 512, LUT_TMIN = Math.pow(10, 3.4), LUT_TMAX = Math.pow(10, 8.6);
  function buildBlackbodyLUT() {
    const data = new Uint8Array(LUT_SIZE * 4);
    for (let i = 0; i < LUT_SIZE; i++) {
      const logT = 3.4 + (8.6 - 3.4) * (i / (LUT_SIZE - 1));
      const T = Math.pow(10, logT);
      const [r, g, b] = blackbodyToLinearRGB(T);
      data[i * 4 + 0] = Math.round(Math.pow(Math.min(1, r), 1 / 2.2) * 255);
      data[i * 4 + 1] = Math.round(Math.pow(Math.min(1, g), 1 / 2.2) * 255);
      data[i * 4 + 2] = Math.round(Math.pow(Math.min(1, b), 1 / 2.2) * 255);
      data[i * 4 + 3] = 255;
    }
    return { data, size: LUT_SIZE, tMinLog: 3.4, tMaxLog: 8.6 };
  }

  /* ============================================================================
   * 5) 程序化星空背景（等距柱状投影，2048×1024）
   *    深空 fBm 星云 + 银河带 + 按星等分布的点星（颜色取黑体 LUT）
   * ==========================================================================*/
  function buildStarfield(w, h, lut) {
    const rng = mulberry32(0x2BADB002);
    const px = new Float32Array(w * h * 3);
    const MW_POLE = norm3(0.42, 0.78, 0.46);

    for (let y = 0; y < h; y++) {
      const v = y / h;
      const th = v * Math.PI;
      const sTh = Math.sin(th), cTh = Math.cos(th);
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const ph = u * 2 * Math.PI;
        const dx = sTh * Math.cos(ph), dy = cTh, dz = sTh * Math.sin(ph);
        const n1 = fbm3(dx * 2.3 + 97.1, dy * 2.3 + 33.7, dz * 2.3 + 12.9, 4);
        const n2 = fbm3(dx * 5.9 + 7.7, dy * 5.9 + 71.3, dz * 5.9 + 41.1, 3);
        const mwLat = Math.asin(dx * MW_POLE[0] + dy * MW_POLE[1] + dz * MW_POLE[2]);
        const mw = Math.exp(-(mwLat * mwLat) / (2 * 0.16 * 0.16)) * (0.55 + 0.45 * n2);
        const i = (y * w + x) * 3;
        px[i + 0] = 0.0035 + 0.016 * n1 + 0.05 * mw;
        px[i + 1] = 0.0045 + 0.018 * n1 + 0.042 * mw;
        px[i + 2] = 0.0090 + 0.028 * n1 + 0.036 * mw;
      }
    }

    function lutColor(logT) {
      const t = (logT - lut.tMinLog) / (lut.tMaxLog - lut.tMinLog);
      let idx = Math.max(0, Math.min(lut.size - 2, Math.floor(t * (lut.size - 1))));
      const f = t * (lut.size - 1) - idx;
      const a = idx * 4, b = a + 4;
      return [
        (lut.data[a] + (lut.data[b] - lut.data[a]) * f) / 255,
        (lut.data[a + 1] + (lut.data[b + 1] - lut.data[a + 1]) * f) / 255,
        (lut.data[a + 2] + (lut.data[b + 2] - lut.data[a + 2]) * f) / 255
      ];
    }

    function splat(d, B, tint, sigma) {
      const u = Math.atan2(d[2], d[0]) / (2 * Math.PI) + 0.5;
      const v = Math.acos(Math.max(-1, Math.min(1, d[1]))) / Math.PI;
      const cx = u * w, cy = v * h;
      const R = Math.ceil(2.6 * sigma);
      for (let dy = -R; dy <= R; dy++) {
        const yy = Math.round(cy) + dy;
        if (yy < 1 || yy >= h - 1) continue;
        for (let dx = -R; dx <= R; dx++) {
          let xx = Math.round(cx) + dx;
          xx = ((xx % w) + w) % w;               // 水平无缝环绕
          const d2 = dx * dx + dy * dy;
          const g = Math.exp(-d2 / (2 * sigma * sigma));
          if (g < 0.02) continue;
          const i = (yy * w + xx) * 3;
          px[i + 0] += B * tint[0] * g;
          px[i + 1] += B * tint[1] * g;
          px[i + 2] += B * tint[2] * g;
        }
      }
    }

    // 点星：星等 m ∈ [0,5]，亮度 ∝ 10^(−0.4m)
    for (let i = 0; i < 3400; i++) {
      const d = randDir(rng);
      const m = 5.0 * Math.pow(rng(), 0.85);
      const B = Math.pow(10, -0.4 * m) * 1.35;
      const logT = 3.477 + rng() * 1.0;         // 3000K–30000K 对数均匀
      splat(d, B, lutColor(logT), 0.75 + B * 1.6);
    }
    // 少量亮星（大光斑，供透镜产生可见的爱因斯坦弧）
    for (let i = 0; i < 22; i++) {
      const d = randDir(rng);
      const m = 0.4 * rng() - 0.6;
      const B = Math.pow(10, -0.4 * m) * 0.9;
      splat(d, B, lutColor(3.9 + rng() * 0.8), 1.1 + B * 1.8);
    }

    const out = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      for (let c = 0; c < 3; c++) {
        const val = Math.min(1, px[i * 3 + c]);
        out[i * 4 + c] = Math.round(Math.pow(val, 1 / 2.2) * 255);
      }
      out[i * 4 + 3] = 255;
    }
    return { data: out, w, h };
  }

  function randDir(rng) {
    const z = 2 * rng() - 1;
    const t = 2 * Math.PI * rng();
    const s = Math.sqrt(1 - z * z);
    return [s * Math.cos(t), z, s * Math.sin(t)];
  }
  function norm3(x, y, z) {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  }

  /* ============================================================================
   * 6) 物理自检 —— 用独立推导的结果验证数值管线
   * ==========================================================================*/
  function runSelfTest() {
    const R0 = 14.0, F0 = 1 - 2 / R0;             // 相机半径（与默认渲染一致）
    const results = [];
    const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

    // 1. 光子球：u=1/3, u'=0 应精确停留在 r=3M
    {
      const s = integrateBinet(1 / 3, 0, 0.001, 300000, 1e6);
      ok('光子球 r=3M 稳定轨道', s.status === 'exhausted' && Math.abs(s.r - 3) < 1e-9,
        'r = ' + s.r.toPrecision(10) + ' M（期望 3.000000000 M）');
    }

    // 2. 临界碰撞参数 b_c = 3√3 M（阴影边界分岔）
    {
      const run = (b) => {
        const vt = b * Math.sqrt(F0) / R0;
        const vr = -Math.sqrt(1 - vt * vt);
        const u0 = 1 / R0;
        const up0 = -Math.sqrt(F0) * vr / (R0 * vt);
        return integrateBinet(u0, up0, 0.0015, 800000, 5000);
      };
      const resLo = run(B_CRIT - 1e-5), resHi = run(B_CRIT + 1e-5);
      ok('临界碰撞参数 3√3M ≈ 5.19615（b⁻ 被俘获 / b⁺ 逃逸）',
        resLo.status === 'captured' && resHi.status === 'escaped',
        'b = 5.19614 → ' + resLo.status + '；b = 5.19616 → ' + resHi.status);
    }

    // 3. 光线偏折角：b = 100M 时 δ = 4M/b + 15π/4·(M/b)² + 128/3·(M/b)³ ≈ 0.0412208 rad
    {
      const b = 100, rFar = 5000;
      const fFar = 1 - 2 / rFar;
      const vt = b * Math.sqrt(fFar) / rFar;
      const vr = -Math.sqrt(1 - vt * vt);
      const u0 = 1 / rFar;
      const up0 = -Math.sqrt(fFar) * vr / (rFar * vt);
      const res = integrateBinet(u0, up0, 0.001, 4000000, rFar * 2);
      // 偏折角 = 无穷远渐近线之间的夹角：δ = φ_total − π + α_in + α_out
      const aIn = Math.atan2(vt, -vr);
      const rp = -res.up / (res.u * res.u);           // dr/dφ（末态）
      const aOut = Math.atan2(1 / res.u, Math.abs(rp));
      const deflect = res.phi - Math.PI + aIn + aOut;
      const expect = 4 * M / b + (15 * Math.PI / 4) * (M / b) * (M / b) + (128 / 3) * Math.pow(M / b, 3);
      ok('弱场光线偏折 4M/b + 15π/4(M/b)² + 128/3(M/b)³（b=100M）',
        res.status === 'escaped' && Math.abs(deflect - expect) < 2e-5,
        'δ = ' + deflect.toFixed(8) + ' rad（期望 ' + expect.toFixed(8) + ' rad）');
    }

    // 4. ISCO 处多普勒 + 引力红移：与局域参考系洛伦兹变换独立验证
    {
      const r = ISCO, fem = 1 - 2 / r;
      const gam = 1 / Math.sqrt(1 - 0.25);            // β = 0.5 → γ = 1/√0.75
      const grav = Math.sqrt(fem / F0);
      const cases = [
        ['径向出射', 0, 1 / gam],
        ['切向顺行', r / Math.sqrt(fem), 1 / (gam * (1 - 0.5))],
        ['切向逆行', -r / Math.sqrt(fem), 1 / (gam * (1 + 0.5))]
      ];
      let all = true; const lines = [];
      for (const [name, bz, delta] of cases) {
        const gFormula = redshiftFactor(r, R0, bz, { redshift: true, doppler: true });
        const gLocal = grav * delta;
        const diff = Math.abs(gFormula - gLocal);
        if (diff > 1e-9) all = false;
        lines.push(name + ': 公式 ' + gFormula.toFixed(6) + ' / 局域洛伦兹 ' + gLocal.toFixed(6));
      }
      ok('ISCO 红移因子 g（测地线公式 ≡ 局域参考系洛伦兹公式）', all, lines.join('；'));
    }

    // 5. Novikov–Thorne 温度剖面峰值位于 r = (49/36) r_in
    {
      const rIn = ISCO, tIn = 4e6;
      const rPeak = (49 / 36) * rIn;
      let maxR = rIn, maxT = 0;
      for (let i = 1; i <= 40000; i++) {
        const r = rIn + (3 * rIn - rIn) * (i / 40000);
        const T = diskTemperature(r, rIn, tIn);
        if (T > maxT) { maxT = T; maxR = r; }
      }
      const err = Math.abs(maxR / rIn - 49 / 36);
      ok('吸积盘温度峰值 r_p = 1.3611 r_in', err < 2e-4 && Math.abs(maxT - tIn) / tIn < 1e-6,
        '数值峰值 r = ' + (maxR / rIn).toFixed(5) + ' r_in，T_peak = ' + maxT.toExponential(6) + ' K');
    }

    // 6. 黑体 LUT 端点色温（粗验证：低 T 偏红、高 T 偏蓝）
    {
      const lo = blackbodyToLinearRGB(3000), hi = blackbodyToLinearRGB(30000);
      ok('黑体色温色度（3000K 红 > 蓝；30000K 蓝 ≥ 红）',
        lo[0] > lo[2] && hi[2] >= hi[0] * 0.9,
        '3000K rgb=(' + lo.map(v => v.toFixed(3)).join(',') + ')；30000K rgb=(' + hi.map(v => v.toFixed(3)).join(',') + ')');
    }

    return {
      results,
      allPass: results.every(r => r.pass),
      summary: results.map(r => (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name).join('\n')
    };
  }

  return {
    M, HORIZON, PHOTON_SPHERE, ISCO, B_CRIT,
    NT_NORM, NT_HAT_PEAK, NT_X_PEAK,
    mulberry32, fbm3, randDir,
    integrateBinet, binetDeriv, rk4Step,
    diskTemperature, redshiftFactor,
    blackbodyToLinearRGB, buildBlackbodyLUT,
    LUT_TMIN, LUT_TMAX, LUT_SIZE,
    buildStarfield, runSelfTest
  };
})();
