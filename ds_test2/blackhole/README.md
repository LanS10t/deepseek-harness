# HORIZON — Schwarzschild Black Hole Geodesic Renderer

English | [中文](README.zh.md)

A **zero-dependency general-relativistic black hole simulation that opens with a double-click**: backward integration of null geodesics (photon trajectories) in Schwarzschild spacetime for every pixel, complete relativistic radiative transfer for a Novikov–Thorne thin accretion disk (gravitational redshift × Doppler shift/beaming × blackbody radiation), and gravitational lensing of the background stars.

> Units: **geometric units G = c = M = 1** (black hole mass normalized to 1; lengths in M).

---

## Running

**No installation or build is required.**

| Method | Command |
| --- | --- |
| Open directly | Double-click `index.html` (recommended; supports `file://`) |
| Optional static server | `npx serve blackhole` or `python -m http.server 8000 -d blackhole` |

Browser requirements: a modern browser with **WebGL2** support (Chrome / Edge / Firefox / Safari 15+, desktop or mobile). Initial procedural starfield generation takes about one second.

**Physics self-test mode**: `index.html?selftest` runs numerical tests against analytical/local-frame results and opens a result panel (also logged to the browser console).

---

## Physics Model (Formulas Executed by the Rendering Pipeline)

### 1. Metric and Geodesics

Schwarzschild metric:

```
ds² = −(1 − 2M/r) dt² + (1 − 2M/r)⁻¹ dr² + r² (dθ² + sin²θ dφ²)
```

The geodesic equation and conserved quantities (energy `E`, angular momentum `L`) give the **photon orbit equation (Binet)**:

```
u″ + u = 3M u²         u = 1/r，  ' = d/dφ
```

Each pixel ray starts at the camera and integrates this exact equation with **RK4** (adaptive step `h ∝ r²`, finer steps near the photon sphere, configurable maximum step count):

- `r < 2M` → captured by the horizon and rendered as shadow;
- crossing the equatorial plane (disk plane) with `r_in < r < r_out` → disk hit (intersection refined by bisection);
- `r → ∞` → escape; sample the background along the asymptotic direction (producing gravitational lensing / Einstein rings).

Initial ray conditions derived from the conserved quantities:

```
b = L/E = r₀ v_t / √(1 − 2M/r₀)          （碰撞参数）
u′₀ = −√(1 − 2M/r₀) · v_r / (r₀ v_t)
```

Key radii and critical values: horizon `2M`, photon sphere `3M`, ISCO `6M`, shadow boundary `b_c = 3√3M ≈ 5.1962M` (consistent with the √27M shadow scale measured by EHT for M87*).

### 2. Disk Radiation (Novikov–Thorne Thin Disk)

Temperature profile with a zero-torque inner edge (the Schwarzschild case of Page & Thorne 1974):

```
T(r) = T_in · (r_in/r)^(3/4) · [1 − √(r_in/r)]^(1/4) / T̂(r_p)
峰值位于 r_p = (49/36) r_in ≈ 1.3611 r_in（数值上精确验证）
```

The **redshift factor** at each emission event (Keplerian circular emitter `U = Uᵗ(∂_t + Ω ∂_φ)`, `Ω = √(M/r³)`, static camera at `r₀`):

```
g = ν_obs / ν_emit = √(1 − 3M/r) / [ √(1 − 2M/r₀) · (1 − b_z Ω) ]
```

This decomposes into gravitational redshift `√(f_emit/f₀)` × orbital time dilation `1/γ` × Doppler factor `1/(1−β∥)`, matching the local-frame Lorentz transformation **point by point** (verified by self-test 4).

### 3. Radiative Transfer

From the Lorentz invariant `I_ν/ν³`, the observed spectrum remains a blackbody at temperature `gT`, with total intensity

```
I_obs = g⁴ · σT⁴/π          （g⁴ 因子即多普勒集束 + 红移的联合效应）
```

Color: Planck's law × CIE 1931 standard observer → sRGB, using a precomputed 512-entry LUT (continuous transition from red-orange at 3000 K to blue-white at 30000 K).

### 4. Rendering Pipeline

Geodesic ray tracing (HDR) → bright-pass extraction (quarter resolution) → separable Gaussian bloom → ACES tone mapping + gamma correction + vignette. Internal resolution is independently adjustable (0.35×–1.5×), with floating-point framebuffers (`EXT_color_buffer_float`, falling back to RGBA8 when unavailable).

