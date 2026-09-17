/* ============================================================================
 * shaders.js — GLSL ES 3.00 着色器源码（WebGL2）
 *
 * 渲染管线：
 *   1) 测地线光线追踪（每像素反向积分 Schwarzschild 零测地线）
 *   2) 高光提取（1/4 分辨率）
 *   3) 可分离高斯模糊 ×2（辉光）
 *   4) 合成：ACES 色调映射 + γ 校正 + 暗角
 *
 * 物理核心（与 physics.js 的 CPU 版本完全一致，G=c=M=1）：
 *   · 光子轨道方程（Binet）：u'' + u = 3Mu²，u = 1/r，' = d/dφ
 *   · 碰撞参数：b = L/E = r₀v_t / √(1−2M/r₀)
 *   · 吸积盘温度（Novikov–Thorne）：T ∝ r^(−3/4)[1−√(r_in/r)]^(1/4)
 *   · 红移因子：g = √(1−3M/r) / [√(1−2M/r₀)·(1−b_z·√(M/r³))]
 *   · 观测辐射：I ∝ g⁴T⁴，色温 gT（黑体，Planck × CIE1931 LUT）
 * ==========================================================================*/
'use strict';

const Shaders = {};

/* 全屏三角形顶点着色器（所有 pass 共用） */
Shaders.VS_FULLSCREEN = `#version 300 es
out vec2 vUV;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  vUV = (gl_Position.xy + 1.0) * 0.5;
}`;

/* ---------------------------------------------------------------------------
 * 1) 测地线光线追踪片元着色器
 * -------------------------------------------------------------------------*/
