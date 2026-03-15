// =====================================================================
//  Hero Live2D-lite Engine — 基于Canvas的程序化立绘动效
//  从一张静态PNG生成: 呼吸感 + 区域飘动 + 发光闪烁 + 粒子漂浮
//  v3 - 优化呼吸自然度，新增剑光/法杖光芒/闪电弧等高级特效
// =====================================================================
(function(){
'use strict';

// ==================== 每个英雄的动效配置 ====================
const HERO_FX_CONFIG = {
  mage: {
    // 呼吸：轻柔自然的胸部起伏
    breath: { amplitude: 0.005, speed: 1.4, pivotY: 0.95 },
    // 胸口起伏区域配置 (归一化坐标)
    chestHeave: {
      region: [0.30, 0.28, 0.65, 0.48],  // 胸口区域 [x0, y0, x1, y1]
      amplitudeX: 2.5,   // 水平膨胀像素
      amplitudeY: 1.8,   // 垂直膨胀像素
      speed: 1.4,        // 与呼吸同步
      phase: 0,          // 相位偏移
    },
    sway: [
      // 左侧披风 - 轻柔飘动
      { region: [0.0, 0.35, 0.25, 0.98], amplitude: 3.5, speed: 0.8, phase: 0 },
      // 右侧披风
      { region: [0.75, 0.35, 1.0, 0.98], amplitude: 3, speed: 1.0, phase: 1.5 },
      // 头发飘动
      { region: [0.20, 0.0, 0.80, 0.18], amplitude: 1.8, speed: 1.5, phase: 0.8 },
      // 裙摆
      { region: [0.15, 0.75, 0.85, 1.0], amplitude: 2.5, speed: 0.7, phase: 2.0 },
    ],
    glow: [
      // 法杖顶部水晶 - 主光源
      { center: [0.27, 0.10], radius: 0.12, color: [80, 160, 255], intensity: 1.0, speed: 2.0, pulseMin: 0.15, flicker: true },
      // 左手悬浮水晶
      { center: [0.75, 0.48], radius: 0.10, color: [140, 100, 255], intensity: 0.9, speed: 2.5, pulseMin: 0.1, flicker: true },
      // 眼睛发光
      { center: [0.46, 0.19], radius: 0.035, color: [80, 200, 255], intensity: 0.7, speed: 3.5, pulseMin: 0.4 },
      // 左肩甲水晶
      { center: [0.33, 0.26], radius: 0.05, color: [100, 180, 255], intensity: 0.6, speed: 1.8, pulseMin: 0.3 },
      // 右肩甲水晶
      { center: [0.62, 0.26], radius: 0.05, color: [100, 180, 255], intensity: 0.6, speed: 2.0, pulseMin: 0.3 },
      // 胸口宝石
      { center: [0.47, 0.36], radius: 0.04, color: [100, 160, 255], intensity: 0.5, speed: 1.5, pulseMin: 0.35 },
    ],
    particles: {
      count: 30,
      colors: [[100,180,255,0.9],[150,120,255,0.8],[200,200,255,0.7],[255,255,255,0.5]],
      sizeRange: [2, 6],
      speedRange: [0.4, 1.0],
      region: [0.05, 0.0, 0.95, 0.95],
      drift: 'up',
    },
    // 法杖魔法光环特效
    staffAura: {
      center: [0.27, 0.10],       // 法杖顶部水晶位置
      radius: 0.08,                // 光环半径
      color: [80, 160, 255],
      rings: 3,                    // 环数
      rotateSpeed: 1.2,            // 旋转速度
      // 魔法能量射线
      rays: {
        count: 6,
        length: 0.14,
        color: [120, 180, 255],
        speed: 0.8,
        width: 1.5,
      },
      // 次要光源也加光环
      secondary: [
        { center: [0.75, 0.48], radius: 0.06, color: [140, 100, 255] },
      ],
    },
  },
  warrior: {
    breath: { amplitude: 0.005, speed: 1.2, pivotY: 0.95 },
    // 胸口起伏 - 战士胸甲区域
    chestHeave: {
      region: [0.25, 0.30, 0.60, 0.50],  // 胸甲区域
      amplitudeX: 2.0,
      amplitudeY: 2.0,
      speed: 1.2,
      phase: 0,
    },
    sway: [
      // 红色斗篷（背后飘动，幅度降低）
      { region: [0.62, 0.30, 1.0, 0.98], amplitude: 4, speed: 0.7, phase: 0 },
      // 左侧斗篷边
      { region: [0.0, 0.55, 0.15, 0.98], amplitude: 2.5, speed: 0.9, phase: 2.0 },
      // 胡须微动
      { region: [0.28, 0.32, 0.60, 0.52], amplitude: 1, speed: 1.2, phase: 1.0 },
    ],
    glow: [
      // 大剑剑身反光 - 金属冷光（分两段避开头部遮挡）
      // 剑尖段（头部上方，右上角露出的剑身）
      { center: [0.72, 0.06], radius: 0.10, color: [220, 230, 255], intensity: 0.45, speed: 1.2, pulseMin: 0.05, flicker: false },
      // 护手段（头部下方，左侧握手附近的金色护手反光）
      { center: [0.30, 0.26], radius: 0.08, color: [255, 220, 150], intensity: 0.4, speed: 1.5, pulseMin: 0.15, flicker: false },
      // 金色腰带扣
      { center: [0.45, 0.52], radius: 0.06, color: [255, 190, 60], intensity: 0.6, speed: 1.8, pulseMin: 0.25 },
      // 肩甲金色
      { center: [0.25, 0.22], radius: 0.06, color: [255, 190, 60], intensity: 0.5, speed: 1.5, pulseMin: 0.2 },
      // 眼睛
      { center: [0.43, 0.20], radius: 0.03, color: [255, 200, 100], intensity: 0.5, speed: 2.5, pulseMin: 0.3 },
    ],
    particles: {
      count: 16,
      colors: [[255,200,80,0.7],[255,150,50,0.6],[255,255,200,0.5]],
      sizeRange: [1.5, 4],
      speedRange: [0.2, 0.6],
      region: [0.05, 0.15, 0.95, 0.85],
      drift: 'float',
    },
    // 剑光特效
    swordGleam: {
      // 剑身线段定义 (从剑柄到剑尖的归一化坐标)
      // 剑柄在左手握持处(左侧)，剑尖延伸到右上方
      line: { start: [0.28, 0.28], end: [0.80, 0.04] },
      color: [220, 235, 255],
      width: 2.5,
      // 流动光斑
      gleamSpeed: 0.6,         // 大幅降速：从1.8→0.6，光斑缓慢滑动
      gleamLength: 0.25,       // 光斑稍短一些，更聚焦
      gleamIntensity: 0.9,
      // 遮挡区域：头部/脸部区域，剑光经过时衰减
      occlusionZones: [
        // 头部+脸 (归一化矩形 [x0, y0, x1, y1])，occlusion: 遮挡程度 0~1
        { rect: [0.32, 0.08, 0.58, 0.27], occlusion: 0.92 },
        // 胡须/下巴区域，部分遮挡
        { rect: [0.30, 0.27, 0.55, 0.35], occlusion: 0.6 },
      ],
      // 护手/剑鞘高光区 — 光斑到达这个范围会减速停留
      // t参数范围 0(剑柄)~1(剑尖)，护手约在0.0~0.15处
      dwellZone: { tRange: [0.0, 0.18], slowFactor: 0.25 },
      // 剑尖星芒
      tipStar: {
        pos: [0.80, 0.04],
        color: [255, 255, 255],
        size: 0.04,
        speed: 3.0,
        pulseMin: 0.2,
      },
      // 偶尔的斩击弧光
      slashArc: {
        origin: [0.55, 0.16],   // 弧光中心（剑身中段偏上）
        radius: 0.22,
        color: [200, 220, 255],
        interval: 4.0,          // 每隔几秒触发一次
        duration: 0.6,          // 持续时间
        width: 2,
      },
    },
  },
  shaman: {
    breath: { amplitude: 0.005, speed: 1.3, pivotY: 0.93 },
    // 胸口起伏 - 萨满胸部/腹部区域
    chestHeave: {
      region: [0.28, 0.25, 0.62, 0.45],
      amplitudeX: 2.2,
      amplitudeY: 1.8,
      speed: 1.3,
      phase: 0,
    },
    sway: [
      // 肩甲羽毛
      { region: [0.0, 0.14, 0.35, 0.42], amplitude: 3, speed: 1.2, phase: 0 },
      // 腰带/皮裙
      { region: [0.15, 0.60, 0.85, 1.0], amplitude: 2.5, speed: 0.8, phase: 1.2 },
      // 尾部/背后飘带
      { region: [0.0, 0.68, 0.16, 1.0], amplitude: 3.5, speed: 0.7, phase: 0.5 },
    ],
    glow: [
      // 图腾法杖闪电 - 高频闪烁模拟电弧
      { center: [0.82, 0.18], radius: 0.14, color: [80, 200, 255], intensity: 1.0, speed: 5.0, pulseMin: 0.05, flicker: true },
      { center: [0.78, 0.33], radius: 0.10, color: [100, 220, 255], intensity: 0.8, speed: 6.0, pulseMin: 0.05, flicker: true },
      // 左上闪电球
      { center: [0.12, 0.08], radius: 0.09, color: [80, 200, 255], intensity: 0.9, speed: 4.0, pulseMin: 0.05, flicker: true },
      // 蓝色战纹发光
      { center: [0.45, 0.14], radius: 0.07, color: [50, 180, 255], intensity: 0.5, speed: 2.0, pulseMin: 0.25 },
      // 眼睛
      { center: [0.42, 0.16], radius: 0.03, color: [255, 150, 50], intensity: 0.7, speed: 2.5, pulseMin: 0.35 },
    ],
    particles: {
      count: 35,
      colors: [[80,200,255,0.9],[140,220,255,0.8],[255,255,255,0.6],[200,100,255,0.5]],
      sizeRange: [2, 6],
      speedRange: [0.6, 1.5],
      region: [0.0, 0.0, 1.0, 0.85],
      drift: 'spark',
    },
    // 闪电弧线特效
    lightning: {
      arcs: [
        // 法杖顶端到上方：主闪电
        { start: [0.82, 0.22], end: [0.78, 0.05], color: [100, 200, 255], width: 2.5, speed: 8, segments: 8, jitter: 0.03, intensity: 1.0 },
        // 法杖中段到手部
        { start: [0.80, 0.30], end: [0.68, 0.40], color: [80, 180, 255], width: 2, speed: 10, segments: 6, jitter: 0.025, intensity: 0.8 },
        // 左上闪电球射出
        { start: [0.12, 0.08], end: [0.25, 0.15], color: [120, 210, 255], width: 2, speed: 7, segments: 5, jitter: 0.02, intensity: 0.7 },
        // 小闪电弧（在法杖之间跳跃）
        { start: [0.82, 0.18], end: [0.12, 0.08], color: [80, 160, 255], width: 1.5, speed: 12, segments: 12, jitter: 0.04, intensity: 0.4 },
      ],
      // 全局闪烁频率
      globalFlicker: true,
    },
  }
};

// ==================== Live2D Engine ====================
class HeroLive2D {
  constructor(container, heroId, imgSrc) {
    this.container = container;
    this.heroId = heroId;
    this.config = HERO_FX_CONFIG[heroId] || HERO_FX_CONFIG.warrior;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.img = null;
    this.loaded = false;
    this.running = false;
    this.time = 0;
    this.particles = [];
    this.rafId = null;
    
    // Canvas尺寸
    this.W = 0;
    this.H = 0;
    
    this._loadImage(imgSrc);
  }

  _loadImage(src) {
    this.img = new Image();
    // 只在http/https下设置crossOrigin，file://协议下设置会导致图片加载失败
    if (location.protocol !== 'file:') {
      this.img.crossOrigin = 'anonymous';
    }
    this.img.onload = () => {
      this.loaded = true;
      this._setupCanvas();
      this._initParticles();
      this.start();
    };
    this.img.onerror = () => {
      console.warn('HeroLive2D: Failed to load', src);
      // file://下crossOrigin可能导致失败，去掉后重试一次
      if (this.img.crossOrigin !== null && this.img.crossOrigin !== '') {
        console.log('HeroLive2D: retrying without crossOrigin...');
        this.img = new Image();
        this.img.onload = () => {
          this.loaded = true;
          this._setupCanvas();
          this._initParticles();
          this.start();
        };
        this.img.onerror = () => {
          // 真正失败，回退到静态图
          this.container.style.backgroundImage = 'url(' + src + ')';
          this.container.style.backgroundSize = 'contain';
          this.container.style.backgroundPosition = 'center';
          this.container.style.backgroundRepeat = 'no-repeat';
        };
        this.img.src = src;
        return;
      }
      this.container.style.backgroundImage = 'url(' + src + ')';
      this.container.style.backgroundSize = 'contain';
      this.container.style.backgroundPosition = 'center';
      this.container.style.backgroundRepeat = 'no-repeat';
    };
    this.img.src = src;
  }

  _setupCanvas() {
    // 获取容器实际渲染尺寸
    const rect = this.container.getBoundingClientRect();
    let cw = rect.width;
    let ch = rect.height;
    
    // 如果容器尺寸不可用，从inline style或默认值获取
    if (cw < 10) cw = parseInt(this.container.style.width) || 280;
    if (ch < 10) ch = parseInt(this.container.style.height) || 280;
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.round(cw * dpr);
    this.H = Math.round(ch * dpr);
    
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.canvas.style.display = 'block';
    
    // 清空容器，插入canvas
    this.container.innerHTML = '';
    this.container.style.backgroundImage = 'none';
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.appendChild(this.canvas);
  }

  _initParticles() {
    const cfg = this.config.particles;
    this.particles = [];
    for (let i = 0; i < cfg.count; i++) {
      this.particles.push(this._createParticle(true));
    }
  }

  _createParticle(randomPhase) {
    const cfg = this.config.particles;
    const r = cfg.region;
    const colorArr = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
    return {
      x: (r[0] + Math.random() * (r[2] - r[0])) * this.W,
      y: (r[1] + Math.random() * (r[3] - r[1])) * this.H,
      size: cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]),
      speed: cfg.speedRange[0] + Math.random() * (cfg.speedRange[1] - cfg.speedRange[0]),
      color: colorArr,
      phase: randomPhase ? Math.random() * Math.PI * 2 : 0,
      life: randomPhase ? Math.random() * 3 : 0,
      maxLife: 2.5 + Math.random() * 4,
      wobbleAmp: 0.8 + Math.random() * 2.0,
      wobbleSpd: 1 + Math.random() * 2,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.time = performance.now() / 1000;
    this._animate();
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy() {
    this.stop();
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    this.ctx = null;
    this.img = null;
    this.particles = [];
  }

  _animate() {
    if (!this.running || !this.ctx) return;
    const now = performance.now() / 1000;
    const dt = Math.min(now - this.time, 0.05);
    this.time = now;
    
    this._render(now, dt);
    
    this.rafId = requestAnimationFrame(() => this._animate());
  }

  _render(t, dt) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    
    ctx.clearRect(0, 0, W, H);
    
    // 呼吸 - 极微缩放，仅做"活"感
    const breath = this.config.breath;
    const breathVal = Math.sin(t * breath.speed);
    const breathScale = 1 + breathVal * breath.amplitude;
    
    // ---- 第1层: 绘制带轻柔飘动+呼吸的角色 ----
    this._drawSwayedHero(ctx, t, breathScale, breath);
    
    // ---- 第2层: 发光闪烁叠加 ----
    this._drawGlows(ctx, t);
    
    // ---- 第3层: 高级特效（剑光/法杖光环/闪电弧线）----
    this._drawAdvancedFX(ctx, t, dt);
    
    // ---- 第4层: 粒子 ----
    this._drawParticles(ctx, t, dt);
  }

  _drawSwayedHero(ctx, t, breathScale, breathCfg) {
    const W = this.W, H = this.H;
    const pivotY = breathCfg.pivotY * H;
    
    ctx.save();
    
    // 呼吸变换：以脚底为支点做轻微Y缩放
    ctx.translate(W / 2, pivotY);
    ctx.scale(1, breathScale);
    ctx.translate(-W / 2, -pivotY);
    
    // 微小上下浮动
    const breathBob = Math.sin(t * breathCfg.speed) * breathCfg.amplitude * H * 0.5;
    ctx.translate(0, -breathBob);
    
    // 胸口起伏参数
    const chest = this.config.chestHeave;
    const breathPhase = chest ? Math.sin(t * chest.speed + chest.phase) : 0;
    // 使用更自然的呼吸曲线：吸气快、呼气慢
    // sin 的正半周期是吸气(膨胀)，负半周期是呼气(收缩)
    const breathCurve = breathPhase > 0 
      ? Math.pow(breathPhase, 0.7)   // 吸气：稍快膨胀
      : -Math.pow(-breathPhase, 1.3); // 呼气：缓慢收缩
    
    // 使用网格切片
    const SLICE_Y = 60;
    const SLICE_X = 6; // 增加水平分段，以获得更平滑的胸部膨胀
    const sliceH = H / SLICE_Y;
    const sliceW = W / SLICE_X;
    const imgW = this.img.naturalWidth || this.img.width;
    const imgH = this.img.naturalHeight || this.img.height;
    const srcSliceH = imgH / SLICE_Y;
    const srcSliceW = imgW / SLICE_X;
    
    for (let iy = 0; iy < SLICE_Y; iy++) {
      const y = iy * sliceH;
      const yNorm = y / H;
      
      for (let ix = 0; ix < SLICE_X; ix++) {
        const x = ix * sliceW;
        const xNorm = x / W;
        const xCenter = (xNorm + 0.5 / SLICE_X); // 切片中心X归一化
        
        // ---- 飘动偏移 ----
        let offsetX = 0;
        let offsetY = 0;
        
        for (const sway of this.config.sway) {
          const [rx0, ry0, rx1, ry1] = sway.region;
          
          if (yNorm >= ry0 && yNorm <= ry1 && xCenter >= rx0 && xCenter <= rx1) {
            const yRange = ry1 - ry0;
            const yLocal = (yNorm - ry0) / yRange;
            const xRange = rx1 - rx0;
            const xLocal = (xCenter - rx0) / xRange;
            
            const yFade = Math.sin(yLocal * Math.PI);
            const xFade = Math.sin(xLocal * Math.PI);
            const gravityMult = 0.3 + yLocal * 0.7;
            
            const wave = Math.sin(t * sway.speed + sway.phase + yNorm * 4);
            offsetX += wave * sway.amplitude * yFade * xFade * gravityMult;
          }
        }
        
        // ---- 胸口起伏偏移 ----
        if (chest) {
          const [cx0, cy0, cx1, cy1] = chest.region;
          
          if (yNorm >= cy0 && yNorm <= cy1 && xCenter >= cx0 && xCenter <= cx1) {
            const cyRange = cy1 - cy0;
            const cyLocal = (yNorm - cy0) / cyRange; // 0~1 从胸顶到胸底
            const cxRange = cx1 - cx0;
            const cxLocal = (xCenter - cx0) / cxRange; // 0~1 从左到右
            
            // Y方向淡入淡出：在胸口中心最强
            const cyFade = Math.sin(cyLocal * Math.PI);
            // X方向：从中心向两侧对称膨胀
            // cxLocal=0.5 时在中心，向两侧渐弱
            const cxFade = Math.sin(cxLocal * Math.PI);
            
            // X膨胀：胸口两侧向外推（左侧向左，右侧向右）
            const xDir = (cxLocal - 0.5) * 2; // -1 ~ +1，中心为0
            offsetX += xDir * chest.amplitudeX * cyFade * breathCurve;
            
            // Y膨胀：胸口上半部向上推，下半部向下推
            const yDir = (cyLocal - 0.4) * 2; // 重心略偏上
            offsetY += yDir * chest.amplitudeY * cxFade * breathCurve;
          }
        }
        
        // ---- 肩部微动（与呼吸联动）----
        // 呼吸时肩膀会有微小的上提动作
        if (yNorm > 0.18 && yNorm < 0.30) {
          const shoulderFade = Math.sin(((yNorm - 0.18) / 0.12) * Math.PI);
          offsetY -= breathCurve * 1.0 * shoulderFade; // 吸气时肩略上提
        }
        
        // 绘制切片
        const srcX = ix * srcSliceW;
        const srcY = iy * srcSliceH;
        ctx.drawImage(
          this.img,
          srcX, srcY, srcSliceW + 1, srcSliceH + 1,
          x + offsetX, y + offsetY, sliceW + 1, sliceH + 1
        );
      }
    }
    
    ctx.restore();
  }

  _drawGlows(ctx, t) {
    const W = this.W, H = this.H;
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    for (const glow of this.config.glow) {
      const cx = glow.center[0] * W;
      const cy = glow.center[1] * H;
      const r = glow.radius * Math.max(W, H);
      
      // 脉动计算
      let pulse;
      if (glow.flicker) {
        // 闪烁模式：快速不规则脉动
        const base = 0.5 + 0.5 * Math.sin(t * glow.speed);
        const flick = Math.random() > 0.92 ? 0.3 * Math.random() : 0; // 偶尔闪烁
        pulse = glow.pulseMin + (1 - glow.pulseMin) * base + flick;
      } else {
        pulse = glow.pulseMin + (1 - glow.pulseMin) * (0.5 + 0.5 * Math.sin(t * glow.speed));
      }
      const alpha = glow.intensity * pulse;
      
      const [cr, cg, cb] = glow.color;
      
      // 外层大光晕
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
      grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${alpha * 0.6})`);
      grad.addColorStop(0.7, `rgba(${cr},${cg},${cb},${alpha * 0.15})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      
      // 中心亮核
      if (pulse > 0.4) {
        const coreR = r * 0.25;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        coreGrad.addColorStop(0, `rgba(255,255,255,${alpha * 0.9})`);
        coreGrad.addColorStop(0.5, `rgba(${Math.min(255,cr+80)},${Math.min(255,cg+80)},${Math.min(255,cb+80)},${alpha * 0.4})`);
        coreGrad.addColorStop(1, `rgba(255,255,255,0)`);
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.restore();
  }

  // ==================== 高级特效总入口 ====================
  _drawAdvancedFX(ctx, t, dt) {
    const cfg = this.config;
    if (cfg.swordGleam) this._drawSwordGleam(ctx, t);
    if (cfg.staffAura)  this._drawStaffAura(ctx, t);
    if (cfg.lightning)  this._drawLightning(ctx, t);
  }

  // ==================== 战士：剑光特效 ====================
  _drawSwordGleam(ctx, t) {
    const W = this.W, H = this.H;
    const sg = this.config.swordGleam;
    
    const sx = sg.line.start[0] * W, sy = sg.line.start[1] * H;
    const ex = sg.line.end[0] * W,   ey = sg.line.end[1] * H;
    const dx = ex - sx, dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    // ---- 遮挡检测函数：给定归一化坐标返回可见度 0(完全遮挡)~1(完全可见) ----
    const getVisibility = (nx, ny) => {
      if (!sg.occlusionZones) return 1;
      let vis = 1;
      for (const oz of sg.occlusionZones) {
        const [ox0, oy0, ox1, oy1] = oz.rect;
        if (nx >= ox0 && nx <= ox1 && ny >= oy0 && ny <= oy1) {
          // 在遮挡区域内部，中心遮挡最强，边缘渐弱
          const cxN = (nx - ox0) / (ox1 - ox0); // 0~1
          const cyN = (ny - oy0) / (oy1 - oy0);
          // 距边缘的最小距离，用于柔化边缘
          const edgeDist = Math.min(cxN, 1 - cxN, cyN, 1 - cyN);
          const edgeFade = Math.min(1, edgeDist / 0.15); // 边缘15%范围内渐变
          vis *= (1 - oz.occlusion * edgeFade);
        }
      }
      return vis;
    };
    
    // ---- 护手停留：变速运动，光斑在dwellZone减速 ----
    // 用累积相位做非线性映射，让光斑在特定区域走得慢
    const rawT = (t * sg.gleamSpeed) % 2; // 0→2 一个完整来回
    const rawPos = rawT < 1 ? rawT : 2 - rawT; // 0→1→0 三角波
    
    // 应用非线性变速：在dwellZone区间内拉伸时间（走得慢）
    let gleamPos = rawPos;
    if (sg.dwellZone) {
      const dz = sg.dwellZone;
      const [dt0, dt1] = dz.tRange;
      const sf = dz.slowFactor; // <1 表示减速
      // 分段线性映射：
      // 原始 [0, dt0] 映射到 [0, dt0*sf]  (正常区间前段)
      // 原始 [dt0, dt1] 映射到 [dt0*sf, dt0*sf + (dt1-dt0)/sf]  (减速区间)  
      // 原始 [dt1, 1] 映射到剩余  (正常区间后段)
      // 简化：用ease函数让光斑在dwell区域减速
      if (rawPos >= dt0 && rawPos <= dt1) {
        // 在护手区域内，压缩运动
        const localT = (rawPos - dt0) / (dt1 - dt0);
        // ease-in-out让进入和离开都平滑
        const eased = localT < 0.5 
          ? 2 * localT * localT 
          : 1 - Math.pow(-2 * localT + 2, 2) / 2;
        gleamPos = dt0 + eased * (dt1 - dt0);
      }
    }
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    // 1) 剑身底色光芒 - 分段绘制，遮挡区域衰减
    const SEGMENTS = 20;
    for (let i = 0; i < SEGMENTS; i++) {
      const f0 = i / SEGMENTS;
      const f1 = (i + 1) / SEGMENTS;
      const px0 = sx + dx * f0, py0 = sy + dy * f0;
      const px1 = sx + dx * f1, py1 = sy + dy * f1;
      const midNx = sg.line.start[0] + (sg.line.end[0] - sg.line.start[0]) * ((f0 + f1) / 2);
      const midNy = sg.line.start[1] + (sg.line.end[1] - sg.line.start[1]) * ((f0 + f1) / 2);
      const vis = getVisibility(midNx, midNy);
      
      if (vis < 0.02) continue; // 完全遮挡的段跳过
      
      const basePulse = (0.15 + 0.1 * Math.sin(t * 1.5)) * vis;
      ctx.strokeStyle = `rgba(${sg.color[0]},${sg.color[1]},${sg.color[2]},${basePulse})`;
      ctx.lineWidth = sg.width * 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px0, py0);
      ctx.lineTo(px1, py1);
      ctx.stroke();
    }
    
    // 2) 流动光斑 - 分段绘制，遮挡衰减
    const gLen = sg.gleamLength;
    const g0 = Math.max(0, gleamPos - gLen / 2);
    const g1 = Math.min(1, gleamPos + gLen / 2);
    
    // 将光斑区间分成小段绘制
    const GLEAM_SEGS = 12;
    for (let i = 0; i < GLEAM_SEGS; i++) {
      const segF0 = g0 + (g1 - g0) * (i / GLEAM_SEGS);
      const segF1 = g0 + (g1 - g0) * ((i + 1) / GLEAM_SEGS);
      const segMid = (segF0 + segF1) / 2;
      
      const segNx = sg.line.start[0] + (sg.line.end[0] - sg.line.start[0]) * segMid;
      const segNy = sg.line.start[1] + (sg.line.end[1] - sg.line.start[1]) * segMid;
      const vis = getVisibility(segNx, segNy);
      
      if (vis < 0.02) continue;
      
      // 光斑在自身范围内的强度分布（中心最亮）
      const localT = (segMid - g0) / (g1 - g0); // 0~1
      const localIntensity = Math.sin(localT * Math.PI); // 中间最亮
      const alpha = sg.gleamIntensity * localIntensity * vis;
      
      const spx0 = sx + dx * segF0, spy0 = sy + dy * segF0;
      const spx1 = sx + dx * segF1, spy1 = sy + dy * segF1;
      
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = sg.width * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(spx0, spy0);
      ctx.lineTo(spx1, spy1);
      ctx.stroke();
    }
    
    // 光斑中心辉光 - 也做遮挡检测
    const gmx_f = (g0 + g1) / 2;
    const gmNx = sg.line.start[0] + (sg.line.end[0] - sg.line.start[0]) * gmx_f;
    const gmNy = sg.line.start[1] + (sg.line.end[1] - sg.line.start[1]) * gmx_f;
    const gmVis = getVisibility(gmNx, gmNy);
    
    if (gmVis > 0.05) {
      const gmx = sx + dx * gmx_f, gmy = sy + dy * gmx_f;
      const glowR = len * 0.06;
      const ggr = ctx.createRadialGradient(gmx, gmy, 0, gmx, gmy, glowR);
      ggr.addColorStop(0, `rgba(${sg.color[0]},${sg.color[1]},${sg.color[2]},${sg.gleamIntensity * 0.35 * gmVis})`);
      ggr.addColorStop(1, `rgba(${sg.color[0]},${sg.color[1]},${sg.color[2]},0)`);
      ctx.fillStyle = ggr;
      ctx.fillRect(gmx - glowR, gmy - glowR, glowR * 2, glowR * 2);
    }
    
    // 3) 剑尖星芒 - 剑尖在头部上方不被遮挡
    const ts = sg.tipStar;
    const tpx = ts.pos[0] * W, tpy = ts.pos[1] * H;
    const tipVis = getVisibility(ts.pos[0], ts.pos[1]);
    
    if (tipVis > 0.1) {
      const starPulse = ts.pulseMin + (1 - ts.pulseMin) * (0.5 + 0.5 * Math.sin(t * ts.speed));
      const starSize = ts.size * Math.max(W, H) * starPulse;
      const tipAlpha = starPulse * 0.8 * tipVis;
      
      // 十字星芒
      ctx.strokeStyle = `rgba(${ts.color[0]},${ts.color[1]},${ts.color[2]},${tipAlpha})`;
      ctx.lineWidth = 1.5;
      const arms = 4;
      for (let i = 0; i < arms; i++) {
        const angle = (i / arms) * Math.PI + t * 0.3;
        ctx.beginPath();
        ctx.moveTo(tpx, tpy);
        ctx.lineTo(tpx + Math.cos(angle) * starSize, tpy + Math.sin(angle) * starSize);
        ctx.stroke();
      }
      // 中心白点
      const cg = ctx.createRadialGradient(tpx, tpy, 0, tpx, tpy, starSize * 0.3);
      cg.addColorStop(0, `rgba(255,255,255,${starPulse * tipVis})`);
      cg.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(tpx, tpy, starSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 4) 偶尔的斩击弧光
    const sa = sg.slashArc;
    const slashCycle = t % sa.interval;
    if (slashCycle < sa.duration) {
      const slashProgress = slashCycle / sa.duration;
      const slashAlpha = slashProgress < 0.3 ? slashProgress / 0.3 : (1 - slashProgress) / 0.7;
      const arcCx = sa.origin[0] * W, arcCy = sa.origin[1] * H;
      const arcR = sa.radius * Math.max(W, H);
      
      ctx.strokeStyle = `rgba(${sa.color[0]},${sa.color[1]},${sa.color[2]},${slashAlpha * 0.7})`;
      ctx.lineWidth = sa.width;
      ctx.lineCap = 'round';
      
      const startAngle = -Math.PI * 0.6 + slashProgress * Math.PI * 0.3;
      const sweepAngle = Math.PI * 0.5 * (1 - slashProgress * 0.5);
      ctx.beginPath();
      ctx.arc(arcCx, arcCy, arcR * (0.6 + slashProgress * 0.4), startAngle, startAngle + sweepAngle);
      ctx.stroke();
      
      // 弧光拖尾
      ctx.strokeStyle = `rgba(255,255,255,${slashAlpha * 0.3})`;
      ctx.lineWidth = sa.width * 2;
      ctx.beginPath();
      ctx.arc(arcCx, arcCy, arcR * (0.6 + slashProgress * 0.4), startAngle + sweepAngle * 0.6, startAngle + sweepAngle);
      ctx.stroke();
    }
    
    ctx.restore();
  }

  // ==================== 法师：法杖魔法光环 ====================
  _drawStaffAura(ctx, t) {
    const W = this.W, H = this.H;
    const sa = this.config.staffAura;
    const maxDim = Math.max(W, H);
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    // 绘制一个光源的旋转光环
    const drawAura = (center, radius, color, isMain) => {
      const cx = center[0] * W, cy = center[1] * H;
      const r = radius * maxDim;
      
      // 旋转魔法环
      const rings = isMain ? sa.rings : 2;
      for (let ri = 0; ri < rings; ri++) {
        const ringR = r * (0.6 + ri * 0.3);
        const rotAngle = t * sa.rotateSpeed * (ri % 2 === 0 ? 1 : -0.7) + ri * Math.PI / 3;
        const ringAlpha = 0.25 - ri * 0.06;
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotAngle);
        
        // 画椭圆虚线环
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${ringAlpha})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 5 + ri * 2]);
        ctx.beginPath();
        ctx.ellipse(0, 0, ringR, ringR * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 环上的亮点 (2-3个)
        const dotCount = 2 + (ri % 2);
        for (let di = 0; di < dotCount; di++) {
          const dotAngle = (di / dotCount) * Math.PI * 2 + t * sa.rotateSpeed * 2;
          const dotX = Math.cos(dotAngle) * ringR;
          const dotY = Math.sin(dotAngle) * ringR * 0.4;
          const dotR = 2 + Math.sin(t * 4 + di) * 1;
          
          const dg = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, dotR * 3);
          dg.addColorStop(0, `rgba(255,255,255,0.8)`);
          dg.addColorStop(0.3, `rgba(${color[0]},${color[1]},${color[2]},0.5)`);
          dg.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
          ctx.fillStyle = dg;
          ctx.fillRect(dotX - dotR * 3, dotY - dotR * 3, dotR * 6, dotR * 6);
        }
        
        ctx.restore();
      }
      
      // 主光源的能量射线
      if (isMain && sa.rays) {
        const rays = sa.rays;
        const rayLen = rays.length * maxDim;
        
        for (let i = 0; i < rays.count; i++) {
          const angle = (i / rays.count) * Math.PI * 2 + t * rays.speed;
          const pulse = 0.3 + 0.7 * Math.pow(Math.sin(t * 2 + i * 1.3), 2);
          const rayAlpha = 0.15 * pulse;
          
          const rx = cx + Math.cos(angle) * rayLen;
          const ry = cy + Math.sin(angle) * rayLen;
          
          const rg = ctx.createLinearGradient(cx, cy, rx, ry);
          rg.addColorStop(0, `rgba(${rays.color[0]},${rays.color[1]},${rays.color[2]},${rayAlpha})`);
          rg.addColorStop(0.6, `rgba(${rays.color[0]},${rays.color[1]},${rays.color[2]},${rayAlpha * 0.3})`);
          rg.addColorStop(1, `rgba(${rays.color[0]},${rays.color[1]},${rays.color[2]},0)`);
          
          ctx.strokeStyle = rg;
          ctx.lineWidth = rays.width;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(rx, ry);
          ctx.stroke();
        }
      }
    };
    
    // 主光源
    drawAura(sa.center, sa.radius, sa.color, true);
    
    // 次要光源
    if (sa.secondary) {
      for (const sec of sa.secondary) {
        drawAura(sec.center, sec.radius, sec.color, false);
      }
    }
    
    ctx.restore();
  }

  // ==================== 萨满：闪电弧线 ====================
  _drawLightning(ctx, t) {
    const W = this.W, H = this.H;
    const lcfg = this.config.lightning;
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    for (const arc of lcfg.arcs) {
      // 闪电每隔一段时间重新生成形状
      const flickerCycle = Math.floor(t * arc.speed);
      
      // 全局闪烁：闪电不是持续可见的，有明灭
      let arcAlpha = arc.intensity;
      if (lcfg.globalFlicker) {
        // 使用确定性伪随机来产生闪烁效果
        const flickPhase = Math.sin(flickerCycle * 7.31 + arc.start[0] * 13);
        arcAlpha *= (flickPhase > -0.3) ? 1.0 : 0.15;
      }
      
      if (arcAlpha < 0.05) continue;
      
      const sx = arc.start[0] * W, sy = arc.start[1] * H;
      const ex = arc.end[0] * W,   ey = arc.end[1] * H;
      
      // 生成锯齿形闪电路径
      const points = [{ x: sx, y: sy }];
      const segs = arc.segments;
      
      // 使用 flickerCycle 作为种子来生成一致的锯齿 
      let seed = flickerCycle * 137 + arc.start[0] * 997;
      const pseudoRand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return (seed / 0x7fffffff) - 0.5; // -0.5 ~ 0.5
      };
      
      for (let i = 1; i < segs; i++) {
        const frac = i / segs;
        const baseX = sx + (ex - sx) * frac;
        const baseY = sy + (ey - sy) * frac;
        // 垂直于连线方向的偏移
        const perpX = -(ey - sy);
        const perpY = (ex - sx);
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
        const jit = pseudoRand() * arc.jitter * Math.max(W, H) * 2;
        points.push({
          x: baseX + (perpX / perpLen) * jit,
          y: baseY + (perpY / perpLen) * jit,
        });
      }
      points.push({ x: ex, y: ey });
      
      // 绘制闪电主体 (双层：外层宽光晕 + 内层细白线)
      // 外层光晕
      ctx.strokeStyle = `rgba(${arc.color[0]},${arc.color[1]},${arc.color[2]},${arcAlpha * 0.4})`;
      ctx.lineWidth = arc.width * 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      
      // 中间层
      ctx.strokeStyle = `rgba(${arc.color[0]},${arc.color[1]},${arc.color[2]},${arcAlpha * 0.7})`;
      ctx.lineWidth = arc.width * 2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      
      // 内层白色核心
      ctx.strokeStyle = `rgba(255,255,255,${arcAlpha * 0.9})`;
      ctx.lineWidth = arc.width * 0.8;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      
      // 节点亮点
      for (let i = 1; i < points.length - 1; i++) {
        if (Math.abs(pseudoRand()) > 0.25) continue; // 随机显示部分节点
        const np = points[i];
        const ng = ctx.createRadialGradient(np.x, np.y, 0, np.x, np.y, arc.width * 4);
        ng.addColorStop(0, `rgba(255,255,255,${arcAlpha * 0.6})`);
        ng.addColorStop(0.5, `rgba(${arc.color[0]},${arc.color[1]},${arc.color[2]},${arcAlpha * 0.3})`);
        ng.addColorStop(1, `rgba(${arc.color[0]},${arc.color[1]},${arc.color[2]},0)`);
        ctx.fillStyle = ng;
        ctx.fillRect(np.x - arc.width * 4, np.y - arc.width * 4, arc.width * 8, arc.width * 8);
      }
    }
    
    ctx.restore();
  }

  _drawParticles(ctx, t, dt) {
    const W = this.W, H = this.H;
    const cfg = this.config.particles;
    const region = cfg.region;
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += dt;
      
      // 不同漂移模式
      if (cfg.drift === 'up') {
        p.y -= p.speed * dt * H * 0.04;
        p.x += Math.sin(t * p.wobbleSpd + p.phase) * p.wobbleAmp * 0.5;
      } else if (cfg.drift === 'float') {
        p.y += Math.sin(t * p.wobbleSpd + p.phase) * p.speed * dt * H * 0.015;
        p.x += Math.cos(t * p.wobbleSpd * 0.7 + p.phase) * p.wobbleAmp * 0.6;
      } else if (cfg.drift === 'spark') {
        const angle = t * p.wobbleSpd + p.phase;
        p.y += Math.sin(angle) * p.speed * dt * H * 0.05;
        p.x += Math.cos(angle * 1.3) * p.speed * dt * W * 0.04;
        p._flicker = Math.random() > 0.88 ? 0.15 : 1;
      }
      
      // 生命周期淡入淡出
      const lifePct = p.life / p.maxLife;
      let alpha = 1;
      if (lifePct < 0.15) alpha = lifePct / 0.15;
      else if (lifePct > 0.65) alpha = (1 - lifePct) / 0.35;
      if (p._flicker) alpha *= p._flicker;
      
      // 超出边界或生命结束 → 重生
      if (p.life > p.maxLife || p.y < region[1] * H - 30 || p.y > region[3] * H + 30 ||
          p.x < region[0] * W - 30 || p.x > region[2] * W + 30) {
        this.particles[i] = this._createParticle(false);
        continue;
      }
      
      if (alpha <= 0.01) continue;
      
      const [cr, cg, cb, ca] = p.color;
      const finalAlpha = Math.max(0, Math.min(1, alpha * (ca || 0.6)));
      const size = p.size * (0.7 + 0.3 * Math.sin(t * 3 + p.phase));
      
      // 发光粒子外层
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${finalAlpha})`);
      grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},${finalAlpha * 0.4})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - size * 3, p.y - size * 3, size * 6, size * 6);
      
      // 白色核心
      ctx.fillStyle = `rgba(255,255,255,${finalAlpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
}

// ==================== 全局管理 ====================
window.HeroLive2D = HeroLive2D;

window.createHeroLive2D = function(container, heroId) {
  // 销毁旧实例
  if (window._heroLive2D) {
    window._heroLive2D.destroy();
    window._heroLive2D = null;
  }
  
  const imgPath = 'assets/heroes/' + heroId + '.png';
  window._heroLive2D = new HeroLive2D(container, heroId, imgPath);
  return window._heroLive2D;
};

})();