---

## Controls

| Input | Effect |
| --- | --- |
| Mouse/finger drag | Orbit around the black hole |
| Wheel / two-finger pinch | Adjust orbital radius r₀ (3.2M–60M) |
| Double-click / `R` | Reset the view |
| `Space` | Pause/resume |
| `H` | Show/hide the parameter panel |
| `F` | Fullscreen |
| `1`–`5` | Presets: default / Interstellar / edge-on / top-down / close-up |

## Live Parameters

| Parameter | Range | Default | Notes |
| --- | --- | --- | --- |
| Orbital radius r₀ | 3.2–60 M | 12 M | Camera distance from the black hole |
| Field of view FOV | 12–95° | 60° | |
| Disk inner radius r_in | 2.2–10 M | **6 M (ISCO)** | The inner edge is the innermost stable circular orbit |
| Disk outer radius r_out | 8–60 M | 30 M | |
| Peak temperature T_in | 10⁵–3×10⁷ K | 4×10⁶ K | Logarithmic scale; determines disk color |
| Disk brightness | 0.1–12 | 2.6 | HDR brightness multiplier |
| Doppler shift + beaming | On/off | On | Disable to compare with the classical image |
| Gravitational redshift | On/off | On | Disable to compare with the classical image |
| Blackbody true color | On/off | On | White-hot monochrome when disabled |
| Geodesic accuracy | 0.15–2.0 | 0.6 | Joint step-size and maximum-step adjustment |
| Internal resolution | 35–150% | 90% | Antialiasing/performance tradeoff |
| Exposure / bloom | −2…+3 / 0–2.5 | +0.5 / 1.0 | Tone mapping |
| Starfield brightness | 0–4 | 1.0 | |
| Background | Stars / grid / black | Stars | The grid makes gravitational lensing most apparent |

**Exploring the physics**: disabling Doppler makes disk brightness left-right symmetric (only gravitational redshift remains). Disabling gravitational redshift as well gives a classical disk without relativistic effects. Enable them one at a time to see each contribution.

---

## Physics Self-Tests (Executed, All Passed)

`node` and browser `?selftest` run the same tests. Results measured with Node v24:

```
PASS  光子球 r=3M 稳定轨道            r = 3.000000000 M
PASS  临界碰撞参数 3√3M ≈ 5.19615     b=5.19614 → captured；b=5.19616 → escaped
PASS  弱场光线偏折（b=100M）           δ = 0.04121854 rad（理论 0.04122076，三阶精度）
PASS  ISCO 红移因子 g                 测地线公式 ≡ 局域洛伦兹公式（径向 0.7638 / 顺行 1.5275 / 逆行 0.5092）
PASS  吸积盘温度峰值 r_p=1.3611 r_in   数值峰值与解析值一致
PASS  黑体色温色度                     3000K 偏红 / 30000K 偏蓝
```

## Performance

- Per-pixel RK4 geodesic integration (adaptive steps and early exit) gives typical scenes at 60 FPS with default accuracy on a discrete GPU. For integrated graphics, geodesic accuracy of 0.3 or internal resolution of 60% is recommended.
- Photon rings and higher-order disk images arise naturally from integration; increasing accuracy reveals additional rings.

## Project Structure

```
blackhole/
├── index.html          # 入口（UI 骨架，双击即开）
├── css/style.css       # 仪器控制台风格界面
├── js/
│   ├── physics.js      # 物理内核：测地线积分、NT 剖面、红移因子、
│   │                   #   黑体 LUT（Planck×CIE1931）、星空生成、自检
│   ├── shaders.js      # GLSL 源码：光线追踪 / 高光 / 模糊 / 合成
│   └── main.js         # WebGL2 管线、相机、交互、UI 绑定
└── README.md
```

## References

- Schwarzschild, K. 1916, *Sitzungsber. Preuss. Akad. Wiss.*
- Luminet, J.-P. 1979, *A&A* 75, 228 — the first numerical simulation of a black hole image
- Page, D. N. & Thorne, K. S. 1974, *ApJ* 191, 499 — relativistic thin disks
- Novikov, I. D. & Thorne, K. S. 1973 — thin-disk temperature profile
- Riazuelo, A. 2018, *Int. J. Mod. Phys. D* 27, 1842005 — Schwarzschild black hole rendering
- Keeton & Petters 2005 — higher-order weak-field deflection
- EHT Collaboration 2019/2022 — observational tests of the √27M shadow size