Shaders.FS_RAYTRACE = `#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2  uResolution;   // 内部渲染分辨率
uniform vec3  uCamPos;       // 相机位置（史瓦西坐标，|p|=r₀）
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamForward;   // 指向黑洞（=−p̂₀）
uniform float uTanFov;       // tan(FOV/2)（水平）
uniform float uF0;           // f(r₀) = 1−2M/r₀
uniform float uRSky;         // 逃逸半径（视为无穷远，默认 2000M）
uniform float uDiskIn;       // 吸积盘内半径
uniform float uDiskOut;      // 吸积盘外半径
uniform float uTIn;          // 盘面峰值温度（K，NT 剖面归一化）
uniform float uTNorm;        // NT 剖面归一化常数
uniform float uDiskBright;   // 盘面亮度
uniform float uStepScale;    // 步长 h = clamp(uStepScale·r², 0.0004, 0.5)
uniform float uStepMax;      // 最大步数
uniform float uDopplerOn;    // 多普勒效应开关
uniform float uRedshiftOn;   // 引力红移开关
uniform float uTrueColor;    // 黑体真彩色开关
uniform float uSkyBright;    // 星空亮度
uniform int   uBgMode;       // 0=星空 1=网格 2=纯黑
uniform float uLutMin;       // log10(T) LUT 下界
uniform float uLutMax;       // log10(T) LUT 上界
uniform float uSceneScale;   // HDR 压缩系数（float 缓冲=1，RGBA8 回退=0.35）
uniform sampler2D uBBLUT;    // 黑体辐射颜色 LUT
uniform sampler2D uSkyTex;   // 星空等距柱状投影

const float PI = 3.141592653589793;
const float LN10 = 2.302585092994046;
const int MAX_LOOP = 8192;

/* 光子轨道方程：u'' = −u + 3Mu²（M=1） */
vec2 deriv(vec2 s){ return vec2(s.y, -s.x + 3.0 * s.x * s.x); }

/* 经典 RK4 */
vec2 rk4(vec2 s, float h){
  vec2 k1 = deriv(s);
  vec2 k2 = deriv(s + 0.5 * h * k1);
  vec2 k3 = deriv(s + 0.5 * h * k2);
  vec2 k4 = deriv(s + h * k3);
  return s + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

/* 黑体颜色（Planck × CIE1931，预计算 LUT；γ 解码为线性） */
vec3 bbColor(float logT){
  float x = clamp((logT - uLutMin) / (uLutMax - uLutMin), 0.0, 1.0);
  return pow(texture(uBBLUT, vec2(x, 0.5)).rgb, vec3(2.2));
}

/* 无穷远背景（被引力透镜自然弯曲） */
vec3 skyFromDir(vec3 d){
  if (uBgMode == 2) return vec3(0.0);
  if (uBgMode == 1) {
    float lon = atan(d.z, d.x);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    float cell = 0.14;
    vec2 gv = vec2(lon, lat) / cell;
    vec2 f = abs(fract(gv) - 0.5);
    float checker = mod(floor(gv.x) + floor(gv.y), 2.0);
    float line = 1.0 - smoothstep(0.43, 0.5, max(f.x, f.y));
    float eq = exp(-lat * lat / (2.0 * 0.0175 * 0.0175));
    vec3 col = vec3(0.010, 0.016, 0.028)
             + vec3(0.032, 0.040, 0.058) * checker
             + vec3(0.10, 0.12, 0.16) * line
             + vec3(0.05, 0.09, 0.13) * eq;
    return col * uSkyBright;
  }
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  vec3 c = texture(uSkyTex, vec2(u, v)).rgb;
  return pow(c, vec3(2.2)) * uSkyBright;
}

void main(){
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;

  /* 像素光线方向（相机局域正交标架，即静态观测者的物理方向） */
  vec3 dir = normalize(uCamForward
            + ndc.x * uTanFov * aspect * uCamRight
            + ndc.y * uTanFov * uCamUp);

  /* 轨道平面分解：a = p̂₀（初始径向），bd = 初始切向 */
  vec3 a = normalize(uCamPos);
  float r0 = length(uCamPos);
  float vr = dot(dir, a);
  vec3 tang = dir - vr * a;
  float vt2 = dot(tang, tang);

  /* 近径向光线：无轨道角动量，直进直出（视界内即被俘获） */
  if (vt2 < 1e-8) {
    vec3 col = vec3(0.0);
    if (vr > 0.0) col = skyFromDir(dir);
    fragColor = vec4(col, 1.0);
    return;
  }
  float vt = sqrt(vt2);
  vec3 bd = tang / vt;

  /* 守恒量：碰撞参数 b = L/E，初始条件 u₀、u'₀（与 CPU 版推导一致） */
  float f0 = uF0;
  float b  = r0 * vt / sqrt(f0);
  float u  = 1.0 / r0;
  float up = -sqrt(f0) * vr / (r0 * vt);
  float phi = 0.0;

  /* 轨道平面对赤道面（吸积盘平面 z=0）的投影 */
  float cz = a.z, sz = bd.z;
  /* 碰撞参数在盘旋转轴（ẑ）上的投影：b_z = b·(a×bd)·ẑ */
  float bz = b * (a.x * bd.y - a.y * bd.x);

  vec3 col = vec3(0.0);
  float r = r0;
  bool diskHit = false;

  for (int i = 0; i < MAX_LOOP; i++) {
    if (float(i) >= uStepMax) break;                 // 步数耗尽（近临界光线）
    r = 1.0 / u;

    /* 落入视界 → 阴影（纯黑） */
    if (r <= 2.0) break;

    /* 逃逸到无穷远 → 采样背景（方向取当前轨道切向） */
    if (r >= uRSky) {
      float c = cos(phi), s = sin(phi);
      float rp = -up / (u * u);                      // dr/dφ
      vec3 esc = normalize(rp * (c * a + s * bd) + (1.0 / u) * (-s * a + c * bd));
      col = skyFromDir(esc);
      break;
    }

    /* 自适应步长：h ∝ r²（光子球附近自动加密） */
    float h = clamp(uStepScale * r * r, 0.0004, 0.5);
    float phi2 = phi + h;
    vec2 s2 = rk4(vec2(u, up), h);
    float u2 = s2.x, up2 = s2.y;

    /* 吸积盘平面 z=0 交点检测（盘外区域跳过，省开销） */
    if (r < uDiskOut + 10.0) {
      float z0 = (cz * cos(phi) + sz * sin(phi)) / u;
      float z1 = (cz * cos(phi2) + sz * sin(phi2)) / u2;
      if (z0 * z1 <= 0.0) {
        /* 3 次二分 + RK4 精化交点半径 */
        float lo = phi, hi = phi2;
        float ul = u, upl = up;
        float zl = z0;
        for (int k = 0; k < 3; k++) {
          float mid = 0.5 * (lo + hi);
          vec2 sm = rk4(vec2(ul, upl), mid - lo);
          float zm = (cz * cos(mid) + sz * sin(mid)) / sm.x;
          if (zl * zm <= 0.0) { hi = mid; } else { lo = mid; ul = sm.x; upl = sm.y; zl = zm; }
        }
        vec2 sh = rk4(vec2(ul, upl), hi - lo);
        float zh = (cz * cos(hi) + sz * sin(hi)) / sh.x;
        float t = zl / (zl - zh);
        float rc = 1.0 / mix(ul, sh.x, t);
        if (rc > uDiskIn && rc < uDiskOut) { r = rc; diskHit = true; break; }
      }
    }
    phi = phi2; u = u2; up = up2;
  }

  /* 命中吸积盘 → 相对论辐射转移 */
  if (diskHit) {
    float edge = 1.0 - smoothstep(uDiskOut - 1.5, uDiskOut + 0.5, r);

    /* 红移因子 g = ν_obs/ν_emit（引力 × 轨道时间膨胀 × 多普勒） */
    float fem = 1.0 - 2.0 / r;
    float g = 1.0;
    if (uRedshiftOn > 0.5) g *= sqrt(fem / uF0);
    if (uDopplerOn > 0.5)  g *= sqrt(1.0 - 3.0 / r) / (sqrt(fem) * (1.0 - bz * pow(r, -1.5)));

    /* Novikov–Thorne 温度剖面（峰值为 T_in，位于 r = 1.3611 r_in） */
    float x = sqrt(uDiskIn / r);
    float T = uTIn * pow(uDiskIn / r, 0.75) * pow(1.0 - x, 0.25) / uTNorm;

    /* 观测到的是温度 gT 的黑体，辐射通量 ∝ g⁴T⁴（I_ν/ν³ 洛伦兹不变量） */
    float logT = log(g * T) / LN10;
    vec3 c = bbColor(logT);
    if (uTrueColor < 0.5) c = vec3(1.0);
    float I = pow(g, 4.0) * pow(T / uTIn, 4.0) * uDiskBright * edge;
    col = c * I;
  }

  fragColor = vec4(col * uSceneScale, 1.0);
}`;

/* ---------------------------------------------------------------------------
 * 2) 高光提取（辉光阈值）
 * -------------------------------------------------------------------------*/
Shaders.FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uThresh;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(uThresh, uThresh * 2.0, max(l, 0.0));
  fragColor = vec4(c * w, 1.0);
}`;

/* ---------------------------------------------------------------------------
 * 3) 可分离高斯模糊（9 抽头，σ≈2，1/4 分辨率）
 * -------------------------------------------------------------------------*/
Shaders.FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uTexel;   // 模糊方向（水平/垂直）
void main(){
  vec3 s = texture(uTex, vUV).rgb * 0.227027;
  s += (texture(uTex, vUV + uTexel * 1.384615).rgb + texture(uTex, vUV - uTexel * 1.384615).rgb) * 0.194595;
  s += (texture(uTex, vUV + uTexel * 3.230769).rgb + texture(uTex, vUV - uTexel * 3.230769).rgb) * 0.121622;
  s += (texture(uTex, vUV + uTexel * 5.175620).rgb + texture(uTex, vUV - uTexel * 5.175620).rgb) * 0.054054;
  s += (texture(uTex, vUV + uTexel * 7.127800).rgb + texture(uTex, vUV - uTexel * 7.127800).rgb) * 0.016216;
  fragColor = vec4(s, 1.0);
}`;

/* ---------------------------------------------------------------------------
 * 4) 合成：场景 + 辉光 → ACES → γ → 暗角
 * -------------------------------------------------------------------------*/
Shaders.FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uSceneInv;   // 1/uSceneScale（RGBA8 回退时还原 HDR）

vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main(){
  vec3 c = texture(uScene, vUV).rgb * uSceneInv + texture(uBloom, vUV).rgb * uBloomStrength;
  c *= exp2(uExposure);
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));
  float vg = smoothstep(1.4, 0.5, length(vUV - 0.5) * 2.0);
  c *= 1.0 - 0.22 * (1.0 - vg);
  fragColor = vec4(c, 1.0);
}`;
