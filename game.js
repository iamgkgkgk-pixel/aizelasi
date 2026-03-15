// 使用全局THREE（通过script标签加载）和全局DATA/SYS
(function(){
const {ALL_HEROES,CHAPTERS,SKILL_DB,SKILL_COMBOS,RARITY_NAME,RARITY_COLOR,EQUIPMENT_DB,SIGNIN_REWARDS,NUM,
  HERO_LEVEL,HERO_STAR,STUCK_GUIDE,
  BUFF_DB,BUFF_MIN_PER_PANEL,BUFF_MAX_PER_PANEL,
  calcXpNeed,calcSkillDmg,calcSkillCd,calcEnemyStats,calcBossStats,rollCrit,calcFinalDmg,isEliteSpawn,
  calcHeroXpNeed,calcHeroLevelBonus} = window.DATA;
const SYS = window.SYS;
const SFX = window.SFX || {}; // 音效引擎

// 标记模块已加载
window._gameLoaded=true;
if(window._loadTimer)clearTimeout(window._loadTimer);

// ==================== 加载进度 ====================
const _loadTips=['💡 不同英雄拥有独特的标志技能和技能偏好','⚔️ 战士的旋风斩能在身周持续割草','🔥 法师偏好火系技能，容易组成燃烧流',
  '❄️ 死骑的凛冬将至可以冻结大范围敌人','🛡️ 天赋树可以永久强化你的英雄属性','⭐ 收集碎片可以为英雄升星，大幅提升属性',
  '🏹 猎人的多重射击会自动追踪周围所有敌人','💜 牧师的暗言术可以标记敌人并回复生命'];
let _tipIdx=0;
setInterval(()=>{const el=document.getElementById('loading-tip');if(el){_tipIdx=(_tipIdx+1)%_loadTips.length;el.style.opacity='0';setTimeout(()=>{el.textContent=_loadTips[_tipIdx];el.style.opacity='1'},300)}},3500);
function setLoadProgress(pct,text){
  const bar=document.getElementById('loading-bar-fill');
  const txt=document.getElementById('loading-text');
  if(bar)bar.style.width=pct+'%';
  if(txt)txt.textContent=text||'';
}
setLoadProgress(20,'初始化游戏引擎...');

// ==================== 玩家数据 ====================
let PD=SYS.loadSave()||SYS.createDefaultPD();
// 旧存档兼容性迁移
if(!PD.talents)PD.talents={war:[],def:[],util:[]};
if(!PD.equipEnhance)PD.equipEnhance={};
if(PD.totalFrags===undefined)PD.totalFrags=0;
if(PD.consecutiveFails===undefined)PD.consecutiveFails=0;
if(PD.lastFailChapter===undefined)PD.lastFailChapter='';
// 迁移英雄数据：确保每个英雄有level/xp/star字段
Object.keys(PD.heroes).forEach(k=>{
  const h=PD.heroes[k];
  if(h.level===undefined)h.level=1;
  if(h.xp===undefined)h.xp=0;
  if(h.star===undefined)h.star=0;
});
function save(){SYS.saveToDisk(PD)}
setLoadProgress(30,'加载存档数据...');

// ==================== 战斗状态 ====================
let gameActive=false,gamePaused=false,gameTime=0;
const S={hp:100,maxHp:100,xp:0,xpNeed:10,level:1,kills:0,gold:0,wave:1,waveT:0,waveDur:25,speed:4.5,attack:10,
  critRate:0.05,critDmg:2.0,armor:0,
  skills:[],enemies:[],projectiles:[],particles:[],pickups:[],
  boss:null,bossActive:false,bossPhase:0,moveDir:new THREE.Vector2(),killStreak:0,ksTimer:0,
  chapter:null,bossKillsThisGame:0,revived:false,comboSkills:[],eliteKills:0,
  // 被动系统状态
  passiveTimers:{},passiveStacks:{},
  // 装备特效状态
  equipEffects:{},atkHitCount:0,
  // 燃烧DOT列表
  dots:[]};
const keys={},skillTimers={};
let baseAtkTimer=0,spawnTimer=0;

// ==================== 性能检测与自适应 ====================
setLoadProgress(40,'初始化3D渲染...');
const isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||('ontouchstart' in window&&innerWidth<1024);
const perfTier=isMobile?(navigator.hardwareConcurrency>=6?'mid':'low'):'high';
const VFX={
  pixelRatio:perfTier==='low'?Math.min(devicePixelRatio,1):Math.min(devicePixelRatio,2),
  bloomEnabled:perfTier!=='low',
  bloomRes:perfTier==='high'?0.5:0.25,
  bloomStrength:perfTier==='high'?0.8:0.6,
  bloomRadius:0.4,bloomThreshold:0.3,
  maxParticles:perfTier==='high'?500:perfTier==='mid'?250:120,
  maxLights:perfTier==='high'?8:perfTier==='mid'?4:2,
  shadowRes:perfTier==='high'?1024:512,
  gpuParticleCount:perfTier==='high'?2000:perfTier==='mid'?800:300,
  trailDensity:perfTier==='high'?1:perfTier==='mid'?0.6:0.3,
};

// ==================== Three.js ====================
const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a2a1a);scene.fog=new THREE.Fog(0x1a2a1a,30,55);
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,0.1,100);camera.position.set(0,22,16);camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer({antialias:perfTier!=='low',alpha:false,powerPreference:isMobile?'low-power':'high-performance'});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(VFX.pixelRatio);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=perfTier==='low'?THREE.BasicShadowMap:THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;touch-action:none';
document.getElementById('game-screen').appendChild(renderer.domElement);

// ==================== 角色立绘贴图预加载 ====================
const HERO_TEXTURES={};
const BOSS_TEXTURES={};
const _texLoader=new THREE.TextureLoader();
const _heroTexFiles={warrior:'warrior.png',mage:'mage.png',hunter:'hunter.png',priest:'priest.png',
  rogue:'rogue.png',shaman:'shaman.png',deathknight:'deathknight.png',druid:'druid.png',
  warlock:'warlock.png',paladin:'paladin.png'};
const _bossTexFiles={'霍格':'hogger.png','范克里夫':'vancleef.png','血领主曼多基尔':'mandokir.png',
  '拉格纳罗斯':'ragnaros.png','克尔苏加德之影':'kelthuzad.png','阿克蒙德':'archimonde.png',
  '巫妖王':'lichking.png','虚空领主':'voidlord.png'};
let _texLoadCount=0,_texTotal=0;
function preloadTextures(){
  _texTotal=Object.keys(_heroTexFiles).length+Object.keys(_bossTexFiles).length;
  _texLoadCount=0;
  const onLoad=()=>{_texLoadCount++;setLoadProgress(40+Math.floor(_texLoadCount/_texTotal*15),'加载角色立绘('+_texLoadCount+'/'+_texTotal+')...')};
  const onError=(url)=>()=>{_texLoadCount++;console.warn('立绘加载失败:',url)};
  Object.entries(_heroTexFiles).forEach(([id,f])=>{
    _texLoader.load('assets/heroes/'+f,(tex)=>{tex.colorSpace=THREE.SRGBColorSpace;HERO_TEXTURES[id]=tex;onLoad()},undefined,onError(f))});
  Object.entries(_bossTexFiles).forEach(([name,f])=>{
    _texLoader.load('assets/bosses/'+f,(tex)=>{tex.colorSpace=THREE.SRGBColorSpace;BOSS_TEXTURES[name]=tex;onLoad()},undefined,onError(f))});
}
preloadTextures();

// ==================== 程序化纹理生成（Canvas，零外部资源） ====================
function makeCanvasTex(sz,drawFn){
  const c=document.createElement('canvas');c.width=c.height=sz;const ctx=c.getContext('2d');
  drawFn(ctx,sz);const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}
// 径向渐变光晕（通用辉光粒子）
const glowTex=makeCanvasTex(64,(ctx,s)=>{
  const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.15,'rgba(255,255,255,0.8)');
  g.addColorStop(0.4,'rgba(255,200,100,0.3)');g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,s,s);
});
// 火焰/烟雾纹理
const flameTex=makeCanvasTex(64,(ctx,s)=>{
  const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(255,255,200,1)');g.addColorStop(0.2,'rgba(255,180,50,0.9)');
  g.addColorStop(0.5,'rgba(255,80,20,0.5)');g.addColorStop(0.8,'rgba(120,20,0,0.15)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,s,s);
});
const smokeTex=makeCanvasTex(64,(ctx,s)=>{
  const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(80,80,80,0.6)');g.addColorStop(0.5,'rgba(50,50,50,0.3)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,s,s);
});
// 电弧纹理
const sparkTex=makeCanvasTex(32,(ctx,s)=>{
  const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(200,230,255,1)');g.addColorStop(0.3,'rgba(100,180,255,0.7)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,s,s);
});
// 冰晶纹理
const iceTex=makeCanvasTex(32,(ctx,s)=>{
  const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(200,240,255,1)');g.addColorStop(0.4,'rgba(100,200,255,0.6)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,s,s);
});

// ==================== 轻量Bloom后处理（自写，不依赖addon） ====================
let bloomComposer=null;
if(VFX.bloomEnabled){
  // 创建低分辨率bloom RT
  const bw=Math.floor(innerWidth*VFX.bloomRes);
  const bh=Math.floor(innerHeight*VFX.bloomRes);
  const bloomRT1=new THREE.WebGLRenderTarget(bw,bh,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat});
  const bloomRT2=new THREE.WebGLRenderTarget(bw,bh,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat});
  const mainRT=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat});
  // 亮度提取着色器
  const brightPassMat=new THREE.ShaderMaterial({
    uniforms:{tDiffuse:{value:null},threshold:{value:VFX.bloomThreshold}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform sampler2D tDiffuse;uniform float threshold;varying vec2 vUv;
      void main(){vec4 c=texture2D(tDiffuse,vUv);float br=dot(c.rgb,vec3(0.2126,0.7152,0.0722));
      gl_FragColor=br>threshold?vec4(c.rgb*(br-threshold)/br,c.a):vec4(0.0);}`
  });
  // 高斯模糊着色器（两pass：水平+垂直）
  const blurMat=new THREE.ShaderMaterial({
    uniforms:{tDiffuse:{value:null},direction:{value:new THREE.Vector2(1,0)},resolution:{value:new THREE.Vector2(bw,bh)}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform sampler2D tDiffuse;uniform vec2 direction;uniform vec2 resolution;varying vec2 vUv;
      void main(){vec2 px=direction/resolution;vec4 c=vec4(0.0);
      c+=texture2D(tDiffuse,vUv-4.0*px)*0.051;c+=texture2D(tDiffuse,vUv-3.0*px)*0.0918;
      c+=texture2D(tDiffuse,vUv-2.0*px)*0.12245;c+=texture2D(tDiffuse,vUv-1.0*px)*0.1531;
      c+=texture2D(tDiffuse,vUv)*0.1633;
      c+=texture2D(tDiffuse,vUv+1.0*px)*0.1531;c+=texture2D(tDiffuse,vUv+2.0*px)*0.12245;
      c+=texture2D(tDiffuse,vUv+3.0*px)*0.0918;c+=texture2D(tDiffuse,vUv+4.0*px)*0.051;
      gl_FragColor=c;}`
  });
  // 合成着色器（原图+bloom）
  const combineMat=new THREE.ShaderMaterial({
    uniforms:{tBase:{value:null},tBloom:{value:null},strength:{value:VFX.bloomStrength}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform sampler2D tBase;uniform sampler2D tBloom;uniform float strength;varying vec2 vUv;
      void main(){vec4 base=texture2D(tBase,vUv);vec4 bloom=texture2D(tBloom,vUv);
      gl_FragColor=base+bloom*strength;gl_FragColor.a=1.0;}`
  });
  const fsQuadGeo=new THREE.PlaneGeometry(2,2);
  const fsScene=new THREE.Scene();const fsCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const fsMesh=new THREE.Mesh(fsQuadGeo,brightPassMat);fsScene.add(fsMesh);
  bloomComposer={mainRT,bloomRT1,bloomRT2,brightPassMat,blurMat,combineMat,fsScene,fsCamera,fsMesh,
    render:function(){
      // 1: 渲染场景到mainRT
      renderer.setRenderTarget(this.mainRT);renderer.render(scene,camera);
      // 2: 亮度提取 → bloomRT1
      this.fsMesh.material=this.brightPassMat;this.brightPassMat.uniforms.tDiffuse.value=this.mainRT.texture;
      renderer.setRenderTarget(this.bloomRT1);renderer.render(this.fsScene,this.fsCamera);
      // 3: 水平模糊 → bloomRT2
      this.fsMesh.material=this.blurMat;this.blurMat.uniforms.tDiffuse.value=this.bloomRT1.texture;
      this.blurMat.uniforms.direction.value.set(1,0);
      renderer.setRenderTarget(this.bloomRT2);renderer.render(this.fsScene,this.fsCamera);
      // 4: 垂直模糊 → bloomRT1
      this.blurMat.uniforms.tDiffuse.value=this.bloomRT2.texture;
      this.blurMat.uniforms.direction.value.set(0,1);
      renderer.setRenderTarget(this.bloomRT1);renderer.render(this.fsScene,this.fsCamera);
      // 5: 合成到屏幕
      this.fsMesh.material=this.combineMat;this.combineMat.uniforms.tBase.value=this.mainRT.texture;
      this.combineMat.uniforms.tBloom.value=this.bloomRT1.texture;
      renderer.setRenderTarget(null);renderer.render(this.fsScene,this.fsCamera);
    },
    resize:function(w,h){
      this.mainRT.setSize(w,h);
      const bw=Math.floor(w*VFX.bloomRes),bh=Math.floor(h*VFX.bloomRes);
      this.bloomRT1.setSize(bw,bh);this.bloomRT2.setSize(bw,bh);
      this.blurMat.uniforms.resolution.value.set(bw,bh);
    }
  };
}

// ==================== 动态光源池（复用有限灯光，避免创建/销毁） ====================
const lightPool=[];
for(let i=0;i<VFX.maxLights;i++){
  const l=new THREE.PointLight(0xffffff,0,15);l.visible=false;scene.add(l);
  lightPool.push({light:l,life:0,maxLife:0});
}
function addDynLight(pos,color,intensity=2,range=12,dur=.3){
  // 找一个空闲或最老的灯
  let best=lightPool[0],minLife=Infinity;
  for(const lp of lightPool){if(lp.life<=0){best=lp;break;}if(lp.life<minLife){minLife=lp.life;best=lp;}}
  best.light.position.set(pos.x,pos.y||2,pos.z);best.light.color.setHex(color);
  best.light.intensity=intensity;best.light.distance=range;best.light.visible=true;
  best.life=dur;best.maxLife=dur;best.baseIntensity=intensity;
}
function updateDynLights(dt){
  for(const lp of lightPool){
    if(lp.life>0){lp.life-=dt;const r=Math.max(0,lp.life/lp.maxLife);lp.light.intensity=lp.baseIntensity*r;
    if(lp.life<=0){lp.light.visible=false;}}
  }
}

// ==================== GPU粒子系统（Points+BufferGeometry，一次绘制几百粒子） ====================
const GPU_P_MAX=VFX.gpuParticleCount;
const gpuPGeo=new THREE.BufferGeometry();
const gpuPPositions=new Float32Array(GPU_P_MAX*3);
const gpuPColors=new Float32Array(GPU_P_MAX*4);
const gpuPSizes=new Float32Array(GPU_P_MAX);
gpuPGeo.setAttribute('position',new THREE.BufferAttribute(gpuPPositions,3));
gpuPGeo.setAttribute('color',new THREE.BufferAttribute(gpuPColors,4));
gpuPGeo.setAttribute('size',new THREE.BufferAttribute(gpuPSizes,1));
const gpuPMat=new THREE.ShaderMaterial({
  uniforms:{tex:{value:glowTex},time:{value:0}},
  vertexShader:`
    attribute float size;attribute vec4 color;varying vec4 vColor;varying float vLife;
    void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.0);
    gl_PointSize=size*(300.0/(-mv.z));gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`
    uniform sampler2D tex;varying vec4 vColor;
    void main(){vec4 t=texture2D(tex,gl_PointCoord);gl_FragColor=vec4(vColor.rgb,vColor.a*t.a);
    if(gl_FragColor.a<0.01)discard;}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
});
const gpuPMesh=new THREE.Points(gpuPGeo,gpuPMat);gpuPMesh.frustumCulled=false;scene.add(gpuPMesh);
// GPU粒子数据
const gpuParticles=[];let gpuPIdx=0;
function emitGpuP(pos,color,vel,size=3,life=.5,opts={}){
  if(gpuParticles.length>=GPU_P_MAX)return;
  gpuParticles.push({x:pos.x,y:pos.y||1,z:pos.z,vx:vel.x||0,vy:vel.y||0,vz:vel.z||0,
    r:((color>>16)&255)/255,g:((color>>8)&255)/255,b:(color&255)/255,
    size,life,maxLife:life,gravity:opts.gravity!==undefined?opts.gravity:8,
    shrink:opts.shrink!==undefined?opts.shrink:true,
    fadeStyle:opts.fadeStyle||'linear'});
}
function emitGpuBurst(pos,color,count,speed=5,size=3,life=.5,opts={}){
  const n=Math.floor(count*VFX.trailDensity);
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,el=(Math.random()-.5)*Math.PI;
    const sp=speed*(.5+Math.random());
    const vx=Math.cos(a)*Math.cos(el)*sp,vy=Math.sin(el)*sp+speed*.3,vz=Math.sin(a)*Math.cos(el)*sp;
    emitGpuP(pos,color,{x:vx,y:vy,z:vz},size*(.5+Math.random()),life*(.6+Math.random()*.8),opts);
  }
}
function updateGpuParticles(dt){
  for(let i=gpuParticles.length-1;i>=0;i--){
    const p=gpuParticles[i];p.life-=dt;
    if(p.life<=0){gpuParticles.splice(i,1);continue;}
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    p.vy-=p.gravity*dt;
  }
  // 写入缓冲区
  const len=gpuParticles.length;
  for(let i=0;i<len;i++){
    const p=gpuParticles[i];const r=Math.max(0,p.life/p.maxLife);
    const i3=i*3,i4=i*4;
    gpuPPositions[i3]=p.x;gpuPPositions[i3+1]=p.y;gpuPPositions[i3+2]=p.z;
    gpuPColors[i4]=p.r;gpuPColors[i4+1]=p.g;gpuPColors[i4+2]=p.b;
    gpuPColors[i4+3]=p.fadeStyle==='flash'?r*r:r;
    gpuPSizes[i]=p.shrink?p.size*(.3+r*.7):p.size;
  }
  // 清空未使用的
  for(let i=len;i<GPU_P_MAX;i++){gpuPSizes[i]=0;gpuPColors[i*4+3]=0;}
  gpuPGeo.attributes.position.needsUpdate=true;
  gpuPGeo.attributes.color.needsUpdate=true;
  gpuPGeo.attributes.size.needsUpdate=true;
}

// ==================== 着色器材质工厂 ====================
// 火焰着色器材质（程序化噪声扰动）
function makeFireShaderMat(color1=0xff6600,color2=0xff2200,opts={}){
  const c1=new THREE.Color(color1),c2=new THREE.Color(color2);
  return new THREE.ShaderMaterial({
    uniforms:{time:{value:0},color1:{value:c1},color2:{value:c2},opacity:{value:opts.opacity||0.7}},
    vertexShader:`varying vec2 vUv;varying vec3 vPos;void main(){vUv=uv;vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      uniform float time;uniform vec3 color1;uniform vec3 color2;uniform float opacity;
      varying vec2 vUv;varying vec3 vPos;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
      void main(){
        float n=fbm(vUv*3.0+vec2(0.0,-time*2.0));
        float flame=smoothstep(0.0,0.8,1.0-vUv.y+n*0.4);
        vec3 col=mix(color2,color1,flame);
        float a=flame*opacity*smoothstep(0.0,0.1,vUv.y);
        gl_FragColor=vec4(col*1.5,a);
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending
  });
}
// 能量光柱着色器
function makeBeamShaderMat(color=0xff00ff,opts={}){
  const c=new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms:{time:{value:0},baseColor:{value:c},opacity:{value:opts.opacity||0.4}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform float time;uniform vec3 baseColor;uniform float opacity;varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        float n=noise(vec2(vUv.x*8.0,vUv.y*2.0-time*3.0));
        float edge=smoothstep(0.0,0.3,vUv.x)*smoothstep(1.0,0.7,vUv.x);
        float pulse=0.8+0.2*sin(time*6.0+vUv.y*10.0);
        float a=edge*(0.3+n*0.4)*opacity*pulse;
        vec3 col=baseColor*(1.0+n*0.5);
        gl_FragColor=vec4(col,a);
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending
  });
}
// 冲击波着色器
function makeShockwaveShaderMat(color=0xffffff){
  const c=new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms:{time:{value:0},baseColor:{value:c},progress:{value:0},opacity:{value:0.6}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform vec3 baseColor;uniform float progress;uniform float opacity;varying vec2 vUv;
      void main(){
        vec2 c=vUv-0.5;float d=length(c)*2.0;
        float ring=smoothstep(0.8,0.95,d)*smoothstep(1.0,0.95,d);
        float a=ring*opacity*(1.0-progress);
        gl_FragColor=vec4(baseColor*(1.0+ring*0.5),a);
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending
  });
}

// ==================== 光照 ====================
const amb=new THREE.AmbientLight(0x404060,0.6);scene.add(amb);
const dirLight=new THREE.DirectionalLight(0xffeedd,1.0);dirLight.position.set(10,20,10);dirLight.castShadow=true;
dirLight.shadow.mapSize.set(VFX.shadowRes,VFX.shadowRes);dirLight.shadow.camera.near=1;dirLight.shadow.camera.far=50;
dirLight.shadow.camera.left=-25;dirLight.shadow.camera.right=25;dirLight.shadow.camera.top=25;dirLight.shadow.camera.bottom=-25;
scene.add(dirLight);scene.add(dirLight.target);
const ptLight=new THREE.PointLight(0xff8844,0.3,30);ptLight.position.set(0,5,0);scene.add(ptLight);
// 半球光增加环境品质
const hemiLight=new THREE.HemisphereLight(0x446688,0x222211,0.3);scene.add(hemiLight);
setLoadProgress(60,'加载游戏资源...');

// ==================== 程序化地面纹理 ====================
function makeGroundTex(baseColor,variant){
  // 程序化生成地面纹理 - 颜色噪点+细节变化
  const sz=256;const c=document.createElement('canvas');c.width=c.height=sz;const ctx=c.getContext('2d');
  const r=(baseColor>>16)&255,g2=(baseColor>>8)&255,b=baseColor&255;
  // 填充基色
  ctx.fillStyle=`rgb(${r},${g2},${b})`;ctx.fillRect(0,0,sz,sz);
  // 像素噪点层
  const img=ctx.getImageData(0,0,sz,sz);const d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-.5)*30;const n2=(Math.random()-.5)*10;
    d[i]=Math.max(0,Math.min(255,d[i]+n));
    d[i+1]=Math.max(0,Math.min(255,d[i+1]+n+n2));
    d[i+2]=Math.max(0,Math.min(255,d[i+2]+n-n2));
  }
  ctx.putImageData(img,0,0);
  // 模拟细节纹理（草地斑块/泥土裂纹/石面纹理）
  if(variant==='grass'||variant==='forest'){
    ctx.globalAlpha=.15;
    for(let i=0;i<400;i++){
      const x=Math.random()*sz,y=Math.random()*sz;
      ctx.strokeStyle=`hsl(${100+Math.random()*40},${50+Math.random()*30}%,${20+Math.random()*20}%)`;
      ctx.lineWidth=.5+Math.random();
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(Math.random()-.5)*6,y-3-Math.random()*5);ctx.stroke();
    }
  }else if(variant==='sand'||variant==='desert'){
    ctx.globalAlpha=.1;
    for(let i=0;i<80;i++){
      ctx.beginPath();const cx=Math.random()*sz,cy=Math.random()*sz;
      ctx.arc(cx,cy,2+Math.random()*8,0,Math.PI*2);
      ctx.fillStyle=`rgba(${r+20},${g2+15},${b},0.15)`;ctx.fill();
    }
  }else if(variant==='stone'||variant==='volcanic'){
    ctx.globalAlpha=.12;
    for(let i=0;i<50;i++){
      ctx.beginPath();const cx=Math.random()*sz,cy=Math.random()*sz;
      ctx.moveTo(cx,cy);
      for(let j=0;j<4;j++)ctx.lineTo(cx+(Math.random()-.5)*20,cy+(Math.random()-.5)*20);
      ctx.strokeStyle=`rgba(0,0,0,.2)`;ctx.lineWidth=.5;ctx.stroke();
    }
  }else if(variant==='ice'||variant==='frost'){
    ctx.globalAlpha=.08;
    for(let i=0;i<60;i++){
      const cx=Math.random()*sz,cy=Math.random()*sz;
      ctx.beginPath();ctx.arc(cx,cy,1+Math.random()*4,0,Math.PI*2);
      ctx.fillStyle=`rgba(200,230,255,0.3)`;ctx.fill();
    }
  }
  ctx.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,8);t.needsUpdate=true;return t;
}
function makeGroundNormalTex(){
  // 简易法线贴图 - 增加地面凹凸感
  const sz=128;const c=document.createElement('canvas');c.width=c.height=sz;const ctx=c.getContext('2d');
  ctx.fillStyle='rgb(128,128,255)';ctx.fillRect(0,0,sz,sz);
  const img=ctx.getImageData(0,0,sz,sz);const d=img.data;
  for(let i=0;i<d.length;i+=4){
    d[i]=128+(Math.random()-.5)*30;   // R = X normal
    d[i+1]=128+(Math.random()-.5)*30; // G = Y normal
    d[i+2]=220+Math.random()*35;       // B = Z normal (mostly up)
  }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,8);t.needsUpdate=true;return t;
}

// ==================== 地面 ====================
const _groundVariants={ch1:'grass',ch2:'sand',ch3:'forest',ch4:'volcanic',ch5:'stone',ch6:'volcanic',ch7:'ice',endless:'stone'};
function createGround(chId){
  const ch=CHAPTERS[chId||'ch1'];
  scene.background=new THREE.Color(ch.bgColor);scene.fog=new THREE.Fog(ch.bgColor,30,55);
  const colors={ch1:0x2d5a27,ch2:0x5a4a27,ch3:0x1a4a1a,ch4:0x4a2a1a,ch5:0x2a2a3a,ch6:0x3a1a0a,ch7:0x2a3a4a,endless:0x1a1a2a};
  const baseC=colors[chId]||0x2d5a27;
  const variant=_groundVariants[chId]||'grass';
  // 程序化纹理地面
  const groundTex=makeGroundTex(baseC,variant);
  const groundNorm=makeGroundNormalTex();
  const g=new THREE.PlaneGeometry(80,80,32,32);const p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setZ(i,(Math.random()-.3)*.25); // 更丰富的地形起伏
  g.computeVertexNormals();
  const gMat=new THREE.MeshStandardMaterial({
    map:groundTex,normalMap:groundNorm,normalScale:new THREE.Vector2(.3,.3),
    color:baseC,roughness:.85,metalness:.02
  });
  const mesh=new THREE.Mesh(g,gMat);mesh.rotation.x=-Math.PI/2;mesh.receiveShadow=true;scene.add(mesh);
  // 树木（更多层次感）
  const treeCount=perfTier==='low'?15:30;
  for(let i=0;i<treeCount;i++){const t=mkTree(variant);const a=Math.random()*Math.PI*2,d=18+Math.random()*18;t.position.set(Math.cos(a)*d,0,Math.sin(a)*d);scene.add(t)}
  // 石头
  const rockCount=perfTier==='low'?8:16;
  for(let i=0;i<rockCount;i++){const r=mkRock(variant);const a=Math.random()*Math.PI*2,d=8+Math.random()*22;r.position.set(Math.cos(a)*d,0,Math.sin(a)*d);scene.add(r)}
  // 地面装饰物：小碎石/杂草簇
  if(perfTier!=='low'){
    const decoCount=perfTier==='high'?40:20;
    for(let i=0;i<decoCount;i++){
      const a=Math.random()*Math.PI*2,d=3+Math.random()*30;
      const x=Math.cos(a)*d,z=Math.sin(a)*d;
      if(Math.random()<.6){
        // 小杂草簇
        const grassG=new THREE.Group();
        const gc=variant==='ice'?0x4a6a5a:variant==='volcanic'?0x3a2a1a:0x2a6a1a+(Math.floor(Math.random()*0x002200));
        for(let j=0;j<3;j++){
          const blade=new THREE.Mesh(new THREE.PlaneGeometry(.08,.3+Math.random()*.2),
            new THREE.MeshStandardMaterial({color:gc,side:THREE.DoubleSide,transparent:true,opacity:.8}));
          blade.position.set((Math.random()-.5)*.15,.15+(Math.random()*.05),0);
          blade.rotation.y=Math.random()*Math.PI;blade.rotation.z=(Math.random()-.5)*.3;
          grassG.add(blade);
        }
        grassG.position.set(x,0,z);scene.add(grassG);
      }else{
        // 小碎石
        const pebble=new THREE.Mesh(
          new THREE.SphereGeometry(.08+Math.random()*.12,4,4),
          new THREE.MeshStandardMaterial({color:0x555555+Math.floor(Math.random()*0x222222),roughness:.95})
        );
        pebble.position.set(x,.04,z);pebble.scale.set(1,.4+Math.random()*.3,1);scene.add(pebble);
      }
    }
  }
  // 初始化环境粒子系统
  initAmbientParticles(chId);
}
function mkTree(variant){const g=new THREE.Group();
  const isIce=variant==='ice'||variant==='frost';
  const isVolcanic=variant==='volcanic';
  const trunkC=isVolcanic?0x3a2a1a:0x5a3a1a;
  const leafC=isIce?0x4488aa:isVolcanic?0x2a4a1a:0x1a6a1a+Math.floor(Math.random()*0x002200);
  // 树干 - 多段更自然
  const t=new THREE.Mesh(new THREE.CylinderGeometry(.12,.28,2.2,6),new THREE.MeshStandardMaterial({color:trunkC,roughness:.95}));
  t.position.y=1.1;t.castShadow=true;g.add(t);
  // 主树冠
  const l=new THREE.Mesh(new THREE.ConeGeometry(1.3,2.8,7),new THREE.MeshStandardMaterial({color:leafC,roughness:.85}));
  l.position.y=2.9;l.castShadow=true;g.add(l);
  // 第二层较小树冠（更立体）
  const l2=new THREE.Mesh(new THREE.ConeGeometry(.8,1.8,6),new THREE.MeshStandardMaterial({color:new THREE.Color(leafC).multiplyScalar(1.15).getHex(),roughness:.85}));
  l2.position.y=3.8;l2.castShadow=true;g.add(l2);
  // 冰霜树：挂冰晶
  if(isIce&&Math.random()<.5){
    const ice=new THREE.Mesh(new THREE.OctahedronGeometry(.15,0),
      new THREE.MeshStandardMaterial({color:0xaaddff,transparent:true,opacity:.6,metalness:.3,roughness:.2}));
    ice.position.set((Math.random()-.5)*.8,2+Math.random(),Math.random()*.5);g.add(ice);
  }
  // 火山树：枯萎暗色
  if(isVolcanic&&Math.random()<.3){
    l.material=new THREE.MeshStandardMaterial({color:0x4a3a1a,roughness:.9});
    l2.visible=false;
  }
  g.scale.setScalar(.6+Math.random()*.9);return g}
function mkRock(variant){
  const isVolcanic=variant==='volcanic';const isIce=variant==='ice';
  const baseC=isVolcanic?0x443322:isIce?0x7799aa:0x666666;
  const g=new THREE.Group();
  // 主石体
  const m=new THREE.Mesh(new THREE.DodecahedronGeometry(.5+Math.random()*.5,0),
    new THREE.MeshStandardMaterial({color:baseC+Math.floor(Math.random()*0x111111),roughness:.88,metalness:isVolcanic?.08:0}));
  m.position.y=.25;m.rotation.set(Math.random(),Math.random(),Math.random());m.scale.set(1,.5+Math.random()*.3,1);m.castShadow=true;g.add(m);
  // 附属小石块
  if(Math.random()<.5){
    const sm=new THREE.Mesh(new THREE.DodecahedronGeometry(.15+Math.random()*.2,0),
      new THREE.MeshStandardMaterial({color:baseC+0x101010,roughness:.9}));
    sm.position.set(.4+Math.random()*.3,.1,Math.random()*.3);sm.rotation.set(Math.random(),Math.random(),Math.random());
    sm.scale.set(1,.5,1);g.add(sm);
  }
  // 火山岩：发光裂纹效果
  if(isVolcanic&&Math.random()<.4){
    const glow=new THREE.Mesh(new THREE.DodecahedronGeometry(.35,0),
      new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:.12}));
    glow.position.copy(m.position);glow.rotation.copy(m.rotation);g.add(glow);
  }
  // 冰霜岩：结冰效果
  if(isIce&&Math.random()<.4){
    const frost=new THREE.Mesh(new THREE.DodecahedronGeometry(.45,0),
      new THREE.MeshStandardMaterial({color:0xaaddff,transparent:true,opacity:.2,metalness:.4,roughness:.1}));
    frost.position.copy(m.position);frost.scale.copy(m.scale).multiplyScalar(1.1);g.add(frost);
  }
  return g}

// ==================== 环境氛围粒子系统 ====================
let ambientPSystem=null;
const AMB_P_MAX=perfTier==='high'?150:perfTier==='mid'?80:0;
function initAmbientParticles(chId){
  if(AMB_P_MAX===0)return;
  // 根据章节选择不同的氛围粒子
  const configs={
    ch1:{color:0xaaff66,size:2,speed:.3,name:'firefly',emissive:true}, // 森林萤火虫
    ch2:{color:0xddcc88,size:1.5,speed:.5,name:'dust',emissive:false}, // 沙漠尘埃
    ch3:{color:0x88ffaa,size:2.5,speed:.2,name:'firefly',emissive:true}, // 丛林萤火虫
    ch4:{color:0xff6622,size:2,speed:.8,name:'ember',emissive:true}, // 火山余烬
    ch5:{color:0x8866cc,size:1.5,speed:.4,name:'soul',emissive:true}, // 亡灵魂火
    ch6:{color:0xff4400,size:2.5,speed:1,name:'ember',emissive:true}, // 地狱烈焰
    ch7:{color:0xccddff,size:1.5,speed:.6,name:'snow',emissive:false}, // 冰霜雪花
    endless:{color:0x6644aa,size:2,speed:.5,name:'soul',emissive:true} // 虚空能量
  };
  const cfg=configs[chId]||configs.ch1;
  // 创建PointsMaterial
  const tex=cfg.emissive?glowTex:smokeTex;
  const geo=new THREE.BufferGeometry();
  const positions=new Float32Array(AMB_P_MAX*3);
  const velocities=[];
  for(let i=0;i<AMB_P_MAX;i++){
    const i3=i*3;
    positions[i3]=(Math.random()-.5)*60;
    positions[i3+1]=.5+Math.random()*8;
    positions[i3+2]=(Math.random()-.5)*60;
    velocities.push({
      x:(Math.random()-.5)*cfg.speed,
      y:cfg.name==='snow'?-cfg.speed*.8:cfg.name==='ember'?cfg.speed*1.5:(Math.random()-.5)*cfg.speed*.5,
      z:(Math.random()-.5)*cfg.speed,
      phase:Math.random()*Math.PI*2
    });
  }
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const mat=new THREE.PointsMaterial({
    map:tex,size:cfg.size,color:cfg.color,
    transparent:true,opacity:.6,depthWrite:false,
    blending:cfg.emissive?THREE.AdditiveBlending:THREE.NormalBlending,
    sizeAttenuation:true
  });
  const points=new THREE.Points(geo,mat);points.frustumCulled=false;scene.add(points);
  ambientPSystem={points,geo,positions,velocities,cfg,mat};
}
function updateAmbientParticles(dt){
  if(!ambientPSystem)return;
  const{positions,velocities,cfg,geo}=ambientPSystem;
  const t=gameTime;
  for(let i=0;i<AMB_P_MAX;i++){
    const i3=i*3,v=velocities[i];
    // 萤火虫/魂火：正弦曲线飘动
    if(cfg.name==='firefly'||cfg.name==='soul'){
      positions[i3]+=Math.sin(t*1.5+v.phase)*dt*v.x*2;
      positions[i3+1]+=Math.sin(t*2+v.phase*2)*dt*.5;
      positions[i3+2]+=Math.cos(t*1.2+v.phase)*dt*v.z*2;
    }
    // 雪花：缓慢下落+飘动
    else if(cfg.name==='snow'){
      positions[i3]+=Math.sin(t+v.phase)*dt*v.x;
      positions[i3+1]+=v.y*dt;
      positions[i3+2]+=Math.cos(t*.8+v.phase)*dt*v.z;
      if(positions[i3+1]<0){positions[i3+1]=8+Math.random()*4;positions[i3]=(Math.random()-.5)*60;positions[i3+2]=(Math.random()-.5)*60;}
    }
    // 余烬：向上飘动
    else if(cfg.name==='ember'){
      positions[i3]+=(Math.random()-.5)*dt*2;
      positions[i3+1]+=v.y*dt;
      positions[i3+2]+=(Math.random()-.5)*dt*2;
      if(positions[i3+1]>12){positions[i3+1]=.2;positions[i3]=(Math.random()-.5)*60;positions[i3+2]=(Math.random()-.5)*60;}
    }
    // 尘埃：水平漂浮
    else{
      positions[i3]+=v.x*dt;
      positions[i3+1]+=Math.sin(t*0.8+v.phase)*dt*.2;
      positions[i3+2]+=v.z*dt;
    }
    // 边界循环
    if(heroMesh){
      const dx=positions[i3]-heroMesh.position.x,dz=positions[i3+2]-heroMesh.position.z;
      if(Math.abs(dx)>35){positions[i3]=heroMesh.position.x+(Math.random()-.5)*50;}
      if(Math.abs(dz)>35){positions[i3+2]=heroMesh.position.z+(Math.random()-.5)*50;}
    }
  }
  geo.attributes.position.needsUpdate=true;
  // 脉动透明度（萤火虫/魂火）
  if(cfg.name==='firefly'||cfg.name==='soul'){
    ambientPSystem.mat.opacity=.4+Math.sin(t*3)*.2;
  }
}

// ==================== 模型工具函数 ====================
const _m=(c,o={})=>new THREE.MeshStandardMaterial({color:c,metalness:o.m||0,roughness:o.r||.7,...o});
const _b=(c,o={})=>new THREE.MeshBasicMaterial({color:c,...o});
function _p(m,o){if(o.position){m.position.copy(o.position);delete o.position}if(o.rotation){m.rotation.copy(o.rotation);delete o.rotation}if(o.scale){m.scale.copy(o.scale);delete o.scale}return m}

// ==================== 骨骼关节 _body（魔兽Q版比例：方头宽肩粗臂短腿） ====================
// 返回 {torso, head, leftArm, rightArm, leftLeg, rightLeg} 关节引用，存到 g.userData.joints
function _body(g,s,bc,sc,o={}){
  // 躯干 — 宽厚胸膛（魔兽风格粗壮上半身）
  const torso=new THREE.Mesh(new THREE.BoxGeometry(s*.65,s*.5,s*.4),_m(bc,{m:.2}));
  torso.position.y=s*.95;torso.castShadow=true;g.add(torso);

  // 头部pivot（轴心在脖子处）— 方形大头，非球形！
  const headPivot=new THREE.Group();headPivot.position.y=s*1.22;g.add(headPivot);
  // 方形头颅（魔兽标志性的方脸大头）
  const h=new THREE.Mesh(new THREE.BoxGeometry(s*.35,s*.32,s*.3),_m(sc||0xffcc99,{r:.85}));
  h.position.y=s*.2;h.castShadow=true;headPivot.add(h);
  // 下巴（方形大下巴，增强粗犷感）
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(s*.28,s*.08,s*.18),_m(sc||0xffcc99,{r:.85}));
  jaw.position.set(0,s*.04,s*.04);headPivot.add(jaw);
  // 眼睛 — 更深邃有力的眼眶
  const eM=_b(o.ec||0xffcc00);
  const e1=new THREE.Mesh(new THREE.BoxGeometry(s*.08,s*.05,s*.04),eM);e1.position.set(-s*.09,s*.24,s*.155);headPivot.add(e1);
  const e2=e1.clone();e2.position.x=s*.09;headPivot.add(e2);
  // 眉骨（魔兽标志性的浓厚眉骨）
  const browM=_m(o.browC||sc||0xeebb88,{r:.9});
  const br1=new THREE.Mesh(new THREE.BoxGeometry(s*.12,s*.04,s*.06),browM);br1.position.set(-s*.09,s*.29,s*.15);headPivot.add(br1);
  const br2=br1.clone();br2.position.x=s*.09;headPivot.add(br2);

  // 左臂关节 — 粗壮大臂（魔兽角色标志性粗手臂）
  const leftArmPivot=new THREE.Group();leftArmPivot.position.set(-s*.42,s*1.12,0);g.add(leftArmPivot);
  // 上臂（较粗）
  const a1u=new THREE.Mesh(new THREE.BoxGeometry(s*.18,s*.25,s*.16),_m(o.ac||bc,{m:.1}));
  a1u.position.y=-s*.12;a1u.castShadow=true;leftArmPivot.add(a1u);
  // 前臂+手（略细但有拳头感）
  const a1l=new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.25,s*.14),_m(o.ac||bc,{m:.1}));
  a1l.position.y=-s*.35;a1l.castShadow=true;leftArmPivot.add(a1l);
  // 拳头
  const fist1=new THREE.Mesh(new THREE.BoxGeometry(s*.12,s*.1,s*.12),_m(sc||0xffcc99,{r:.85}));
  fist1.position.y=-s*.5;leftArmPivot.add(fist1);

  // 右臂关节
  const rightArmPivot=new THREE.Group();rightArmPivot.position.set(s*.42,s*1.12,0);g.add(rightArmPivot);
  const a2u=new THREE.Mesh(new THREE.BoxGeometry(s*.18,s*.25,s*.16),_m(o.ac||bc,{m:.1}));
  a2u.position.y=-s*.12;a2u.castShadow=true;rightArmPivot.add(a2u);
  const a2l=new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.25,s*.14),_m(o.ac||bc,{m:.1}));
  a2l.position.y=-s*.35;a2l.castShadow=true;rightArmPivot.add(a2l);
  const fist2=new THREE.Mesh(new THREE.BoxGeometry(s*.12,s*.1,s*.12),_m(sc||0xffcc99,{r:.85}));
  fist2.position.y=-s*.5;rightArmPivot.add(fist2);

  // 腰带/胯部连接
  const belt=new THREE.Mesh(new THREE.BoxGeometry(s*.6,s*.08,s*.38),_m(o.beltC||0x555555,{m:.3}));
  belt.position.y=s*.68;g.add(belt);

  // 左腿关节 — 较短的腿（魔兽Q版风格）
  const leftLegPivot=new THREE.Group();leftLegPivot.position.set(-s*.16,s*.62,0);g.add(leftLegPivot);
  const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.18,s*.38,s*.18),_m(o.lc||bc,{m:.1}));
  l1.position.y=-s*.2;l1.castShadow=true;leftLegPivot.add(l1);
  // 靴子
  const boot1=new THREE.Mesh(new THREE.BoxGeometry(s*.2,s*.1,s*.24),_m(o.bootC||0x443322,{m:.2}));
  boot1.position.set(0,-s*.42,s*.02);leftLegPivot.add(boot1);

  // 右腿关节
  const rightLegPivot=new THREE.Group();rightLegPivot.position.set(s*.16,s*.62,0);g.add(rightLegPivot);
  const l2=new THREE.Mesh(new THREE.BoxGeometry(s*.18,s*.38,s*.18),_m(o.lc||bc,{m:.1}));
  l2.position.y=-s*.2;l2.castShadow=true;rightLegPivot.add(l2);
  const boot2=new THREE.Mesh(new THREE.BoxGeometry(s*.2,s*.1,s*.24),_m(o.bootC||0x443322,{m:.2}));
  boot2.position.set(0,-s*.42,s*.02);rightLegPivot.add(boot2);

  // 存储关节引用（用于动画驱动）
  g.userData.joints={
    torso, head:headPivot,
    leftArm:leftArmPivot, rightArm:rightArmPivot,
    leftLeg:leftLegPivot, rightLeg:rightLegPivot
  };
}

// ==================== 角色动画系统（魔兽风格：沉稳有力） ====================
// 动画状态：'idle' | 'walk' | 'attack' | 'cast'
// g.userData.anim = { state, timer, attackType }
function initAnim(g,type){
  g.userData.anim={state:'idle',timer:0,attackTimer:0,attackType:'melee',prevState:'idle',
    castFlash:0, hitFlash:0, walkBob:0};
  // 根据英雄类型决定攻击动画类型
  const ranged=['mage','hunter','priest','warlock'];
  if(ranged.includes(type))g.userData.anim.attackType='cast';
  const hybrid=['shaman','druid'];
  if(hybrid.includes(type))g.userData.anim.attackType='hybrid';
}

function animateHero(g,dt,isMoving,isAttacking){
  if(!g||!g.userData.anim)return;
  const a=g.userData.anim;
  const j=g.userData.joints;
  a.timer+=dt;

  // 受击计时器衰减
  if(a.hitFlash>0)a.hitFlash-=dt;

  // 状态切换 —— 攻击/施法由外部(baseAttack/triggerCastAnim)直接设置attackTimer
  // isAttacking参数作为备用触发（当外部还未设置时）
  if(isAttacking&&a.attackTimer<=0){
    a.prevState=a.state;
    a.state=a.attackType==='cast'?'cast':(a.attackType==='hybrid'?'hybrid':'attack');
    a.attackTimer=0.4;
    a.castFlash=0;
  }
  if(a.attackTimer>0){
    a.attackTimer-=dt;
    if(a.attackTimer<=0)a.state=isMoving?'walk':'idle';
  }else{
    if(a.state!=='attack'&&a.state!=='cast'&&a.state!=='hybrid')
      a.state=isMoving?'walk':'idle';
  }

  if(!j)return; // 没有关节（某些自定义模型）

  const t=a.timer;
  // 动画混合目标角度
  let headRotX=0,headRotY=0,torsoRotX=0,torsoRotY=0,torsoRotZ=0;
  let laRot=0,raRot=0; // 左右臂 X 旋转
  let laRotZ=0,raRotZ=0; // 左右臂 Z 旋转
  let llRot=0,rlRot=0; // 左右腿 X 旋转
  let bodyY=0; // 身体上下浮动
  // 记录 torso 基准Y（_body中 torso.position.y = s*0.95）
  const torsoBaseY=j.torso?j.torso.userData._baseY||0.95:0.95;
  // 首次缓存基准Y
  if(j.torso&&!j.torso.userData._baseY)j.torso.userData._baseY=j.torso.position.y;

  switch(a.state){
    case 'idle':
      // === 待机：有生命感的微妙呼吸循环 ===
      // 呼吸起伏（慢周期，柔和正弦）
      bodyY=Math.sin(t*1.8)*.01;
      // 身体极微的重心偏移（像站岗的战士微微晃动）
      torsoRotY=Math.sin(t*0.7)*.015;
      torsoRotZ=Math.sin(t*0.9+0.5)*.008;
      // 头部微微环顾（保持警觉感）
      headRotY=Math.sin(t*0.5)*.03;
      headRotX=Math.sin(t*0.8+1)*.01;
      // 手臂自然下垂，非常轻微的摆动（重力自然下坠的肌肉微颤）
      laRot=Math.sin(t*1.2)*.012;
      raRot=Math.sin(t*1.2+0.3)*.012;
      // 手臂微微外展（不夹死身体，自然站姿）
      laRotZ=0.05;
      raRotZ=-0.05;
      // 腿完全不动
      llRot=0; rlRot=0;
      break;

    case 'walk':
      // === 行走：沉重有力的魔兽步伐 ===
      {const ws=6.5; // 步频（略慢=更沉重）
      const wa=0.55; // 摆动幅度
      const sinW=Math.sin(t*ws);
      const absSinW=Math.abs(sinW);
      // 双脚落地时的颠簸（双频率，每步一颠）
      const bob=absSinW*.04;
      bodyY=bob-0.015; // 整体微微下沉（重心低=沉重感）
      // 身体前倾（行进姿态，不是直立着走）
      torsoRotX=0.08;
      // 手脚对侧交替（左手前=右脚前）—— 动画基本功
      laRot=sinW*wa;
      raRot=-sinW*wa;
      // 手臂 Z 轴自然外摆（跑步时手臂不是贴着身体的）
      laRotZ=0.08+absSinW*.06;
      raRotZ=-0.08-absSinW*.06;
      // 腿的幅度比手臂略小（短腿大头的Q版比例）
      llRot=-sinW*wa*.6;
      rlRot=sinW*wa*.6;
      // 身体随步伐左右微侧（重心转移）
      torsoRotY=sinW*.06;
      torsoRotZ=-sinW*.04; // 肩部随手臂摆动的反向倾斜
      // 头部稳定（走路时头不乱晃 —— 人类本能的头部稳定机制）
      headRotY=-sinW*.02;
      headRotX=0.03; // 微微低头看路
      }
      break;

    case 'attack':
      // === 近战攻击：三段式挥砍（蓄力→猛劈→回收） ===
      {const dur=0.4;
      const rawP=a.attackTimer>0?1-a.attackTimer/dur:1;
      const p=Math.max(0,Math.min(1,rawP)); // 钳制0~1
      if(p<0.18){
        // 蓄力阶段：右臂高举后拉，身体右转蓄力，重心上移
        const pp=p/0.18;
        const easeIn=pp*pp; // easeIn让蓄力加速
        raRot=-1.8*easeIn; // 右臂大幅后摆（比之前更夸张）
        raRotZ=-0.4*easeIn;
        laRot=0.3*easeIn;  // 左臂前伸保持平衡
        laRotZ=0.15*easeIn;
        torsoRotY=-0.3*easeIn; // 身体右转蓄力
        torsoRotX=-0.08*easeIn; // 微微后仰
        headRotY=-0.12*easeIn;
        bodyY=0.03*easeIn; // 起身蓄力
        llRot=0.1*easeIn; // 左腿微前（稳定重心）
      }else if(p<0.42){
        // 猛劈：右臂全力前砸，身体前压，重心急剧下沉
        const pp=(p-0.18)/0.24;
        const easeOut=1-Math.pow(1-pp,3); // 快起慢落
        raRot=-1.8+3.4*easeOut; // 从后到前大幅挥砍
        raRotZ=-0.4+0.4*easeOut;
        laRot=0.3-0.5*easeOut;
        laRotZ=0.15-0.15*easeOut;
        torsoRotY=-0.3+0.6*easeOut; // 身体猛转跟随
        torsoRotX=-0.08+0.22*easeOut; // 前倾下压
        headRotY=-0.12+0.2*easeOut;
        bodyY=0.03-0.08*easeOut; // 重心急剧下沉（力量感！）
        llRot=0.1-0.1*easeOut;
        rlRot=-0.12*easeOut; // 右脚微退
      }else{
        // 恢复：缓慢归位，带有武器惯性的余韵
        const pp=(p-0.42)/0.58;
        const ease=1-Math.pow(1-pp,2.5); // 较慢的easeOut
        raRot=1.6*(1-ease);
        raRotZ=0;
        laRot=-0.2*(1-ease);
        torsoRotY=0.3*(1-ease);
        torsoRotX=0.14*(1-ease);
        bodyY=-0.05*(1-ease);
        headRotY=0.08*(1-ease);
      }}
      break;

    case 'cast':
      // === 施法：蓄能举臂→前推释放→余波消散 ===
      {const dur=0.4;
      const rawP=a.attackTimer>0?1-a.attackTimer/dur:1;
      const p=Math.max(0,Math.min(1,rawP));
      if(p<0.22){
        // 蓄能：双臂向两侧上方举起，身体上升
        const pp=p/0.22;
        const easeIn=pp*pp;
        laRot=-1.1*easeIn; raRot=-1.1*easeIn;
        laRotZ=0.55*easeIn; raRotZ=-0.55*easeIn;
        headRotX=-0.22*easeIn; // 仰头
        bodyY=0.05*easeIn; // 身体上升（蓄能升起）
        torsoRotX=-0.06*easeIn; // 微后仰
      }else if(p<0.48){
        // 释放：双臂向前猛推，身体前倾
        const pp=(p-0.22)/0.26;
        const easeOut=1-Math.pow(1-pp,3);
        laRot=-1.1+1.8*easeOut; raRot=-1.1+1.8*easeOut;
        laRotZ=0.55*(1-easeOut); raRotZ=-0.55*(1-easeOut);
        headRotX=-0.22+0.38*easeOut;
        bodyY=0.05-0.05*easeOut;
        torsoRotX=-0.06+0.18*easeOut; // 前倾释放
        a.castFlash=1-pp;
      }else{
        // 余波消散：缓慢归位
        const pp=(p-0.48)/0.52;
        const ease=1-Math.pow(1-pp,2);
        laRot=0.7*(1-ease); raRot=0.7*(1-ease);
        headRotX=0.16*(1-ease);
        bodyY=0;
        torsoRotX=0.12*(1-ease);
      }}
      break;

    case 'hybrid':
      // === 混合攻击(萨满/德鲁伊)：单手前劈+另一手施法 ===
      {const dur=0.4;
      const rawP=a.attackTimer>0?1-a.attackTimer/dur:1;
      const p=Math.max(0,Math.min(1,rawP));
      if(p<0.2){
        // 蓄力：右手举武器，左手蓄能
        const pp=p/0.2;
        const easeIn=pp*pp;
        raRot=-1.2*easeIn; // 右手举武器
        raRotZ=-0.2*easeIn;
        laRot=-0.8*easeIn; // 左手向后蓄能
        laRotZ=0.4*easeIn;
        torsoRotY=-0.15*easeIn;
        bodyY=0.02*easeIn;
        headRotX=-0.1*easeIn;
      }else if(p<0.45){
        // 释放：右手劈砍+左手推出魔法
        const pp=(p-0.2)/0.25;
        const easeOut=1-Math.pow(1-pp,3);
        raRot=-1.2+2.6*easeOut; // 右手劈下
        raRotZ=-0.2+0.2*easeOut;
        laRot=-0.8+1.4*easeOut; // 左手前推施法
        laRotZ=0.4-0.4*easeOut;
        torsoRotY=-0.15+0.35*easeOut;
        torsoRotX=0.1*easeOut;
        bodyY=0.02-0.05*easeOut;
        headRotX=-0.1+0.15*easeOut;
        a.castFlash=1-pp;
      }else{
        // 恢复
        const pp=(p-0.45)/0.55;
        const ease=1-Math.pow(1-pp,2);
        raRot=1.4*(1-ease);
        laRot=0.6*(1-ease);
        torsoRotY=0.2*(1-ease);
        torsoRotX=0.1*(1-ease);
        bodyY=-0.03*(1-ease);
      }}
      break;
  }

  // === 受击叠加层：被打时身体后仰抖动（叠加在任何状态之上） ===
  if(a.hitFlash>0){
    const hitP=Math.min(1,a.hitFlash/0.12); // 0.12秒受击动画
    const shake=Math.sin(a.hitFlash*60)*.08*hitP; // 高频抖动
    torsoRotX-=0.15*hitP; // 后仰
    torsoRotZ+=shake; // 左右抖动
    bodyY-=0.02*hitP; // 下沉
    headRotX-=0.1*hitP; // 头后仰
  }

  // 平滑插值应用到关节（lerp因子=14*dt，稍快以保证动作响应灵敏）
  const lf=Math.min(1,14*dt);
  if(j.torso){
    j.torso.position.y=THREE.MathUtils.lerp(j.torso.position.y,torsoBaseY+bodyY,lf);
    j.torso.rotation.x=THREE.MathUtils.lerp(j.torso.rotation.x||0,torsoRotX,lf);
    j.torso.rotation.y=THREE.MathUtils.lerp(j.torso.rotation.y,torsoRotY,lf);
    j.torso.rotation.z=THREE.MathUtils.lerp(j.torso.rotation.z||0,torsoRotZ,lf);
  }
  if(j.head){
    j.head.rotation.x=THREE.MathUtils.lerp(j.head.rotation.x,headRotX,lf);
    j.head.rotation.y=THREE.MathUtils.lerp(j.head.rotation.y||0,headRotY,lf);
  }
  if(j.leftArm){
    j.leftArm.rotation.x=THREE.MathUtils.lerp(j.leftArm.rotation.x,laRot,lf);
    j.leftArm.rotation.z=THREE.MathUtils.lerp(j.leftArm.rotation.z,laRotZ,lf);
  }
  if(j.rightArm){
    j.rightArm.rotation.x=THREE.MathUtils.lerp(j.rightArm.rotation.x,raRot,lf);
    j.rightArm.rotation.z=THREE.MathUtils.lerp(j.rightArm.rotation.z,raRotZ,lf);
  }
  if(j.leftLeg){
    j.leftLeg.rotation.x=THREE.MathUtils.lerp(j.leftLeg.rotation.x,llRot,lf);
  }
  if(j.rightLeg){
    j.rightLeg.rotation.x=THREE.MathUtils.lerp(j.rightLeg.rotation.x,rlRot,lf);
  }
}

// 怪物动画（行走摆动+呼吸+受击抖动）
function animateEnemy(e,dt){
  const g=e.mesh;if(!g)return;
  if(!g.userData._et)g.userData._et=Math.random()*10;
  g.userData._et+=dt;
  const t=g.userData._et;
  const sz=e.cfg?e.cfg.sz:0.6;
  if(!e.frozen||e.frozen<=0){
    // 行走摇摆：前后点头式摇晃（比单纯左右摇更像走路）
    g.rotation.z=Math.sin(t*6)*.06;
    g.rotation.x=Math.sin(t*6+1.5)*.04; // 前后微摆（点头感）
    // 上下颠簸（每步一颠，双倍频率）
    const baseY=sz*0.5;
    const bob=Math.abs(Math.sin(t*8))*.025+Math.abs(Math.sin(t*4))*.015;
    if(g.children[0])g.children[0].position.y=baseY+bob;
    // 缩放呼吸：微妙的膨胀收缩（生物体征）
    const breathScale=1+Math.sin(t*2.5)*.015;
    g.scale.y=breathScale;
    g.scale.x=1/Math.sqrt(breathScale); // 保体积守恒
  }
  // 受击闪烁恢复
  if(g.userData._hitFlash>0){
    g.userData._hitFlash-=dt*3;
    // 受击时的后仰抖动
    const hitP=Math.max(0,g.userData._hitFlash*3);
    g.rotation.x-=0.2*hitP;
    g.traverse(c=>{if(c.material&&c.material.emissive)c.material.emissive.setHex(g.userData._hitFlash>0?0xffffff:0x000000)});
  }
}

// BOSS动画（威压感的待机律动+呼吸浮沉）
function animateBoss(e,dt){
  const g=e.mesh;if(!g)return;
  if(!g.userData._bt)g.userData._bt=0;
  g.userData._bt+=dt;
  const t=g.userData._bt;
  // 呼吸浮动（慢频大幅度 — 巨大生物的缓慢呼吸）
  const breathAmp=0.06;
  g.position.y=Math.sin(t*1.2)*breathAmp;
  // 身体缓慢左右摇晃（威压感的不安定感）
  g.rotation.z=Math.sin(t*0.8)*.025;
  // 前后微微点头（像在审视猎物）
  g.rotation.x=Math.sin(t*0.6)*.015;
  // 缓慢转向（环顾四周的霸气）
  g.rotation.y+=Math.sin(t*0.4)*0.002;
  // 缩放呼吸
  const bScale=1+Math.sin(t*1.2)*.02;
  g.scale.setScalar(bScale);
}

// ==================== 英雄 ====================
let heroMesh=null;
const HB={
warrior(g){
  _body(g,1,0x8b1a1a,0xffcc99,{lc:0x666666,ac:0x8b1a1a,bootC:0x555555,beltC:0x8b4513});
  const j=g.userData.joints;
  // === 板甲胸甲细节 ===
  // 胸甲中脊线
  const chestLine=new THREE.Mesh(new THREE.BoxGeometry(.04,.4,.02),_m(0xaa8833,{m:.6}));
  chestLine.position.set(0,.95,.21);g.add(chestLine);
  // 铆钉装饰
  const rivetM=_m(0xccaa55,{m:.7});
  [-.15,.15].forEach(x=>{[.85,1.05].forEach(y=>{
    const rv=new THREE.Mesh(new THREE.SphereGeometry(.02,6,6),rivetM);
    rv.position.set(x,y,.21);g.add(rv);
  })});

  // === 巨型尖刺肩甲（魔兽标志！） ===
  const sM=_m(0x888888,{m:.6,r:.3});
  const spkM=_m(0xaaaaaa,{m:.7,r:.2});
  if(j.leftArm){
    // 左肩甲底座（大块方形）
    const sp1=new THREE.Mesh(new THREE.BoxGeometry(.3,.18,.3),sM);sp1.position.set(0,.08,0);j.leftArm.add(sp1);
    // 肩甲边缘加厚
    const rim1=new THREE.Mesh(new THREE.BoxGeometry(.32,.04,.32),_m(0x666666,{m:.5}));rim1.position.set(0,0,0);j.leftArm.add(rim1);
    // 肩甲上的尖刺（3根）
    const sk1=new THREE.Mesh(new THREE.ConeGeometry(.04,.22,5),spkM);sk1.position.set(0,.25,0);j.leftArm.add(sk1);
    const sk1b=new THREE.Mesh(new THREE.ConeGeometry(.03,.16,5),spkM);sk1b.position.set(-.08,.2,.06);sk1b.rotation.z=.3;j.leftArm.add(sk1b);
    const sk1c=new THREE.Mesh(new THREE.ConeGeometry(.03,.16,5),spkM);sk1c.position.set(.08,.2,.06);sk1c.rotation.z=-.3;j.leftArm.add(sk1c);
  }
  if(j.rightArm){
    // 右肩甲
    const sp2=new THREE.Mesh(new THREE.BoxGeometry(.3,.18,.3),sM);sp2.position.set(0,.08,0);j.rightArm.add(sp2);
    const rim2=new THREE.Mesh(new THREE.BoxGeometry(.32,.04,.32),_m(0x666666,{m:.5}));rim2.position.set(0,0,0);j.rightArm.add(rim2);
    const sk2=new THREE.Mesh(new THREE.ConeGeometry(.04,.22,5),spkM);sk2.position.set(0,.25,0);j.rightArm.add(sk2);
    const sk2b=new THREE.Mesh(new THREE.ConeGeometry(.03,.16,5),spkM);sk2b.position.set(-.08,.2,.06);sk2b.rotation.z=.3;j.rightArm.add(sk2b);
    const sk2c=new THREE.Mesh(new THREE.ConeGeometry(.03,.16,5),spkM);sk2c.position.set(.08,.2,.06);sk2c.rotation.z=-.3;j.rightArm.add(sk2c);
    // === 双手巨剑（挂到右臂） ===
    // 剑柄
    const hilt=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,.2,6),_m(0x8b4513));
    hilt.position.set(.08,-.55,.15);j.rightArm.add(hilt);
    // 护手（十字形）
    const guard=new THREE.Mesh(new THREE.BoxGeometry(.22,.04,.04),_m(0xccaa44,{m:.6}));
    guard.position.set(.08,-.44,.15);j.rightArm.add(guard);
    // 剑身（宽大厚实）
    const blade=new THREE.Mesh(new THREE.BoxGeometry(.1,1.0,.025),_m(0xcccccc,{m:.8,r:.15}));
    blade.position.set(.08,.1,.15);blade.castShadow=true;j.rightArm.add(blade);
    // 剑身血槽
    const groove=new THREE.Mesh(new THREE.BoxGeometry(.03,.7,.03),_m(0xcc3333,{m:.3}));
    groove.position.set(.08,.15,.155);j.rightArm.add(groove);
    // 剑尖
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.05,.15,4),_m(0xcccccc,{m:.8,r:.15}));
    tip.position.set(.08,.65,.15);j.rightArm.add(tip);
  }
  // === T型面罩头盔（经典魔兽战士）===
  if(j.head){
    // 头盔主体
    const helm=new THREE.Mesh(new THREE.BoxGeometry(.4,.28,.34),_m(0x777777,{m:.5,r:.3}));
    helm.position.set(0,.2,-.01);j.head.add(helm);
    // 头盔顶部弧形
    const helmTop=new THREE.Mesh(new THREE.BoxGeometry(.36,.06,.3),_m(0x777777,{m:.5,r:.3}));
    helmTop.position.set(0,.36,-.01);j.head.add(helmTop);
    // T型面罩开口（深色缝隙）
    const visorH=new THREE.Mesh(new THREE.BoxGeometry(.28,.035,.04),_b(0x111111));
    visorH.position.set(0,.22,.17);j.head.add(visorH);
    const visorV=new THREE.Mesh(new THREE.BoxGeometry(.035,.12,.04),_b(0x111111));
    visorV.position.set(0,.2,.17);j.head.add(visorV);
    // 面罩两侧铆钉
    const hRivet1=new THREE.Mesh(new THREE.SphereGeometry(.02,6,6),rivetM);hRivet1.position.set(-.18,.22,.14);j.head.add(hRivet1);
    const hRivet2=hRivet1.clone();hRivet2.position.x=.18;j.head.add(hRivet2);
    // 头盔护颚
    const cheek1=new THREE.Mesh(new THREE.BoxGeometry(.06,.14,.1),_m(0x666666,{m:.5}));cheek1.position.set(-.17,.1,.06);j.head.add(cheek1);
    const cheek2=cheek1.clone();cheek2.position.x=.17;j.head.add(cheek2);
  }
  // === 斗篷（深红色）===
  const cp=new THREE.Mesh(new THREE.PlaneGeometry(.5,.55),_m(0xaa1111,{side:THREE.DoubleSide}));
  cp.position.set(0,.82,-.22);g.add(cp);
  // === 腰带扣（骷髅装饰）===
  const bkl=new THREE.Mesh(new THREE.BoxGeometry(.12,.1,.04),_m(0xc9a44a,{m:.8}));
  bkl.position.set(0,.68,.2);g.add(bkl);
  // 骷髅标志
  const skull=new THREE.Mesh(new THREE.SphereGeometry(.03,6,6),_m(0xeeeecc));
  skull.position.set(0,.68,.23);g.add(skull);
},
mage(g){
  // 长袍下摆（宽大魔法长袍）
  const rb=new THREE.Mesh(new THREE.CylinderGeometry(.15,.38,.9,8),_m(0x3322aa));rb.position.y=.5;rb.castShadow=true;g.add(rb);
  // 躯干（宽厚）
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.55,.4,.35),_m(0x4422cc));torso.position.y=1.05;torso.castShadow=true;g.add(torso);
  // 胸前刺绣花纹
  const emblem=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.02),_b(0xaa88ff,{transparent:true,opacity:.6}));
  emblem.position.set(0,1.05,.19);g.add(emblem);
  // 腰带
  const belt=new THREE.Mesh(new THREE.BoxGeometry(.56,.08,.36),_m(0x6633aa,{m:.3}));belt.position.y=.82;g.add(belt);
  // 头部pivot（方形大头）
  const headPivot=new THREE.Group();headPivot.position.y=1.26;g.add(headPivot);
  const hd=new THREE.Mesh(new THREE.BoxGeometry(.32,.28,.26),_m(0xffcc99,{r:.85}));
  hd.position.y=.18;hd.castShadow=true;headPivot.add(hd);
  // 方下巴
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(.26,.07,.16),_m(0xffcc99,{r:.85}));
  jaw.position.set(0,.04,.03);headPivot.add(jaw);
  // 发光眼（奥术蓝）
  const eM=_b(0x44aaff);
  const e1=new THREE.Mesh(new THREE.BoxGeometry(.07,.04,.03),eM);e1.position.set(-.08,.22,.135);headPivot.add(e1);
  const e2=e1.clone();e2.position.x=.08;headPivot.add(e2);
  // 眉骨
  const brM=_m(0xeebb88,{r:.9});
  const br1=new THREE.Mesh(new THREE.BoxGeometry(.1,.035,.05),brM);br1.position.set(-.08,.26,.13);headPivot.add(br1);
  const br2=br1.clone();br2.position.x=.08;headPivot.add(br2);
  // === 尖顶法师帽（魔兽标志）===
  const hatBase=new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,.04,10),_m(0x3322aa));
  hatBase.position.set(0,.33,0);headPivot.add(hatBase);
  const hatCone=new THREE.Mesh(new THREE.ConeGeometry(.22,.55,8),_m(0x3322aa));
  hatCone.position.set(0,.63,0);hatCone.rotation.z=.12;hatCone.castShadow=true;headPivot.add(hatCone);
  // 帽子上的星星装饰
  const star=new THREE.Mesh(new THREE.OctahedronGeometry(.04,0),_b(0xffcc44,{transparent:true,opacity:.8}));
  star.position.set(-.03,.88,0);headPivot.add(star);
  // 帽檐
  const brim=new THREE.Mesh(new THREE.CylinderGeometry(.3,.32,.03,12),_m(0x3322aa));
  brim.position.set(0,.32,0);headPivot.add(brim);
  // 左臂pivot（持法杖）
  const leftArmPivot=new THREE.Group();leftArmPivot.position.set(-.38,1.1,0);g.add(leftArmPivot);
  const a1u=new THREE.Mesh(new THREE.BoxGeometry(.16,.25,.14),_m(0x4422cc));a1u.position.y=-.12;leftArmPivot.add(a1u);
  const a1l=new THREE.Mesh(new THREE.BoxGeometry(.14,.22,.12),_m(0x4422cc));a1l.position.y=-.32;leftArmPivot.add(a1l);
  // 法杖
  const staff=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,1.8,6),_m(0x6a3a1a));
  staff.position.set(-.08,0,0);staff.castShadow=true;leftArmPivot.add(staff);
  // 法杖顶端水晶（发光）
  const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.1,0),_b(0xff6600,{transparent:true,opacity:.9}));
  crystal.position.set(-.08,.95,0);leftArmPivot.add(crystal);
  // 水晶光晕
  const glow=new THREE.Mesh(new THREE.SphereGeometry(.18,8,8),_b(0xff4400,{transparent:true,opacity:.12}));
  glow.position.set(-.08,.95,0);leftArmPivot.add(glow);
  // 右臂pivot
  const rightArmPivot=new THREE.Group();rightArmPivot.position.set(.38,1.1,0);g.add(rightArmPivot);
  const a2u=new THREE.Mesh(new THREE.BoxGeometry(.16,.25,.14),_m(0x4422cc));a2u.position.y=-.12;rightArmPivot.add(a2u);
  const a2l=new THREE.Mesh(new THREE.BoxGeometry(.14,.22,.12),_m(0x4422cc));a2l.position.y=-.32;rightArmPivot.add(a2l);
  // 右手手掌
  const fist=new THREE.Mesh(new THREE.BoxGeometry(.1,.08,.1),_m(0xffcc99,{r:.85}));
  fist.position.y=-.45;rightArmPivot.add(fist);
  // 虚拟腿pivot（穿长袍）
  const leftLegPivot=new THREE.Group();leftLegPivot.position.set(-.12,.5,0);g.add(leftLegPivot);
  const rightLegPivot=new THREE.Group();rightLegPivot.position.set(.12,.5,0);g.add(rightLegPivot);
  g.userData.joints={torso,head:headPivot,leftArm:leftArmPivot,rightArm:rightArmPivot,leftLeg:leftLegPivot,rightLeg:rightLegPivot};
},
hunter(g){
  _body(g,1,0x2a6622,0xffcc99,{lc:0x5a3a1a,ac:0x3a7733,bootC:0x5a3a1a,beltC:0x5a3a1a});
  const j=g.userData.joints;
  // === 猎人面罩/帽子 ===
  if(j.head){
    // 皮帽
    const hat=new THREE.Mesh(new THREE.BoxGeometry(.38,.12,.32),_m(0x2a5522,{r:.9}));
    hat.position.set(0,.34,-.02);j.head.add(hat);
    // 帽檐
    const brim=new THREE.Mesh(new THREE.BoxGeometry(.36,.04,.15),_m(0x2a5522,{r:.9}));
    brim.position.set(0,.3,.12);j.head.add(brim);
    // 羽毛装饰
    const feather=new THREE.Mesh(new THREE.BoxGeometry(.02,.25,.06),_m(0xff4444));
    feather.position.set(.18,.45,-.02);feather.rotation.z=-.15;j.head.add(feather);
  }
  // === 兽皮披肩 ===
  if(j.leftArm){
    const fur1=new THREE.Mesh(new THREE.BoxGeometry(.24,.12,.22),_m(0x7a5a2a,{r:.95}));
    fur1.position.set(0,.06,0);j.leftArm.add(fur1);
    // 爪痕装饰
    const claw=new THREE.Mesh(new THREE.BoxGeometry(.02,.12,.02),_m(0x444422));
    claw.position.set(-.06,.06,.1);j.leftArm.add(claw);
  }
  if(j.rightArm){
    const fur2=new THREE.Mesh(new THREE.BoxGeometry(.24,.12,.22),_m(0x7a5a2a,{r:.95}));
    fur2.position.set(0,.06,0);j.rightArm.add(fur2);
  }
  // === 弓挂到左臂 ===
  if(j.leftArm){
    // 弓身（弧形）
    const bw=new THREE.Mesh(new THREE.TorusGeometry(.35,.025,8,12,Math.PI),_m(0x8b4513,{m:.2}));
    bw.position.set(0,-.3,.12);bw.rotation.y=Math.PI/2;j.leftArm.add(bw);
    // 弓弦
    const bs=new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,.7,4),_b(0xcccccc));
    bs.position.set(0,-.3,.12);j.leftArm.add(bs);
  }
  // === 箭筒 ===
  const qv=new THREE.Mesh(new THREE.CylinderGeometry(.07,.06,.55,6),_m(0x5a3a1a));
  qv.position.set(.12,1.05,-.22);qv.rotation.z=.15;g.add(qv);
  for(let i=0;i<4;i++){
    const ar=new THREE.Mesh(new THREE.ConeGeometry(.015,.1,4),_m(0xcccccc,{m:.5}));
    ar.position.set(.12+(i-1.5)*.04,1.36,-.22);g.add(ar);
  }
  // === 披风 ===
  const cape=new THREE.Mesh(new THREE.PlaneGeometry(.45,.55),_m(0x2a5522,{side:THREE.DoubleSide}));
  cape.position.set(0,.82,-.22);g.add(cape);
  // 胸甲扣（兽牙）
  const fang=new THREE.Mesh(new THREE.ConeGeometry(.02,.08,4),_m(0xeeeecc));
  fang.position.set(0,.95,.22);fang.rotation.x=Math.PI;g.add(fang);
},
priest(g){
  // 暗影长袍下摆
  const rb=new THREE.Mesh(new THREE.CylinderGeometry(.15,.35,.85,8),_m(0x6633aa));rb.position.y=.48;rb.castShadow=true;g.add(rb);
  // 躯干
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.5,.38,.32),_m(0x7744aa));torso.position.y=1.05;torso.castShadow=true;g.add(torso);
  // 胸前暗影符文
  const rune=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.02),_b(0xaa44ff,{transparent:true,opacity:.5}));
  rune.position.set(0,1.05,.18);g.add(rune);
  // 腰带
  const belt=new THREE.Mesh(new THREE.BoxGeometry(.52,.07,.34),_m(0x553388,{m:.3}));belt.position.y=.82;g.add(belt);
  // 头部pivot（方形大头）
  const headPivot=new THREE.Group();headPivot.position.y=1.24;g.add(headPivot);
  const hd=new THREE.Mesh(new THREE.BoxGeometry(.3,.28,.26),_m(0xeeddcc,{r:.85}));
  hd.position.y=.18;hd.castShadow=true;headPivot.add(hd);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(.24,.06,.14),_m(0xeeddcc,{r:.85}));
  jaw.position.set(0,.04,.03);headPivot.add(jaw);
  // 暗影紫色眼
  const eM=_b(0xaa44ff);
  const e1=new THREE.Mesh(new THREE.BoxGeometry(.07,.04,.03),eM);e1.position.set(-.08,.22,.135);headPivot.add(e1);
  const e2=e1.clone();e2.position.x=.08;headPivot.add(e2);
  // 头顶光环（暗影紫）
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.2,.02,8,24),_b(0x9944ff,{transparent:true,opacity:.5}));
  halo.position.set(0,.42,0);halo.rotation.x=Math.PI/2;headPivot.add(halo);
  // 兜帽
  const hood=new THREE.Mesh(new THREE.BoxGeometry(.38,.2,.32),_m(0x553388));
  hood.position.set(0,.32,-.03);headPivot.add(hood);
  const hoodTop=new THREE.Mesh(new THREE.BoxGeometry(.34,.08,.28),_m(0x553388));
  hoodTop.position.set(0,.42,-.03);headPivot.add(hoodTop);
  // 左臂pivot
  const leftArmPivot=new THREE.Group();leftArmPivot.position.set(-.35,1.1,0);g.add(leftArmPivot);
  const a1u=new THREE.Mesh(new THREE.BoxGeometry(.14,.24,.12),_m(0x7744aa));a1u.position.y=-.12;leftArmPivot.add(a1u);
  const a1l=new THREE.Mesh(new THREE.BoxGeometry(.12,.2,.1),_m(0x7744aa));a1l.position.y=-.3;leftArmPivot.add(a1l);
  const fist1=new THREE.Mesh(new THREE.BoxGeometry(.1,.08,.1),_m(0xeeddcc,{r:.85}));fist1.position.y=-.42;leftArmPivot.add(fist1);
  // 右臂pivot（持暗影之书）
  const rightArmPivot=new THREE.Group();rightArmPivot.position.set(.35,1.1,0);g.add(rightArmPivot);
  const a2u=new THREE.Mesh(new THREE.BoxGeometry(.14,.24,.12),_m(0x7744aa));a2u.position.y=-.12;rightArmPivot.add(a2u);
  const a2l=new THREE.Mesh(new THREE.BoxGeometry(.12,.2,.1),_m(0x7744aa));a2l.position.y=-.3;rightArmPivot.add(a2l);
  // 暗影之书
  const bk=new THREE.Mesh(new THREE.BoxGeometry(.18,.22,.06),_m(0x4a0066));
  bk.position.set(.04,-.2,.14);bk.rotation.z=-.15;rightArmPivot.add(bk);
  // 书页
  const pg=new THREE.Mesh(new THREE.BoxGeometry(.14,.18,.02),_m(0xeeeedd));
  pg.position.set(.04,-.2,.17);pg.rotation.z=-.15;rightArmPivot.add(pg);
  // 暗影光环
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(.7,12,12),_b(0x7722cc,{transparent:true,opacity:.05})),{position:new THREE.Vector3(0,.95,0)}));
  // 虚拟腿pivot
  const leftLegPivot=new THREE.Group();leftLegPivot.position.set(-.12,.5,0);g.add(leftLegPivot);
  const rightLegPivot=new THREE.Group();rightLegPivot.position.set(.12,.5,0);g.add(rightLegPivot);
  g.userData.joints={torso,head:headPivot,leftArm:leftArmPivot,rightArm:rightArmPivot,leftLeg:leftLegPivot,rightLeg:rightLegPivot};
},
rogue(g){
  _body(g,1,0x222222,0xddccbb,{lc:0x1a1a1a,ac:0x333333,ec:0xffcc00,bootC:0x222222,beltC:0x333333});
  const j=g.userData.joints;
  // === 兜帽+面罩（经典盗贼造型）===
  if(j.head){
    // 兜帽
    const hood=new THREE.Mesh(new THREE.BoxGeometry(.4,.22,.36),_m(0x1a1a1a));
    hood.position.set(0,.28,-.04);j.head.add(hood);
    const hoodTop=new THREE.Mesh(new THREE.BoxGeometry(.36,.1,.3),_m(0x1a1a1a));
    hoodTop.position.set(0,.4,-.04);j.head.add(hoodTop);
    // 面罩（遮住下半脸）
    const mask=new THREE.Mesh(new THREE.BoxGeometry(.28,.1,.08),_m(0x111111));
    mask.position.set(0,.08,.12);j.head.add(mask);
  }
  // === 皮甲肩垫 ===
  const padM=_m(0x2a2a2a,{r:.9});
  if(j.leftArm){
    const pad1=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,.2),padM);pad1.position.set(0,.05,0);j.leftArm.add(pad1);
  }
  if(j.rightArm){
    const pad2=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,.2),padM);pad2.position.set(0,.05,0);j.rightArm.add(pad2);
  }
  // === 双匕首 ===
  const dgM=_m(0xcccccc,{m:.8,r:.2});
  if(j.leftArm){
    // 匕首刀身
    const d1=new THREE.Mesh(new THREE.BoxGeometry(.035,.38,.02),dgM);d1.position.set(0,-.4,.14);j.leftArm.add(d1);
    // 匕首护手
    const g1=new THREE.Mesh(new THREE.BoxGeometry(.1,.03,.05),_m(0x333333));g1.position.set(0,-.2,.14);j.leftArm.add(g1);
    // 匕首柄
    const h1=new THREE.Mesh(new THREE.BoxGeometry(.04,.1,.04),_m(0x444422));h1.position.set(0,-.14,.14);j.leftArm.add(h1);
  }
  if(j.rightArm){
    const d2=new THREE.Mesh(new THREE.BoxGeometry(.035,.38,.02),dgM);d2.position.set(0,-.4,.14);j.rightArm.add(d2);
    const g2=new THREE.Mesh(new THREE.BoxGeometry(.1,.03,.05),_m(0x333333));g2.position.set(0,-.2,.14);j.rightArm.add(g2);
    const h2=new THREE.Mesh(new THREE.BoxGeometry(.04,.1,.04),_m(0x444422));h2.position.set(0,-.14,.14);j.rightArm.add(h2);
  }
  // === 毒药瓶（腰间）===
  for(let i=0;i<3;i++){
    const v=new THREE.Mesh(new THREE.CylinderGeometry(.02,.025,.1,6),_m(0x22aa44));
    v.position.set((i-1)*.08,.68,-.2);g.add(v);
    // 瓶盖
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.02,6),_m(0x444444));
    cap.position.set((i-1)*.08,.74,-.2);g.add(cap);
  }
  // === 短披风 ===
  const cape=new THREE.Mesh(new THREE.PlaneGeometry(.4,.45),_m(0x1a1a1a,{side:THREE.DoubleSide}));
  cape.position.set(0,.88,-.22);g.add(cape);
},
shaman(g){
  _body(g,1,0x224488,0xddaa88,{lc:0x3a3a2a,ac:0x2255aa,bootC:0x3a3a2a,beltC:0x5a4a2a});
  const j=g.userData.joints;
  // === 图腾背在身后 ===
  const totem=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,.7,6),_m(0x8b6914));
  totem.position.set(0,1.05,-.25);totem.castShadow=true;g.add(totem);
  // 图腾顶端宝石
  const tGem=new THREE.Mesh(new THREE.OctahedronGeometry(.07,0),_b(0x44aaff,{transparent:true,opacity:.8}));
  tGem.position.set(0,1.45,-.25);g.add(tGem);
  // 图腾雕刻环
  const tRing=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,.04,8),_m(0xaa8844));
  tRing.position.set(0,1.2,-.25);g.add(tRing);
  // === 兽皮/锁甲腰带 ===
  const beltD=new THREE.Mesh(new THREE.BoxGeometry(.58,.08,.4),_m(0x888888,{m:.5,r:.4}));
  beltD.position.y=.68;g.add(beltD);
  // === 狼头肩甲（魔兽萨满标志）===
  const sM=_m(0x666688,{m:.4});
  if(j.leftArm){
    // 左肩甲底座
    const sp1=new THREE.Mesh(new THREE.BoxGeometry(.26,.14,.24),sM);sp1.position.set(0,.07,0);j.leftArm.add(sp1);
    // 狼牙装饰
    const fang1=new THREE.Mesh(new THREE.ConeGeometry(.02,.1,4),_m(0xeeeecc));
    fang1.position.set(-.06,.0,.1);fang1.rotation.x=.3;j.leftArm.add(fang1);
    const fang2=fang1.clone();fang2.position.x=.06;j.leftArm.add(fang2);
  }
  if(j.rightArm){
    // 右肩甲
    const sp2=new THREE.Mesh(new THREE.BoxGeometry(.26,.14,.24),sM);sp2.position.set(0,.07,0);j.rightArm.add(sp2);
    // === 闪电斧头（挂到右臂）===
    // 斧柄
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.55,6),_m(0x8b4513));
    handle.position.set(0,-.35,.14);j.rightArm.add(handle);
    // 斧刃（大块）
    const axeHead=new THREE.Mesh(new THREE.BoxGeometry(.18,.14,.06),_m(0xaaaaaa,{m:.6}));
    axeHead.position.set(-.05,-.05,.14);j.rightArm.add(axeHead);
    // 斧刃发光纹路
    const axeGlow=new THREE.Mesh(new THREE.BoxGeometry(.04,.08,.07),_b(0x44ccff,{transparent:true,opacity:.6}));
    axeGlow.position.set(-.05,-.05,.14);j.rightArm.add(axeGlow);
  }
  // === 面部彩绘（萨满图腾纹）===
  if(j.head){
    const paint=new THREE.Mesh(new THREE.BoxGeometry(.04,.08,.03),_b(0x2266ff,{transparent:true,opacity:.4}));
    paint.position.set(0,.15,.155);j.head.add(paint);
  }
},
deathknight(g){
  _body(g,1,0x2a3a55,0xbbccdd,{lc:0x1a2a3a,ac:0x334466,ec:0x44bbff,bootC:0x222233,beltC:0x334455});
  const j=g.userData.joints;
  const sM=_m(0x3a4a5a,{m:.5,r:.3});
  // === 骷髅尖刺肩甲（死骑标志）===
  if(j.leftArm){
    const sp1=new THREE.Mesh(new THREE.BoxGeometry(.28,.18,.28),sM);sp1.position.set(0,.08,0);j.leftArm.add(sp1);
    // 肩甲骷髅装饰
    const skull1=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.06),_m(0xccccbb));skull1.position.set(0,.06,.14);j.leftArm.add(skull1);
    // 冰刺
    const ice1=new THREE.Mesh(new THREE.ConeGeometry(.035,.2,5),_m(0x66ccff,{m:.3,transparent:true,opacity:.8}));
    ice1.position.set(0,.24,0);j.leftArm.add(ice1);
    const ice1b=new THREE.Mesh(new THREE.ConeGeometry(.025,.14,5),_m(0x66ccff,{m:.3,transparent:true,opacity:.8}));
    ice1b.position.set(-.08,.2,.06);ice1b.rotation.z=.4;j.leftArm.add(ice1b);
  }
  if(j.rightArm){
    const sp2=new THREE.Mesh(new THREE.BoxGeometry(.28,.18,.28),sM);sp2.position.set(0,.08,0);j.rightArm.add(sp2);
    const skull2=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.06),_m(0xccccbb));skull2.position.set(0,.06,.14);j.rightArm.add(skull2);
    const ice2=new THREE.Mesh(new THREE.ConeGeometry(.035,.2,5),_m(0x66ccff,{m:.3,transparent:true,opacity:.8}));
    ice2.position.set(0,.24,0);j.rightArm.add(ice2);
    // === 符文大剑 ===
    // 剑柄
    const hilt=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,.2,6),_m(0x334455));
    hilt.position.set(.08,-.55,.15);j.rightArm.add(hilt);
    // 护手
    const guard=new THREE.Mesh(new THREE.BoxGeometry(.2,.04,.04),_m(0x4488aa,{m:.5}));
    guard.position.set(.08,-.44,.15);j.rightArm.add(guard);
    // 剑身（宽大，发光纹路）
    const blade=new THREE.Mesh(new THREE.BoxGeometry(.1,1.0,.03),_m(0x6688aa,{m:.7,r:.2}));
    blade.position.set(.08,.1,.15);blade.castShadow=true;j.rightArm.add(blade);
    // 符文发光
    const rn=_b(0x44ccff,{transparent:true,opacity:.7});
    [-.15,0,.15,.3].forEach(y=>{
      const r=new THREE.Mesh(new THREE.BoxGeometry(.05,.06,.04),rn);
      r.position.set(.08,y,.155);j.rightArm.add(r);
    });
    // 剑尖
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.05,.15,4),_m(0x6688aa,{m:.7,r:.2}));
    tip.position.set(.08,.65,.15);j.rightArm.add(tip);
  }
  // === 角盔（死骑标志性头盔）===
  if(j.head){
    const helm=new THREE.Mesh(new THREE.BoxGeometry(.38,.26,.32),_m(0x3a4a5a,{m:.5}));
    helm.position.set(0,.2,-.01);j.head.add(helm);
    // 头盔角
    const horn1=new THREE.Mesh(new THREE.ConeGeometry(.03,.2,5),_m(0x4a5a6a,{m:.4}));
    horn1.position.set(-.16,.36,0);horn1.rotation.z=.3;j.head.add(horn1);
    const horn2=horn1.clone();horn2.position.x=.16;horn2.rotation.z=-.3;j.head.add(horn2);
    // 面罩缝隙（发光冰蓝）
    const visor=new THREE.Mesh(new THREE.BoxGeometry(.26,.04,.04),_b(0x44bbff));
    visor.position.set(0,.2,.16);j.head.add(visor);
  }
  // === 冰霜光环 ===
  const frostAura=new THREE.Mesh(new THREE.SphereGeometry(.75,12,12),_b(0x4488cc,{transparent:true,opacity:.04}));
  frostAura.position.y=.9;g.add(frostAura);
  const frostRing=new THREE.Mesh(new THREE.RingGeometry(.15,.85,16),_b(0x88ccff,{side:THREE.DoubleSide,transparent:true,opacity:.1}));
  frostRing.rotation.x=-Math.PI/2;frostRing.position.y=.15;g.add(frostRing);
},
druid(g){
  _body(g,1,0x336633,0xddccaa,{lc:0x5a4a2a,ac:0x447744,bootC:0x4a3a2a,beltC:0x5a4a2a});
  const j=g.userData.joints;
  // === 鹿角头饰（德鲁伊标志）===
  if(j.head){
    // 头饰底座（树皮编织）
    const crown=new THREE.Mesh(new THREE.BoxGeometry(.36,.06,.3),_m(0x6a4a2a,{r:.9}));
    crown.position.set(0,.34,0);j.head.add(crown);
    // 大鹿角
    const aM=_m(0x8b6914);
    const a1=new THREE.Mesh(new THREE.CylinderGeometry(.02,.04,.35,5),aM);
    a1.position.set(-.16,.5,0);a1.rotation.z=.35;j.head.add(a1);
    const a1b=new THREE.Mesh(new THREE.CylinderGeometry(.012,.02,.18,4),aM);
    a1b.position.set(-.28,.68,0);a1b.rotation.z=.8;j.head.add(a1b);
    const a1c=new THREE.Mesh(new THREE.CylinderGeometry(.012,.02,.14,4),aM);
    a1c.position.set(-.22,.62,.06);a1c.rotation.z=.5;a1c.rotation.x=-.3;j.head.add(a1c);
    const a2=a1.clone();a2.position.x=.16;a2.rotation.z=-.35;j.head.add(a2);
    const a2b=a1b.clone();a2b.position.set(.28,.68,0);a2b.rotation.z=-.8;j.head.add(a2b);
    const a2c=a1c.clone();a2c.position.set(.22,.62,.06);a2c.rotation.z=-.5;j.head.add(a2c);
    // 叶子装饰
    const leaf=new THREE.Mesh(new THREE.BoxGeometry(.06,.08,.02),_m(0x33aa33));
    leaf.position.set(-.12,.38,.12);j.head.add(leaf);
    const leaf2=leaf.clone();leaf2.position.x=.12;j.head.add(leaf2);
  }
  // === 皮甲肩垫+藤蔓 ===
  if(j.leftArm){
    const pad1=new THREE.Mesh(new THREE.BoxGeometry(.24,.1,.22),_m(0x447744,{r:.85}));
    pad1.position.set(0,.05,0);j.leftArm.add(pad1);
    // 藤蔓缠绕
    const vine=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.3,6),_m(0x33aa33));
    vine.position.set(-.04,-.15,.05);vine.rotation.z=.5;j.leftArm.add(vine);
  }
  if(j.rightArm){
    const pad2=new THREE.Mesh(new THREE.BoxGeometry(.24,.1,.22),_m(0x447744,{r:.85}));
    pad2.position.set(0,.05,0);j.rightArm.add(pad2);
  }
  // === 法杖（挂到左臂）===
  if(j.leftArm){
    const staff=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,1.6,6),_m(0x6a4a2a));
    staff.position.set(-.1,0,0);j.leftArm.add(staff);
    // 法杖顶端自然之环
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.08,.015,6,12,Math.PI*1.5),_b(0xaaffaa,{transparent:true,opacity:.7}));
    ring.position.set(-.1,.82,0);j.leftArm.add(ring);
    // 中心翠绿宝石
    const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.05,0),_b(0x66ff66,{transparent:true,opacity:.7}));
    gem.position.set(-.1,.82,0);j.leftArm.add(gem);
  }
  // === 树皮披风 ===
  const cape=new THREE.Mesh(new THREE.PlaneGeometry(.48,.55),_m(0x2a7a2a,{side:THREE.DoubleSide}));
  cape.position.set(0,.82,-.22);g.add(cape);
  // === 脚底生长的草 ===
  for(let i=0;i<6;i++){
    const gs=new THREE.Mesh(new THREE.ConeGeometry(.025,.18,3),_m(0x33aa33));
    const an=Math.random()*Math.PI*2;
    gs.position.set(Math.cos(an)*.4,.09,Math.sin(an)*.4);g.add(gs);
  }
  // 自然光环
  const natAura=new THREE.Mesh(new THREE.SphereGeometry(.6,12,12),_b(0x44ff44,{transparent:true,opacity:.03}));
  natAura.position.y=.9;g.add(natAura);
},
warlock(g){
  // 邪能长袍
  const rb=new THREE.Mesh(new THREE.CylinderGeometry(.15,.38,.9,8),_m(0x2a0a3a));rb.position.y=.48;rb.castShadow=true;g.add(rb);
  // 躯干
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.5,.38,.32),_m(0x3a1a4a));torso.position.y=1.05;torso.castShadow=true;g.add(torso);
  // 胸前邪能符文
  const rune=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.02),_b(0x44ff44,{transparent:true,opacity:.4}));
  rune.position.set(0,1.05,.18);g.add(rune);
  // 腰带
  const belt=new THREE.Mesh(new THREE.BoxGeometry(.52,.08,.34),_m(0x3a1a4a,{m:.3}));belt.position.y=.82;g.add(belt);
  // 灵魂石腰扣
  const soulGem=new THREE.Mesh(new THREE.OctahedronGeometry(.04,0),_b(0x22ff44,{transparent:true,opacity:.8}));
  soulGem.position.set(0,.82,.18);g.add(soulGem);
  // 头部pivot（方形大头）
  const headPivot=new THREE.Group();headPivot.position.y=1.24;g.add(headPivot);
  const hd=new THREE.Mesh(new THREE.BoxGeometry(.3,.28,.26),_m(0xddccbb,{r:.85}));
  hd.position.y=.18;hd.castShadow=true;headPivot.add(hd);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(.24,.06,.14),_m(0xddccbb,{r:.85}));
  jaw.position.set(0,.04,.03);headPivot.add(jaw);
  // 邪能绿眼
  const eM=_b(0x44ff44);
  const e1=new THREE.Mesh(new THREE.BoxGeometry(.07,.04,.03),eM);e1.position.set(-.08,.22,.135);headPivot.add(e1);
  const e2=e1.clone();e2.position.x=.08;headPivot.add(e2);
  // 恶魔角（术士标志）
  const hornM=_m(0x444444,{m:.3});
  const horn1=new THREE.Mesh(new THREE.ConeGeometry(.03,.2,5),hornM);
  horn1.position.set(-.14,.4,0);horn1.rotation.z=.25;headPivot.add(horn1);
  const horn2=horn1.clone();horn2.position.x=.14;horn2.rotation.z=-.25;headPivot.add(horn2);
  // 兜帽
  const hood=new THREE.Mesh(new THREE.BoxGeometry(.36,.18,.3),_m(0x2a0a3a));
  hood.position.set(0,.32,-.03);headPivot.add(hood);
  // 左臂pivot
  const leftArmPivot=new THREE.Group();leftArmPivot.position.set(-.35,1.1,0);g.add(leftArmPivot);
  const a1u=new THREE.Mesh(new THREE.BoxGeometry(.15,.24,.12),_m(0x3a1a4a));a1u.position.y=-.12;leftArmPivot.add(a1u);
  const a1l=new THREE.Mesh(new THREE.BoxGeometry(.13,.2,.1),_m(0x3a1a4a));a1l.position.y=-.3;leftArmPivot.add(a1l);
  const fist1=new THREE.Mesh(new THREE.BoxGeometry(.1,.08,.1),_m(0xddccbb,{r:.85}));fist1.position.y=-.42;leftArmPivot.add(fist1);
  // 右臂pivot（持灵魂石/邪火）
  const rightArmPivot=new THREE.Group();rightArmPivot.position.set(.35,1.1,0);g.add(rightArmPivot);
  const a2u=new THREE.Mesh(new THREE.BoxGeometry(.15,.24,.12),_m(0x3a1a4a));a2u.position.y=-.12;rightArmPivot.add(a2u);
  const a2l=new THREE.Mesh(new THREE.BoxGeometry(.13,.2,.1),_m(0x3a1a4a));a2l.position.y=-.3;rightArmPivot.add(a2l);
  // 灵魂石
  const soul=new THREE.Mesh(new THREE.OctahedronGeometry(.08,0),_b(0x22ff44,{transparent:true,opacity:.7}));
  soul.position.set(.02,-.4,.15);rightArmPivot.add(soul);
  const soulGlow=new THREE.Mesh(new THREE.SphereGeometry(.15,8,8),_b(0x22ff22,{transparent:true,opacity:.08}));
  soulGlow.position.set(.02,-.4,.15);rightArmPivot.add(soulGlow);
  // === 小恶魔宠物 ===
  const imp=new THREE.Group();
  // 恶魔身体
  const impBody=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.08),_m(0xaa2222));imp.add(impBody);
  // 恶魔头
  const impHead=new THREE.Mesh(new THREE.BoxGeometry(.08,.07,.06),_m(0xcc3333));impHead.position.y=.08;imp.add(impHead);
  // 小角
  const ih1=new THREE.Mesh(new THREE.ConeGeometry(.015,.05,4),_m(0x444444));ih1.position.set(-.03,.13,0);ih1.rotation.z=.3;imp.add(ih1);
  const ih2=ih1.clone();ih2.position.x=.03;ih2.rotation.z=-.3;imp.add(ih2);
  // 恶魔眼
  const ie1=new THREE.Mesh(new THREE.BoxGeometry(.02,.015,.02),_b(0xffcc00));ie1.position.set(-.02,.09,.03);imp.add(ie1);
  const ie2=ie1.clone();ie2.position.x=.02;imp.add(ie2);
  imp.position.set(.55,1.45,0);g.add(imp);
  // 邪能光环
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(.65,12,12),_b(0x44ff44,{transparent:true,opacity:.03})),{position:new THREE.Vector3(0,.95,0)}));
  // 虚拟腿pivot
  const leftLegPivot=new THREE.Group();leftLegPivot.position.set(-.12,.5,0);g.add(leftLegPivot);
  const rightLegPivot=new THREE.Group();rightLegPivot.position.set(.12,.5,0);g.add(rightLegPivot);
  g.userData.joints={torso,head:headPivot,leftArm:leftArmPivot,rightArm:rightArmPivot,leftLeg:leftLegPivot,rightLeg:rightLegPivot};
},
paladin(g){
  _body(g,1,0xddaa33,0xffcc99,{lc:0xaaaa55,ac:0xcc9922,bootC:0x888855,beltC:0xaa8822});
  const j=g.userData.joints;
  const sM=_m(0xddaa22,{m:.6,r:.3});
  // === 圣光翼肩甲（圣骑标志）===
  if(j.leftArm){
    const sp1=new THREE.Mesh(new THREE.BoxGeometry(.28,.16,.28),sM);sp1.position.set(0,.08,0);j.leftArm.add(sp1);
    // 翼状装饰
    const wing1=new THREE.Mesh(new THREE.BoxGeometry(.04,.2,.12),_m(0xc9a44a,{m:.5}));
    wing1.position.set(-.1,.2,0);wing1.rotation.z=.3;j.leftArm.add(wing1);
    // === 盾牌（挂到左臂）===
    // 盾面
    const shield=new THREE.Mesh(new THREE.BoxGeometry(.06,.45,.35),_m(0xddaa22,{m:.5,r:.3}));
    shield.position.set(-.02,-.2,.1);shield.castShadow=true;j.leftArm.add(shield);
    // 盾牌金色十字
    const crossV=new THREE.Mesh(new THREE.BoxGeometry(.065,.35,.02),_b(0xc9a44a));
    crossV.position.set(-.02,-.2,.28);j.leftArm.add(crossV);
    const crossH=new THREE.Mesh(new THREE.BoxGeometry(.065,.02,.22),_b(0xc9a44a));
    crossH.position.set(-.02,-.2,.28);j.leftArm.add(crossH);
    // 盾牌边框
    const rim=new THREE.Mesh(new THREE.BoxGeometry(.065,.48,.38),_m(0xaa8822,{m:.4}));
    rim.position.set(-.025,-.2,.1);j.leftArm.add(rim);
  }
  if(j.rightArm){
    const sp2=new THREE.Mesh(new THREE.BoxGeometry(.28,.16,.28),sM);sp2.position.set(0,.08,0);j.rightArm.add(sp2);
    const wing2=new THREE.Mesh(new THREE.BoxGeometry(.04,.2,.12),_m(0xc9a44a,{m:.5}));
    wing2.position.set(.1,.2,0);wing2.rotation.z=-.3;j.rightArm.add(wing2);
    // === 圣光锤 ===
    // 锤柄
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.55,6),_m(0x8b4513));
    handle.position.set(0,-.3,.14);j.rightArm.add(handle);
    // 锤头（大块方形）
    const hammerHead=new THREE.Mesh(new THREE.BoxGeometry(.18,.14,.14),_m(0xddaa22,{m:.6}));
    hammerHead.position.set(0,.0,.14);j.rightArm.add(hammerHead);
    // 锤头发光纹
    const hamGlow=new THREE.Mesh(new THREE.BoxGeometry(.06,.08,.15),_b(0xffdd44,{transparent:true,opacity:.3}));
    hamGlow.position.set(0,.0,.14);j.rightArm.add(hamGlow);
  }
  // === 金色头盔（带T型面罩）===
  if(j.head){
    const helm=new THREE.Mesh(new THREE.BoxGeometry(.38,.26,.32),_m(0xddaa22,{m:.5}));
    helm.position.set(0,.2,-.01);j.head.add(helm);
    // 面罩
    const visorH=new THREE.Mesh(new THREE.BoxGeometry(.24,.04,.04),_b(0x222222));
    visorH.position.set(0,.2,.16);j.head.add(visorH);
    const visorV=new THREE.Mesh(new THREE.BoxGeometry(.03,.1,.04),_b(0x222222));
    visorV.position.set(0,.18,.16);j.head.add(visorV);
    // 头盔顶部脊
    const crest=new THREE.Mesh(new THREE.BoxGeometry(.04,.08,.2),_m(0xc9a44a,{m:.6}));
    crest.position.set(0,.34,-.02);j.head.add(crest);
  }
  // === 胸甲圣光徽章 ===
  const emblem=new THREE.Mesh(new THREE.OctahedronGeometry(.06,0),_b(0xc9a44a,{transparent:true,opacity:.8}));
  emblem.position.set(0,1.05,.2);g.add(emblem);
  // 圣光光环
  const holyAura=new THREE.Mesh(new THREE.SphereGeometry(.7,12,12),_b(0xffdd44,{transparent:true,opacity:.04}));
  holyAura.position.y=.9;g.add(holyAura);
}
};
function createHero(type){
  const c=ALL_HEROES[type],g=new THREE.Group();
  // 始终使用积木人模型（有骨骼关节可动画）
  if(HB[type])HB[type](g);else{
    const bd=new THREE.Mesh(new THREE.CapsuleGeometry(.35,.6,8,12),_m(c.color,{m:.3,r:.6}));bd.position.y=1;bd.castShadow=true;g.add(bd);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.28,12,12),_m(0xffcc99));hd.position.y=1.75;hd.castShadow=true;g.add(hd);
  }
  // 初始化动画系统
  initAnim(g,type);
  // 脚底主环（亮色、旋转）
  const ring=new THREE.Mesh(new THREE.RingGeometry(.55,.7,32),_b(c.color,{side:THREE.DoubleSide,transparent:true,opacity:.4,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));ring.rotation.x=-Math.PI/2;ring.position.y=.1;g.add(ring);g.userData.ring=ring;
  // 脚底外扩散光环
  const ringOuter=new THREE.Mesh(new THREE.RingGeometry(.7,1.0,32),_b(c.color,{side:THREE.DoubleSide,transparent:true,opacity:.1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));ringOuter.rotation.x=-Math.PI/2;ringOuter.position.y=.08;g.add(ringOuter);g.userData.ringOuter=ringOuter;
  // 脚底光斑（贴地圆形光）
  const groundGlow=new THREE.Mesh(new THREE.CircleGeometry(1.2,24),_b(c.color,{transparent:true,opacity:.06,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));groundGlow.rotation.x=-Math.PI/2;groundGlow.position.y=.06;g.add(groundGlow);g.userData.groundGlow=groundGlow;
  // 身体光环
  const glow=new THREE.Mesh(new THREE.SphereGeometry(.5,12,12),_b(c.color,{transparent:true,opacity:.06}));glow.position.y=1;glow.scale.setScalar(1.8);g.add(glow);g.userData.glow=glow;
  scene.add(g);return g;
}

// ==================== 怪物 ====================
function _hp(g,s){
  const bg=new THREE.Mesh(new THREE.PlaneGeometry(s*1,.08),_b(0x333333,{side:THREE.DoubleSide}));bg.position.y=s*1.6;g.add(bg);
  const f=new THREE.Mesh(new THREE.PlaneGeometry(s*1,.08),_b(0xff0000,{side:THREE.DoubleSide}));f.position.y=s*1.6;g.add(f);
  g.userData.hpBar=f;g.userData.hpW=s*1;
}
const EB={
'狗头人'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.4,s*.4,s*.3),_m(t.color,{r:.8}));bd.position.y=s*.5;bd.castShadow=true;g.add(bd);
  const hd=new THREE.Mesh(new THREE.SphereGeometry(s*.2,8,8),_m(t.color));hd.position.set(0,s*.85,s*.05);hd.scale.set(1,.9,1.2);g.add(hd);
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.08,s*.15,6),_m(0x664433)),{position:new THREE.Vector3(0,s*.8,s*.22),rotation:new THREE.Euler(-Math.PI/2,0,0)}));
  const eM=_b(0xff4444);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.04,6,6),eM);e1.position.set(-s*.08,s*.9,s*.15);g.add(e1);const e2=e1.clone();e2.position.x=s*.08;g.add(e2);
  const cd=new THREE.Mesh(new THREE.CylinderGeometry(s*.02,s*.02,s*.2,5),_m(0xffffcc));cd.position.set(s*.2,s*.6,s*.1);g.add(cd);
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.03,s*.08,5),_b(0xff8800,{transparent:true,opacity:.8})),{position:new THREE.Vector3(s*.2,s*.72,s*.1)}));
  const lM=_m(t.color);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*.2,s*.1),lM);l1.position.set(-s*.1,s*.2,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.1;g.add(l2);
},
'豺狼人'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.4,s*.5,s*.3),_m(t.color));bd.position.y=s*.6;bd.castShadow=true;g.add(bd);
  const hd=new THREE.Mesh(new THREE.SphereGeometry(s*.2,8,8),_m(t.color));hd.position.set(0,s*1.0,s*.05);g.add(hd);
  const earM=_m(0x997755);const ear1=new THREE.Mesh(new THREE.ConeGeometry(s*.06,s*.15,4),earM);ear1.position.set(-s*.12,s*1.2,0);ear1.rotation.z=.2;g.add(ear1);const ear2=ear1.clone();ear2.position.x=s*.12;ear2.rotation.z=-.2;g.add(ear2);
  const eM=_b(0xffcc00);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.04,6,6),eM);e1.position.set(-s*.08,s*1.05,s*.16);g.add(e1);const e2=e1.clone();e2.position.x=s*.08;g.add(e2);
  const cl=new THREE.Mesh(new THREE.CylinderGeometry(s*.03,s*.04,s*.4,5),_m(0x5a3a1a));cl.position.set(s*.25,s*.5,s*.1);cl.rotation.z=-.3;g.add(cl);
  const lM=_m(t.color);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*.25,s*.1),lM);l1.position.set(-s*.1,s*.2,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.1;g.add(l2);
},
'迪菲亚打手'(g,t){const s=t.sz;_body(g,s,0xaa3322,0xddccaa,{lc:0x443322,ac:0x993322});
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.24,s*.1,s*.2),_m(0xcc2222)),{position:new THREE.Vector3(0,s*1.42,s*.02)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.08,s*.08,s*.08),_m(0x5a3a1a)),{position:new THREE.Vector3(-s*.35,s*.7,s*.08)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.08,s*.08,s*.08),_m(0x5a3a1a)),{position:new THREE.Vector3(s*.35,s*.7,s*.08)}));
},
'迪菲亚盗贼'(g,t){const s=t.sz;_body(g,s,0x882222,0xddccaa,{lc:0x332222,ac:0x772222});
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.24,s*.1,s*.2),_m(0xcc2222)),{position:new THREE.Vector3(0,s*1.42,s*.02)}));
  const d1=new THREE.Mesh(new THREE.BoxGeometry(s*.02,s*.2,s*.01),_m(0xbbbbbb,{m:.7}));d1.position.set(-s*.36,s*.6,s*.1);g.add(d1);const d2=d1.clone();d2.position.x=s*.36;g.add(d2);
},
'迪菲亚法师'(g,t){const s=t.sz;
  const rb=new THREE.Mesh(new THREE.CylinderGeometry(s*.1,s*.22,s*.65,6),_m(0xcc4422));rb.position.y=s*.42;rb.castShadow=true;g.add(rb);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.3,s*.25,s*.2),_m(0xcc5533)),{position:new THREE.Vector3(0,s*.9,0)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.16,8,8),_m(0xddccaa)),{position:new THREE.Vector3(0,s*1.15,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.2,s*.08,s*.16),_m(0xcc2222)),{position:new THREE.Vector3(0,s*1.1,s*.02)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.08,6,6),_b(0xff4400,{transparent:true,opacity:.7})),{position:new THREE.Vector3(s*.2,s*.8,s*.12)}));
},
'丛林巨魔'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.35,s*.6,s*.25),_m(t.color));bd.position.y=s*.7;bd.castShadow=true;g.add(bd);
  const hd=new THREE.Mesh(new THREE.SphereGeometry(s*.18,8,8),_m(t.color));hd.position.y=s*1.2;g.add(hd);
  const tM=_m(0xffffcc);const t1=new THREE.Mesh(new THREE.ConeGeometry(s*.02,s*.1,4),tM);t1.position.set(-s*.06,s*1.08,s*.15);t1.rotation.x=-.3;g.add(t1);const t2=t1.clone();t2.position.x=s*.06;g.add(t2);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.25,s*.02,s*.01),_b(0xff2222)),{position:new THREE.Vector3(0,s*1.22,s*.18)}));
  const aM=_m(t.color);const a1=new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*.5,s*.1),aM);a1.position.set(-s*.28,s*.6,0);g.add(a1);const a2=a1.clone();a2.position.x=s*.28;g.add(a2);
  const lM=_m(t.color);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*.3,s*.1),lM);l1.position.set(-s*.1,s*.2,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.1;g.add(l2);
  const sp=new THREE.Mesh(new THREE.CylinderGeometry(s*.015,s*.015,s*.7,5),_m(0x5a3a1a));sp.position.set(s*.28,s*.8,s*.1);g.add(sp);
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.03,s*.1,4),_m(0xaaaaaa,{m:.6})),{position:new THREE.Vector3(s*.28,s*1.18,s*.1)}));
},
'银背猩猩'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.55,s*.5,s*.4),_m(t.color));bd.position.y=s*.55;bd.castShadow=true;g.add(bd);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.45,s*.3,s*.05),_m(0xaaaaaa)),{position:new THREE.Vector3(0,s*.6,-s*.22)}));
  const hd=new THREE.Mesh(new THREE.SphereGeometry(s*.2,8,8),_m(0x444422));hd.position.set(0,s*.9,s*.1);hd.scale.set(1,.85,1);g.add(hd);
  const eM=_b(0xff2222);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.04,6,6),eM);e1.position.set(-s*.08,s*.93,s*.25);g.add(e1);const e2=e1.clone();e2.position.x=s*.08;g.add(e2);
  const aM=_m(t.color);const a1=new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.45,s*.15),aM);a1.position.set(-s*.38,s*.4,0);g.add(a1);const a2=a1.clone();a2.position.x=s*.38;g.add(a2);
  const lM=_m(t.color);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.2,s*.15),lM);l1.position.set(-s*.15,s*.15,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.15;g.add(l2);
},
'猛虎'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.3,s*.25,s*.6),_m(t.color));bd.position.y=s*.4;bd.castShadow=true;g.add(bd);
  const hd=new THREE.Mesh(new THREE.BoxGeometry(s*.25,s*.2,s*.2),_m(t.color));hd.position.set(0,s*.5,s*.35);g.add(hd);
  for(let i=0;i<3;i++){g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.02,s*.26,s*.08),_m(0x332200)),{position:new THREE.Vector3(0,s*.4,s*.1-i*s*.2)}))}
  const eM=_b(0xffcc00);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.03,5,5),eM);e1.position.set(-s*.08,s*.55,s*.42);g.add(e1);const e2=e1.clone();e2.position.x=s*.08;g.add(e2);
  const lM=_m(t.color);[[-s*.12,s*.15,s*.2],[s*.12,s*.15,s*.2],[-s*.12,s*.15,-s*.2],[s*.12,s*.15,-s*.2]].forEach(p=>{g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.08,s*.25,s*.08),lM),{position:new THREE.Vector3(...p)}))});
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.02,s*.01,s*.3,5),_m(t.color)),{position:new THREE.Vector3(0,s*.45,-s*.4),rotation:new THREE.Euler(.5,0,0)}));
},
'黑铁矮人'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.45,s*.4,s*.3),_m(t.color));bd.position.y=s*.5;bd.castShadow=true;g.add(bd);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.18,8,8),_m(0x886644)),{position:new THREE.Vector3(0,s*.85,0)}));
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.15,s*.2,5),_m(0x332211)),{position:new THREE.Vector3(0,s*.65,s*.1),rotation:new THREE.Euler(Math.PI,0,0)}));
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.15,s*.2,s*.1,6),_m(0x555555,{m:.6})),{position:new THREE.Vector3(0,s*.98,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*.08,s*.1),_m(0x444444,{m:.5})),{position:new THREE.Vector3(s*.28,s*.55,s*.1)}));
  const lM=_m(0x444444);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.12,s*.2,s*.12),lM);l1.position.set(-s*.12,s*.15,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.12;g.add(l2);
},
'火元素'(g,t){const s=t.sz;
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.3,8,8),_m(0xff4400,{emissive:0xff2200,emissiveIntensity:.3})),{position:new THREE.Vector3(0,s*.6,0)}));
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.2,s*.3,6),_b(0xff6600,{transparent:true,opacity:.8})),{position:new THREE.Vector3(0,s*1.0,0)}));
  const aM=_b(0xff4400,{transparent:true,opacity:.6});const a1=new THREE.Mesh(new THREE.ConeGeometry(s*.08,s*.35,5),aM);a1.position.set(-s*.3,s*.7,0);a1.rotation.z=.6;g.add(a1);const a2=a1.clone();a2.position.set(s*.3,s*.7,0);a2.rotation.z=-.6;g.add(a2);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.5,8,8),_b(0xff4400,{transparent:true,opacity:.1})),{position:new THREE.Vector3(0,s*.7,0)}));
  const eM=_b(0xffff00);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.05,5,5),eM);e1.position.set(-s*.1,s*.7,s*.25);g.add(e1);const e2=e1.clone();e2.position.x=s*.1;g.add(e2);
},
'熔岩犬'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.3,s*.25,s*.5),_m(0x661100));bd.position.y=s*.4;bd.castShadow=true;g.add(bd);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.02,s*.3),_b(0xff4400,{transparent:true,opacity:.5})),{position:new THREE.Vector3(0,s*.53,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.22,s*.18,s*.18),_m(0x661100)),{position:new THREE.Vector3(0,s*.5,s*.3)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.08,s*.1),_m(0xff2200)),{position:new THREE.Vector3(0,s*.43,s*.4)}));
  const eM=_b(0xff6600);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.035,5,5),eM);e1.position.set(-s*.06,s*.55,s*.36);g.add(e1);const e2=e1.clone();e2.position.x=s*.06;g.add(e2);
  const lM=_m(0x551100);[[-s*.1,s*.15,s*.15],[s*.1,s*.15,s*.15],[-s*.1,s*.15,-s*.15],[s*.1,s*.15,-s*.15]].forEach(p=>{g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.07,s*.25,s*.07),lM),{position:new THREE.Vector3(...p)}))});
},
'食尸鬼'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.3,s*.35,s*.25),_m(0x445544));bd.position.y=s*.5;bd.rotation.x=.2;bd.castShadow=true;g.add(bd);
  const hd=new THREE.Mesh(new THREE.SphereGeometry(s*.15,7,7),_m(0x556644));hd.position.set(0,s*.85,s*.08);hd.scale.set(1,.85,1);g.add(hd);
  const eM=_b(0x44ff44);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.04,5,5),eM);e1.position.set(-s*.06,s*.88,s*.2);g.add(e1);const e2=e1.clone();e2.position.x=s*.06;g.add(e2);
  const a1=new THREE.Mesh(new THREE.BoxGeometry(s*.08,s*.4,s*.08),_m(0x445544));a1.position.set(-s*.22,s*.45,s*.08);a1.rotation.z=-.2;g.add(a1);
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.03,s*.08,3),_m(0x888866)),{position:new THREE.Vector3(-s*.25,s*.22,s*.08),rotation:new THREE.Euler(-Math.PI/2,0,0)}));
  const a2=a1.clone();a2.position.x=s*.22;a2.rotation.z=.2;g.add(a2);
  const lM=_m(0x445544);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*.2,s*.1),lM);l1.position.set(-s*.1,s*.15,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.1;g.add(l2);
},
'憎恶'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.SphereGeometry(s*.4,8,8),_m(0x556633));bd.position.y=s*.6;bd.scale.set(1,1.1,.9);bd.castShadow=true;g.add(bd);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.12,7,7),_m(0x667744)),{position:new THREE.Vector3(0,s*1.05,s*.15)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.01,s*.5,s*.01),_m(0x222222)),{position:new THREE.Vector3(0,s*.6,s*.35)}));
  const eM=_b(0x44ff00);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.03,5,5),eM);e1.position.set(-s*.05,s*1.08,s*.25);g.add(e1);const e2=e1.clone();e2.position.x=s*.05;g.add(e2);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.2,s*.45,s*.18),_m(0x556633)),{position:new THREE.Vector3(-s*.4,s*.55,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*.35,s*.1),_m(0x667744)),{position:new THREE.Vector3(s*.35,s*.55,0)}));
  const lM=_m(0x556633);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.2,s*.15),lM);l1.position.set(-s*.15,s*.15,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.15;g.add(l2);
},
'亡灵法师'(g,t){const s=t.sz;
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.08,s*.2,s*.6,6),_m(0x3a2255)),{position:new THREE.Vector3(0,s*.4,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.25,s*.2,s*.18),_m(0x4a3366)),{position:new THREE.Vector3(0,s*.8,0)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.14,7,7),_m(0xddddaa)),{position:new THREE.Vector3(0,s*1.0,0)}));
  const eM=_b(0x4444ff);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.03,5,5),eM);e1.position.set(-s*.05,s*1.03,s*.12);g.add(e1);const e2=e1.clone();e2.position.x=s*.05;g.add(e2);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.06,6,6),_b(0x6644aa,{transparent:true,opacity:.7})),{position:new THREE.Vector3(s*.18,s*.75,s*.1)}));
},
'恶魔卫兵'(g,t){const s=t.sz;_body(g,s,0x882222,0x662211,{lc:0x551111,ac:0x882222,ec:0xff4400});
  const hM=_m(0x222222);const h1=new THREE.Mesh(new THREE.ConeGeometry(s*.04,s*.2,5),hM);h1.position.set(-s*.12,s*1.65,0);h1.rotation.z=.3;g.add(h1);const h2=h1.clone();h2.position.x=s*.12;h2.rotation.z=-.3;g.add(h2);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.12,s*.03),_m(0x555555,{m:.5})),{position:new THREE.Vector3(s*.38,s*.98,s*.1)}));
},
'地狱火'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.DodecahedronGeometry(s*.35,0),_m(0x553311,{r:.9}));bd.position.y=s*.6;bd.castShadow=true;g.add(bd);
  const lv=new THREE.Mesh(new THREE.DodecahedronGeometry(s*.3,0),_b(0xff4400,{transparent:true,opacity:.3}));lv.position.y=s*.6;lv.rotation.set(.5,.5,0);g.add(lv);
  g.add(_p(new THREE.Mesh(new THREE.DodecahedronGeometry(s*.15,0),_m(0x553311)),{position:new THREE.Vector3(0,s*1.05,0)}));
  const eM=_b(0xff8800);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.04,5,5),eM);e1.position.set(-s*.06,s*1.08,s*.12);g.add(e1);const e2=e1.clone();e2.position.x=s*.06;g.add(e2);
  const lM=_m(0x553311);const a1=new THREE.Mesh(new THREE.BoxGeometry(s*.18,s*.35,s*.18),lM);a1.position.set(-s*.4,s*.5,0);g.add(a1);const a2=a1.clone();a2.position.x=s*.4;g.add(a2);
  const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.25,s*.15),lM);l1.position.set(-s*.15,s*.15,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.15;g.add(l2);
},
'末日守卫'(g,t){const s=t.sz;_body(g,s,0x661100,0x551100,{lc:0x440800,ac:0x661100,ec:0xff2200});
  const hM=_m(0x222222);const h1=new THREE.Mesh(new THREE.ConeGeometry(s*.05,s*.25,5),hM);h1.position.set(-s*.12,s*1.7,0);h1.rotation.z=.4;g.add(h1);const h2=h1.clone();h2.position.x=s*.12;h2.rotation.z=-.4;g.add(h2);
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.01,s*.02,s*.7,4),_b(0xff4400,{transparent:true,opacity:.6})),{position:new THREE.Vector3(s*.35,s*.6,s*.15),rotation:new THREE.Euler(0,0,-.5)}));
},
'维库人'(g,t){const s=t.sz;_body(g,s,0x6666aa,0x8888aa,{lc:0x555577,ac:0x6666aa});
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.16,s*.2,s*.1,6),_m(0x888888,{m:.4})),{position:new THREE.Vector3(0,s*1.6,0)}));
  const hM=_m(0xccccaa);const h1=new THREE.Mesh(new THREE.ConeGeometry(s*.03,s*.15,4),hM);h1.position.set(-s*.18,s*1.6,0);h1.rotation.z=.5;g.add(h1);const h2=h1.clone();h2.position.x=s*.18;h2.rotation.z=-.5;g.add(h2);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.12,s*.1,s*.02),_m(0x888888,{m:.5})),{position:new THREE.Vector3(s*.35,s*.9,s*.1)}));
},
'冰霜巨龙'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.5,s*.35,s*.8),_m(0x88bbff,{m:.2}));bd.position.y=s*.5;bd.castShadow=true;g.add(bd);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.25,s*.2,s*.3),_m(0x88bbff)),{position:new THREE.Vector3(0,s*.65,s*.5)}));
  const eM=_b(0x44eeff);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.04,5,5),eM);e1.position.set(-s*.08,s*.7,s*.62);g.add(e1);const e2=e1.clone();e2.position.x=s*.08;g.add(e2);
  const wM=_m(0x88ccff,{side:THREE.DoubleSide,transparent:true,opacity:.7});
  const wg=new THREE.BufferGeometry();const v=new Float32Array([-s*.15,s*.5,0,-s*.7,s*1.0,-s*.2,-s*.2,s*.3,-s*.3]);wg.setAttribute('position',new THREE.BufferAttribute(v,3));wg.computeVertexNormals();
  g.add(new THREE.Mesh(wg,wM));const w2=new THREE.Mesh(wg,wM);w2.scale.x=-1;g.add(w2);
  const lM=_m(0x7799cc);[[-s*.2,s*.15,s*.25],[s*.2,s*.15,s*.25],[-s*.2,s*.15,-s*.25],[s*.2,s*.15,-s*.25]].forEach(p=>{g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*.25,s*.1),lM),{position:new THREE.Vector3(...p)}))});
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.1,s*.5,5),_m(0x88bbff)),{position:new THREE.Vector3(0,s*.4,-s*.65),rotation:new THREE.Euler(.8,0,0)}));
},
'瓦格里'(g,t){const s=t.sz;_body(g,s,0x8888aa,0x9999bb,{lc:0x666688,ac:0x8888aa});
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.12,s*.18,s*.12,6),_m(0x5a4a3a)),{position:new THREE.Vector3(0,s*1.62,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.04,s*.5,s*.015),_m(0xaaaacc,{m:.6})),{position:new THREE.Vector3(s*.35,s*.7,s*.1)}));
},
'虚空行者'(g,t){const s=t.sz;
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.3,8,8),_m(0x3311aa)),{position:new THREE.Vector3(0,s*.7,0)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.15,8,8),_m(0x4422bb)),{position:new THREE.Vector3(0,s*1.1,0)}));
  const eM=_b(0xaa44ff);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.04,5,5),eM);e1.position.set(-s*.06,s*1.13,s*.12);g.add(e1);const e2=e1.clone();e2.position.x=s*.06;g.add(e2);
  const aM=_m(0x3311aa);const a1=new THREE.Mesh(new THREE.BoxGeometry(s*.08,s*.3,s*.08),aM);a1.position.set(-s*.25,s*.75,0);g.add(a1);const a2=a1.clone();a2.position.x=s*.25;g.add(a2);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.5,8,8),_b(0x5522cc,{transparent:true,opacity:.08})),{position:new THREE.Vector3(0,s*.8,0)}));
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.15,s*.3,6),_b(0x4422bb,{transparent:true,opacity:.3})),{position:new THREE.Vector3(0,s*.35,0),rotation:new THREE.Euler(Math.PI,0,0)}));
},
'扭曲畸体'(g,t){const s=t.sz;
  const bd=new THREE.Mesh(new THREE.DodecahedronGeometry(s*.35,0),_m(0x663366));bd.position.y=s*.6;bd.rotation.set(.3,.2,.1);bd.castShadow=true;g.add(bd);
  const eM=_b(0xff44ff);for(let i=0;i<4;i++){const ey=new THREE.Mesh(new THREE.SphereGeometry(s*.04,5,5),eM);const an=i*1.5;ey.position.set(Math.cos(an)*s*.2,s*.6+Math.sin(an)*s*.15,s*.3);g.add(ey)}
  const tM=_m(0x774477);for(let i=0;i<3;i++){const tn=new THREE.Mesh(new THREE.CylinderGeometry(s*.04,s*.015,s*.4,5),tM);const an=i*2.1;tn.position.set(Math.cos(an)*s*.35,s*.5,Math.sin(an)*s*.15);tn.rotation.z=Math.cos(an)*.5;g.add(tn)}
  const lM=_m(0x663366);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.12,s*.2,s*.12),lM);l1.position.set(-s*.12,s*.15,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.15;g.add(l2);
},
'暗影精英'(g,t){const s=t.sz;_body(g,s,0x442266,0x553377,{lc:0x331155,ac:0x553377,ec:0xcc44ff});
  const hd=new THREE.Mesh(new THREE.SphereGeometry(s*.24,8,8,0,Math.PI*2,0,Math.PI*.55),_m(0x221144));hd.position.y=s*1.55;g.add(hd);
  const bM=_m(0x7744cc,{m:.5,transparent:true,opacity:.7});
  const b1=new THREE.Mesh(new THREE.BoxGeometry(s*.03,s*.35,s*.015),bM);b1.position.set(-s*.38,s*.6,s*.1);g.add(b1);const b2=b1.clone();b2.position.x=s*.38;g.add(b2);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.5,8,8),_b(0x6622cc,{transparent:true,opacity:.06})),{position:new THREE.Vector3(0,s*.9,0)}));
}
};
function mkEnemyMesh(t){
  const g=new THREE.Group();
  if(EB[t.name])EB[t.name](g,t);
  else{const b=new THREE.Mesh(new THREE.CapsuleGeometry(t.sz*.4,t.sz*.5,6,8),_m(t.color,{r:.7}));b.position.y=t.sz*.8;b.castShadow=true;g.add(b);
    const eM=_b(0xff0000);const e1=new THREE.Mesh(new THREE.SphereGeometry(t.sz*.1,8,8),eM);e1.position.set(-t.sz*.15,t.sz*1.1,t.sz*.3);g.add(e1);const e2=e1.clone();e2.position.x=t.sz*.15;g.add(e2)}
  // 脚底类型指示圈：tank=红色，fast=黄色，caster=紫色，其他=暗色
  const typeColors={tank:0xff4444,fast:0xffcc00,caster:0xaa44ff,fodder:0x886644,standard:0x666666};
  const tc=typeColors[t.type]||0x666666;
  const indicator=new THREE.Mesh(new THREE.RingGeometry(t.sz*.3,t.sz*.45,12),_b(tc,{side:THREE.DoubleSide,transparent:true,opacity:.2}));
  indicator.rotation.x=-Math.PI/2;indicator.position.y=.02;g.add(indicator);
  _hp(g,t.sz);return g;
}
function spawnEnemy(){
  const ch=S.chapter||CHAPTERS.ch1;const types=ch.enemyTypes;const wi=Math.min(S.wave-1,types.length-1);
  const pool=types.slice(0,wi+1);const t=Math.random()<.3&&wi>0?pool[wi]:pool[Math.floor(Math.random()*pool.length)];
  // 使用新数值公式计算波次缩放
  const scaled=calcEnemyStats(t,S.wave,ch);
  // 战力差距倍率：英雄越弱于推荐战力，怪物越强
  const pgm=S.powerGapMult||1;
  scaled.hp=Math.round(scaled.hp*pgm);
  scaled.atk=+(scaled.atk*pgm).toFixed(1);
  const mesh=mkEnemyMesh(t);const a=Math.random()*Math.PI*2,d=18+Math.random()*5;
  const hp=heroMesh?heroMesh.position:new THREE.Vector3();
  mesh.position.set(hp.x+Math.cos(a)*d,0,hp.z+Math.sin(a)*d);scene.add(mesh);
  // 精英怪判定
  const elite=isEliteSpawn(S.wave);
  const eHp=elite?scaled.hp*NUM.ELITE_HP_MULT:scaled.hp;
  const eAtk=elite?scaled.atk*NUM.ELITE_ATK_MULT:scaled.atk;
  const eXp=elite?scaled.xp*NUM.ELITE_XP_MULT:scaled.xp;
  if(elite){
    mesh.scale.multiplyScalar(NUM.ELITE_SIZE_MULT);
    // 精英怪添加金色光环
    const eliteRing=new THREE.Mesh(new THREE.RingGeometry(t.sz*.8,t.sz*1.0,16),_b(0xffaa00,{side:THREE.DoubleSide,transparent:true,opacity:.4}));
    eliteRing.rotation.x=-Math.PI/2;eliteRing.position.y=.12;mesh.add(eliteRing);
    mesh.userData.eliteRing=eliteRing;
  }
  S.enemies.push({mesh,type:t,hp:eHp,maxHp:eHp,atk:eAtk,speed:scaled.spd+Math.random()*.3,xp:eXp,
    isBoss:false,isElite:elite,hitFlash:0,frozen:0,
    // DOT状态
    burning:0,burnDmg:0,cursed:false});
}
// ==================== BOSS ====================
const BB={
'霍格'(g,c){const s=c.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.5,s*.6,s*.4),_m(0x664422));bd.position.y=s*.7;bd.castShadow=true;g.add(bd);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.25,8,8),_m(0x886644)),{position:new THREE.Vector3(0,s*1.15,s*.05)}));
  const eM=_b(0xff4400);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.06,6,6),eM);e1.position.set(-s*.1,s*1.2,s*.2);g.add(e1);const e2=e1.clone();e2.position.x=s*.1;g.add(e2);
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.1,s*.15,6),_m(0x886644)),{position:new THREE.Vector3(0,s*1.05,s*.25),rotation:new THREE.Euler(-Math.PI/2,0,0)}));
  const aM=_m(0x664422);const a1=new THREE.Mesh(new THREE.BoxGeometry(s*.18,s*.5,s*.15),aM);a1.position.set(-s*.4,s*.6,0);g.add(a1);const a2=a1.clone();a2.position.x=s*.4;g.add(a2);
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.04,s*.04,s*.8,6),_m(0x5a3a1a)),{position:new THREE.Vector3(s*.4,s*.7,s*.15),rotation:new THREE.Euler(0,0,-.2)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.12,s*.08),_m(0x888888,{m:.5})),{position:new THREE.Vector3(s*.4,s*1.15,s*.15)}));
  const lM=_m(0x664422);const l1=new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.3,s*.15),lM);l1.position.set(-s*.15,s*.2,0);g.add(l1);const l2=l1.clone();l2.position.x=s*.15;g.add(l2);
},
'范克里夫'(g,c){const s=c.sz;_body(g,s,0x882222,0xddccaa,{lc:0x442222,ac:0x772222});
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.3,s*.12,s*.22),_m(0xcc2222)),{position:new THREE.Vector3(0,s*1.42,s*.02)}));
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.18,s*.22,s*.08,8),_m(0x553333)),{position:new THREE.Vector3(0,s*1.62,0)}));
  const d1=new THREE.Mesh(new THREE.BoxGeometry(s*.04,s*.4,s*.015),_m(0xcccccc,{m:.8}));d1.position.set(-s*.4,s*.65,s*.12);g.add(d1);const d2=d1.clone();d2.position.x=s*.4;g.add(d2);
  g.add(_p(new THREE.Mesh(new THREE.PlaneGeometry(s*.45,s*.5),_m(0x882222,{side:THREE.DoubleSide})),{position:new THREE.Vector3(0,s*.85,-s*.18)}));
},
'血领主曼多基尔'(g,c){const s=c.sz;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(s*.45,s*.7,s*.3),_m(0x44aa66));bd.position.y=s*.75;bd.castShadow=true;g.add(bd);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.22,8,8),_m(0x44aa66)),{position:new THREE.Vector3(0,s*1.3,0)}));
  const tM=_m(0xffffcc);const t1=new THREE.Mesh(new THREE.ConeGeometry(s*.04,s*.15,4),tM);t1.position.set(-s*.08,s*1.18,s*.18);t1.rotation.x=-.3;g.add(t1);const t2=t1.clone();t2.position.x=s*.08;g.add(t2);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.35,s*.03,s*.01),_b(0xff0000)),{position:new THREE.Vector3(0,s*1.35,s*.22)}));
  const eM=_b(0xff2222);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.05,6,6),eM);e1.position.set(-s*.08,s*1.35,s*.18);g.add(e1);const e2=e1.clone();e2.position.x=s*.08;g.add(e2);
  const aM=_m(0x44aa66);const a1=new THREE.Mesh(new THREE.BoxGeometry(s*.12,s*.55,s*.12),aM);a1.position.set(-s*.35,s*.65,0);g.add(a1);const a2=a1.clone();a2.position.x=s*.35;g.add(a2);
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.025,s*.025,s*1.0,5),_m(0x8b4513)),{position:new THREE.Vector3(s*.35,s*.9,s*.1)}));
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.05,s*.15,4),_m(0xaaaaaa,{m:.6})),{position:new THREE.Vector3(s*.35,s*1.45,s*.1)}));
},
'拉格纳罗斯'(g,c){const s=c.sz;
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.45,8,8),_m(0xff4400,{emissive:0xff2200,emissiveIntensity:.4})),{position:new THREE.Vector3(0,s*.7,0)}));
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.3,s*.5,7),_b(0xff6600,{transparent:true,opacity:.8})),{position:new THREE.Vector3(0,s*1.3,0)}));
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.2,s*.35,6),_b(0xffaa00,{transparent:true,opacity:.6})),{position:new THREE.Vector3(0,s*1.5,0)}));
  const eM=_b(0xffff00);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.08,6,6),eM);e1.position.set(-s*.15,s*.85,s*.35);g.add(e1);const e2=e1.clone();e2.position.x=s*.15;g.add(e2);
  const aM=_b(0xff4400,{transparent:true,opacity:.7});const a1=new THREE.Mesh(new THREE.ConeGeometry(s*.1,s*.6,5),aM);a1.position.set(-s*.45,s*.8,0);a1.rotation.z=.8;g.add(a1);const a2=a1.clone();a2.position.set(s*.45,s*.8,0);a2.rotation.z=-.8;g.add(a2);
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.05,s*.05,s*1.2,6),_m(0x555555,{m:.5})),{position:new THREE.Vector3(s*.5,s*.8,s*.15),rotation:new THREE.Euler(0,0,-.3)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.2,s*.15,s*.08),_m(0x888888,{m:.6})),{position:new THREE.Vector3(s*.5,s*1.45,s*.15)}));
  const fr=new THREE.Mesh(new THREE.RingGeometry(s*.2,s*1.2,16),_b(0xff4400,{side:THREE.DoubleSide,transparent:true,opacity:.15,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));fr.rotation.x=-Math.PI/2;fr.position.y=.12;g.add(fr);
},
'克尔苏加德之影'(g,c){const s=c.sz;
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.15,s*.35,s*1.0,8),_m(0x3a2255)),{position:new THREE.Vector3(0,s*.6,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.5,s*.4,s*.3),_m(0x4a3366)),{position:new THREE.Vector3(0,s*1.2,0)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.2,8,8),_m(0xddddaa)),{position:new THREE.Vector3(0,s*1.55,0)}));
  const eM=_b(0x4488ff);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.06,6,6),eM);e1.position.set(-s*.08,s*1.58,s*.16);g.add(e1);const e2=e1.clone();e2.position.x=s*.08;g.add(e2);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.12,8,8),_b(0x4488ff,{transparent:true,opacity:.6})),{position:new THREE.Vector3(-s*.4,s*1.1,s*.15)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.12,8,8),_b(0x4488ff,{transparent:true,opacity:.6})),{position:new THREE.Vector3(s*.4,s*1.1,s*.15)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.8,12,12),_b(0x6644aa,{transparent:true,opacity:.06})),{position:new THREE.Vector3(0,s*1,0)}));
},
'阿克蒙德'(g,c){const s=c.sz;_body(g,s,0x662200,0x441100,{lc:0x441100,ac:0x662200,ec:0xff4400});
  const hM=_m(0x222222);const h1=new THREE.Mesh(new THREE.ConeGeometry(s*.06,s*.35,5),hM);h1.position.set(-s*.15,s*1.8,0);h1.rotation.z=.3;g.add(h1);const h2=h1.clone();h2.position.x=s*.15;h2.rotation.z=-.3;g.add(h2);
  const wM=_m(0x441100,{side:THREE.DoubleSide});const wg=new THREE.BufferGeometry();
  const v=new Float32Array([-s*.1,s*1.2,-s*.1,-s*.7,s*1.7,-s*.3,-s*.2,s*.7,-s*.2]);wg.setAttribute('position',new THREE.BufferAttribute(v,3));wg.computeVertexNormals();
  g.add(new THREE.Mesh(wg,wM));const w2=new THREE.Mesh(wg,wM);w2.scale.x=-1;g.add(w2);
  const spM=_m(0x444444,{m:.4});g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.25,s*.2,s*.3),spM),{position:new THREE.Vector3(-s*.4,s*1.3,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.25,s*.2,s*.3),spM),{position:new THREE.Vector3(s*.4,s*1.3,0)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*1.0,12,12),_b(0x882200,{transparent:true,opacity:.05})),{position:new THREE.Vector3(0,s*1,0)}));
},
'巫妖王'(g,c){const s=c.sz;_body(g,s,0x2a3a55,0xbbccdd,{lc:0x1a2a3a,ac:0x334466,ec:0x44bbff});
  g.add(_p(new THREE.Mesh(new THREE.CylinderGeometry(s*.2,s*.25,s*.15,8),_m(0x3a4a5a,{m:.6})),{position:new THREE.Vector3(0,s*1.62,0)}));
  const crM=_m(0x44aaff,{m:.3,transparent:true,opacity:.8});
  const cr1=new THREE.Mesh(new THREE.BoxGeometry(s*.03,s*.2,s*.03),crM);cr1.position.set(-s*.12,s*1.78,0);cr1.rotation.z=.15;g.add(cr1);
  const cr2=cr1.clone();cr2.position.x=s*.12;cr2.rotation.z=-.15;g.add(cr2);
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.03,s*.15,s*.03),crM),{position:new THREE.Vector3(0,s*1.82,0)}));
  const sM=_m(0x3a4a5a,{m:.5,r:.3});
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.28,s*.22,s*.32),sM),{position:new THREE.Vector3(-s*.4,s*1.3,0)}));
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.28,s*.22,s*.32),sM),{position:new THREE.Vector3(s*.4,s*1.3,0)}));
  const ic=_m(0x66ccff,{m:.3,transparent:true,opacity:.8});
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.04,s*.2,5),ic),{position:new THREE.Vector3(-s*.4,s*1.5,0)}));
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.04,s*.2,5),ic),{position:new THREE.Vector3(s*.4,s*1.5,0)}));
  const bl=new THREE.Mesh(new THREE.BoxGeometry(s*.1,s*1.1,s*.03),_m(0x6688aa,{m:.7,r:.2}));bl.position.set(s*.42,s*.9,s*.15);bl.rotation.z=-.1;bl.castShadow=true;g.add(bl);
  [.5,.7,.9,1.1].forEach(y=>{g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.05,s*.05,s*.04),_b(0x44ccff,{transparent:true,opacity:.8})),{position:new THREE.Vector3(s*.42,y,s*.16)}))});
  g.add(_p(new THREE.Mesh(new THREE.BoxGeometry(s*.18,s*.08,s*.08),_m(0x334455)),{position:new THREE.Vector3(s*.42,s*.32,s*.15)}));
  const fr=new THREE.Mesh(new THREE.RingGeometry(s*.2,s*1.2,20),_b(0x88ccff,{side:THREE.DoubleSide,transparent:true,opacity:.12,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));fr.rotation.x=-Math.PI/2;fr.position.y=.12;g.add(fr);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*1.0,12,12),_b(0x4488cc,{transparent:true,opacity:.04})),{position:new THREE.Vector3(0,s*1,0)}));
  g.add(_p(new THREE.Mesh(new THREE.PlaneGeometry(s*.5,s*.6),_m(0x2a3a55,{side:THREE.DoubleSide})),{position:new THREE.Vector3(0,s*.85,-s*.2)}));
},
'虚空领主'(g,c){const s=c.sz;
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.5,10,10),_m(0x2211aa)),{position:new THREE.Vector3(0,s*.8,0)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.22,8,8),_m(0x3322bb)),{position:new THREE.Vector3(0,s*1.4,0)}));
  const eM=_b(0xcc44ff);const e1=new THREE.Mesh(new THREE.SphereGeometry(s*.06,6,6),eM);e1.position.set(-s*.08,s*1.45,s*.18);g.add(e1);const e2=e1.clone();e2.position.x=s*.08;g.add(e2);
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*.06,6,6),_b(0xff22ff)),{position:new THREE.Vector3(0,s*1.55,s*.1)}));
  const aM=_m(0x2211aa);const a1=new THREE.Mesh(new THREE.BoxGeometry(s*.15,s*.5,s*.12),aM);a1.position.set(-s*.45,s*.8,0);g.add(a1);const a2=a1.clone();a2.position.x=s*.45;g.add(a2);
  for(let i=0;i<6;i++){const shard=new THREE.Mesh(new THREE.OctahedronGeometry(s*.06,0),_b(0x8844ff,{transparent:true,opacity:.5}));
    const an=i*Math.PI/3;shard.position.set(Math.cos(an)*s*.7,s*.8+Math.sin(an*2)*.2,Math.sin(an)*s*.7);g.add(shard)}
  g.add(_p(new THREE.Mesh(new THREE.ConeGeometry(s*.25,s*.4,6),_b(0x3311aa,{transparent:true,opacity:.3})),{position:new THREE.Vector3(0,s*.35,0),rotation:new THREE.Euler(Math.PI,0,0)}));
  g.add(_p(new THREE.Mesh(new THREE.SphereGeometry(s*1.0,12,12),_b(0x5522cc,{transparent:true,opacity:.05})),{position:new THREE.Vector3(0,s*.8,0)}));
}
};
function spawnBoss(cfg){
  const g=new THREE.Group();
  // 始终使用积木人模型（有动画）
  if(BB[cfg.name])BB[cfg.name](g,cfg);
  else{const b=new THREE.Mesh(new THREE.CapsuleGeometry(cfg.sz*.5,cfg.sz*.8,8,12),_m(cfg.color,{m:.4,r:.5}));b.position.y=cfg.sz*.9;b.castShadow=true;g.add(b);
    const hM=_m(0x222222);const h1=new THREE.Mesh(new THREE.ConeGeometry(.2,.8,6),hM);h1.position.set(-.4,cfg.sz*1.6,0);h1.rotation.z=.3;g.add(h1);const h2=h1.clone();h2.position.x=.4;h2.rotation.z=-.3;g.add(h2);
    const eM=_b(0xff4400);const e1=new THREE.Mesh(new THREE.SphereGeometry(.2,8,8),eM);e1.position.set(-.3,cfg.sz*1.35,cfg.sz*.4);g.add(e1);const e2=e1.clone();e2.position.x=.3;g.add(e2)}
  const aura=new THREE.Mesh(new THREE.RingGeometry(cfg.sz*.8,cfg.sz*1.2,32),_b(cfg.color,{side:THREE.DoubleSide,transparent:true,opacity:.2}));
  aura.rotation.x=-Math.PI/2;aura.position.y=.05;g.add(aura);g.userData.aura=aura;
  const a=Math.random()*Math.PI*2;const hp=heroMesh?heroMesh.position:new THREE.Vector3();
  g.position.set(hp.x+Math.cos(a)*15,0,hp.z+Math.sin(a)*15);scene.add(g);
  // 波次缩放：普通模式用线性+12%/波，无尽模式用calcBossStats指数缩放
  const ch=S.chapter||CHAPTERS.ch1;
  let bossHp,bossAtk;
  if(ch.endlessScale){
    const bossCount=S.bossKillsThisGame;
    const scaled=calcBossStats(cfg,bossCount);
    bossHp=scaled.hp;bossAtk=scaled.atk;
  }else{
    const wm=1+(S.wave-1)*0.12; // ↑ 0.05→0.12 BOSS缩放更陡
    bossHp=Math.round(cfg.hp*wm);bossAtk=+(cfg.atk*wm).toFixed(1);
  }
  // BOSS也应用战力差距倍率
  const pgm=S.powerGapMult||1;
  bossHp=Math.round(bossHp*pgm);bossAtk=+(bossAtk*pgm).toFixed(1);
  // 构建BOSS阶段数据
  const phases=cfg.phases||[{hpPct:1.0,skills:['charge'],atkMult:1.0,spdMult:1.0,interval:5}];
  const boss={mesh:g,type:{...cfg},
    hp:bossHp,maxHp:bossHp,
    atk:bossAtk,baseAtk:bossAtk, // baseAtk用于阶段转换乘数
    speed:cfg.spd,baseSpd:cfg.spd,
    xp:Math.round(25*(1+S.wave*0.15)),  // ↓ BOSS经验降低
    isBoss:true,isElite:false,hitFlash:0,frozen:0,
    burning:0,burnDmg:0,cursed:false,
    // BOSS阶段系统
    phases:phases,
    specTimer:phases[0].interval||5,
    specInterval:phases[0].interval||5,
    phaseSkills:phases[0].skills||[]
  };
  S.enemies.push(boss);S.boss=boss;S.bossActive=true;S.bossPhase=0;
  document.getElementById('boss-name').textContent='💀 '+cfg.name;document.getElementById('boss-hp-bar').classList.add('active');
}

// ==================== 屏幕震动系统 ====================
let shakeIntensity=0,shakeDuration=0,shakeTimer=0;
function screenShake(intensity=.15,duration=.2){shakeIntensity=Math.max(shakeIntensity,intensity);shakeDuration=Math.max(shakeDuration,duration);shakeTimer=0}
function screenFlash(color='#fff',opacity=.3,dur=120){
  const el=document.createElement('div');el.style.cssText=`position:fixed;inset:0;background:${color};opacity:${opacity};pointer-events:none;z-index:99;transition:opacity ${dur}ms ease-out`;
  document.getElementById('game-screen').appendChild(el);
  requestAnimationFrame(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),dur)})
}

// ==================== 弹射 & 粒子（全面升级版） ====================
function fireProjectile(from,to,color,dmg,sz=.15,spd=15,opts={}){
  const g=new THREE.Group();
  // 核心弹体 —— 明亮发光球（additive blending）
  const core=new THREE.Mesh(new THREE.SphereGeometry(sz,8,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95}));
  g.add(core);
  // 外层光晕（additive）
  const glowMat=new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false});
  const glowSpr=new THREE.Sprite(glowMat);glowSpr.scale.setScalar(sz*6);g.add(glowSpr);
  g.position.set(from.x,1,from.z);scene.add(g);
  const d=new THREE.Vector3(to.x-from.x,0,to.z-from.z).normalize();
  S.projectiles.push({mesh:g,dir:d,speed:spd,dmg,life:3,sz,color,trailTimer:0,...opts})
}
function aoeEffect(pos,r,color,dur=.5,opts={}){
  const g=new THREE.Group();
  // 着色器冲击波环
  const swMat=makeShockwaveShaderMat(color);
  swMat.depthWrite=false;swMat.polygonOffset=true;swMat.polygonOffsetFactor=-4;swMat.polygonOffsetUnits=-4;
  const sw=new THREE.Mesh(new THREE.PlaneGeometry(r*2.2,r*2.2),swMat);
  sw.rotation.x=-Math.PI/2;g.add(sw);
  // 内环光晕
  const innerMat=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
  const inner=new THREE.Mesh(new THREE.RingGeometry(.05,r*.4,24),innerMat);
  inner.rotation.x=-Math.PI/2;g.add(inner);
  // 外环
  const outerMat=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.35,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
  const outer=new THREE.Mesh(new THREE.RingGeometry(r*.6,r,24),outerMat);
  outer.rotation.x=-Math.PI/2;g.add(outer);
  g.position.set(pos.x,.35,pos.z);scene.add(g);
  // 动态光源
  addDynLight(pos,color,1.5,r*1.5,dur*.6);
  S.particles.push({mesh:g,life:dur,maxLife:dur,type:'aoe',radius:r,shaderMat:swMat,...opts})
}
function explosion(pos,color,n=10,opts={}){
  const py=pos.y||1;
  // 中心强闪光（sprite）
  const flashMat=new THREE.SpriteMaterial({map:glowTex,color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
  const flashSpr=new THREE.Sprite(flashMat);flashSpr.scale.setScalar(2);flashSpr.position.set(pos.x,py,pos.z);scene.add(flashSpr);
  S.particles.push({mesh:flashSpr,life:.12,maxLife:.12,type:'flash'});
  // 动态光源
  addDynLight(pos,color,3,8,.35);
  // GPU粒子爆发 —— 火花
  emitGpuBurst({x:pos.x,y:py,z:pos.z},color,n*2,6,4,.6,{gravity:10});
  // GPU粒子 —— 白色热核心
  emitGpuBurst({x:pos.x,y:py,z:pos.z},0xffffcc,Math.floor(n*.5),3,3,.3,{gravity:5,fadeStyle:'flash'});
  // 烟雾GPU粒子
  const smokeN=Math.floor(Math.max(2,n/3)*VFX.trailDensity);
  for(let i=0;i<smokeN;i++){
    const a=Math.random()*Math.PI*2;
    emitGpuP({x:pos.x,y:py,z:pos.z},0x444444,
      {x:Math.cos(a)*1.5,y:1+Math.random()*2,z:Math.sin(a)*1.5},
      5+Math.random()*3,.8+Math.random()*.5,{gravity:1,shrink:false,fadeStyle:'linear'});
  }
  // 冲击波环（仅大爆炸）
  if(n>=8){
    const swMat=makeShockwaveShaderMat(color);
    const sw=new THREE.Mesh(new THREE.PlaneGeometry(2,2),swMat);
    sw.rotation.x=-Math.PI/2;sw.position.set(pos.x,py,pos.z);scene.add(sw);
    S.particles.push({mesh:sw,life:.4,maxLife:.4,type:'shockwave',speed:n*.8,shaderMat:swMat});
  }
}
// 闪电视觉效果（连接两点的锯齿闪电 — 增强版：additive+光源+GPU电花）
function lightningBolt(from,to,color=0x88aaff,width=.05,segments=8){
  const pts=[];const dx=to.x-from.x,dz=to.z-from.z;
  for(let i=0;i<=segments;i++){
    const t=i/segments;
    const jx=(i>0&&i<segments)?(Math.random()-.5)*1.5:0;
    const jz=(i>0&&i<segments)?(Math.random()-.5)*1.5:0;
    const jy=(i>0&&i<segments)?(Math.random()-.5)*.8:0;
    pts.push(new THREE.Vector3(from.x+dx*t+jx,1+jy,from.z+dz*t+jz));
  }
  const curve=new THREE.CatmullRomCurve3(pts);
  const gg=new THREE.Group();
  // 核心电弧（亮白色）
  const bolt=new THREE.Mesh(new THREE.TubeGeometry(curve,segments*2,width,4,false),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));
  gg.add(bolt);
  // 中层彩色光晕
  const glowTube=new THREE.Mesh(new THREE.TubeGeometry(curve,segments*2,width*3,4,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false}));
  gg.add(glowTube);
  // 外层扩散
  const outerTube=new THREE.Mesh(new THREE.TubeGeometry(curve,segments*2,width*6,3,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.06,blending:THREE.AdditiveBlending,depthWrite:false}));
  gg.add(outerTube);
  scene.add(gg);
  // 沿路径散落GPU电花粒子
  const sparkN=Math.floor(4*VFX.trailDensity);
  for(let i=0;i<sparkN;i++){const t=Math.random();const p=curve.getPointAt(t);emitGpuP(p,color,{x:(Math.random()-.5)*3,y:1+Math.random()*2,z:(Math.random()-.5)*3},2,.25,{gravity:5});}
  // 中点动态光源
  const mid=pts[Math.floor(pts.length/2)];addDynLight(mid,color,1.5,8,.2);
  S.particles.push({mesh:gg,life:.2,maxLife:.2,type:'lightning'});
}
// 粗闪电弧（连锁闪电用，带电弧分支 — 增强版）
function thickLightningArc(from,to,color=0x44ccff,width=.1,segments=10){
  const pts=[];const dx=to.x-from.x,dz=to.z-from.z,dy=(to.y||1)-(from.y||1);
  for(let i=0;i<=segments;i++){
    const t=i/segments;
    const jx=(i>0&&i<segments)?(Math.random()-.5)*2:0;
    const jz=(i>0&&i<segments)?(Math.random()-.5)*2:0;
    const jy=(i>0&&i<segments)?(Math.random()-.5)*1:0;
    pts.push(new THREE.Vector3(from.x+dx*t+jx,(from.y||1)+dy*t+jy,from.z+dz*t+jz));
  }
  const curve=new THREE.CatmullRomCurve3(pts);
  const g=new THREE.Group();
  // 核心（白色）
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,segments*2,width,5,false),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false})));
  // 彩色中层
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,segments*2,width*2.5,5,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.35,blending:THREE.AdditiveBlending,depthWrite:false})));
  // 外层
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,segments*2,width*5,3,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.08,blending:THREE.AdditiveBlending,depthWrite:false})));
  // 分支
  const brN=perfTier==='low'?1:2+Math.floor(Math.random()*2);
  for(let b=0;b<brN;b++){
    const bi=Math.floor((.2+Math.random()*.6)*segments);
    const bp=pts[Math.min(bi,pts.length-1)].clone();
    const be=bp.clone().add(new THREE.Vector3((Math.random()-.5)*3,(Math.random()-.5)*1.5,(Math.random()-.5)*3));
    const brPts=[bp];for(let j=1;j<4;j++){const tt=j/4;brPts.push(new THREE.Vector3(bp.x+(be.x-bp.x)*tt+(Math.random()-.5)*.5,bp.y+(be.y-bp.y)*tt+(Math.random()-.5)*.3,bp.z+(be.z-bp.z)*tt+(Math.random()-.5)*.5))}brPts.push(be);
    const brCurve=new THREE.CatmullRomCurve3(brPts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(brCurve,6,width*.5,3,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false})));
  }
  scene.add(g);
  // GPU电花粒子沿弧线
  emitGpuBurst({x:(from.x+to.x)/2,y:(from.y||1+to.y||1)/2,z:(from.z+to.z)/2},color,8,4,3,.3,{gravity:6});
  // 动态光
  const mid=pts[Math.floor(pts.length/2)];addDynLight(mid,color,2,10,.3);
  S.particles.push({mesh:g,life:.35,maxLife:.35,type:'lightning'});
  return g;
}
// 叉状闪电视觉（从一点分叉成多条 — 增强版）
function forkedLightningFx(origin,targets,color=0xaaddff,width=.08){
  const g=new THREE.Group();
  targets.forEach(tgt=>{
    const to=tgt.mesh?tgt.mesh.position:tgt;
    const segments=8;const pts=[];
    const dx=to.x-origin.x,dz=to.z-origin.z;
    for(let i=0;i<=segments;i++){
      const t=i/segments;const spread=t<.3?.3:1;
      const jx=(i>0&&i<segments)?(Math.random()-.5)*1.8*spread:0;
      const jz=(i>0&&i<segments)?(Math.random()-.5)*1.8*spread:0;
      const jy=(i>0&&i<segments)?(Math.random()-.5)*.6:0;
      pts.push(new THREE.Vector3(origin.x+dx*t+jx,(origin.y||1)+jy+Math.sin(t*Math.PI)*.5,origin.z+dz*t+jz));
    }
    const curve=new THREE.CatmullRomCurve3(pts);
    // 白色核心
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,segments*2,width,4,false),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false})));
    // 彩色光晕
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,segments*2,width*3,3,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.2,blending:THREE.AdditiveBlending,depthWrite:false})));
    // 末端GPU电花爆发
    emitGpuBurst(to,color,5,3,2,.25,{gravity:4});
  });
  // 起点光球（sprite）
  const coreMat=new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false});
  const coreSpr=new THREE.Sprite(coreMat);coreSpr.scale.setScalar(1.5);coreSpr.position.set(origin.x,origin.y||1,origin.z);g.add(coreSpr);
  scene.add(g);
  addDynLight(origin,color,2,10,.3);
  S.particles.push({mesh:g,life:.4,maxLife:.4,type:'lightning'});
}
// 电弧冲击波环（连锁闪电跳跃落点特效 — 增强版）
function electricImpact(pos,r=1.5,color=0x44ccff){
  // 着色器冲击波
  const swMat=makeShockwaveShaderMat(color);
  swMat.depthWrite=false;swMat.polygonOffset=true;swMat.polygonOffsetFactor=-4;swMat.polygonOffsetUnits=-4;
  const sw=new THREE.Mesh(new THREE.PlaneGeometry(r*2,r*2),swMat);
  sw.rotation.x=-Math.PI/2;sw.position.set(pos.x,.35,pos.z);scene.add(sw);
  S.particles.push({mesh:sw,life:.3,maxLife:.3,type:'shockwave',speed:6,shaderMat:swMat});
  // GPU电火花
  emitGpuBurst({x:pos.x,y:1,z:pos.z},color,8,5,3,.35,{gravity:8});
  addDynLight(pos,color,1.5,6,.25);
}
// 光柱效果（从天而降 — 着色器版）
function lightBeam(pos,color=0xff00ff,r=1,dur=.8){
  const g=new THREE.Group();
  // 着色器光柱（能量流动效果）
  const beamMat=makeBeamShaderMat(color,{opacity:0.4});
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(r*.3,r,12,12,1,true),beamMat);
  beam.position.set(0,6,0);g.add(beam);
  // 底部光晕（sprite）
  const baseMat=new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false});
  const baseSpr=new THREE.Sprite(baseMat);baseSpr.scale.set(r*3,r*1.5,1);baseSpr.position.y=.3;g.add(baseSpr);
  // 旋转光环
  const halo=new THREE.Mesh(new THREE.TorusGeometry(r*.8,.08,8,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
  halo.rotation.x=-Math.PI/2;halo.position.y=.5;g.add(halo);
  // 上升光点GPU粒子
  const pN=Math.floor(6*VFX.trailDensity);
  for(let i=0;i<pN;i++){
    emitGpuP({x:pos.x+(Math.random()-.5)*r,y:.5,z:pos.z+(Math.random()-.5)*r},color,
      {x:(Math.random()-.5)*.5,y:3+Math.random()*4,z:(Math.random()-.5)*.5},2,dur*.8,{gravity:-1,shrink:true});
  }
  g.position.set(pos.x,0,pos.z);scene.add(g);
  addDynLight(pos,color,2.5,r*3,dur*.7);
  S.particles.push({mesh:g,life:dur,maxLife:dur,type:'beam',shaderMat:beamMat})
}
// 旋转刀刃效果（增强：光晕拖尾+动态光）
function spinBlade(center,r,color=0xffaa00,dur=2,bladeCount=4){
  const g=new THREE.Group();
  for(let i=0;i<bladeCount;i++){
    const ang=(i/bladeCount)*Math.PI*2;
    const blade=new THREE.Mesh(new THREE.BoxGeometry(r*.6,.08,.15),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
    blade.position.set(Math.cos(ang)*r*.5,.5,Math.sin(ang)*r*.5);
    blade.rotation.y=ang;g.add(blade);
    // 刀刃光晕拖尾
    const trailMat=new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false});
    const trail=new THREE.Sprite(trailMat);trail.scale.set(r*.5,.3,1);
    trail.position.set(Math.cos(ang)*r*.6,.5,Math.sin(ang)*r*.6);g.add(trail);
  }
  // 中心能量柱
  const coreMat=new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,depthWrite:false});
  const core=new THREE.Sprite(coreMat);core.scale.set(1,3,1);core.position.y=1;g.add(core);
  g.position.set(center.x,0,center.z);scene.add(g);
  addDynLight(center,color,2,r*1.5,dur*.5);
  S.particles.push({mesh:g,life:dur,maxLife:dur,type:'spin',speed:8})
}
// 冰晶散射效果（增强：冰晶+GPU冰粒+冰蓝光）
function iceShatter(pos,r,n=12){
  const nn=Math.floor(n*VFX.trailDensity);
  // 少量Mesh冰晶（保留视觉多样性）
  const meshN=Math.min(nn,6);
  for(let i=0;i<meshN;i++){
    const sz=.08+Math.random()*.12;
    const geom=Math.random()>.5?new THREE.OctahedronGeometry(sz):new THREE.TetrahedronGeometry(sz);
    const m=new THREE.Mesh(geom,new THREE.MeshStandardMaterial({color:0x88ddff,transparent:true,opacity:.85,metalness:.3,roughness:.2,emissive:0x224466,emissiveIntensity:.5}));
    m.position.copy(pos);m.position.y=1;scene.add(m);
    const ang=Math.random()*Math.PI*2;const spd=3+Math.random()*5;
    const v=new THREE.Vector3(Math.cos(ang)*spd,1+Math.random()*3,Math.sin(ang)*spd);
    S.particles.push({mesh:m,life:.6+Math.random()*.4,maxLife:.6+Math.random()*.4,type:'exp',vel:v})
  }
  // 大量GPU冰晶粒子
  emitGpuBurst({x:pos.x,y:1,z:pos.z},0x88ddff,nn,5,3,.7,{gravity:8});
  emitGpuBurst({x:pos.x,y:1,z:pos.z},0xbbeeff,Math.floor(nn*.3),3,2,.4,{gravity:4,fadeStyle:'flash'});
  addDynLight(pos,0x44aaff,1.5,r*.8,.4);
}
// 火焰尾迹（GPU粒子版，高效率）
function fireTrail(pos,color=0xff4400){
  const n=Math.ceil(2*VFX.trailDensity);
  for(let i=0;i<n;i++){
    emitGpuP({x:pos.x+(Math.random()-.5)*.3,y:pos.y||1,z:pos.z+(Math.random()-.5)*.3},
      color,{x:(Math.random()-.5)*.8,y:1.5+Math.random()*2,z:(Math.random()-.5)*.8},
      3+Math.random()*2,.3+Math.random()*.2,{gravity:2,shrink:true});
  }
  // 偶尔加个白色热点
  if(Math.random()<.3)emitGpuP({x:pos.x,y:pos.y||1,z:pos.z},0xffffaa,{x:0,y:2,z:0},2,.15,{gravity:1,fadeStyle:'flash'});
}
function spawnPickup(pos,type='xp'){let g,mt;if(type==='xp'){g=new THREE.OctahedronGeometry(.15,0);mt=new THREE.MeshBasicMaterial({color:0x44aaff,transparent:true,opacity:.8})}else if(type==='gold'){g=new THREE.CylinderGeometry(.12,.12,.05,12);mt=new THREE.MeshStandardMaterial({color:0xc9a44a,metalness:.8})}else{g=new THREE.SphereGeometry(.15,8,8);mt=new THREE.MeshBasicMaterial({color:0x44ff44,transparent:true,opacity:.8})}const m=new THREE.Mesh(g,mt);m.position.set(pos.x+(Math.random()-.5),.5,pos.z+(Math.random()-.5));scene.add(m);S.pickups.push({mesh:m,type,life:15})}

// ==================== 伤害 ====================
function nearest(pos,max){let b=null,d=max;for(const e of S.enemies){const dd=e.mesh.position.distanceTo(pos);if(dd<d){d=dd;b=e}}return b}
function nearestN(pos,max,n){return[...S.enemies].filter(e=>e.mesh.position.distanceTo(pos)<max).sort((a,b)=>a.mesh.position.distanceTo(pos)-b.mesh.position.distanceTo(pos)).slice(0,n)}
function hasSkill(id){return S.skills.some(s=>s.id===id)}
function sklLv(id){const s=S.skills.find(s=>s.id===id);return s?s.level:0}
function dmgEnemy(e,d,opts={}){
  if(!e||e.hp<=0)return;
  if(!isFinite(d)||d!==d){d=1}
  const tb=S.talentBonus||{};
  // 暴击判定
  const cr=opts.noCrit?false:rollCrit(S.critRate+(opts.bonusCrit||0));
  // 盗贼被动：暴击后下一次必暴击
  const hero=PD.selectedHero;
  if(hero==='rogue'&&S.passiveStacks.shadowNextCrit){
    S.passiveStacks.shadowNextCrit=false;
  }
  let finalD=cr?d*(S.critDmg+(opts.bonusCritDmg||0)):d;
  // 盗贼被动：暴击后标记下次必暴击+伤害提升
  if(hero==='rogue'&&cr){S.passiveStacks.shadowNextCrit=true;finalD*=1.5;
    // 盗贼攻击叠加连击点
    if(S.passiveStacks.comboPoints!==undefined)S.passiveStacks.comboPoints=Math.min(5,(S.passiveStacks.comboPoints||0)+1)}
  // 暗牧被动：DOT伤害回血
  if(hero==='priest'&&opts.isDot){S.hp=Math.min(S.maxHp,S.hp+finalD*0.15)}
  // ===== 暗影形态DOT伤害加成 =====
  if(S.passiveStacks.shadowFormActive&&opts.isDot&&S.passiveStacks.shadowFormDotBonus>0){finalD*=(1+S.passiveStacks.shadowFormDotBonus)}
  // ===== 黑暗契约技能伤害加成 =====
  if(S.passiveStacks.darkPactActive>0&&opts.isSkill&&S.passiveStacks.darkPactSkillDmg>0){finalD*=(1+S.passiveStacks.darkPactSkillDmg)}
  // ===== 天赋攻击效果 =====
  // 狂暴: 低血量(<30%)时攻击力额外加成
  if(tb.berserker>0&&S.hp<S.maxHp*0.30){finalD*=(1+tb.berserker)}
  // 处决: 对低血量(<30%)敌人额外伤害
  if(tb.execute>0&&e.hp<e.maxHp*0.30){finalD*=(1+tb.execute)}
  // 技能伤害加成
  if(tb.skillDmg>0&&opts.isSkill){finalD*=(1+tb.skillDmg)}
  // ===== 局内BUFF: 技能伤害加成 =====
  const _bfs=S.buffStats||{};
  if(_bfs.skillDmg>0&&opts.isSkill){finalD*=(1+_bfs.skillDmg)}
  // ===== 局内BUFF: 精英/BOSS伤害加成 =====
  if(_bfs.eliteDmg>0&&(e.isElite||e.isBoss)){finalD*=(1+_bfs.eliteDmg)}
  // 护甲穿透: 无视敌人部分护甲(对BOSS有效)
  if(tb.armorPen>0&&e.armor>0){
    const ignoreArmor=e.armor*tb.armorPen;
    const effectiveArmor=Math.max(0,e.armor-ignoreArmor);
    const origReduce=e.armor>0?Math.min(0.75,e.armor/(e.armor+20)):0;
    const newReduce=effectiveArmor>0?Math.min(0.75,effectiveArmor/(effectiveArmor+20)):0;
    // 补偿已计算的护甲减伤差值
    if(origReduce>newReduce)finalD*=(1-newReduce)/(1-origReduce);
  }
  // 装备特效：暗影爆发
  if(S.equipEffects.shadow&&Math.random()<0.15){finalD*=1.5;explosion(e.mesh.position,0x7722cc,5)}
  // 装备特效：风暴之戒（技能伤害+12%）
  if(S.equipEffects.storm&&opts.isSkill){finalD*=1.12}
  finalD=Math.max(1,Math.round(finalD));
  // NaN防护：如果经过各种加成后变成NaN，兜底为1
  if(!isFinite(finalD)||finalD!==finalD)finalD=1;
  // 修复已处于NaN状态的怪物hp（补救之前的bug残留）
  if(e.hp!==e.hp)e.hp=0;
  e.hp-=finalD;e.hitFlash=.12;showDmg(e.mesh.position,finalD,cr,opts.skillName||null);
  // 音效：暴击用重音，普通命中用轻音（节流：每60ms最多一次）
  if(SFX.hit){const _nt=Date.now();if(!dmgEnemy._lastSfx||_nt-dmgEnemy._lastSfx>60){dmgEnemy._lastSfx=_nt;if(cr&&SFX.crit)SFX.crit();else SFX.hit()}}
  // 伤害统计追踪
  trackDmg(finalD,opts.skillName||null,cr);
  // ===== 天赋吸血效果 =====
  // 生命汲取: 造成伤害的一部分转为治疗
  if(tb.leech>0){S.hp=Math.min(S.maxHp,S.hp+finalD*tb.leech)}
  // ===== 局内BUFF: 吸血 =====
  if(_bfs.leech>0){S.hp=Math.min(S.maxHp,S.hp+finalD*_bfs.leech)}
  // ===== 天赋暴击冲击波 =====
  // 灭世: 技能暴击时释放冲击波
  if(tb.critWave>0&&cr&&opts.isSkill&&e.mesh){
    const cwPos=e.mesh.position.clone();const cwR=3.5;
    aoeEffect(cwPos,cwR,0xff8800,.4);
    S.enemies.forEach(e2=>{if(e2!==e&&e2.hp>0&&e2.mesh.position.distanceTo(cwPos)<cwR)
      dmgEnemy(e2,finalD*0.3,{noCrit:true,skillName:'暴击冲击波'})});
  }
  // 法师被动：点燃（火焰攻击附加燃烧DOT）
  if(hero==='mage'&&opts.isFireDmg&&!e.burning){
    e.burning=3;e.burnDmg=finalD*0.10; // 3秒内每秒造成10%原伤害
  }
  if(e.mesh.userData.hpBar){const r=Math.max(0,e.hp/e.maxHp);e.mesh.userData.hpBar.scale.x=r;e.mesh.userData.hpBar.position.x=-(1-r)*e.mesh.userData.hpW*.5}
  if(e.isBoss){
    const fill=document.getElementById('boss-hp-fill');if(fill)fill.style.width=Math.max(0,e.hp/e.maxHp*100)+'%';
    // BOSS阶段转换检测
    checkBossPhase(e);
  }
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  const ep=e.mesh.position.clone();const ec=e.type.color;
  // 击杀音效
  if(e.isBoss&&SFX.bossKill)SFX.bossKill();
  else if(e.isElite&&SFX.eliteKill)SFX.eliteKill();
  else if(SFX.kill)SFX.kill();
  // 基础爆炸粒子
  explosion(ep,ec,e.isBoss?30:e.isElite?18:10);
  // GPU粒子增强死亡效果
  emitGpuBurst(ep,ec,e.isBoss?40:e.isElite?20:8,e.isBoss?8:5,e.isBoss?5:3,.6,{gravity:6});
  // 白色核心闪光
  emitGpuBurst(ep,0xffffff,e.isBoss?15:e.isElite?8:3,3,2,.3,{gravity:2,fadeStyle:'flash'});
  // 动态光源
  addDynLight(ep,ec,e.isBoss?4:e.isElite?2.5:1.2,e.isBoss?15:10,e.isBoss?.5:.25);
  if(e.isBoss){screenShake(.2,.3);screenFlash('#ff4400',.2,200);lightBeam(ep,ec,2,.6)}
  else if(e.isElite){screenShake(.1,.15);screenFlash('#ffaa00',.1,100);lightBeam(ep,0xffaa00,1.2,.4)}
  else if(Math.random()<.3)screenShake(.03,.06);
  // XP掉落：固定少量球，避免经验膨胀
  const xpDropCount=e.isBoss?5:e.isElite?3:2; // ↑ 更多XP球，升级更快更爽
  for(let i=0;i<xpDropCount;i++)spawnPickup(e.mesh.position,'xp');
  // 金币掉落：波次缩放
  const goldChance=e.isBoss?1.0:e.isElite?0.8:0.4;
  const tb=S.talentBonus||{};
  // ===== 天赋: 击杀必掉金币 =====
  const finalGoldChance=tb.goldOnKill>0?1.0:goldChance;
  if(Math.random()<finalGoldChance){
    const goldCount=e.isBoss?3:e.isElite?2:1;
    for(let i=0;i<goldCount;i++)spawnPickup(e.mesh.position,'gold');
  }
  // 生命恢复球掉落
  if(Math.random()<NUM.HEAL_ORB_CHANCE*(e.isElite?2:1))spawnPickup(e.mesh.position,'heal');
  // 血之渴望被动
  if(hasSkill('bloodthirst')){
    const l=sklLv('bloodthirst');const sk=SKILL_DB.find(s=>s.id==='bloodthirst');
    const healPct=sk.healOnKillPct+(l-1)*sk.healOnKillPctPerLv;
    S.hp=Math.min(S.maxHp,S.hp+S.maxHp*healPct);
  }
  // ===== 天赋: 击杀回血 =====
  if(tb.killHeal>0){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*tb.killHeal)}
  // ===== 天赋: 击杀精英回血 =====
  if(tb.eliteHeal>0&&e.isElite){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*tb.eliteHeal)}
  // ===== 局内BUFF: 击杀回血 =====
  const _bfs2=S.buffStats||{};
  if(_bfs2.killHeal>0){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*_bfs2.killHeal)}
  // 术士被动：诅咒目标死亡爆炸
  if(PD.selectedHero==='warlock'&&e.cursed){
    const splashDmg=e.maxHp*0.15;const splashR=2.5;
    explosion(e.mesh.position,0x22ff22,12);aoeEffect(e.mesh.position,splashR,0x22ff22,.3);
    S.enemies.forEach(e2=>{if(e2!==e&&e2.hp>0&&e2.mesh.position.distanceTo(e.mesh.position)<splashR)dmgEnemy(e2,splashDmg,{noCrit:true})});
  }
  // 灵魂收割合成技
  if(S.comboSkills.includes('soulreap')){
    const combo=SKILL_COMBOS.find(c=>c.id==='soulreap');
    const targets=nearestN(e.mesh.position,8,combo.soulCount);
    targets.forEach(t=>{if(t!==e&&t.hp>0){
      const soulDmg=combo.soulDmg+S.attack*combo.soulAtkRatio;
      fireProjectile(e.mesh.position,t.mesh.position,0x88ff88,soulDmg,.12,combo.soulSpeed,{trail:'leaf',trailColor:0x66ff66})}});
  }
  // 装备特效：战神徽记叠加战意
  if(S.equipEffects.warcry){
    S.passiveStacks.warcryStacks=Math.min(10,(S.passiveStacks.warcryStacks||0)+1);
  }
  scene.remove(e.mesh);const idx=S.enemies.indexOf(e);if(idx>=0)S.enemies.splice(idx,1);
  S.kills++;S.killStreak++;S.ksTimer=2;PD.totalKills++;PD.dailyProgress.kills=(PD.dailyProgress.kills||0)+1;
  if(e.isElite){S.eliteKills++;PD.totalEliteKills=(PD.totalEliteKills||0)+1;PD.dailyProgress.eliteKills=(PD.dailyProgress.eliteKills||0)+1}
  if(e.isBoss){S.boss=null;S.bossActive=false;S.bossSpawning=false;S.bossPhase=0;S.bossKillsThisGame++;
    document.getElementById('boss-hp-bar').classList.remove('active');
    S.gold+=Math.round(NUM.GOLD_BOSS_MULT*(1+S.wave*0.5));
    PD.totalBossKills++;PD.dailyProgress.bossKills=(PD.dailyProgress.bossKills||0)+1;
    // BOSS击杀宝箱掉落
    spawnLootChest(ep,'boss');
    if(S.chapter&&S.chapter.id!=='endless'&&S.wave>=S.chapter.waves){showResult(true);return}
    // 无尽模式或非终极BOSS波：击杀BOSS后推进下一波
    if(S.chapter&&(S.chapter.id==='endless'||S.wave<S.chapter.waves)){S.wave++;S.waveT=0;announceWaveEnhanced(S.wave);if(S.wave>PD.maxWave)PD.maxWave=S.wave}
  }
  // 精英怪掉落宝箱概率（天赋: 精英掉宝率提升）
  else if(e.isElite&&Math.random()<0.4+(tb.eliteLoot||0))spawnLootChest(ep,'elite');
  if(S.killStreak>PD.maxKillStreak)PD.maxKillStreak=S.killStreak;
  if(S.level>(PD.maxLevelReached||0))PD.maxLevelReached=S.level;
  // === 击杀里程碑系统 ===
  checkKillMilestones();
  // === 极速连杀计数（1秒内连续击杀） ===
  updateRapidKill();
  // === 动态事件：击杀进度检查 ===
  if(S.activeEvent&&S.activeEvent.type==='challenge'){S.activeEvent.progress++;updateEventUI()}
}
// === 技能专属伤害颜色映射 ===
const SKILL_DMG_STYLE={
  '火球术':{color:'#ff6622',glow:'rgba(255,102,34,.8)',icon:'🔥'},
  '活体炸弹':{color:'#ff4400',glow:'rgba(255,68,0,.8)',icon:'💥'},
  '霜冻新星':{color:'#44ddff',glow:'rgba(68,221,255,.8)',icon:'❄️'},
  '暴风雪':{color:'#66bbff',glow:'rgba(102,187,255,.8)',icon:'🌨️'},
  '霜之哀伤':{color:'#4488ff',glow:'rgba(68,136,255,.8)',icon:'🥶'},
  '雷霆一击':{color:'#ffff44',glow:'rgba(255,255,68,.8)',icon:'⚡'},
  '闪电链':{color:'#88ccff',glow:'rgba(136,204,255,.8)',icon:'⛓️'},
  '连锁闪电':{color:'#44ccff',glow:'rgba(68,204,255,.8)',icon:'🌩️'},
  '叉状闪电':{color:'#aaddff',glow:'rgba(170,221,255,.8)',icon:'🔱'},
  '自然之怒':{color:'#44ff44',glow:'rgba(68,255,68,.8)',icon:'🍃'},
  '灰烬使者':{color:'#ffaa00',glow:'rgba(255,170,0,.8)',icon:'🗡️'},
  '萨格拉斯之眼':{color:'#ff44ff',glow:'rgba(255,68,255,.8)',icon:'👁️'},
  '达拉然坠落':{color:'#ff6600',glow:'rgba(255,102,0,.9)',icon:'🏰'},
  '泰坦之握':{color:'#ff8844',glow:'rgba(255,136,68,.8)',icon:'👊'},
  '冰火两重天':{color:'#ff88ff',glow:'rgba(255,136,255,.8)',icon:'🌡️'},
  '荆棘术':{color:'#88ff44',glow:'rgba(136,255,68,.8)',icon:'🌿'},
};
function showDmg(wp,v,crit,skillName){
  try{
    const sp=wp.clone();sp.y+=2;sp.project(camera);
    const x=(sp.x*.5+.5)*innerWidth,y=(-sp.y*.5+.5)*innerHeight;
    const style=skillName?SKILL_DMG_STYLE[skillName]:null;
    const el=document.createElement('div');
    // 构建className
    let cls='dmg-num';
    if(crit)cls+=' crit';
    if(style)cls+=' skill-dmg';
    el.className=cls;
    // 技能伤害带颜色+技能名标签
    if(style&&!crit){
      el.style.color=style.color;
      el.style.textShadow=`0 0 8px ${style.glow},0 0 16px ${style.glow},0 2px 4px rgba(0,0,0,.9)`;
      el.innerHTML=`${style.icon}<span class="sdmg-val">${v}</span>`;
    }else if(style&&crit){
      el.style.color=style.color;
      el.style.textShadow=`0 0 15px ${style.glow},0 0 30px ${style.glow},0 0 50px ${style.glow},0 3px 6px rgba(0,0,0,.9)`;
      el.innerHTML=`${style.icon}<span class="sdmg-val">${v}</span><span class="sdmg-crit">暴击!</span>`;
    }else{
      el.textContent=v;
    }
    // 高伤害特殊尺寸（>500时放大）
    if(v>=2000){el.classList.add('dmg-mega')}
    else if(v>=500){el.classList.add('dmg-big')}
    // 位置随机偏移，避免重叠
    const ox=(Math.random()-.5)*40;
    const oy=(Math.random()-.5)*20;
    el.style.left=(x+ox)+'px';el.style.top=(y+oy)+'px';
    document.getElementById('game-screen').appendChild(el);
    setTimeout(()=>el.remove(),crit?1000:800);
  }catch(e){}
}

// ==================== 系统1：击杀里程碑 ====================
const KILL_MILESTONES=[
  {kills:25,title:'初试牛刀',desc:'25连杀',tier:0},
  {kills:50,title:'嗜血',desc:'50连杀',tier:1},
  {kills:100,title:'杀戮盛宴',desc:'100连杀',tier:2},
  {kills:200,title:'不可阻挡',desc:'200连杀',tier:3},
  {kills:500,title:'死神降临',desc:'500连杀',tier:3},
];
const TOTAL_KILL_MILESTONES=[
  {kills:50,title:'热身完毕',tier:0},
  {kills:100,title:'百战之师',tier:1},
  {kills:200,title:'屠魔者',tier:1},
  {kills:500,title:'杀神',tier:2},
  {kills:1000,title:'千夫所指',tier:3},
];
let _lastMilestoneStreak=0,_lastMilestoneTotalKill=0;
function checkKillMilestones(){
  // 连杀里程碑
  for(const m of KILL_MILESTONES){
    if(S.killStreak>=m.kills&&_lastMilestoneStreak<m.kills){
      _lastMilestoneStreak=m.kills;showMilestone(m.title,m.desc,m.tier);break;
    }
  }
  // 总击杀里程碑（单局）
  for(const m of TOTAL_KILL_MILESTONES){
    if(S.kills>=m.kills&&_lastMilestoneTotalKill<m.kills){
      _lastMilestoneTotalKill=m.kills;showMilestone(m.title,`${m.kills} 击杀`,m.tier);break;
    }
  }
}
function showMilestone(title,desc,tier){
  const gs=document.getElementById('game-screen');
  const el=document.createElement('div');
  el.className='milestone-banner'+(tier>=3?' legendary':'');
  el.innerHTML=`<div class="milestone-title">⚔ 里程碑 ⚔</div><div class="milestone-name">${title}</div><div class="milestone-desc">${desc}</div>`;
  gs.appendChild(el);setTimeout(()=>el.remove(),2500);
  // 视觉反馈根据tier
  if(tier>=3){screenFlash('#c9a44a',.2,200);screenShake(.15,.25);if(heroMesh)lightBeam(heroMesh.position,0xc9a44a,2,.6)}
  else if(tier>=2){screenFlash('#ff8800',.15,150);screenShake(.1,.15)}
  else if(tier>=1){screenFlash('#ff4444',.1,100);screenShake(.06,.1)}
  // GPU粒子庆祝
  if(heroMesh){
    const hp=heroMesh.position;
    const colors=[0xc9a44a,0xff8800,0xff4444,0xff00ff];
    emitGpuBurst(hp,colors[tier]||0xc9a44a,15+tier*10,4+tier*2,3+tier,.8,{gravity:5});
  }
}

// 极速连杀系统（1.5秒内连续击杀计数）
let rapidKillCount=0,rapidKillTimer=0,rapidKillEl=null;
function updateRapidKill(){
  rapidKillCount++;rapidKillTimer=1.5;
  if(rapidKillCount>=3){
    if(!rapidKillEl){
      rapidKillEl=document.createElement('div');
      rapidKillEl.className='rapid-kill-counter';
      document.getElementById('game-screen').appendChild(rapidKillEl);
    }
    rapidKillEl.textContent=`⚡×${rapidKillCount}`;
    rapidKillEl.className='rapid-kill-counter'+(rapidKillCount>=10?' ultra':rapidKillCount>=6?' hot':'');
    // 极速5杀/10杀特殊反馈
    if(rapidKillCount===5){screenFlash('#ff8800',.08,80)}
    if(rapidKillCount===10){showMilestone('极速十杀！','⚡ DECA KILL',2)}
    if(rapidKillCount===20){showMilestone('毁灭！','⚡ RAMPAGE',3)}
  }
}
function tickRapidKill(dt){
  if(rapidKillTimer>0){rapidKillTimer-=dt;if(rapidKillTimer<=0){rapidKillCount=0;
    if(rapidKillEl){rapidKillEl.remove();rapidKillEl=null}}}
}

// ==================== 系统2：波次节奏增强 ====================
function announceWaveEnhanced(n){
  if(SFX.wave)SFX.wave();
  const gs=document.getElementById('game-screen');
  // 闪光条
  const flash=document.createElement('div');flash.className='wave-flash-line';gs.appendChild(flash);setTimeout(()=>flash.remove(),800);
  // 增强公告
  const ch=S.chapter||CHAPTERS.ch1;
  const totalWaves=ch.waves||10;
  const progress=n/totalWaves;
  let diffClass='diff-easy',diffText='轻松';
  if(progress>.8){diffClass='diff-hell';diffText='地狱'}
  else if(progress>.6){diffClass='diff-hard';diffText='困难'}
  else if(progress>.35){diffClass='diff-medium';diffText='普通'}
  const el=document.createElement('div');el.className='wave-announce-enhanced';
  el.innerHTML=`<div class="wave-announce-num">第 ${n} 波</div><div class="wave-announce-label">WAVE ${n}</div><div class="wave-announce-difficulty ${diffClass}">${diffText}</div>`;
  gs.appendChild(el);setTimeout(()=>el.remove(),3000);
  // 屏幕闪光
  screenFlash('#c9a44a',.08,80);
  // 每3波给一个小高光
  if(n%3===0&&n>1){
    emitGpuBurst(heroMesh?heroMesh.position:{x:0,y:1,z:0},0xc9a44a,10,3,2,.5,{gravity:4});
  }
}

// ==================== 系统3：宝箱掉落系统 ====================
const LOOT_TABLE={
  elite:[
    {icon:'💰',text:'+50金币',type:'gold',amount:50,weight:35},
    {icon:'⚡',text:'攻击力+3',type:'atkBuff',amount:3,weight:25},
    {icon:'💚',text:'回复20%HP',type:'heal',amount:0.2,weight:20},
    {icon:'⏩',text:'移速+0.3',type:'spdBuff',amount:0.3,weight:15},
    {icon:'🎯',text:'暴击率+3%',type:'critBuff',amount:0.03,weight:5},
  ],
  boss:[
    {icon:'💰',text:'+200金币',type:'gold',amount:200,weight:20},
    {icon:'⚡',text:'攻击力+8',type:'atkBuff',amount:8,weight:20},
    {icon:'💚',text:'最大HP+30',type:'maxHpBuff',amount:30,weight:15},
    {icon:'🎯',text:'暴击率+5%',type:'critBuff',amount:0.05,weight:15},
    {icon:'🛡️',text:'护甲+2',type:'armorBuff',amount:2,weight:15},
    {icon:'🌟',text:'全属性+5%',type:'allBuff',amount:0.05,weight:10,rarity:'epic'},
    {icon:'⚔️',text:'攻击力+15',type:'atkBuff',amount:15,weight:5,rarity:'legendary'},
  ],
};
let pendingLoot=null;
function spawnLootChest(pos,tier){
  // 在3D场景中生成宝箱拾取物
  const g=new THREE.BoxGeometry(.3,.25,.2);
  const mt=new THREE.MeshStandardMaterial({color:tier==='boss'?0xc9a44a:0xcc8844,metalness:.6,roughness:.3});
  const m=new THREE.Mesh(g,mt);
  m.position.set(pos.x+(Math.random()-.5),0.2,pos.z+(Math.random()-.5));
  scene.add(m);
  // 发光效果
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:tier==='boss'?0xc9a44a:0xff8800,transparent:true,blending:THREE.AdditiveBlending,opacity:.5}));
  glow.scale.set(2,2,1);glow.position.y=.3;m.add(glow);
  S.pickups.push({mesh:m,type:'chest',tier,life:20});
}
function openLootChest(tier){
  const table=LOOT_TABLE[tier]||LOOT_TABLE.elite;
  // 加权随机选2-3个奖励
  const numRewards=tier==='boss'?3:2;
  const rewards=[];
  for(let i=0;i<numRewards;i++){
    const totalW=table.reduce((s,l)=>s+l.weight,0);let r=Math.random()*totalW;
    for(const l of table){r-=l.weight;if(r<=0){rewards.push(l);break}}
  }
  // 应用奖励
  rewards.forEach(r=>{
    if(r.type==='gold')S.gold+=r.amount;
    else if(r.type==='atkBuff'){S.attack+=r.amount;if(S.growthLog)S.growthLog.lootAtk+=r.amount}
    else if(r.type==='heal')S.hp=Math.min(S.maxHp,S.hp+S.maxHp*r.amount);
    else if(r.type==='spdBuff'){S.speed+=r.amount;if(S.growthLog)S.growthLog.lootSpd+=r.amount}
    else if(r.type==='critBuff'){S.critRate=Math.min(0.6,S.critRate+r.amount);if(S.growthLog)S.growthLog.lootCrit+=r.amount}
    else if(r.type==='maxHpBuff'){S.maxHp+=r.amount;S.hp+=r.amount;if(S.growthLog)S.growthLog.lootHp+=r.amount}
    else if(r.type==='armorBuff'){S.armor+=r.amount;if(S.growthLog)S.growthLog.lootArmor+=r.amount}
    else if(r.type==='allBuff'){const atkGain=Math.round(S.attack*r.amount);const hpGain=Math.round(S.maxHp*r.amount);S.attack=Math.round(S.attack*(1+r.amount));S.maxHp=Math.round(S.maxHp*(1+r.amount));S.hp=Math.min(S.maxHp,S.hp);S.speed+=(r.amount*2);if(S.growthLog){S.growthLog.lootAtk+=atkGain;S.growthLog.lootHp+=hpGain;S.growthLog.lootSpd+=r.amount*2}}
  });
  // ===== 精英：不暂停 — 自动领取+侧边悬浮通知 =====
  if(tier!=='boss'){
    showLootToast(rewards,tier);
    if(SFX.loot)SFX.loot();
    if(heroMesh)emitGpuBurst(heroMesh.position,0xff8800,12,3,2,.6,{gravity:4});
    screenFlash('#ff8800',.08,80);
    return;
  }
  // ===== BOSS：全屏弹窗（保留打断） =====
  gamePaused=true;
  if(SFX.loot)SFX.loot();
  const popup=document.getElementById('loot-popup');
  const itemsHtml=rewards.map(r=>`<div class="loot-item ${r.rarity||''}""><div class="loot-item-icon">${r.icon}</div><div class="loot-item-text">${r.text}</div></div>`).join('');
  popup.innerHTML=`<div class="loot-chest-popup" onclick="closeLootPopup()"><div class="loot-chest-icon">👑</div><div class="loot-chest-title">BOSS 战利品</div><div class="loot-items">${itemsHtml}</div><div class="btn-gold loot-btn" style="padding:10px 30px;font-size:14px">收下战利品</div></div>`;
  popup.style.display='block';
  if(heroMesh)emitGpuBurst(heroMesh.position,0xc9a44a,20,5,3,.8,{gravity:4});
  screenFlash('#c9a44a',.15,150);
}
window.closeLootPopup=function(){
  document.getElementById('loot-popup').style.display='none';gamePaused=false;
};
// ===== 精英战利品侧边悬浮通知（不暂停游戏） =====
let _lootToastQueue=[];
let _lootToastActive=0;
const LOOT_TOAST_MAX=3; // 最多同时显示3条
function showLootToast(rewards,tier){
  // 获取或创建通知容器
  let container=document.getElementById('loot-toast-container');
  if(!container){
    container=document.createElement('div');container.id='loot-toast-container';container.className='loot-toast-container';
    document.getElementById('game-screen').appendChild(container);
  }
  // 如果已有太多通知，合并显示
  if(_lootToastActive>=LOOT_TOAST_MAX){
    // 找到最后一条通知追加内容
    const lastToast=container.lastElementChild;
    if(lastToast){
      const extra=document.createElement('div');extra.className='loot-toast-extra';
      extra.textContent=`+${rewards.map(r=>r.text).join(' ')}`;
      lastToast.querySelector('.loot-toast-body').appendChild(extra);
    }
    return;
  }
  const toast=document.createElement('div');toast.className='loot-toast';
  // 奖励图标+文字
  const itemsStr=rewards.map(r=>`<span class="loot-toast-reward"><span class="ltr-icon">${r.icon}</span>${r.text}</span>`).join('');
  toast.innerHTML=`<div class="loot-toast-header"><span class="loot-toast-badge">📦</span><span class="loot-toast-label">精英掉落</span></div><div class="loot-toast-body">${itemsStr}</div><div class="loot-toast-timer"></div>`;
  container.appendChild(toast);
  _lootToastActive++;
  // 入场动画后自动消失
  requestAnimationFrame(()=>toast.classList.add('show'));
  const duration=2500;
  // 进度条动画
  const timerBar=toast.querySelector('.loot-toast-timer');
  if(timerBar)timerBar.style.transition=`width ${duration}ms linear`;
  requestAnimationFrame(()=>{requestAnimationFrame(()=>{if(timerBar)timerBar.style.width='0%'})});
  setTimeout(()=>{
    toast.classList.add('hide');
    setTimeout(()=>{
      if(toast.parentNode)toast.parentNode.removeChild(toast);
      _lootToastActive=Math.max(0,_lootToastActive-1);
    },400);
  },duration);
}

// ==================== 系统4：伤害统计追踪 ====================
let dmgStats={total:0,maxHit:0,maxHitSkill:'',skillDmg:{},basicAtkDmg:0,critCount:0,totalHits:0};
function resetDmgStats(){dmgStats={total:0,maxHit:0,maxHitSkill:'',skillDmg:{},basicAtkDmg:0,critCount:0,totalHits:0}}
function trackDmg(amount,skillName,isCrit){
  dmgStats.total+=amount;dmgStats.totalHits++;
  if(isCrit)dmgStats.critCount++;
  if(amount>dmgStats.maxHit){dmgStats.maxHit=amount;dmgStats.maxHitSkill=skillName||'普攻'}
  if(skillName){dmgStats.skillDmg[skillName]=(dmgStats.skillDmg[skillName]||0)+amount}
  else{dmgStats.basicAtkDmg+=amount}
}
function renderDpsChart(){
  const entries=[{name:'普攻',icon:'⚔️',dmg:dmgStats.basicAtkDmg}];
  Object.entries(dmgStats.skillDmg).forEach(([name,dmg])=>{
    const sk=SKILL_DB.find(s=>s.name===name);
    entries.push({name,icon:sk?sk.icon:'✨',dmg});
  });
  entries.sort((a,b)=>b.dmg-a.dmg);
  const maxDmg=entries[0]?entries[0].dmg:1;
  const colors=['#ff8c00','#c9a44a','#44ddff','#44ff88','#a335ee','#ff4444','#888'];
  let html='<div class="result-dps-chart"><div class="dps-chart-title">⚔️ 伤害分布</div>';
  entries.slice(0,6).forEach((e,i)=>{
    const pct=Math.max(2,e.dmg/maxDmg*100);
    const color=colors[i%colors.length];
    html+=`<div class="dps-bar-row"><div class="dps-bar-icon">${e.icon}</div><div class="dps-bar-name">${e.name}</div><div class="dps-bar-wrap"><div class="dps-bar-fill" style="width:${pct}%;background:${color}"></div></div><div class="dps-bar-val">${e.dmg>=1000?(e.dmg/1000).toFixed(1)+'k':e.dmg}</div></div>`;
  });
  html+='</div>';
  // 高光数据
  const dps=gameTime>0?(dmgStats.total/gameTime).toFixed(0):0;
  const critPct=dmgStats.totalHits>0?Math.round(dmgStats.critCount/dmgStats.totalHits*100):0;
  html+=`<div class="result-highlight-stats"><div class="highlight-stat"><div class="hs-value">${dps}</div><div class="hs-label">DPS</div></div><div class="highlight-stat"><div class="hs-value">${dmgStats.maxHit}</div><div class="hs-label">最高单次</div></div><div class="highlight-stat"><div class="hs-value">${critPct}%</div><div class="hs-label">暴击率</div></div></div>`;
  return html;
}

// ==================== 系统5：战斗动态事件 ====================
let eventTimer=0,eventCooldown=30; // 首次事件在30秒后
const EVENT_TYPES=[
  {type:'challenge',title:'⚔ 限时挑战',desc:'10秒内消灭{n}个怪物！',targetBase:8,reward:{type:'atkBuff',amount:5,icon:'⚡',text:'攻击力+5'},dur:10},
  {type:'challenge',title:'💀 精英猎杀',desc:'15秒内消灭精英怪！',targetBase:1,reward:{type:'critBuff',amount:0.04,icon:'🎯',text:'暴击率+4%'},dur:15,needElite:true},
  {type:'shrine',title:'✨ 祝福神龛',desc:'靠近获得随机祝福',dur:12},
  {type:'shrine',title:'💚 生命之泉',desc:'靠近持续恢复生命',dur:15,healType:true},
];
function trySpawnEvent(dt){
  if(S.activeEvent||S.bossActive||S.wave<2)return;
  eventTimer+=dt;
  if(eventTimer>=eventCooldown){
    eventTimer=0;eventCooldown=35+Math.random()*25; // 35~60秒间隔
    const evt=EVENT_TYPES[Math.floor(Math.random()*EVENT_TYPES.length)];
    if(evt.type==='challenge'){
      const target=evt.targetBase+Math.floor(S.wave*.5);
      S.activeEvent={...evt,target,progress:0,timer:evt.dur};
      showEventBanner(evt.title,evt.desc.replace('{n}',target));
    }else if(evt.type==='shrine'){
      // 在英雄附近随机位置生成神龛
      if(!heroMesh)return;
      const angle=Math.random()*Math.PI*2;const dist=6+Math.random()*4;
      const sx=heroMesh.position.x+Math.cos(angle)*dist;
      const sz=heroMesh.position.z+Math.sin(angle)*dist;
      const shrineGroup=new THREE.Group();shrineGroup.position.set(sx,0,sz);
      // 神龛底座
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.4,.5,.3,6),new THREE.MeshStandardMaterial({color:evt.healType?0x44ff44:0x44ddff,metalness:.4}));
      base.position.y=.15;shrineGroup.add(base);
      // 光柱
      const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.05,.1,2,6),new THREE.MeshBasicMaterial({color:evt.healType?0x44ff44:0x44ddff,transparent:true,opacity:.3}));
      pillar.position.y=1.2;shrineGroup.add(pillar);
      // 发光
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:evt.healType?0x44ff44:0x44ddff,transparent:true,blending:THREE.AdditiveBlending,opacity:.4}));
      glow.scale.set(3,3,1);glow.position.y=1;shrineGroup.add(glow);
      scene.add(shrineGroup);
      S.activeEvent={...evt,timer:evt.dur,mesh:shrineGroup,pos:{x:sx,z:sz},activated:false};
      showEventBanner(evt.title,evt.desc);
    }
  }
}
function processEvent(dt){
  if(!S.activeEvent)return;
  const ev=S.activeEvent;
  ev.timer-=dt;
  if(ev.type==='challenge'){
    // 检查是否完成
    if(ev.progress>=ev.target){
      // 挑战成功！
      const r=ev.reward;
      if(r.type==='atkBuff'){S.attack+=r.amount;if(S.growthLog)S.growthLog.eventAtk+=r.amount}
      else if(r.type==='critBuff'){S.critRate=Math.min(0.6,S.critRate+r.amount);if(S.growthLog)S.growthLog.eventCrit+=r.amount}
      showMilestone('挑战完成！',r.text,1);
      S.activeEvent=null;hideEventBanner();return;
    }
    if(ev.timer<=0){
      // 挑战失败
      const el=document.createElement('div');el.className='kill-streak';el.textContent='❌ 挑战失败';
      document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1500);
      S.activeEvent=null;hideEventBanner();return;
    }
    updateEventUI();
  }else if(ev.type==='shrine'){
    if(ev.timer<=0){
      // 超时移除
      if(ev.mesh){try{scene.remove(ev.mesh)}catch(ex){}}
      S.activeEvent=null;hideEventBanner();return;
    }
    // 检查英雄是否靠近
    if(heroMesh&&ev.pos){
      const d=Math.sqrt((heroMesh.position.x-ev.pos.x)**2+(heroMesh.position.z-ev.pos.z)**2);
      if(d<2){
        if(ev.healType){
          // 持续回血
          S.hp=Math.min(S.maxHp,S.hp+S.maxHp*0.02*dt);
          if(!ev.activated){ev.activated=true;
            const el=document.createElement('div');el.className='kill-streak';el.textContent='💚 生命恢复中...';
            document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1200)}
        }else if(!ev.activated){
          ev.activated=true;
          // 随机祝福
          const blessings=[
            {text:'攻击力+8',apply:()=>{S.attack+=8;if(S.growthLog)S.growthLog.eventAtk+=8}},
            {text:'移速+0.5',apply:()=>{S.speed+=0.5;if(S.growthLog)S.growthLog.eventSpd+=0.5}},
            {text:'暴击率+4%',apply:()=>{S.critRate=Math.min(0.6,S.critRate+0.04);if(S.growthLog)S.growthLog.eventCrit+=0.04}},
            {text:'护甲+3',apply:()=>{S.armor+=3;if(S.growthLog)S.growthLog.eventArmor+=3}},
            {text:'最大生命+40',apply:()=>{S.maxHp+=40;S.hp=Math.min(S.maxHp,S.hp+40);if(S.growthLog)S.growthLog.eventHp+=40}},
          ];
          const b=blessings[Math.floor(Math.random()*blessings.length)];
          b.apply();
          showMilestone('获得祝福',b.text,1);
          showStatChangeFloat('🏛️ '+b.text,'buff');
          if(heroMesh)emitGpuBurst(heroMesh.position,0x44ddff,15,4,3,.7,{gravity:3});
          // 移除神龛
          if(ev.mesh){try{scene.remove(ev.mesh)}catch(ex){}}
          S.activeEvent=null;hideEventBanner();return;
        }
      }
    }
    // 更新屏幕标记
    updateShrineMarker(ev);
  }
}
function showEventBanner(title,desc){
  const banner=document.getElementById('event-banner');
  const ev=S.activeEvent;
  const frameClass=ev.type==='challenge'?'challenge':ev.type==='shrine'?(ev.healType?'shrine':'shrine'):'challenge';
  let progressHtml='';
  if(ev.type==='challenge')progressHtml=`<div class="event-progress"><div class="event-progress-fill" id="event-prog-fill" style="width:0%"></div></div>`;
  banner.innerHTML=`<div class="event-frame ${frameClass}"><div class="event-title">${title}</div><div class="event-desc">${desc}</div><div class="event-timer" id="event-timer">${Math.ceil(ev.timer)}s</div>${progressHtml}</div>`;
  banner.style.display='block';
}
function updateEventUI(){
  const ev=S.activeEvent;if(!ev)return;
  const timer=document.getElementById('event-timer');if(timer)timer.textContent=Math.ceil(ev.timer)+'s';
  if(ev.type==='challenge'){
    const fill=document.getElementById('event-prog-fill');
    if(fill)fill.style.width=Math.min(100,ev.progress/ev.target*100)+'%';
  }
}
function hideEventBanner(){document.getElementById('event-banner').style.display='none'}
let _shrineMarker=null;
function updateShrineMarker(ev){
  if(!heroMesh||!ev.pos)return;
  // 使用3D投影到屏幕坐标
  const wp=new THREE.Vector3(ev.pos.x,2,ev.pos.z);wp.project(camera);
  const x=(wp.x*.5+.5)*innerWidth,y=(-wp.y*.5+.5)*innerHeight;
  if(!_shrineMarker){_shrineMarker=document.createElement('div');_shrineMarker.className='event-marker';document.getElementById('game-screen').appendChild(_shrineMarker)}
  _shrineMarker.style.left=x+'px';_shrineMarker.style.top=Math.max(60,y-40)+'px';
  _shrineMarker.innerHTML=`<div class="event-marker-icon">${ev.healType?'💚':'✨'}</div><div class="event-marker-label">${ev.healType?'生命之泉':'神龛'}</div>`;
}
function clearShrineMarker(){if(_shrineMarker){_shrineMarker.remove();_shrineMarker=null}}

// ==================== 系统6：屏幕边缘危险预警 ====================
function updateEdgeWarnings(){
  if(!heroMesh||!gameActive)return;
  let top=0,bottom=0,left=0,right=0;
  const arrowContainer=document.getElementById('game-screen');
  // 清除旧箭头
  arrowContainer.querySelectorAll('.edge-arrow').forEach(a=>a.remove());
  const threatDist=12; // 检测距离
  let closestThreats=[];
  for(const e of S.enemies){
    if(e.hp<=0)continue;
    const ep=e.mesh.position.clone();ep.y=1;ep.project(camera);
    const sx=(ep.x*.5+.5)*innerWidth,sy=(-ep.y*.5+.5)*innerHeight;
    const dist=e.mesh.position.distanceTo(heroMesh.position);
    if(dist>threatDist)continue;
    const offscreen=sx<-10||sx>innerWidth+10||sy<-10||sy>innerHeight+10;
    if(!offscreen)continue;
    // 计算方向
    const threat=1-dist/threatDist; // 0~1越近越强
    if(sy<0)top=Math.max(top,threat);
    if(sy>innerHeight)bottom=Math.max(bottom,threat);
    if(sx<0)left=Math.max(left,threat);
    if(sx>innerWidth)right=Math.max(right,threat);
    closestThreats.push({sx:Math.max(20,Math.min(innerWidth-20,sx)),sy:Math.max(20,Math.min(innerHeight-20,sy)),threat,isBoss:e.isBoss,isElite:e.isElite});
  }
  // 更新边缘发光
  const wt=document.getElementById('edge-warn-top'),wb=document.getElementById('edge-warn-bottom');
  const wl=document.getElementById('edge-warn-left'),wr=document.getElementById('edge-warn-right');
  if(wt){wt.style.opacity=top;wt.classList.toggle('active',top>0.1)}
  if(wb){wb.style.opacity=bottom;wb.classList.toggle('active',bottom>0.1)}
  if(wl){wl.style.opacity=left;wl.classList.toggle('active',left>0.1)}
  if(wr){wr.style.opacity=right;wr.classList.toggle('active',right>0.1)}
  // 显示箭头（最多5个最近的威胁）
  closestThreats.sort((a,b)=>b.threat-a.threat);
  closestThreats.slice(0,5).forEach(t=>{
    const arrow=document.createElement('div');arrow.className='edge-arrow';
    const clampX=Math.max(30,Math.min(innerWidth-30,t.sx));
    const clampY=Math.max(50,Math.min(innerHeight-50,t.sy));
    arrow.style.left=clampX+'px';arrow.style.top=clampY+'px';
    arrow.style.fontSize=(t.isBoss?'28px':t.isElite?'24px':'18px');
    arrow.textContent=t.isBoss?'💀':t.isElite?'⚠️':'▲';
    // 旋转箭头指向屏幕外
    const cx=innerWidth/2,cy=innerHeight/2;
    const angle=Math.atan2(t.sy-cy,t.sx-cx)*180/Math.PI;
    arrow.style.transform=`rotate(${angle+90}deg)`;
    arrowContainer.appendChild(arrow);
    setTimeout(()=>arrow.remove(),150);
  });
}

// ==================== 技能处理 ====================
function checkCombos(){const prev=new Set(S.comboSkills);S.comboSkills=[];const heroId=PD.selectedHero;SKILL_COMBOS.forEach(c=>{
  // 职业限定合成只对对应英雄生效
  if(c.heroOnly&&c.heroOnly!==heroId)return;
  if(c.req.every(r=>{const s=S.skills.find(sk=>sk.id===r);return s&&s.level>=c.reqLv})){
    S.comboSkills.push(c.id);
    // 新解锁的合成技：初始化CD为完整值，防止立即触发（特别是ascendance会重置所有技能CD）
    if(!prev.has(c.id)&&!skillTimers[c.id]){skillTimers[c.id]=c.cd||10}
  }})}
function processSkills(dt){
  if(!heroMesh)return;
  const hp=heroMesh.position;const heroAtk=S.attack;
  // 战神徽记攻击力加成
  const warcryBonus=S.equipEffects.warcry?(S.passiveStacks.warcryStacks||0)*0.03:0;
  const effectiveAtk=heroAtk*(1+warcryBonus);
  // 辅助函数：获取技能数据
  function skData(id){return SKILL_DB.find(s=>s.id===id)}
  // 辅助函数：触发施法动画 + 重置技能CD
  function triggerCastAnim(){if(heroMesh&&heroMesh.userData.anim&&heroMesh.userData.anim.attackTimer<=0){
    heroMesh.userData.anim.state='cast';heroMesh.userData.anim.attackTimer=0.4}}
  function resetCd(k,sk,l){
    let cd=calcSkillCd(sk,l);
    // 局内BUFF: 技能CD减少
    const _bfCd=S.buffStats||{};
    if(_bfCd.skillCd>0)cd*=(1-Math.min(0.4,_bfCd.skillCd)); // 最多减40%CD
    skillTimers[k]=cd;triggerCastAnim();
    // 播放技能音效
    if(SFX.skill)SFX.skill(k);
  }
  // 🔥 火球术 —— 带火焰拖尾的炽热弹幕
  if(hasSkill('fireball')){const k='fireball';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('fireball');const sk=skData('fireball');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const projN=Math.floor(sk.projCount+(l-1)*sk.projCountPerLv);
    const targets=nearestN(hp,15,Math.min(projN,5));
    targets.forEach(t=>{fireProjectile(hp,t.mesh.position,0xff4400,dmg,.2,sk.projSpeed,{trail:'fire',trailColor:0xff2200,isFireDmg:true,isSkill:true,skillName:'火球术'})})}}
  // ❄️ 霜冻新星 —— 冰锥从脚下向外爆射+冰环扩散（独特：地面冰锥阵）
  if(hasSkill('frostnova')){const k='frostnova';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('frostnova');const sk=skData('frostnova');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.radius+(l-1)*sk.radiusPerLv;
    const fDur=sk.freezeDur+(l-1)*sk.freezePerLv;
    // 独特视觉：冰锥从地面向外爆射
    const spikeN=8+l*2;
    for(let i=0;i<spikeN;i++){
      const ang=(i/spikeN)*Math.PI*2+(Math.random()-.3)*.4;
      const dist=r*(.3+Math.random()*.7);
      const sx=hp.x+Math.cos(ang)*dist,sz=hp.z+Math.sin(ang)*dist;
      const spikeH=.8+Math.random()*.6;
      const spike=new THREE.Mesh(
        new THREE.ConeGeometry(.12+Math.random()*.08,spikeH,4),
        new THREE.MeshStandardMaterial({color:0x88eeff,transparent:true,opacity:.9,emissive:0x44aadd,emissiveIntensity:.8,metalness:.4,roughness:.1})
      );
      spike.position.set(sx,0,sz);spike.rotation.z=(Math.random()-.5)*.4;
      spike.rotation.x=(Math.random()-.5)*.3;
      scene.add(spike);
      S.particles.push({mesh:spike,life:.6+Math.random()*.3,maxLife:.9,type:'frostSpike',
        vel:new THREE.Vector3(Math.cos(ang)*2,3+Math.random()*2,Math.sin(ang)*2)});
    }
    // 冰环地面纹理
    const ringMat=new THREE.MeshBasicMaterial({color:0x66ddff,transparent:true,opacity:.6,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
    const ring=new THREE.Mesh(new THREE.RingGeometry(r*.2,r,24),ringMat);
    ring.rotation.x=-Math.PI/2;ring.position.set(hp.x,.35,hp.z);scene.add(ring);
    S.particles.push({mesh:ring,life:.7,maxLife:.7,type:'aoe',radius:r});
    iceShatter(hp,r*.5,4+l);screenShake(.08,.15);
    // 冰霜地面碎片GPU粒子向外辐射
    emitGpuBurst({x:hp.x,y:.3,z:hp.z},0x88eeff,12+l*3,4,3,.5,{gravity:8});
    S.enemies.forEach(e=>{if(e.mesh.position.distanceTo(hp)<r){dmgEnemy(e,dmg,{isSkill:true,skillName:'霜冻新星'});e.frozen=fDur}})}}
  // ⚡ 雷霆一击 —— 闪电从天劈下+电弧扩散
  if(hasSkill('thunder')){const k='thunder';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('thunder');const sk=skData('thunder');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.radius+(l-1)*sk.radiusPerLv;
    const chainCh=sk.chainChance+(l-1)*sk.chainChancePerLv;
    lightBeam(hp,0xffff44,r*.3,.3);aoeEffect(hp,r,0xffff44,.35);screenFlash('#ffffaa',.15,80);screenShake(.1,.12);
    const nearby=S.enemies.filter(e=>e.hp>0&&e.mesh.position.distanceTo(hp)<r);
    nearby.forEach(e=>{dmgEnemy(e,dmg,{isSkill:true,skillName:'雷霆一击'});if(Math.random()<chainCh)lightningBolt(hp,e.mesh.position,0xffff88,.04,5)})}}
  // 💚 治疗之泉 —— 翠绿十字标志+心形上升粒子（独特：十字回血标志）
  if(hasSkill('heal')){const k='heal';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('heal');const sk=skData('heal');
    resetCd(k,sk,l);
    const healPct=sk.healPct+(l-1)*sk.healPctPerLv;
    S.hp=Math.min(S.maxHp,S.hp+S.maxHp*healPct);
    // 独特视觉：翠绿十字标志
    const crossG=new THREE.Group();
    const cBar1=new THREE.Mesh(new THREE.BoxGeometry(.2,1.2,.2),new THREE.MeshBasicMaterial({color:0x44ff44,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));
    cBar1.position.y=1.5;crossG.add(cBar1);
    const cBar2=new THREE.Mesh(new THREE.BoxGeometry(1.2,.2,.2),new THREE.MeshBasicMaterial({color:0x44ff44,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));
    cBar2.position.y=1.5;crossG.add(cBar2);
    const crossGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0x44ff44,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
    crossGlow.scale.set(3,3,1);crossGlow.position.y=1.5;crossG.add(crossGlow);
    crossG.position.set(hp.x,0,hp.z);scene.add(crossG);
    S.particles.push({mesh:crossG,life:1,maxLife:1,type:'healCross'});
    // 上升绿色粒子环
    for(let i=0;i<10;i++){
      const ang=(i/10)*Math.PI*2;
      emitGpuP({x:hp.x+Math.cos(ang)*1.2,y:.5,z:hp.z+Math.sin(ang)*1.2},
        Math.random()<.5?0x44ff88:0x88ffaa,
        {x:Math.cos(ang)*.5,y:3+Math.random()*2,z:Math.sin(ang)*.5},2,.7,{gravity:-1,shrink:true});
    }
    // 治疗飘字
    showDmg(hp,'+'+Math.round(S.maxHp*healPct),false,null);
    addDynLight(hp,0x44ff44,2,6,.5);
  }}
  // 💥 活体炸弹 —— 脉动大火球+命中引爆连锁（独特：更大弹体+红色脉动）
  if(hasSkill('livingbomb')){const k='livingbomb';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('livingbomb');const sk=skData('livingbomb');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const explR=sk.explodeRadius+(l-1)*sk.explodeRadiusPerLv;
    const explDmgPct=sk.explodeDmgPct+(l-1)*sk.explodeDmgPctPerLv;
    const t=nearest(hp,14);if(t){
      fireProjectile(hp,t.mesh.position,0xff3300,dmg,.45,sk.projSpeed,{trail:'fire',trailColor:0xff2200,onHit:'explode',explodeR:explR,explodeDmgPct:explDmgPct,isFireDmg:true,isSkill:true,skillName:'活体炸弹'});
      // 投射点预警闪光
      emitGpuBurst({x:hp.x,y:1,z:hp.z},0xff4400,4,2,2,.15,{gravity:3});
    }}}
  // 🌨️ 暴风雪 —— 天降冰柱雨+寒霜暴风圈（独特：冰柱从天而降）
  if(hasSkill('blizzard')){const k='blizzard';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('blizzard');const sk=skData('blizzard');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.radius+(l-1)*sk.radiusPerLv;
    const dur=sk.duration+(l-1)*sk.durationPerLv;
    const ticks=Math.floor(dur/sk.tickRate);
    const t=nearest(hp,15);if(t){const p=t.mesh.position.clone();
    // 独特视觉：暴风雪旋转雪暴圈
    const stormG=new THREE.Group();
    const stormRing=new THREE.Mesh(new THREE.RingGeometry(r*.3,r,24),new THREE.MeshBasicMaterial({color:0x88ccff,transparent:true,opacity:.25,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
    stormRing.rotation.x=-Math.PI/2;stormG.add(stormRing);
    for(let si=0;si<3;si++){
      const arc=new THREE.Mesh(new THREE.TorusGeometry(r*(.5+si*.2),.03,4,32,Math.PI*.8),
        new THREE.MeshBasicMaterial({color:0x88ddff,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false}));
      arc.rotation.x=-Math.PI/2;arc.rotation.z=si*Math.PI*2/3;stormG.add(arc);
    }
    stormG.position.set(p.x,.4,p.z);scene.add(stormG);
    S.particles.push({mesh:stormG,life:dur+.3,maxLife:dur+.3,type:'blizzardStorm',speed:3});
    // 天降冰柱
    for(let i=0;i<ticks;i++)setTimeout(()=>{if(!gameActive)return;
      const ox=(Math.random()-.5)*r*1.5,oz=(Math.random()-.5)*r*1.5;
      const drop=new THREE.Vector3(p.x+ox,0,p.z+oz);
      const icicleH=1.2+Math.random()*.8;
      const icicle=new THREE.Mesh(new THREE.CylinderGeometry(0,.15+Math.random()*.1,icicleH,5),
        new THREE.MeshStandardMaterial({color:0xaaddff,transparent:true,opacity:.85,emissive:0x2266aa,emissiveIntensity:.6,metalness:.5,roughness:.1}));
      icicle.position.set(drop.x,12+Math.random()*3,drop.z);icicle.rotation.x=Math.PI;
      scene.add(icicle);
      S.particles.push({mesh:icicle,life:.35,maxLife:.35,type:'icicleFall',target:drop.clone(),startY:icicle.position.y});
      setTimeout(()=>{if(!gameActive)return;iceShatter(drop,.8,2);
        emitGpuBurst({x:drop.x,y:.3,z:drop.z},0x88ddff,4,3,2,.3,{gravity:6});
        S.enemies.forEach(e=>{if(e.mesh.position.distanceTo(drop)<2){dmgEnemy(e,dmg,{isSkill:true,skillName:'暴风雪'});e.frozen=sk.freezeOnHit}});
      },300)},i*sk.tickRate*1000)}}}
  // ⛓️ 闪电链 —— 弧光在敌人间跳跃
  if(hasSkill('chainlight')){const k='chainlight';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('chainlight');const sk=skData('chainlight');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const bn=sk.bounceCount+(l-1)*sk.bounceCountPerLv;
    let cur=nearest(hp,15);const hit=new Set();let lp=hp.clone();let chainDmg=dmg;
    for(let i=0;i<bn&&cur;i++){const delay=i*50;const fromP=lp.clone();const toP=cur.mesh.position.clone();const enemy=cur;const cd=chainDmg;
    setTimeout(()=>{if(!gameActive)return;dmgEnemy(enemy,cd,{isSkill:true,skillName:'闪电链'});lightningBolt(fromP,toP,0x88ccff,.05,6);explosion(toP,0x88aaff,3)},delay);
    hit.add(cur);lp=cur.mesh.position.clone();chainDmg*=sk.bounceDmgDecay;
    let nb=null,md=sk.bounceRange;for(const e of S.enemies){if(hit.has(e))continue;const dd=e.mesh.position.distanceTo(lp);if(dd<md){md=dd;nb=e}}cur=nb}
    if(bn>3)screenFlash('#88ccff',.1,60)}}
  // 🌩️ 连锁闪电 —— 粗壮电弧在敌群间疯狂跳跃+连锁爆炸
  if(hasSkill('chainstorm')){const k='chainstorm';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('chainstorm');const sk=skData('chainstorm');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const jumpN=sk.jumpCount+(l-1)*sk.jumpCountPerLv;
    let cur=nearest(hp,sk.jumpRange);const hit=new Set();let lp=hp.clone();let chainDmg=dmg;
    for(let i=0;i<jumpN&&cur;i++){const delay=i*60;const fromP=lp.clone();const toP=cur.mesh.position.clone();const enemy=cur;const cd=chainDmg;const idx=i;
    setTimeout(()=>{if(!gameActive||!enemy||enemy.hp<=0)return;dmgEnemy(enemy,cd,{isSkill:true});thickLightningArc(fromP,toP,0x44ccff,.08+Math.random()*.04,8);electricImpact(toP,1.2+l*.15,0x44ccff);if(idx%3===0)screenShake(.04,.06)},delay);
    hit.add(cur);lp=cur.mesh.position.clone();chainDmg*=sk.jumpDmgDecay;
    let nb=null,md=8+l*.5;for(const e of S.enemies){if(hit.has(e)||e.hp<=0)continue;const dd=e.mesh.position.distanceTo(lp);if(dd<md){md=dd;nb=e}}
    if(!nb){hit.clear();nb=nearest(lp,8+l*.5)}cur=nb}screenFlash('#44ccff',.12,80)}}
  // 🔱 叉状闪电 —— 从英雄射出分叉闪电扫荡前方敌群
  if(hasSkill('forkedlight')){const k='forkedlight';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('forkedlight');const sk=skData('forkedlight');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const forkN=sk.forkCount+(l-1)*sk.forkCountPerLv;
    const targets=nearestN(hp,sk.range,forkN);
    if(targets.length>0){forkedLightningFx(hp,targets,0xaaddff,.06+l*.005);
    targets.forEach((t,i)=>{setTimeout(()=>{if(!gameActive||!t||t.hp<=0)return;dmgEnemy(t,dmg,{isSkill:true,skillName:'叉状闪电'});electricImpact(t.mesh.position,.8+l*.1,0xaaddff);
    const splashR=sk.splashRadius;S.enemies.forEach(e2=>{if(e2!==t&&e2.hp>0&&e2.mesh.position.distanceTo(t.mesh.position)<splashR){dmgEnemy(e2,dmg*sk.splashDmgPct,{isSkill:true,skillName:'叉状闪电'});if(Math.random()<.3)lightningBolt(t.mesh.position,e2.mesh.position,0x88bbff,.03,4)}})},i*40)});
    if(targets.length>=3)screenShake(.06,.1);screenFlash('#aaddff',.08,60)}}}
  // 🍃 自然之怒 —— 翡翠追踪飞弹+叶片旋转（独特：施法时绿叶旋风环绕）
  if(hasSkill('naturewrath')){const k='naturewrath';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('naturewrath');const sk=skData('naturewrath');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const projN=Math.floor(sk.projCount+(l-1)*sk.projCountPerLv);
    // 独特视觉：施法瞬间的叶片旋风
    const leafN=6+l;
    for(let i=0;i<leafN;i++){
      const ang=(i/leafN)*Math.PI*2;const dist=1+Math.random()*.5;
      emitGpuP({x:hp.x+Math.cos(ang)*dist,y:.8+Math.random()*.5,z:hp.z+Math.sin(ang)*dist},
        Math.random()<.5?0x44ff44:0x88ff44,
        {x:Math.cos(ang+Math.PI/2)*3,y:2+Math.random()*2,z:Math.sin(ang+Math.PI/2)*3},2,.5,{gravity:2,shrink:true});
    }
    nearestN(hp,12,projN).forEach(t=>fireProjectile(hp,t.mesh.position,0x44ff44,dmg,.15,sk.projSpeed,{trail:'leaf',trailColor:0x22cc22,isSkill:true,skillName:'自然之怒'}))}}
  // 🗡️ 灰烬使者 —— 金色十字圣光剑气旋风（独特：十字光芒剑气弧线）
  if(hasSkill('ashbringer')){const k='ashbringer';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('ashbringer');const sk=skData('ashbringer');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.spinRadius+(l-1)*sk.spinRadiusPerLv;
    const dur=sk.spinDuration+(l-1)*sk.spinDurPerLv;
    const hitTicks=Math.floor(dur/sk.hitRate);
    // 独特视觉：金色十字光芒剑气
    const bladeG=new THREE.Group();
    const bladeCount=4+Math.floor(l/2);
    for(let i=0;i<bladeCount;i++){
      const ang=(i/bladeCount)*Math.PI*2;
      // 剑刃形状（扁长三角锥）
      const swordGeo=new THREE.ConeGeometry(.08,r*.7,3);
      swordGeo.rotateZ(Math.PI/2);
      const swordMat=new THREE.MeshStandardMaterial({color:0xffcc44,transparent:true,opacity:.85,emissive:0xffaa00,emissiveIntensity:1.5,metalness:.6,roughness:.2});
      const sword=new THREE.Mesh(swordGeo,swordMat);
      sword.position.set(Math.cos(ang)*r*.5,.8,Math.sin(ang)*r*.5);
      sword.rotation.y=ang;bladeG.add(sword);
      // 剑气拖尾光弧
      const trailMat=new THREE.MeshBasicMaterial({color:0xffdd66,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,depthWrite:false});
      const trailGeo=new THREE.PlaneGeometry(r*.5,.3);
      const trail=new THREE.Mesh(trailGeo,trailMat);
      trail.position.set(Math.cos(ang)*r*.5,.8,Math.sin(ang)*r*.5);
      trail.rotation.y=ang;trail.rotation.x=Math.PI/2;bladeG.add(trail);
    }
    // 中心十字圣光
    const cross1=new THREE.Mesh(new THREE.PlaneGeometry(.15,r*1.8),
      new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    cross1.position.y=1;bladeG.add(cross1);
    const cross2=new THREE.Mesh(new THREE.PlaneGeometry(r*1.8,.15),
      new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    cross2.position.y=1;bladeG.add(cross2);
    bladeG.position.set(hp.x,0,hp.z);scene.add(bladeG);
    S.particles.push({mesh:bladeG,life:dur,maxLife:dur,type:'ashbladesSpin',speed:8});
    addDynLight(hp,0xffaa00,3,r*2,dur*.5);
    screenShake(.06,.15);
    // 初始圣光脉冲
    emitGpuBurst({x:hp.x,y:1,z:hp.z},0xffdd44,10,4,3,.4,{gravity:3});
    for(let i=0;i<hitTicks;i++)setTimeout(()=>{if(!gameActive||!heroMesh)return;const ang=(i/hitTicks)*Math.PI*2+gameTime*3;const cx=heroMesh.position.x+Math.cos(ang)*r;const cz=heroMesh.position.z+Math.sin(ang)*r;
      // 金色剑气弧线粒子
      emitGpuBurst({x:cx,y:.8,z:cz},0xffcc44,3,3,2,.2,{gravity:4});
      S.enemies.forEach(e=>{if(e.hp<=0)return;const dx=e.mesh.position.x-cx,dz=e.mesh.position.z-cz;if(Math.sqrt(dx*dx+dz*dz)<2)dmgEnemy(e,dmg,{isSkill:true,skillName:'灰烬使者'})})},i*sk.hitRate*1000)}}
  // 🥶 霜之哀伤 —— 冰魄巨剑升空+锁链冰封全场（独特：3D冰剑+放射冰锁链）
  if(hasSkill('frostmourne')){const k='frostmourne';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('frostmourne');const sk=skData('frostmourne');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const fDur=sk.freezeDur+(l-1)*sk.freezeDurPerLv;
    // 独特视觉1：冰魄巨剑从地面升起
    const swordG=new THREE.Group();
    const blade=new THREE.Mesh(new THREE.BoxGeometry(.15,4,.04),
      new THREE.MeshStandardMaterial({color:0x88ccff,transparent:true,opacity:.9,emissive:0x4488ff,emissiveIntensity:1.2,metalness:.7,roughness:.1}));
    blade.position.y=2;swordG.add(blade);
    const hilt=new THREE.Mesh(new THREE.BoxGeometry(.4,.2,.08),
      new THREE.MeshStandardMaterial({color:0x6644aa,emissive:0x4422aa,emissiveIntensity:.5}));
    hilt.position.y=.2;swordG.add(hilt);
    // 剑身光晕
    const sGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0x4488ff,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));
    sGlow.scale.set(1.5,5,1);sGlow.position.y=2;swordG.add(sGlow);
    swordG.position.set(hp.x,-2,hp.z);scene.add(swordG);
    S.particles.push({mesh:swordG,life:1.2,maxLife:1.2,type:'frostSword'});
    // 独特视觉2：放射状冰锁链连接所有敌人
    const chainN=Math.min(S.enemies.length,12);
    const chainTargets=S.enemies.slice(0,chainN);
    chainTargets.forEach((e,idx)=>{
      if(e.hp<=0)return;
      setTimeout(()=>{
        if(!gameActive)return;
        // 冰锁链（蓝色粗弧线）
        const from=hp.clone();from.y=2;const to=e.mesh.position.clone();to.y=1.5;
        const pts=[];const segs=6;
        for(let j=0;j<=segs;j++){
          const t=j/segs;
          const jx=(j>0&&j<segs)?(Math.random()-.5)*.8:0;
          const jy=(j>0&&j<segs)?(Math.random()-.5)*.4:0;
          pts.push(new THREE.Vector3(from.x+(to.x-from.x)*t+jx,from.y+(to.y-from.y)*t+jy+Math.sin(t*Math.PI)*.5,from.z+(to.z-from.z)*t+jx));
        }
        const curve=new THREE.CatmullRomCurve3(pts);
        const chainMesh=new THREE.Group();
        chainMesh.add(new THREE.Mesh(new THREE.TubeGeometry(curve,12,.04,4,false),
          new THREE.MeshBasicMaterial({color:0xaaddff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false})));
        chainMesh.add(new THREE.Mesh(new THREE.TubeGeometry(curve,12,.12,3,false),
          new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:.2,blending:THREE.AdditiveBlending,depthWrite:false})));
        scene.add(chainMesh);
        S.particles.push({mesh:chainMesh,life:.6,maxLife:.6,type:'lightning'});
        // 命中敌人位置冰晶爆发
        emitGpuBurst({x:to.x,y:1,z:to.z},0x88ccff,5,3,2,.3,{gravity:5});
      },idx*30);
    });
    // 全屏冰霜扩散波
    screenFlash('#88ccff',.25,200);screenShake(.2,.3);
    // 扩散冰环（比aoeEffect更大更慢）
    const bigRing=new THREE.Mesh(new THREE.RingGeometry(.5,1,32),
      new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:.5,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
    bigRing.rotation.x=-Math.PI/2;bigRing.position.set(hp.x,.35,hp.z);scene.add(bigRing);
    S.particles.push({mesh:bigRing,life:.8,maxLife:.8,type:'shockwave',speed:sk.radius*1.5});
    iceShatter(hp,3,8);
    addDynLight(hp,0x4488ff,4,15,.8);
    S.enemies.forEach(e=>{dmgEnemy(e,dmg,{isSkill:true,skillName:'霜之哀伤'});e.frozen=fDur})}}
  // 👁️ 萨格拉斯之眼 —— 天空恶魔巨眼+邪能灼烧射线（独特：3D魔眼投影）
  if(hasSkill('eyeofsargeras')){const k='eyeofsargeras';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('eyeofsargeras');const sk=skData('eyeofsargeras');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const hitR=sk.hitRadius+(l-1)*sk.hitRadiusPerLv;
    const dur=sk.beamDuration+(l-1)*sk.beamDurPerLv;
    const ticks=Math.floor(dur/sk.tickRate);
    const t=nearest(hp,20);if(t){const p=t.mesh.position.clone();
    // 独特视觉1：天空恶魔之眼3D模型
    const eyeG=new THREE.Group();
    // 外圈——邪能旋转光环
    const eyeRing=new THREE.Mesh(new THREE.TorusGeometry(1.8,.15,8,24),
      new THREE.MeshBasicMaterial({color:0xff00ff,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));
    eyeG.add(eyeRing);
    // 内圈——深色眼球
    const eyeBall=new THREE.Mesh(new THREE.SphereGeometry(1.2,16,12),
      new THREE.MeshStandardMaterial({color:0x220044,emissive:0xff00ff,emissiveIntensity:.6,transparent:true,opacity:.7}));
    eyeG.add(eyeBall);
    // 瞳孔——竖条裂缝
    const pupilGeo=new THREE.PlaneGeometry(.2,1.6);
    const pupilMat=new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    const pupil=new THREE.Mesh(pupilGeo,pupilMat);pupil.position.z=1.21;eyeG.add(pupil);
    // 眼光晕
    const eyeGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff44ff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
    eyeGlow.scale.set(6,6,1);eyeG.add(eyeGlow);
    eyeG.position.set(p.x,14,p.z);
    eyeG.lookAt(p.x,0,p.z);// 朝下看
    scene.add(eyeG);
    S.particles.push({mesh:eyeG,life:dur+.5,maxLife:dur+.5,type:'demonEye',targetPos:p.clone()});
    // 独特视觉2：邪能射线从眼到地面
    const beamPts=[new THREE.Vector3(p.x,13,p.z),new THREE.Vector3(p.x,0,p.z)];
    const beamCurve=new THREE.LineCurve3(beamPts[0],beamPts[1]);
    const beamMesh=new THREE.Mesh(new THREE.TubeGeometry(beamCurve,4,.3,8,false),
      new THREE.MeshBasicMaterial({color:0xff44ff,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,depthWrite:false}));
    scene.add(beamMesh);
    S.particles.push({mesh:beamMesh,life:dur+.3,maxLife:dur+.3,type:'beam',shaderMat:null});
    // 射线外层
    const beamOuter=new THREE.Mesh(new THREE.TubeGeometry(beamCurve,4,.8,6,false),
      new THREE.MeshBasicMaterial({color:0xff00ff,transparent:true,opacity:.08,blending:THREE.AdditiveBlending,depthWrite:false}));
    scene.add(beamOuter);
    S.particles.push({mesh:beamOuter,life:dur+.3,maxLife:dur+.3,type:'beam',shaderMat:null});
    addDynLight(p,0xff00ff,3,8,dur*.5);
    for(let i=0;i<ticks;i++)setTimeout(()=>{if(!gameActive)return;
      // 地面灼烧环取代通用aoeEffect
      emitGpuBurst({x:p.x,y:.5,z:p.z},0xff44ff,4,2,2,.2,{gravity:3});
      screenShake(.04,.08);
      S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(p)<hitR)dmgEnemy(e,dmg,{isSkill:true,skillName:'萨格拉斯之眼'})})},i*sk.tickRate*1000)}}}
  // 🏰 达拉然坠落 —— 着色器火焰陨石+大气层燃烧拖尾+蘑菇云爆炸
  if(hasSkill('dalaran')){const k='dalaran';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('dalaran');const sk=skData('dalaran');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const impactR=sk.impactRadius+(l-1)*sk.impactRadiusPerLv;
    const t=nearest(hp,20);const p=t?t.mesh.position.clone():hp.clone();
    // 阶段1: 红色脉动预警圈+警告光柱
    aoeEffect(p,impactR,0xff2200,1.6);lightBeam(p,0xff2200,1,.8);
    // 天空陨石 — 着色器火焰材质
    const mg=new THREE.Group();
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x442200,emissive:0xff4400,emissiveIntensity:.8,roughness:.6}));mg.add(rock);
    const fireMat=makeFireShaderMat(0xff8800,0xff2200,{opacity:0.8});
    const fireWrap=new THREE.Mesh(new THREE.SphereGeometry(1.6,12,12),fireMat);mg.add(fireWrap);
    const haloMat=new THREE.SpriteMaterial({map:flameTex,color:0xff6600,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false});
    const haloSpr=new THREE.Sprite(haloMat);haloSpr.scale.setScalar(5);mg.add(haloSpr);
    mg.position.set(p.x,25,p.z-8);scene.add(mg);
    S.particles.push({mesh:mg,life:1.5,maxLife:1.5,type:'meteor',target:p.clone(),fireMat:fireMat,rock:rock});
    // 阶段2: 着陆巨型爆炸（1.5秒后）
    setTimeout(()=>{if(!gameActive)return;
      emitGpuBurst({x:p.x,y:1,z:p.z},0xff6600,50,12,6,.8,{gravity:6});
      emitGpuBurst({x:p.x,y:1,z:p.z},0xffaa44,30,8,5,.6,{gravity:8,fadeStyle:'flash'});
      emitGpuBurst({x:p.x,y:2,z:p.z},0xff2200,25,6,4,1,{gravity:3});
      for(let i=0;i<15;i++){emitGpuP({x:p.x+(Math.random()-.5)*2,y:1+Math.random(),z:p.z+(Math.random()-.5)*2},0x444444,{x:(Math.random()-.5)*2,y:6+Math.random()*8,z:(Math.random()-.5)*2},8+Math.random()*5,1.5+Math.random(),{gravity:-0.5,shrink:false})}
      aoeEffect(p,impactR,0xff8800,.8);
      // 地面灼烧持续AOE
      const burnMat=makeFireShaderMat(0xff4400,0x661100,{opacity:0.3});
      burnMat.depthWrite=false;burnMat.polygonOffset=true;burnMat.polygonOffsetFactor=-4;burnMat.polygonOffsetUnits=-4;
      const burnPlane=new THREE.Mesh(new THREE.PlaneGeometry(impactR*1.5,impactR*1.5),burnMat);
      burnPlane.rotation.x=-Math.PI/2;burnPlane.position.set(p.x,.35,p.z);scene.add(burnPlane);
      S.particles.push({mesh:burnPlane,life:sk.groundBurnDur,maxLife:sk.groundBurnDur,type:'groundfire',shaderMat:burnMat,
        burnDmg:sk.groundBurnDmg+effectiveAtk*0.3,burnPos:p.clone(),burnRadius:impactR});
      lightBeam(p,0xff4400,3,.6);explosion(p,0xff6600,20);
      screenFlash('#ff6600',.4,200);screenShake(.4,.4);addDynLight(p,0xff6600,5,15,.8);
      S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(p)<impactR)dmgEnemy(e,dmg,{isFireDmg:true,isSkill:true})})
    },1500)}}
  // ===== 10个英雄标志技能 (signature) — 开局自动获得·可升级 =====
  // 🌀 战士·旋风斩 — 旋转斧刃割草
  if(hasSkill('sig_whirlwind')){const k='sig_whirlwind';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_whirlwind');const sk=skData('sig_whirlwind');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.radius+(l-1)*sk.radiusPerLv;
    const hits=sk.spinHits+(l-1)*sk.spinHitsPerLv;
    // --- 3D旋转斧刃视觉 ---
    const bladeCount=2+Math.floor(l/2);const bladeGroup=new THREE.Group();bladeGroup.position.copy(hp);bladeGroup.position.y=0.8;
    for(let b=0;b<bladeCount;b++){
      const ang=(b/bladeCount)*Math.PI*2;
      // 斧刃：扁平锥体
      const bladeMat=new THREE.MeshStandardMaterial({color:0xcc4444,emissive:0xff2200,emissiveIntensity:1.2,metalness:0.8,roughness:0.2,transparent:true,opacity:0.9});
      const blade=new THREE.Mesh(new THREE.ConeGeometry(0.12,r*0.6,3),bladeMat);
      blade.rotation.z=Math.PI/2;blade.position.set(Math.cos(ang)*r*0.4,0,Math.sin(ang)*r*0.4);blade.rotation.y=ang;
      bladeGroup.add(blade);
      // 斧刃拖尾光弧
      const trailMat=new THREE.MeshBasicMaterial({color:0xff4444,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
      const trail=new THREE.Mesh(new THREE.PlaneGeometry(r*0.5,0.15),trailMat);
      trail.position.copy(blade.position);trail.rotation.y=ang+Math.PI/2;bladeGroup.add(trail);
    }
    // 中心旋涡气流环
    const vortexMat=new THREE.MeshBasicMaterial({color:0xff6644,transparent:true,opacity:0.15,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const vortex=new THREE.Mesh(new THREE.RingGeometry(r*0.2,r*0.9,24),vortexMat);vortex.rotation.x=-Math.PI/2;bladeGroup.add(vortex);
    scene.add(bladeGroup);
    // 金属火花粒子
    emitGpuBurst({x:hp.x,y:0.8,z:hp.z},0xff6633,8+l*2,3,3,0.2,{gravity:6});
    screenShake(.04,.06);
    // 旋转动画 + 伤害tick
    const spinDur=hits*0.2;let spinT=0;
    const spinFn=()=>{if(!gameActive){scene.remove(bladeGroup);return}
      spinT+=0.016;bladeGroup.rotation.y+=0.4;
      // 每次旋转过半圈判定伤害
      const hitIdx=Math.floor(spinT/0.2);
      if(hitIdx<hits&&spinT-hitIdx*0.2<0.02){
        S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r){
          dmgEnemy(e,dmg,{isSkill:true,skillName:'旋风斩'});
          // 击中金属火花
          emitGpuBurst(e.mesh.position,0xffaa44,2,2,1.5,0.1,{gravity:8})}});
        screenShake(.02,.03);
      }
      // 拖尾缩小
      bladeGroup.children.forEach(c=>{if(c.material&&c.material.opacity!==undefined)c.material.opacity*=0.995});
      if(spinT>=spinDur){
        // 结束：斧刃飞散
        emitGpuBurst({x:hp.x,y:0.8,z:hp.z},0xcc3333,6,4,3,0.15,{gravity:5});
        scene.remove(bladeGroup);return}
      requestAnimationFrame(spinFn)};
    requestAnimationFrame(spinFn);}}
  // 🔥 法师·烈焰风暴 — 火焰柱阵列喷射
  if(hasSkill('sig_firestorm')){const k='sig_firestorm';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_firestorm');const sk=skData('sig_firestorm');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.radius+(l-1)*sk.radiusPerLv;
    const dur=sk.duration+(l-1)*sk.durationPerLv;
    const ticks=Math.floor(dur/sk.tickRate);
    const t=nearest(hp,15);const center=t?t.mesh.position.clone():hp.clone();
    // --- 火焰柱阵列视觉 ---
    const pillarCount=4+l;const pillars=[];
    for(let pi=0;pi<pillarCount;pi++){
      const ang=(pi/pillarCount)*Math.PI*2+Math.random()*0.5;
      const dist=Math.random()*r*0.7;
      const px=center.x+Math.cos(ang)*dist,pz=center.z+Math.sin(ang)*dist;
      // 火焰柱：着色器发光圆柱
      const pillarH=1.5+Math.random()*2;
      const pillarGeo=new THREE.CylinderGeometry(0.15+Math.random()*0.1,0.3+Math.random()*0.1,pillarH,6);
      const pillarMat=new THREE.MeshBasicMaterial({color:0xff6600,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending});
      const pillar=new THREE.Mesh(pillarGeo,pillarMat);pillar.position.set(px,pillarH/2,pz);
      // 内核亮芯
      const coreMat=new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending});
      const core=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.15,pillarH*0.8,4),coreMat);
      pillar.add(core);
      // 顶部火焰Sprite
      const topSpr=new THREE.Sprite(new THREE.SpriteMaterial({color:0xff4400,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending}));
      topSpr.position.y=pillarH/2;topSpr.scale.set(0.8,0.8,1);pillar.add(topSpr);
      scene.add(pillar);pillars.push({mesh:pillar,baseH:pillarH,born:pi*0.08});
    }
    // 地面灼烧圈
    const burnRing=new THREE.Mesh(new THREE.RingGeometry(0.3,r,20),
      new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:0.2,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
    burnRing.rotation.x=-Math.PI/2;burnRing.position.set(center.x,0.3,center.z);scene.add(burnRing);
    addDynLight(center,0xff4400,3,8,dur);
    screenFlash('#ff440022',.08,100);
    // 持续tick伤害 + 火焰柱动画
    let fireT=0;
    const fireFn=()=>{if(!gameActive){pillars.forEach(p=>scene.remove(p.mesh));scene.remove(burnRing);return}
      fireT+=0.016;
      // 火焰柱脉动动画
      pillars.forEach(p=>{
        const age=fireT-p.born;if(age<0)return;
        const pulse=1+Math.sin(age*8)*0.15;
        p.mesh.scale.set(pulse,1+Math.sin(age*5)*0.1,pulse);
        p.mesh.material.opacity=Math.max(0,0.7*(1-fireT/(dur+0.3)));
        // 上升火星粒子
        if(Math.random()<0.15)emitGpuP(p.mesh.position,Math.random()<0.5?0xff6600:0xffaa00,{vy:3+Math.random()*2,vx:(Math.random()-0.5)*1.5,vz:(Math.random()-0.5)*1.5,life:0.4,size:1.5,gravity:-2,shrink:true});
      });
      burnRing.material.opacity=Math.max(0,0.2*(1-fireT/dur));
      if(fireT>=dur+0.3){pillars.forEach(p=>scene.remove(p.mesh));scene.remove(burnRing);return}
      requestAnimationFrame(fireFn)};
    requestAnimationFrame(fireFn);
    // 伤害tick
    for(let i=0;i<ticks;i++)setTimeout(()=>{if(!gameActive)return;
      S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(new THREE.Vector3(center.x,0,center.z))<r)dmgEnemy(e,dmg,{isSkill:true,isFireDmg:true,skillName:'烈焰风暴'})})
    },i*sk.tickRate*1000)}}
  // 🏹 猎人·多重射击 — 能量弓弦+锥体箭矢齐射
  if(hasSkill('sig_multishot')){const k='sig_multishot';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_multishot');const sk=skData('sig_multishot');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const count=sk.arrowCount+(l-1)*sk.arrowCountPerLv;
    const targets=nearestN(hp,18,count);
    // --- 能量弓弦蓄力视觉 ---
    const bowGroup=new THREE.Group();bowGroup.position.copy(hp);bowGroup.position.y=1.2;
    // 弓弦能量弧
    const bowCurve=new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.8,0.5,0),new THREE.Vector3(0,0,-0.6),new THREE.Vector3(0.8,0.5,0));
    const bowTube=new THREE.Mesh(new THREE.TubeGeometry(bowCurve,12,0.03,4,false),
      new THREE.MeshBasicMaterial({color:0x66ff66,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending}));
    bowGroup.add(bowTube);
    // 弦光
    const stringMat=new THREE.MeshBasicMaterial({color:0xaaffaa,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending});
    const stringGeo=new THREE.CylinderGeometry(0.01,0.01,1.2,4);
    const bowStr=new THREE.Mesh(stringGeo,stringMat);bowStr.position.set(0,0.5,-0.1);bowStr.rotation.z=Math.PI/6;bowGroup.add(bowStr);
    scene.add(bowGroup);
    // 蓄力绿色粒子旋涡
    emitGpuBurst({x:hp.x,y:1.2,z:hp.z},0x88ff44,6,2,1.5,0.15,{gravity:1});
    // 短暂蓄力后释放箭矢
    setTimeout(()=>{if(!gameActive){scene.remove(bowGroup);return}
      scene.remove(bowGroup);
      // 释放闪光
      emitGpuBurst({x:hp.x,y:1.2,z:hp.z},0xccffaa,10,3,2,0.1,{gravity:3});
      screenShake(.02,.04);
      if(targets.length>0){
        targets.forEach((t,i)=>{
          setTimeout(()=>{if(!gameActive)return;
            fireProjectile(hp,t.mesh.position,0x88ff44,dmg,.15,sk.projSpeed,{trail:'leaf',trailColor:0x66cc22,isSkill:true,skillName:'多重射击',homing:true,
              onHit:function(){
                // 箭矢钉地：地面绿色震波纹
                emitGpuBurst(t.mesh.position,0x88ff44,3,2,1.5,0.08,{gravity:6});
              }});
          },i*40); // 连珠射击间隔
        });
      }else{
        for(let i=0;i<count;i++){const ang=(i/count)*Math.PI*2;const tp={x:hp.x+Math.cos(ang)*12,y:0,z:hp.z+Math.sin(ang)*12};
          fireProjectile(hp,tp,0x88ff44,dmg,.15,sk.projSpeed,{trail:'leaf',trailColor:0x66cc22,isSkill:true,skillName:'多重射击'})}}
    },120);}}
  // 💜 牧师·暗言术 — 暗影锁链+灵魂吸取
  if(hasSkill('sig_shadowword')){const k='sig_shadowword';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_shadowword');const sk=skData('sig_shadowword');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const markN=sk.markCount+(l-1)*sk.markCountPerLv;
    const dur=sk.markDur+(l-1)*sk.markDurPerLv;
    const targets=nearestN(hp,12,markN);
    const ticks=Math.floor(dur/0.5);
    // --- 暗影锁链视觉 ---
    const chainGroup=new THREE.Group();scene.add(chainGroup);
    const chainMeshes=[];
    targets.forEach((t,idx)=>{
      // 暗影标记：头顶暗紫符文旋转
      const runeMat=new THREE.MeshBasicMaterial({color:0xbb66ff,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
      const rune=new THREE.Mesh(new THREE.RingGeometry(0.2,0.4,6),runeMat);
      rune.position.copy(t.mesh.position);rune.position.y=2.2;rune.rotation.x=-Math.PI/2;
      chainGroup.add(rune);
      // 锁链连接：从英雄到目标的暗影管
      const from=hp.clone();from.y=1;const to=t.mesh.position.clone();to.y=1.2;
      const mid=from.clone().add(to).multiplyScalar(0.5);mid.y+=1.5;
      const curve=new THREE.QuadraticBezierCurve3(from,mid,to);
      const tubeMat=new THREE.MeshBasicMaterial({color:0x9944cc,transparent:true,opacity:0.4,blending:THREE.AdditiveBlending});
      const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,10,0.04,4,false),tubeMat);
      chainGroup.add(tube);
      // 外层暗影光晕管
      const outerMat=new THREE.MeshBasicMaterial({color:0x6622aa,transparent:true,opacity:0.12,blending:THREE.AdditiveBlending});
      const outer=new THREE.Mesh(new THREE.TubeGeometry(curve,10,0.15,4,false),outerMat);
      chainGroup.add(outer);
      chainMeshes.push({rune,tube,outer,target:t});
      // 标记暗影粒子爆发
      emitGpuBurst(t.mesh.position,0xbb88ff,4,1.5,1.5,0.1,{gravity:2});
    });
    // 中心暗影球
    const orbMat=new THREE.MeshBasicMaterial({color:0x9966cc,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending});
    const orb=new THREE.Mesh(new THREE.SphereGeometry(0.3,8,8),orbMat);
    orb.position.copy(hp);orb.position.y=1.2;chainGroup.add(orb);
    addDynLight(hp,0x9944cc,2,6,dur);
    // 持续动画：符文旋转+灵魂粒子从敌人流向英雄
    let swT=0;
    const swFn=()=>{if(!gameActive){scene.remove(chainGroup);return}
      swT+=0.016;
      chainMeshes.forEach(cm=>{
        cm.rune.rotation.z+=0.06;
        cm.rune.material.opacity=Math.max(0,0.6*(1-swT/dur));
        cm.tube.material.opacity=Math.max(0,0.4*(1-swT/dur));
        cm.outer.material.opacity=Math.max(0,0.12*(1-swT/dur));
        // 灵魂粒子从敌人流向英雄
        if(Math.random()<0.2&&cm.target.hp>0){
          const ep=cm.target.mesh.position;
          emitGpuP({x:ep.x,y:1.5,z:ep.z},0xcc88ff,{
            vx:(hp.x-ep.x)*1.5,vy:1,vz:(hp.z-ep.z)*1.5,life:0.5,size:2,gravity:0,shrink:true});}
      });
      orb.material.opacity=0.3+Math.sin(swT*6)*0.2;orb.scale.setScalar(1+Math.sin(swT*4)*0.1);
      if(swT>=dur){scene.remove(chainGroup);return}
      requestAnimationFrame(swFn)};
    requestAnimationFrame(swFn);
    // DOT伤害tick
    targets.forEach(t=>{
      for(let i=0;i<ticks;i++)setTimeout(()=>{if(!gameActive||!t||t.hp<=0)return;
        dmgEnemy(t,dmg,{isSkill:true,isDot:true,skillName:'暗言术'});
        S.hp=Math.min(S.maxHp,S.hp+dmg*sk.healPct);
      },i*500)})}}
  // 🌑 盗贼·影舞 — 残影分身瞬移连击
  if(hasSkill('sig_shadowdance')){const k='sig_shadowdance';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_shadowdance');const sk=skData('sig_shadowdance');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const strikes=sk.strikeCount+(l-1)*sk.strikeCountPerLv;
    const invDur=sk.invincDur+(l-1)*sk.invincDurPerLv;
    S.passiveStacks.invincible=(S.passiveStacks.invincible||0)+invDur;
    // --- 残影分身视觉 ---
    // 消失烟雾
    emitGpuBurst({x:hp.x,y:0.8,z:hp.z},0x332244,8,2,2,0.15,{gravity:2});
    for(let i=0;i<strikes;i++){setTimeout(()=>{if(!gameActive)return;
      const t=nearest(hp,12);if(!t||t.hp<=0)return;
      const tp=t.mesh.position;
      // 在目标位置生成残影（半透明暗紫色剪影）
      const ghostMat=new THREE.MeshBasicMaterial({color:0x5522aa,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending});
      const ghost=new THREE.Mesh(new THREE.BoxGeometry(0.4,1.4,0.2),ghostMat);
      // 残影出现在目标背后
      const dir=new THREE.Vector3().subVectors(tp,hp).normalize();
      ghost.position.set(tp.x+dir.x*0.5,0.7,tp.z+dir.z*0.5);
      ghost.lookAt(tp);scene.add(ghost);
      // X形刀光斩痕
      const slashMat=new THREE.MeshBasicMaterial({color:0xaa44ff,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
      const slash1=new THREE.Mesh(new THREE.PlaneGeometry(0.08,1.8),slashMat);
      slash1.position.copy(tp);slash1.position.y=1;slash1.rotation.z=Math.PI/4;
      const slash2=new THREE.Mesh(new THREE.PlaneGeometry(0.08,1.8),slashMat.clone());
      slash2.position.copy(tp);slash2.position.y=1;slash2.rotation.z=-Math.PI/4;
      scene.add(slash1);scene.add(slash2);
      // 暗影粒子从斩击点飞散
      emitGpuBurst(tp,0x7744cc,4,2.5,2,0.08,{gravity:4});
      // 伤害
      dmgEnemy(t,dmg,{isSkill:true,bonusCrit:1.0,bonusCritDmg:0.5,skillName:'影舞'});
      screenShake(.03,.05);
      // 残影和刀光渐隐
      let fadeT=0;
      const fadeFn=()=>{fadeT+=0.016;
        const a=1-fadeT/0.3;
        ghost.material.opacity=Math.max(0,0.5*a);ghost.position.y+=0.03;
        slash1.material.opacity=Math.max(0,0.7*a);slash1.scale.x=1+fadeT*3;
        slash2.material.opacity=Math.max(0,0.7*a);slash2.scale.x=1+fadeT*3;
        if(fadeT>=0.3){scene.remove(ghost);scene.remove(slash1);scene.remove(slash2);return}
        requestAnimationFrame(fadeFn)};
      requestAnimationFrame(fadeFn);
    },i*150)}}}
  // 🌊 萨满·图腾风暴 — 3D图腾柱+元素漩涡
  if(hasSkill('sig_totemstorm')){const k='sig_totemstorm';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_totemstorm');const sk=skData('sig_totemstorm');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.totemRadius+(l-1)*sk.totemRadPerLv;
    const dur=sk.totemDur+(l-1)*sk.totemDurPerLv;
    const ticks=Math.floor(dur/0.5);
    const totemColors=[0xff4400,0x44ff44,0x44aaff];
    const totemEmit=[0xff2200,0x22cc22,0x2288dd];
    const totemNames=['🔥','💧','⚡'];
    const totemGroup=new THREE.Group();scene.add(totemGroup);
    const totems=[];
    for(let c=0;c<3;c++){
      const ang=(c/3)*Math.PI*2;
      const tx=hp.x+Math.cos(ang)*2.5,tz=hp.z+Math.sin(ang)*2.5;
      // 3D图腾柱：方柱+顶部元素球+底座
      const pillarGeo=new THREE.BoxGeometry(0.35,1.6,0.35);
      const pillarMat=new THREE.MeshStandardMaterial({color:0x8B4513,roughness:0.8,metalness:0.1});
      const pillar=new THREE.Mesh(pillarGeo,pillarMat);pillar.position.set(tx,0.8,tz);pillar.castShadow=true;
      totemGroup.add(pillar);
      // 图腾面部雕纹（前面板）
      const faceMat=new THREE.MeshBasicMaterial({color:totemColors[c],transparent:true,opacity:0.6,blending:THREE.AdditiveBlending});
      const face=new THREE.Mesh(new THREE.PlaneGeometry(0.25,0.5),faceMat);
      face.position.z=0.18;face.position.y=0.2;pillar.add(face);
      // 顶部元素球
      const orbMat=new THREE.MeshStandardMaterial({color:totemColors[c],emissive:totemEmit[c],emissiveIntensity:1.5,transparent:true,opacity:0.8});
      const orb=new THREE.Mesh(new THREE.SphereGeometry(0.2,8,8),orbMat);
      orb.position.y=1;pillar.add(orb);
      // 元素光晕Sprite
      const haloMat=new THREE.SpriteMaterial({color:totemColors[c],transparent:true,opacity:0.3,blending:THREE.AdditiveBlending});
      const halo=new THREE.Sprite(haloMat);halo.scale.set(1.2,1.2,1);halo.position.y=1;pillar.add(halo);
      // 底座圆环
      const baseMat=new THREE.MeshBasicMaterial({color:totemColors[c],transparent:true,opacity:0.15,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
      const base=new THREE.Mesh(new THREE.RingGeometry(0.3,r*0.6,16),baseMat);
      base.rotation.x=-Math.PI/2;base.position.set(tx,0.3,tz);totemGroup.add(base);
      totems.push({pillar,orb,halo,base,x:tx,z:tz,type:c});
      // 升起动画
      pillar.scale.y=0;pillar.position.y=0;
      addDynLight({x:tx,y:1.5,z:tz},totemColors[c],1.5,5,dur);
    }
    // 图腾升起+元素效果动画
    let totT=0;
    const totFn=()=>{if(!gameActive){scene.remove(totemGroup);return}
      totT+=0.016;
      totems.forEach(tm=>{
        // 升起动画
        const rise=Math.min(1,totT*3);
        tm.pillar.scale.y=rise;tm.pillar.position.y=0.8*rise;
        // 元素球脉动
        const pulse=1+Math.sin(totT*5+tm.type*2)*0.2;
        tm.orb.scale.setScalar(pulse);
        tm.halo.material.opacity=0.2+Math.sin(totT*4+tm.type)*0.15;
        tm.base.material.opacity=Math.max(0,0.15*(1-totT/dur));
        // 元素粒子效果（各不相同）
        if(Math.random()<0.1){
          const pos={x:tm.x,y:1.8,z:tm.z};
          if(tm.type===0)emitGpuP(pos,0xff6600,{vy:2+Math.random(),vx:(Math.random()-0.5)*2,vz:(Math.random()-0.5)*2,life:0.3,size:1.5,gravity:-1,shrink:true}); // 火星上升
          else if(tm.type===1)emitGpuP(pos,0x88ffcc,{vy:-0.5,vx:(Math.random()-0.5),vz:(Math.random()-0.5),life:0.5,size:2,gravity:1,shrink:true}); // 水滴下落
          else emitGpuP(pos,0x88ccff,{vy:1+Math.random()*2,vx:(Math.random()-0.5)*3,vz:(Math.random()-0.5)*3,life:0.2,size:1,gravity:0,shrink:true}); // 电花四射
        }
      });
      if(totT>=dur){
        // 图腾消散爆炸
        totems.forEach(tm=>emitGpuBurst({x:tm.x,y:1,z:tm.z},totemColors[tm.type],5,2,2,0.2,{gravity:4}));
        scene.remove(totemGroup);return}
      requestAnimationFrame(totFn)};
    requestAnimationFrame(totFn);
    // 伤害tick
    for(let c=0;c<3;c++){const ang=(c/3)*Math.PI*2;
      const tp={x:hp.x+Math.cos(ang)*2.5,y:0,z:hp.z+Math.sin(ang)*2.5};
      for(let i=0;i<ticks;i++)setTimeout(()=>{if(!gameActive)return;
        if(c===0){S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(new THREE.Vector3(tp.x,0,tp.z))<r)dmgEnemy(e,dmg*.5,{isSkill:true,isFireDmg:true,skillName:'图腾风暴'})})}
        else if(c===1){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*0.008)}
        else{const targets=S.enemies.filter(e=>e.hp>0&&e.mesh.position.distanceTo(new THREE.Vector3(tp.x,0,tp.z))<r*1.2);
          if(targets.length>0){const et=targets[Math.floor(Math.random()*targets.length)];lightningBolt(tp,et.mesh.position,0x44aaff,.03,4);dmgEnemy(et,dmg*.6,{isSkill:true,skillName:'图腾风暴'})}}
      },i*500)}}}
  // ❄️ 死骑·凛冬将至 — 冰刺裂地阵列
  if(hasSkill('sig_wintercoming')){const k='sig_wintercoming';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_wintercoming');const sk=skData('sig_wintercoming');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.freezeRadius+(l-1)*sk.freezeRadPerLv;
    const fDur=sk.freezeDur+(l-1)*sk.freezeDurPerLv;
    // --- 冰刺裂地视觉 ---
    const iceGroup=new THREE.Group();scene.add(iceGroup);
    const spikeCount=8+l*2;
    // 地面冰裂纹（从中心向外的裂缝线条）
    const crackMat=new THREE.MeshBasicMaterial({color:0x88ddff,transparent:true,opacity:0.4,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
    for(let ci=0;ci<6;ci++){
      const cAng=ci/6*Math.PI*2+Math.random()*0.3;
      const crackLen=r*0.6+Math.random()*r*0.3;
      const crack=new THREE.Mesh(new THREE.PlaneGeometry(0.06,crackLen),crackMat.clone());
      crack.rotation.x=-Math.PI/2;crack.rotation.z=cAng;
      crack.position.set(hp.x+Math.cos(cAng)*crackLen*0.5,0.3,hp.z+Math.sin(cAng)*crackLen*0.5);
      iceGroup.add(crack);
    }
    // 中心冰霜冲击圆（向外扩散）
    const waveMat=new THREE.MeshBasicMaterial({color:0x66ccff,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
    const wave=new THREE.Mesh(new THREE.RingGeometry(0.2,0.5,20),waveMat);
    wave.rotation.x=-Math.PI/2;wave.position.set(hp.x,0.35,hp.z);iceGroup.add(wave);
    // 冰刺依次从地面刺出（ConeGeometry尖锥）
    const spikes=[];
    for(let si=0;si<spikeCount;si++){
      const sAng=si/spikeCount*Math.PI*2+Math.random()*0.4;
      const sDist=1+Math.random()*(r-1);
      const sH=0.8+Math.random()*1.5;
      const spikeMat=new THREE.MeshStandardMaterial({
        color:0xaaddff,emissive:0x4488cc,emissiveIntensity:0.8,
        metalness:0.5,roughness:0.1,transparent:true,opacity:0.85});
      const spike=new THREE.Mesh(new THREE.ConeGeometry(0.1+Math.random()*0.08,sH,5),spikeMat);
      spike.position.set(hp.x+Math.cos(sAng)*sDist,0,hp.z+Math.sin(sAng)*sDist);
      spike.scale.y=0; // 从地面升起
      spike.rotation.x=(Math.random()-0.5)*0.3;spike.rotation.z=(Math.random()-0.5)*0.3;
      iceGroup.add(spike);
      spikes.push({mesh:spike,targetH:sH,delay:si*0.04,born:false});
    }
    screenShake(.08,.15);
    addDynLight(hp,0x4488cc,3,10,1.5);
    // 冰刺升起+扩散动画
    let iceT=0;
    const iceFn=()=>{if(!gameActive){scene.remove(iceGroup);return}
      iceT+=0.016;
      // 冲击波向外扩散
      const waveR=iceT*r*2;
      wave.scale.set(1+waveR,1+waveR,1);wave.material.opacity=Math.max(0,0.3*(1-iceT/0.5));
      // 冰刺依次升起
      spikes.forEach(sp=>{
        const age=iceT-sp.delay;
        if(age<0)return;
        if(!sp.born){sp.born=true;
          // 刺出时碎冰粒子
          emitGpuBurst(sp.mesh.position,0x88ddff,2,1.5,1.5,0.05,{gravity:6});}
        const riseT=Math.min(1,age*6); // 快速刺出
        sp.mesh.scale.y=riseT;sp.mesh.position.y=sp.targetH*0.5*riseT;
        // 消散
        if(iceT>1.2){sp.mesh.material.opacity=Math.max(0,0.85*(1-(iceT-1.2)/0.8))}
      });
      // 裂纹消散
      if(iceT>1.5)iceGroup.children.forEach(c=>{if(c.material)c.material.opacity*=0.97});
      if(iceT>=2.2){scene.remove(iceGroup);return}
      requestAnimationFrame(iceFn)};
    requestAnimationFrame(iceFn);
    // 伤害+冰冻
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r){dmgEnemy(e,dmg,{isSkill:true,skillName:'凛冬将至'});e.frozen=fDur}})}}
  // ⭐ 德鲁伊·星辰坠落 — 星轨光弧+流星拖尾
  if(hasSkill('sig_starfall')){const k='sig_starfall';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_starfall');const sk=skData('sig_starfall');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const meteorN=sk.meteorCount+(l-1)*sk.meteorCountPerLv;
    const impR=sk.impactR+(l-1)*sk.impactRPerLv;
    // --- 天空星轨光弧 ---
    const starGroup=new THREE.Group();scene.add(starGroup);
    // 头顶旋转星轨环
    const orbitMat=new THREE.MeshBasicMaterial({color:0xffdd66,transparent:true,opacity:0.25,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const orbit=new THREE.Mesh(new THREE.TorusGeometry(3,0.02,4,32),orbitMat);
    orbit.position.set(hp.x,8,hp.z);orbit.rotation.x=Math.PI/3;starGroup.add(orbit);
    const orbit2=new THREE.Mesh(new THREE.TorusGeometry(2.5,0.02,4,32),orbitMat.clone());
    orbit2.position.set(hp.x,8,hp.z);orbit2.rotation.x=Math.PI/4;orbit2.rotation.y=Math.PI/3;starGroup.add(orbit2);
    // 轨道上的小星星
    for(let si=0;si<6;si++){
      const starMat=new THREE.MeshBasicMaterial({color:0xffffaa,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending});
      const star=new THREE.Mesh(new THREE.OctahedronGeometry(0.1,0),starMat);
      const sa=si/6*Math.PI*2;
      star.position.set(hp.x+Math.cos(sa)*3,8+Math.sin(sa)*0.5,hp.z+Math.sin(sa)*3);
      starGroup.add(star);
    }
    addDynLight({x:hp.x,y:8,z:hp.z},0xffdd44,2,8,2);
    // 陨石依次坠落
    for(let i=0;i<meteorN;i++){setTimeout(()=>{if(!gameActive){scene.remove(starGroup);return}
      const t=nearest(hp,15);
      const px=t?t.mesh.position.x:hp.x+(Math.random()-0.5)*10;
      const pz=t?t.mesh.position.z:hp.z+(Math.random()-0.5)*10;
      // 流星3D体：发光八面体+拖尾
      const meteorMat=new THREE.MeshStandardMaterial({color:0xffee66,emissive:0xffcc00,emissiveIntensity:2,transparent:true,opacity:0.9});
      const meteor=new THREE.Mesh(new THREE.OctahedronGeometry(0.25,1),meteorMat);
      const startX=px+(Math.random()-0.5)*3;const startZ=pz+(Math.random()-0.5)*3;
      meteor.position.set(startX,10,startZ);scene.add(meteor);
      // 流星光晕
      const mGlow=new THREE.Sprite(new THREE.SpriteMaterial({color:0xffdd44,transparent:true,opacity:0.4,blending:THREE.AdditiveBlending}));
      mGlow.scale.set(1.5,1.5,1);meteor.add(mGlow);
      // 坠落动画+星尘拖尾
      let mT=0;const fallDur=0.25;
      const mFn=()=>{mT+=0.016;const t2=mT/fallDur;
        meteor.position.x=startX+(px-startX)*t2;
        meteor.position.y=10*(1-t2*t2); // 加速坠落
        meteor.position.z=startZ+(pz-startZ)*t2;
        meteor.rotation.x+=0.2;meteor.rotation.z+=0.15;
        // 星尘拖尾粒子
        if(Math.random()<0.6)emitGpuP(meteor.position,Math.random()<0.5?0xffee88:0xffcc44,
          {vy:1,vx:(Math.random()-0.5)*2,vz:(Math.random()-0.5)*2,life:0.3,size:1.5,gravity:2,shrink:true});
        if(mT>=fallDur){
          scene.remove(meteor);
          // 着地爆炸：星尘四射+地面星光圆
          emitGpuBurst({x:px,y:0.3,z:pz},0xffee66,8,3,3,0.2,{gravity:5});
          emitGpuBurst({x:px,y:0.3,z:pz},0xffcc00,5,2,2,0.15,{gravity:4});
          // 地面星光圆环
          const impactRing=new THREE.Mesh(new THREE.RingGeometry(0.2,impR,16),
            new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
          impactRing.rotation.x=-Math.PI/2;impactRing.position.set(px,0.05,pz);scene.add(impactRing);
          addDynLight({x:px,y:1,z:pz},0xffdd44,2,5,0.4);
          screenShake(.03,.05);
          // 圆环消散
          let rT=0;const rFn=()=>{rT+=0.016;impactRing.material.opacity=Math.max(0,0.3*(1-rT/0.5));
            if(rT>=0.5){scene.remove(impactRing);return}requestAnimationFrame(rFn)};requestAnimationFrame(rFn);
          // 伤害
          S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(new THREE.Vector3(px,0,pz))<impR)dmgEnemy(e,dmg,{isSkill:true,skillName:'星辰坠落'})});
          return}
        requestAnimationFrame(mFn)};
      requestAnimationFrame(mFn);
    },i*300)}
    // 星轨消散
    setTimeout(()=>{if(starGroup.parent)scene.remove(starGroup)},meteorN*300+500);}}
  // 😈 术士·末日守卫 — 3D恶魔实体+邪能射线
  if(hasSkill('sig_doomguard')){const k='sig_doomguard';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_doomguard');const sk=skData('sig_doomguard');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const dur=sk.guardDur+(l-1)*sk.guardDurPerLv;
    const ticks=Math.floor(dur/sk.guardAtkRate);
    // --- 恶魔实体3D模型 ---
    const demonGroup=new THREE.Group();
    const demonX=hp.x+2,demonZ=hp.z-1;
    demonGroup.position.set(demonX,0,demonZ);
    // 身体
    const bodyMat=new THREE.MeshStandardMaterial({color:0x331144,emissive:0x440066,emissiveIntensity:0.5,roughness:0.6});
    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.4,1.8,6),bodyMat);body.position.y=1.2;demonGroup.add(body);
    // 头部
    const headMat=new THREE.MeshStandardMaterial({color:0x441155,emissive:0x660088,emissiveIntensity:0.6});
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.25,6,6),headMat);head.position.y=2.3;demonGroup.add(head);
    // 角
    const hornMat=new THREE.MeshStandardMaterial({color:0x442200,roughness:0.4,metalness:0.3});
    const horn1=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.4,4),hornMat);horn1.position.set(-0.15,2.5,0);horn1.rotation.z=0.3;demonGroup.add(horn1);
    const horn2=horn1.clone();horn2.position.x=0.15;horn2.rotation.z=-0.3;demonGroup.add(horn2);
    // 眼睛（发光邪绿）
    const eyeMat=new THREE.MeshBasicMaterial({color:0x44ff44,blending:THREE.AdditiveBlending});
    const eye1=new THREE.Mesh(new THREE.SphereGeometry(0.04,4,4),eyeMat);eye1.position.set(-0.08,2.35,0.2);demonGroup.add(eye1);
    const eye2=eye1.clone();eye2.position.x=0.08;demonGroup.add(eye2);
    // 翅膀（PlaneGeometry三角形）
    const wingMat=new THREE.MeshBasicMaterial({color:0x660099,transparent:true,opacity:0.4,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const wingGeo=new THREE.BufferGeometry();
    const wingVerts=new Float32Array([0,0,0, -1.2,0.8,0, -0.3,1.5,0]);
    wingGeo.setAttribute('position',new THREE.BufferAttribute(wingVerts,3));wingGeo.computeVertexNormals();
    const wing1=new THREE.Mesh(wingGeo,wingMat);wing1.position.set(-0.3,1.5,-0.15);demonGroup.add(wing1);
    const wing2=new THREE.Mesh(wingGeo,wingMat.clone());wing2.position.set(0.3,1.5,-0.15);wing2.scale.x=-1;demonGroup.add(wing2);
    // 脚下邪能圈
    const circleMat=new THREE.MeshBasicMaterial({color:0x9944cc,transparent:true,opacity:0.2,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
    const circle=new THREE.Mesh(new THREE.RingGeometry(0.5,1.2,16),circleMat);circle.rotation.x=-Math.PI/2;circle.position.y=0.35;demonGroup.add(circle);
    scene.add(demonGroup);
    addDynLight({x:demonX,y:2,z:demonZ},0x9944cc,2,6,dur);
    // 召唤公告
    const el=document.createElement('div');el.className='kill-streak';el.textContent='😈 末日守卫降临！';
    document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1200);
    // 召唤特效
    emitGpuBurst({x:demonX,y:0.5,z:demonZ},0x9944cc,10,3,3,0.2,{gravity:3});
    screenShake(.04,.08);
    // 恶魔存在期间动画
    let demonT=0;
    const demonFn=()=>{if(!gameActive){scene.remove(demonGroup);return}
      demonT+=0.016;
      // 翅膀扇动
      const wingAng=Math.sin(demonT*3)*0.3;
      wing1.rotation.y=wingAng;wing2.rotation.y=-wingAng;
      // 身体微浮
      body.position.y=1.2+Math.sin(demonT*2)*0.05;head.position.y=2.3+Math.sin(demonT*2)*0.05;
      // 邪能圈旋转
      circle.rotation.z+=0.02;circle.material.opacity=0.15+Math.sin(demonT*4)*0.08;
      // 眼睛闪烁
      eye1.material.opacity=0.8+Math.sin(demonT*8)*0.2;eye2.material.opacity=eye1.material.opacity;
      if(demonT>=dur){
        // 消散
        emitGpuBurst({x:demonX,y:1,z:demonZ},0x7733aa,8,3,3,0.2,{gravity:3});
        scene.remove(demonGroup);return}
      requestAnimationFrame(demonFn)};
    requestAnimationFrame(demonFn);
    // 攻击tick：邪能射线
    for(let i=0;i<ticks;i++){setTimeout(()=>{if(!gameActive)return;
      const t=nearest(hp,14);if(t&&t.hp>0){
        const eDmg=t.cursed?dmg*sk.cursedMult:dmg;
        dmgEnemy(t,eDmg,{isSkill:true,skillName:'末日守卫'});
        // 邪能射线（从恶魔眼睛到目标）
        const from={x:demonX,y:2.35,z:demonZ};
        const to=t.mesh.position;
        const beamCurve=new THREE.LineCurve3(new THREE.Vector3(from.x,from.y,from.z),new THREE.Vector3(to.x,to.y||0.8,to.z));
        const beamMat=new THREE.MeshBasicMaterial({color:0xbb44ff,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending});
        const beam=new THREE.Mesh(new THREE.TubeGeometry(beamCurve,4,0.06,4,false),beamMat);scene.add(beam);
        const beamOuter=new THREE.Mesh(new THREE.TubeGeometry(beamCurve,4,0.2,4,false),
          new THREE.MeshBasicMaterial({color:0x7722aa,transparent:true,opacity:0.15,blending:THREE.AdditiveBlending}));scene.add(beamOuter);
        // 命中爆炸
        emitGpuBurst(to,0xbb44ff,4,2,2,0.1,{gravity:4});
        // 射线消散
        let bT=0;const bFn=()=>{bT+=0.016;beam.material.opacity=Math.max(0,0.6*(1-bT/0.2));beamOuter.material.opacity=Math.max(0,0.15*(1-bT/0.2));
          if(bT>=0.2){scene.remove(beam);scene.remove(beamOuter);return}requestAnimationFrame(bFn)};requestAnimationFrame(bFn);}
    },i*sk.guardAtkRate*1000)}}}
  // 🛡️ 圣骑·复仇之盾 — 3D盾牌弹射+金色光弧
  if(hasSkill('sig_avengershield')){const k='sig_avengershield';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv('sig_avengershield');const sk=skData('sig_avengershield');
    resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const bounceN=sk.bounceCount+(l-1)*sk.bounceCountPerLv;
    const shieldGain=S.maxHp*(sk.shieldPct+(l-1)*sk.shieldPctPerLv);
    // 构建弹射目标序列
    const bounceTargets=[];let cur=nearest(hp,sk.bounceRange);let lp=hp.clone();const hit=new Set();
    for(let i=0;i<bounceN&&cur;i++){
      bounceTargets.push({from:lp.clone(),target:cur});
      hit.add(cur);lp=cur.mesh.position.clone();
      let nb=null,md=sk.bounceRange;for(const e of S.enemies){if(hit.has(e)||e.hp<=0)continue;const dd=e.mesh.position.distanceTo(lp);if(dd<md){md=dd;nb=e}}
      cur=nb;}
    if(bounceTargets.length===0){S.passiveStacks.divineShield=(S.passiveStacks.divineShield||0)+shieldGain;return}
    // --- 3D盾牌模型 ---
    const shieldGroup=new THREE.Group();
    // 盾面（圆角方形近似）
    const faceMat=new THREE.MeshStandardMaterial({color:0xffcc33,emissive:0xffaa00,emissiveIntensity:1,metalness:0.7,roughness:0.2,transparent:true,opacity:0.9});
    const shieldFace=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,0.06,6),faceMat);
    shieldFace.rotation.x=Math.PI/2;shieldGroup.add(shieldFace);
    // 盾面十字纹饰
    const crossMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const crossV=new THREE.Mesh(new THREE.PlaneGeometry(0.06,0.5),crossMat);crossV.position.z=0.04;shieldGroup.add(crossV);
    const crossH=new THREE.Mesh(new THREE.PlaneGeometry(0.35,0.06),crossMat.clone());crossH.position.z=0.04;shieldGroup.add(crossH);
    // 盾边缘发光
    const edgeMat=new THREE.MeshBasicMaterial({color:0xffdd66,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending});
    const edge=new THREE.Mesh(new THREE.TorusGeometry(0.35,0.03,4,12),edgeMat);shieldGroup.add(edge);
    // 盾光晕
    const haloMat=new THREE.SpriteMaterial({color:0xffcc44,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending});
    const halo=new THREE.Sprite(haloMat);halo.scale.set(1.5,1.5,1);shieldGroup.add(halo);
    shieldGroup.position.copy(hp);shieldGroup.position.y=1;
    scene.add(shieldGroup);
    // 依次弹射动画
    let bounceIdx=0;
    function animateBounce(){
      if(bounceIdx>=bounceTargets.length||!gameActive){
        scene.remove(shieldGroup);
        S.passiveStacks.divineShield=(S.passiveStacks.divineShield||0)+shieldGain;
        // 护盾获得闪光
        emitGpuBurst({x:hp.x,y:1,z:hp.z},0xffdd44,6,2,2,0.15,{gravity:3});
        return}
      const b=bounceTargets[bounceIdx];const target=b.target;
      if(!target||target.hp<=0){bounceIdx++;animateBounce();return}
      const from=shieldGroup.position.clone();
      const to=target.mesh.position.clone();to.y=1;
      const dist=from.distanceTo(to);const flyDur=Math.max(0.08,dist/25);
      // 弹射光弧轨迹（QuadraticBezier弧线）
      const mid=from.clone().add(to).multiplyScalar(0.5);mid.y+=1.5;
      const trailCurve=new THREE.QuadraticBezierCurve3(from,mid,to);
      const trailMat=new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:0.35,blending:THREE.AdditiveBlending});
      const trail=new THREE.Mesh(new THREE.TubeGeometry(trailCurve,12,0.04,4,false),trailMat);scene.add(trail);
      let flyT=0;
      const flyFn=()=>{flyT+=0.016;const t2=Math.min(1,flyT/flyDur);
        // 沿弧线飞行
        const p=trailCurve.getPoint(t2);
        shieldGroup.position.copy(p);
        // 盾牌旋转
        shieldGroup.rotation.y+=0.3;shieldGroup.rotation.z+=0.15;
        // 发光拖尾粒子
        if(Math.random()<0.4)emitGpuP(shieldGroup.position,0xffdd66,{vy:0.5,vx:(Math.random()-0.5)*2,vz:(Math.random()-0.5)*2,life:0.2,size:1.5,gravity:2,shrink:true});
        if(t2>=1){
          // 命中
          dmgEnemy(target,dmg,{isSkill:true,skillName:'复仇之盾'});
          // 命中金色爆发
          emitGpuBurst(to,0xffdd44,6,2.5,2,0.1,{gravity:5});
          addDynLight(to,0xffaa33,1.5,4,0.3);
          screenShake(.03,.04);
          // 弧线渐隐
          let tT=0;const tFn=()=>{tT+=0.016;trail.material.opacity=Math.max(0,0.35*(1-tT/0.4));
            if(tT>=0.4){scene.remove(trail);return}requestAnimationFrame(tFn)};requestAnimationFrame(tFn);
          bounceIdx++;
          setTimeout(()=>animateBounce(),60);return}
        requestAnimationFrame(flyFn)};
      requestAnimationFrame(flyFn);
    }
    animateBounce();}}

  // ===========================================================================================
  //  30个职业专属技能 — 每个技能拥有独特3D特效
  // ===========================================================================================
  const heroId=PD.selectedHero;

  // ⚔️ 战士 —— 英勇飞跃：跳向密集敌群，落地裂地冲击
  if(hasSkill('heroic_leap')){const k='heroic_leap';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=sk.radius+(l-1)*(sk.radiusPerLv||0.3);
    let bestPos=hp.clone();let bestCnt=0;
    S.enemies.forEach(e=>{if(e.hp>0){let cnt=0;S.enemies.forEach(e2=>{if(e2.hp>0&&e2.mesh.position.distanceTo(e.mesh.position)<r)cnt++});if(cnt>bestCnt){bestCnt=cnt;bestPos=e.mesh.position.clone()}}});
    const impG=new THREE.Group();
    for(let i=0;i<6;i++){const a=i*Math.PI/3;const cr=new THREE.Mesh(new THREE.PlaneGeometry(r*0.8,0.15),new THREE.MeshBasicMaterial({color:0xff6600,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));cr.rotation.x=-Math.PI/2;cr.rotation.z=a;cr.position.y=0.35;impG.add(cr)}
    for(let i=0;i<8;i++){const rk=new THREE.Mesh(new THREE.DodecahedronGeometry(0.2+Math.random()*0.3,0),new THREE.MeshStandardMaterial({color:0x665544,roughness:0.8}));const ag=Math.random()*Math.PI*2;rk.position.set(Math.cos(ag)*Math.random()*r*0.6,0.3+Math.random()*2,Math.sin(ag)*Math.random()*r*0.6);rk.userData={vy:3+Math.random()*4,vx:Math.cos(ag)*(2+Math.random()*3),vz:Math.sin(ag)*(2+Math.random()*3)};impG.add(rk)}
    const dustR=new THREE.Mesh(new THREE.RingGeometry(0.3,r,24),new THREE.MeshBasicMaterial({color:0xaa8844,transparent:true,opacity:0.6,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));dustR.rotation.x=-Math.PI/2;dustR.position.y=0.35;impG.add(dustR);
    impG.position.copy(bestPos);scene.add(impG);
    let t0=0;const la=()=>{t0+=0.016;impG.children.forEach(c=>{if(c.userData&&c.userData.vy!==undefined){c.userData.vy-=15*0.016;c.position.x+=c.userData.vx*0.016;c.position.y+=c.userData.vy*0.016;c.position.z+=c.userData.vz*0.016;if(c.material&&c.material.opacity)c.material.opacity=Math.max(0,1-t0/0.8)}else if(c.material)c.material.opacity=Math.max(0,c.material.opacity-0.016*2)});if(t0>=1){scene.remove(impG);return}requestAnimationFrame(la)};requestAnimationFrame(la);
    emitGpuBurst(bestPos,0xaa6633,15,6,4,0.6,{gravity:8});addDynLight(bestPos,0xff6600,2,r*1.5,0.5);screenShake(0.12,0.2);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(bestPos)<r){dmgEnemy(e,dmg,{isSkill:true,skillName:'英勇飞跃'});e.frozen=(sk.slowDur||2)*0.5}})}}

  // 🪓 战士 —— 斩杀：巨型血色弧形斩击
  if(hasSkill('execute_strike')){const k='execute_strike';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,6);
    if(tg&&tg.hp>0){resetCd(k,sk,l);let dmg=calcSkillDmg(sk,l,effectiveAtk);const isExec=tg.hp/tg.maxHp<(sk.executePct||0.30);if(isExec)dmg*=(sk.bonusDmg||2.5);
    const sG=new THREE.Group();const sc=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-2,2.5,0),new THREE.Vector3(0,3.5,0),new THREE.Vector3(2,0.5,0));
    sG.add(new THREE.Mesh(new THREE.TubeGeometry(sc,16,isExec?0.25:0.15,6,false),new THREE.MeshBasicMaterial({color:isExec?0xff0000:0xcc4400,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false})));
    sG.add(new THREE.Mesh(new THREE.TubeGeometry(sc,16,isExec?0.5:0.3,4,false),new THREE.MeshBasicMaterial({color:isExec?0xff2200:0xff6633,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending,depthWrite:false})));
    sG.position.copy(tg.mesh.position);sG.position.y+=0.5;sG.lookAt(hp);scene.add(sG);
    emitGpuBurst(tg.mesh.position,isExec?0xff0000:0xcc4400,isExec?20:10,5,3,0.4,{gravity:6});
    if(isExec){screenFlash('#ff0000',0.15,100);screenShake(0.1,0.15);addDynLight(tg.mesh.position,0xff0000,3,8,0.4)}
    let st=0;const sf=()=>{st+=0.016;sG.children.forEach(c=>{if(c.material)c.material.opacity*=0.92});sG.scale.x+=0.05;if(st>=0.4){scene.remove(sG);return}requestAnimationFrame(sf)};requestAnimationFrame(sf);
    dmgEnemy(tg,dmg,{isSkill:true,skillName:'斩杀'});if(tg.hp<=0)S.hp=Math.min(S.maxHp,S.hp+S.maxHp*0.05)}}}

  // 🛡️ 战士 —— 盾墙：六面体能量护盾
  if(hasSkill('shield_wall')){const k='shield_wall';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const wDur=(sk.wallDur||3)+(l-1)*(sk.wallDurPerLv||0.3);const dRed=(sk.dmgReduction||0.50)+(l-1)*(sk.dmgRedPerLv||0.05);
    S.passiveStacks.shieldWallActive=wDur;S.passiveStacks.shieldWallReduction=dRed;
    const shG=new THREE.Group();shG.add(new THREE.Mesh(new THREE.IcosahedronGeometry(2,1),new THREE.MeshBasicMaterial({color:0xffaa33,transparent:true,opacity:0.25,wireframe:true,blending:THREE.AdditiveBlending,depthWrite:false})));
    shG.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.8,1),new THREE.MeshBasicMaterial({color:0xffdd66,transparent:true,opacity:0.08,depthWrite:false})));
    shG.position.copy(hp);shG.position.y=1;scene.add(shG);addDynLight(hp,0xffaa33,2,6,wDur);
    let sw0=0;const sa=()=>{sw0+=0.016;if(heroMesh)shG.position.copy(heroMesh.position).add({x:0,y:1,z:0});shG.rotation.y+=0.02;
    const f=sw0>wDur-0.5?Math.max(0,1-(sw0-(wDur-0.5))/0.5):1;shG.children.forEach(c=>{c.material.opacity=c.material.opacity>0.1?0.25*f:0.08*f});
    if(sw0>=wDur){scene.remove(shG);return}requestAnimationFrame(sa)};requestAnimationFrame(sa)}}

  // ☄️ 法师 —— 炎爆术：巨型蓄力火球（使用统一投射物系统，修复命中bug）
  if(hasSkill('pyroblast')){const k='pyroblast';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,15);
    if(tg&&tg.hp>0){resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);const expR=sk.explosionR||2;
    fireProjectile(hp,tg.mesh.position,0xff4400,dmg,0.6,sk.projSpeed||16,{
      trail:'fire',trailColor:0xff6600,isFireDmg:true,isSkill:true,skillName:'炎爆术',
      onHit:'explode',explodeR:expR,explodeDmgPct:1.0
    })}}}

  // 🔮 法师 —— 奥术冲击：叠层紫色弹+递增伤害（使用统一投射物系统，修复命中bug）
  if(hasSkill('arcane_blast')){const k='arcane_blast';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    if(!S.passiveStacks.arcaneStacks)S.passiveStacks.arcaneStacks=0;
    S.passiveStacks.arcaneStacks=Math.min(sk.maxStacks||4,S.passiveStacks.arcaneStacks+1);
    const stk=S.passiveStacks.arcaneStacks;let dmg=calcSkillDmg(sk,l,effectiveAtk);dmg*=(1+stk*(sk.stackMult||0.20));
    S.passiveTimers._arcaneDecay=5.0;
    const tg=nearest(hp,12);if(tg&&tg.hp>0){
    fireProjectile(hp,tg.mesh.position,0x8844ff,dmg,0.3+stk*0.1,20,{
      trail:'holy',trailColor:0xaa66ff,isSkill:true,skillName:'奥术冲击',
      onHit:'explode',explodeR:2,explodeDmgPct:0
    })}}}
  if(hasSkill('arcane_blast')&&S.passiveTimers._arcaneDecay!==undefined){S.passiveTimers._arcaneDecay-=dt;if(S.passiveTimers._arcaneDecay<=0){S.passiveStacks.arcaneStacks=Math.max(0,(S.passiveStacks.arcaneStacks||0)-1);S.passiveTimers._arcaneDecay=2}}

  // 🧊 法师 —— 寒冰屏障：冰晶护盾
  if(hasSkill('ice_barrier')){const k='ice_barrier';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const shAmt=S.maxHp*(sk.shieldPct+(l-1)*(sk.shieldPctPerLv||0.03));
    S.passiveStacks.iceBarrier=(S.passiveStacks.iceBarrier||0)+shAmt;S.passiveStacks.iceBarrierCdBonus=sk.cdBonus||0.20;
    const iG=new THREE.Group();
    for(let i=0;i<8;i++){const a=i*Math.PI/4;const sh=new THREE.Mesh(new THREE.ConeGeometry(0.2,0.8,4),new THREE.MeshBasicMaterial({color:0x66ccff,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));sh.position.set(Math.cos(a)*1.5,1+Math.sin(i*0.5)*0.3,Math.sin(a)*1.5);sh.rotation.z=a;iG.add(sh)}
    iG.position.copy(hp);scene.add(iG);emitGpuBurst(hp,0x66ccff,15,3,2,0.3,{gravity:1});addDynLight(hp,0x66ccff,1.5,5,0.5);
    let ib=0;const ia=()=>{ib+=0.016;if(heroMesh)iG.position.copy(heroMesh.position);iG.rotation.y+=0.03;
    iG.children.forEach((c,i)=>{c.position.y=1+Math.sin(ib*2+i*0.5)*0.2;c.material.opacity=Math.max(0,0.5*(1-ib/3))});
    if(ib>=3||!S.passiveStacks.iceBarrier||S.passiveStacks.iceBarrier<=0){scene.remove(iG);return}requestAnimationFrame(ia)};requestAnimationFrame(ia)}}

  // 💣 猎人 —— 爆炸陷阱：地面放置
  if(hasSkill('explosive_trap')){const k='explosive_trap';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const dmg=calcSkillDmg(sk,l,effectiveAtk);const r=sk.trapRadius+(l-1)*(sk.trapRadPerLv||0.3);
    if(!S.passiveStacks.traps)S.passiveStacks.traps=[];
    S.passiveStacks.traps=S.passiveStacks.traps.filter(t=>t.life>0);
    if(S.passiveStacks.traps.length<(sk.trapMax||3)){
    const tp=hp.clone();tp.y=0.1;const tG=new THREE.Group();
    tG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.5,0.15,8),new THREE.MeshStandardMaterial({color:0x666666,metalness:0.8,roughness:0.3})));
    const dr=new THREE.Mesh(new THREE.RingGeometry(0.3,0.45,16),new THREE.MeshBasicMaterial({color:0xff2200,transparent:true,opacity:0.5,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));dr.rotation.x=-Math.PI/2;dr.position.y=0.3;tG.add(dr);
    const det=new THREE.Mesh(new THREE.RingGeometry(r-0.1,r,32),new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:0.15,side:THREE.DoubleSide,depthWrite:false}));det.rotation.x=-Math.PI/2;det.position.y=0.3;tG.add(det);
    tG.position.copy(tp);scene.add(tG);S.passiveStacks.traps.push({mesh:tG,pos:tp,life:sk.trapDur||15,r,dmg,triggered:false})}}}
  if(S.passiveStacks.traps&&S.passiveStacks.traps.length>0){
    S.passiveStacks.traps.forEach(trap=>{if(trap.triggered)return;trap.life-=dt;if(trap.mesh&&trap.mesh.children[1])trap.mesh.children[1].material.opacity=0.3+Math.sin(gameTime*4)*0.2;
    if(trap.life<=0){scene.remove(trap.mesh);return}
    S.enemies.forEach(e=>{if(e.hp>0&&!trap.triggered&&e.mesh.position.distanceTo(trap.pos)<trap.r*0.5){trap.triggered=true;
    explosion(trap.pos,0xff4400,20);emitGpuBurst(trap.pos,0xff6600,25,7,4,0.5,{gravity:8});addDynLight(trap.pos,0xff4400,3,trap.r*2,0.5);screenShake(0.1,0.15);
    S.enemies.forEach(e2=>{if(e2.hp>0&&e2.mesh.position.distanceTo(trap.pos)<trap.r)dmgEnemy(e2,trap.dmg,{isSkill:true,isFireDmg:true,skillName:'爆炸陷阱'})});scene.remove(trap.mesh)}})});
    S.passiveStacks.traps=S.passiveStacks.traps.filter(t=>t.life>0&&!t.triggered)}

  // 🎯 猎人 —— 瞄准射击：激光瞄准线+精准弹
  if(hasSkill('aimed_shot')){const k='aimed_shot';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,18);
    if(tg&&tg.hp>0){resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const aG=new THREE.Group();
    const lp=[new THREE.Vector3(hp.x,1.2,hp.z),new THREE.Vector3(tg.mesh.position.x,1.2,tg.mesh.position.z)];
    aG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lp),8,0.03,4,false),new THREE.MeshBasicMaterial({color:0xff0000,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false})));
    const ch=new THREE.Mesh(new THREE.PlaneGeometry(1.2,0.06),new THREE.MeshBasicMaterial({color:0xff2200,transparent:true,opacity:0.8,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));ch.position.copy(tg.mesh.position);ch.position.y=2.5;ch.rotation.x=-Math.PI/2;aG.add(ch);
    const cv=ch.clone();cv.rotation.z=Math.PI/2;aG.add(cv);
    const hc=new THREE.Mesh(new THREE.RingGeometry(0.4,0.6,16),new THREE.MeshBasicMaterial({color:0xff0000,transparent:true,opacity:0.6,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));hc.position.copy(tg.mesh.position);hc.position.y=2.5;hc.rotation.x=-Math.PI/2;aG.add(hc);
    scene.add(aG);
    setTimeout(()=>{fireProjectile(hp,tg.mesh.position,0x44ff44,dmg,0.2,30,{trail:'sharp',trailColor:0x88ff88,bonusCrit:1.0,isSkill:true,skillName:'瞄准射击'});emitGpuBurst(tg.mesh.position,0xff4400,12,4,3,0.3,{gravity:5})},150);
    let a0=0;const af2=()=>{a0+=0.016;aG.children.forEach(c=>{if(c.material)c.material.opacity*=0.93});if(a0>=0.5){scene.remove(aG);return}requestAnimationFrame(af2)};requestAnimationFrame(af2)}}}

  // 🦁 猎人 —— 狂野怒火：宠物狂暴+爪击
  if(hasSkill('bestial_wrath')){const k='bestial_wrath';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const rd=sk.rageDur||8;const rm=1+(sk.petRageMult||1)+(l-1)*(sk.petRagePerLv||0.2);const bd=effectiveAtk*0.8*rm;
    const rG=new THREE.Group();const ra=new THREE.Mesh(new THREE.RingGeometry(1.5,2,24),new THREE.MeshBasicMaterial({color:0xff6600,transparent:true,opacity:0.4,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));ra.rotation.x=-Math.PI/2;rG.add(ra);
    rG.position.copy(hp);scene.add(rG);emitGpuBurst(hp,0xff4400,15,5,3,0.3,{gravity:3});
    for(let tk=0;tk<Math.floor(rd/1.5);tk++){setTimeout(()=>{if(!gameActive||!heroMesh)return;const t=nearest(heroMesh.position,12);
    if(t&&t.hp>0){dmgEnemy(t,bd,{noCrit:false,isSkill:true,skillName:'狂野怒火'});
    const cG=new THREE.Group();for(let c=0;c<3;c++){const cl=new THREE.Mesh(new THREE.PlaneGeometry(0.1,1.2),new THREE.MeshBasicMaterial({color:0xff6600,transparent:true,opacity:0.8,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));cl.position.set((c-1)*0.3,1,0);cG.add(cl)}
    cG.position.copy(t.mesh.position);scene.add(cG);S.particles.push({mesh:cG,life:0.3,maxLife:0.3,type:'aoe'});
    emitGpuBurst(t.mesh.position,0xff4400,6,3,2,0.2,{gravity:4});S.hp=Math.min(S.maxHp,S.hp+S.maxHp*(sk.healPctOnPetHit||0.01))}},tk*1500)}
    let rg=0;const rf=()=>{rg+=0.016;if(heroMesh)rG.position.copy(heroMesh.position);rG.rotation.y+=0.05;ra.material.opacity=0.4*(1-rg/rd);if(rg>=rd){scene.remove(rG);return}requestAnimationFrame(rf)};requestAnimationFrame(rf)}}

  // 🧠 牧师 —— 心灵震爆：暗影脑波锥+恐惧
  if(hasSkill('mind_blast')){const k='mind_blast';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,10);
    if(tg&&tg.hp>0){resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const fR=sk.fearRadius||4;const fD=(sk.fearDur||1.5)+(l-1)*(sk.fearDurPerLv||0.2);
    const bG=new THREE.Group();const cn=new THREE.Mesh(new THREE.ConeGeometry(2,5,8,1,true),new THREE.MeshBasicMaterial({color:0x9944ff,transparent:true,opacity:0.5,wireframe:true,blending:THREE.AdditiveBlending,depthWrite:false}));cn.rotation.x=Math.PI/2;bG.add(cn);
    for(let i=0;i<3;i++){const w=new THREE.Mesh(new THREE.RingGeometry(0.5+i*0.8,0.8+i*0.8,16),new THREE.MeshBasicMaterial({color:0x7722cc,transparent:true,opacity:0.4-i*0.1,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));w.rotation.x=Math.PI/2;w.position.z=-(1+i*1.5);bG.add(w)}
    bG.position.copy(hp);bG.position.y=1.5;bG.lookAt(tg.mesh.position);scene.add(bG);
    emitGpuBurst(tg.mesh.position,0x9944ff,15,5,3,0.4,{gravity:3});addDynLight(tg.mesh.position,0x9944ff,2,8,0.4);
    let mb=0;const mf=()=>{mb+=0.016;bG.children.forEach(c=>{c.material.opacity*=0.94;if(c.geometry&&c.geometry.type==='RingGeometry')c.scale.setScalar(1+mb*2)});cn.scale.z=1+mb*3;if(mb>=0.5){scene.remove(bG);return}requestAnimationFrame(mf)};requestAnimationFrame(mf);
    dmgEnemy(tg,dmg,{isSkill:true,skillName:'心灵震爆'});
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(tg.mesh.position)<fR){e.frozen=fD;emitGpuP(e.mesh.position,0x9944ff,{vx:0,vy:2,vz:0},3,0.4,{gravity:1,shrink:true})}})}}}

  // 👤 牧师 —— 暗影形态（被动BUFF标记）
  if(hasSkill('shadow_form')){const sfL=sklLv('shadow_form');const sfS=skData('shadow_form');S.passiveStacks.shadowFormActive=true;S.passiveStacks.shadowFormDotBonus=(sfS.dotDmgBonus||0.35)+(sfL-1)*(sfS.dotDmgPerLv||0.08);S.passiveStacks.shadowFormDmgRed=(sfS.dmgReduction||0.15)+(sfL-1)*(sfS.dmgRedPerLv||0.03)}

  // 🙏 牧师 —— 愈合祷言：金色祈祷光柱
  if(hasSkill('prayer_of_mending')){const k='prayer_of_mending';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const hAmt=S.maxHp*((sk.healPct||0.10)+(l-1)*(sk.healPctPerLv||0.02));const isLow=S.hp/S.maxHp<(sk.lowHpThreshold||0.30);
    S.hp=Math.min(S.maxHp,S.hp+(isLow?hAmt*2:hAmt));
    const hG=new THREE.Group();
    hG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.8,4,8,1,true),new THREE.MeshBasicMaterial({color:isLow?0xffff00:0xffdd88,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false})));
    const c1=new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.15),new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:0.7,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));c1.rotation.x=-Math.PI/2;c1.position.y=0.35;hG.add(c1);
    const c2=c1.clone();c2.rotation.z=Math.PI/2;hG.add(c2);
    hG.position.copy(hp);hG.children[0].position.y=2;scene.add(hG);
    emitGpuBurst(hp,isLow?0xffff00:0xffdd88,12,3,2,0.5,{gravity:-1});addDynLight(hp,0xffdd44,1.5,5,0.5);
    let ph=0;const pf2=()=>{ph+=0.016;hG.children[0].position.y=2+ph*2;hG.children.forEach(c=>{if(c.material)c.material.opacity=Math.max(0,c.material.opacity-0.025)});if(ph>=0.6){scene.remove(hG);return}requestAnimationFrame(pf2)};requestAnimationFrame(pf2)}}

  // 💀 盗贼 —— 剔骨：连击点终结技
  if(hasSkill('eviscerate')){const k='eviscerate';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);if(!S.passiveStacks.comboPoints)S.passiveStacks.comboPoints=0;
    const cp=S.passiveStacks.comboPoints;if(cp>=1){resetCd(k,sk,l);let dmg=calcSkillDmg(sk,l,effectiveAtk);dmg*=(1+cp*(sk.comboPointMult||0.6));S.passiveStacks.comboPoints=0;
    const tg=nearest(hp,5);if(tg&&tg.hp>0){
    const eG=new THREE.Group();const s1=new THREE.Mesh(new THREE.PlaneGeometry(2,0.12),new THREE.MeshBasicMaterial({color:0x44ff44,transparent:true,opacity:0.9,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));s1.position.y=1;s1.rotation.z=Math.PI/4;eG.add(s1);const s2=s1.clone();s2.rotation.z=-Math.PI/4;eG.add(s2);
    for(let i=0;i<cp;i++){const co=new THREE.Mesh(new THREE.OctahedronGeometry(0.15),new THREE.MeshBasicMaterial({color:0xff4444,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}));co.position.set((Math.random()-0.5)*0.8,1+i*0.3,(Math.random()-0.5)*0.8);eG.add(co)}
    eG.position.copy(tg.mesh.position);scene.add(eG);emitGpuBurst(tg.mesh.position,0x44ff44,8+cp*3,5,3,0.4,{gravity:5});addDynLight(tg.mesh.position,0x44ff44,1.5+cp*0.3,6,0.3);if(cp>=4)screenShake(0.08,0.12);
    let ev=0;const ef=()=>{ev+=0.016;eG.children.forEach(c=>{if(c.material)c.material.opacity*=0.92;c.scale.setScalar(1+ev*2)});if(ev>=0.4){scene.remove(eG);return}requestAnimationFrame(ef)};requestAnimationFrame(ef);
    dmgEnemy(tg,dmg,{isSkill:true,skillName:'剔骨'})}}}}

  // 🧥 盗贼 —— 暗影斗篷：免疫+加速
  if(hasSkill('cloak_of_shadows')){const k='cloak_of_shadows';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const dur=(sk.immuneDur||2)+(l-1)*(sk.immuneDurPerLv||0.3);S.passiveStacks.invincible=dur;S.speed*=(1+(sk.spdBoost||0.50));
    const ckG=new THREE.Group();for(let i=0;i<12;i++){const sm=new THREE.Mesh(new THREE.SphereGeometry(0.3+Math.random()*0.2,6,6),new THREE.MeshBasicMaterial({color:0x220044,transparent:true,opacity:0.4,depthWrite:false}));sm.position.set(Math.cos(i*Math.PI/6)*1.2,0.5+Math.random()*1.5,Math.sin(i*Math.PI/6)*1.2);ckG.add(sm)}
    ckG.position.copy(hp);scene.add(ckG);addDynLight(hp,0x440088,1,5,dur);emitGpuBurst(hp,0x440088,20,3,2,0.3,{gravity:0.5});
    let ck=0;const ca=()=>{ck+=0.016;if(heroMesh)ckG.position.copy(heroMesh.position);ckG.rotation.y+=0.04;ckG.children.forEach(c=>{c.material.opacity=0.4*(1-ck/dur)});if(ck>=dur){scene.remove(ckG);return}requestAnimationFrame(ca)};requestAnimationFrame(ca)}}

  // 🌀 盗贼 —— 刃舞：旋转飞刃环
  if(hasSkill('blade_dance')){const k='blade_dance';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);const r=(sk.spinRadius||3.5)+(l-1)*(sk.spinRadPerLv||0.3);
    const bdG=new THREE.Group();for(let i=0;i<4;i++){const a=i*Math.PI/2;const bl=new THREE.Mesh(new THREE.ConeGeometry(0.1,1.2,3),new THREE.MeshBasicMaterial({color:0xccddff,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}));bl.position.set(Math.cos(a)*r*0.6,1,Math.sin(a)*r*0.6);bl.rotation.z=Math.PI/2;bdG.add(bl)}
    const tr=new THREE.Mesh(new THREE.TorusGeometry(r*0.6,0.08,6,24),new THREE.MeshBasicMaterial({color:0xaaccff,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));tr.rotation.x=Math.PI/2;tr.position.y=1;bdG.add(tr);
    bdG.position.copy(hp);scene.add(bdG);
    let bd=0;const bs=()=>{bd+=0.016;if(heroMesh)bdG.position.copy(heroMesh.position);bdG.rotation.y+=0.3;bdG.children.forEach(c=>{if(c.material)c.material.opacity=Math.max(0,c.material.opacity-0.03)});if(bd>=0.5){scene.remove(bdG);return}requestAnimationFrame(bs)};requestAnimationFrame(bs);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r){dmgEnemy(e,dmg,{isSkill:true,skillName:'刃舞'});if(Math.random()<(sk.comboBuildChance||0.5))S.passiveStacks.comboPoints=Math.min(5,(S.passiveStacks.comboPoints||0)+1)}})}}

  // 🌋 萨满 —— 熔岩爆裂：炽热熔岩弹（使用统一投射物系统，修复无法命中bug）
  if(hasSkill('lava_burst')){const k='lava_burst';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,14);
    if(tg&&tg.hp>0){resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);
    // 使用统一投射物系统（2D碰撞检测+正确dt+爆炸AOE）
    fireProjectile(hp,tg.mesh.position,0xff4400,dmg,0.35,sk.projSpeed||20,{
      trail:'fire',trailColor:0xff2200,isFireDmg:true,isSkill:true,skillName:'熔岩爆裂',
      bonusCrit:0.5,onHit:'explode',explodeR:2.5,explodeDmgPct:1.0
    })}}}

  // 🌧️ 萨满 —— 治疗之雨：持续雨滴区域
  if(hasSkill('healing_rain')){const k='healing_rain';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);const dur=sk.duration||5;const hPct=(sk.healPct||0.03)+(l-1)*(sk.healPctPerLv||0.01);const aB=(sk.armorBonus||3)+(l-1)*(sk.armorPerLv||1);
    const rP=hp.clone();S.armor+=aB;const rainR=3.5;
    const rnG=new THREE.Group();
    // 地面水圈 —— 半透明蓝色区域
    const pl=new THREE.Mesh(new THREE.CircleGeometry(rainR,32),new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:0.15,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));pl.rotation.x=-Math.PI/2;pl.position.y=0.35;rnG.add(pl);
    // 外圈发光环
    const outerRing=new THREE.Mesh(new THREE.RingGeometry(rainR-0.1,rainR+0.05,48),new THREE.MeshBasicMaterial({color:0x66aaff,transparent:true,opacity:0.35,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));outerRing.rotation.x=-Math.PI/2;outerRing.position.y=0.36;rnG.add(outerRing);
    // 顶部云雾层 —— 多个半透明sprite组成雨云
    const cloudSprites=[];for(let ci=0;ci<5;ci++){
      const cMat=new THREE.SpriteMaterial({map:glowTex,color:0x6699cc,transparent:true,opacity:0.2+Math.random()*0.1,blending:THREE.AdditiveBlending,depthWrite:false});
      const cSpr=new THREE.Sprite(cMat);cSpr.scale.set(2+Math.random()*2,1+Math.random()*0.5,1);
      cSpr.position.set((Math.random()-0.5)*rainR*1.2,6+Math.random()*0.8,(Math.random()-0.5)*rainR*1.2);
      rnG.add(cSpr);cloudSprites.push(cSpr)}
    // 预创建一批3D雨滴条（CylinderGeometry细长条）
    const rainDrops=[];const rainMat=new THREE.MeshBasicMaterial({color:0x88bbff,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false});
    for(let ri=0;ri<30;ri++){
      const drop=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.5+Math.random()*0.5,3),rainMat.clone());
      drop.position.set((Math.random()-0.5)*rainR*2,Math.random()*6,(Math.random()-0.5)*rainR*2);
      drop.userData.speed=10+Math.random()*6;drop.userData.baseX=(Math.random()-0.5)*rainR*2;drop.userData.baseZ=(Math.random()-0.5)*rainR*2;
      rnG.add(drop);rainDrops.push(drop)}
    // 涟漪环数组（地面水花涟漪）
    const ripples=[];
    rnG.position.copy(rP);scene.add(rnG);addDynLight(rP,0x4488ff,1.5,rainR+2,dur);
    let rn=0;const rl=()=>{rn+=0.016;const fade=rn<0.5?rn/0.5:(rn>dur-0.5?Math.max(0,(dur-rn)/0.5):1);
    // 更新3D雨滴下落
    rainDrops.forEach(drop=>{drop.position.y-=drop.userData.speed*0.016;
      if(drop.position.y<0.1){
        // 雨滴触底 —— 溅射粒子
        const sx=rP.x+drop.userData.baseX,sz=rP.z+drop.userData.baseZ;
        if(Math.random()<0.4)emitGpuP({x:sx,y:0.2,z:sz},0x88ccff,{vx:(Math.random()-0.5)*1,vy:1+Math.random()*1.5,vz:(Math.random()-0.5)*1},1.5,0.15,{gravity:5,shrink:true});
        // 创建涟漪
        if(Math.random()<0.3){const rip=new THREE.Mesh(new THREE.RingGeometry(0.05,0.1,16),new THREE.MeshBasicMaterial({color:0x88ccff,transparent:true,opacity:0.5*fade,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
          rip.rotation.x=-Math.PI/2;rip.position.set(drop.userData.baseX,0.13,drop.userData.baseZ);rnG.add(rip);ripples.push({mesh:rip,age:0,maxAge:0.6})}
        // 重置雨滴到顶部
        drop.position.y=5.5+Math.random()*1.5;drop.userData.baseX=(Math.random()-0.5)*rainR*2;drop.userData.baseZ=(Math.random()-0.5)*rainR*2;
        drop.position.x=drop.userData.baseX;drop.position.z=drop.userData.baseZ}
      drop.material.opacity=0.5*fade});
    // 更新涟漪（扩散+消失）
    for(let ri2=ripples.length-1;ri2>=0;ri2--){const rip=ripples[ri2];rip.age+=0.016;const t=rip.age/rip.maxAge;
      rip.mesh.scale.setScalar(1+t*3);rip.mesh.material.opacity=0.5*fade*(1-t);
      if(rip.age>=rip.maxAge){rnG.remove(rip.mesh);rip.mesh.material.dispose();rip.mesh.geometry.dispose();ripples.splice(ri2,1)}}
    // 云雾缓慢飘动
    cloudSprites.forEach((cs,ci)=>{cs.position.x+=Math.sin(rn*0.5+ci)*0.005;cs.material.opacity=(0.2+Math.sin(rn*2+ci)*0.05)*fade});
    // 额外GPU粒子——雨雾弥漫效果
    if(Math.random()<0.5)emitGpuP({x:rP.x+(Math.random()-0.5)*rainR*2,y:0.3+Math.random()*0.5,z:rP.z+(Math.random()-0.5)*rainR*2},0x88bbff,{vx:(Math.random()-0.5)*0.5,vy:0.3+Math.random()*0.3,vz:(Math.random()-0.5)*0.5},1.5,0.2,{gravity:-0.3,shrink:true});
    // 地面水圈脉动
    pl.material.opacity=(0.15+Math.sin(rn*4)*0.05)*fade;outerRing.material.opacity=(0.35+Math.sin(rn*3)*0.1)*fade;
    // 治疗tick
    if(Math.floor(rn*2)>Math.floor((rn-0.016)*2)&&heroMesh&&heroMesh.position.distanceTo(rP)<rainR){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*hPct);
      // 治疗反馈——绿色上升粒子
      for(let hi=0;hi<3;hi++)emitGpuP({x:heroMesh.position.x+(Math.random()-0.5)*0.5,y:heroMesh.position.y+Math.random(),z:heroMesh.position.z+(Math.random()-0.5)*0.5},0x44ff88,{vx:(Math.random()-0.5)*0.3,vy:1.5+Math.random(),vz:(Math.random()-0.5)*0.3},2,0.25,{gravity:-0.5,shrink:true})}
    if(rn>=dur){
      // 清理雨滴材质
      rainDrops.forEach(d=>{d.material.dispose();d.geometry.dispose()});
      ripples.forEach(rip=>{rnG.remove(rip.mesh);rip.mesh.material.dispose();rip.mesh.geometry.dispose()});
      scene.remove(rnG);S.armor=Math.max(0,S.armor-aB);return}requestAnimationFrame(rl)};requestAnimationFrame(rl)}}

  // 🌍 萨满 —— 地震术：持续地面裂缝+震动+眩晕
  if(hasSkill('earthquake')){const k='earthquake';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=(sk.radius||5)+(l-1)*(sk.radiusPerLv||0.4);const dur=sk.duration||3;const tR=sk.tickRate||0.5;const qP=hp.clone();
    const qG=new THREE.Group();
    for(let i=0;i<8;i++){const a=Math.random()*Math.PI*2;const len=1+Math.random()*r*0.7;
    const pts=[new THREE.Vector3(0,0.12,0)];for(let j=1;j<=4;j++){const t=j/4;pts.push(new THREE.Vector3(Math.cos(a)*len*t+(Math.random()-0.5)*0.5,0.12,Math.sin(a)*len*t+(Math.random()-0.5)*0.5))}
    qG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),8,0.06,3,false),new THREE.MeshBasicMaterial({color:0xff6600,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending,depthWrite:false})))}
    const qR=new THREE.Mesh(new THREE.RingGeometry(r-0.2,r,32),new THREE.MeshBasicMaterial({color:0xaa6633,transparent:true,opacity:0.3,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));qR.rotation.x=-Math.PI/2;qR.position.y=0.35;qG.add(qR);
    qG.position.copy(qP);scene.add(qG);addDynLight(qP,0xff6600,2,r,dur);
    let eq=0,lTk=0;const ql=()=>{eq+=0.016;if(eq<dur)screenShake(0.02,0.04);
    qG.children.forEach(c=>{if(c.material)c.material.opacity=0.7*Math.max(0,1-eq/dur)*(0.7+Math.sin(eq*8)*0.3)});
    if(Math.random()<0.15&&eq<dur)emitGpuP({x:qP.x+(Math.random()-0.5)*r,y:0.2,z:qP.z+(Math.random()-0.5)*r},0x886644,{vx:(Math.random()-0.5)*2,vy:2+Math.random()*3,vz:(Math.random()-0.5)*2},2+Math.random()*2,0.4,{gravity:8,shrink:true});
    if(eq<dur&&eq-lTk>=tR){lTk=eq;S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(qP)<r){dmgEnemy(e,dmg,{isSkill:true,skillName:'地震术'});if(Math.random()<(sk.stunChance||0.15)){e.frozen=(e.frozen||0)+0.8;emitGpuP(e.mesh.position,0xffaa00,{vx:0,vy:1.5,vz:0},2,0.3,{gravity:1})}}})}
    if(eq>=dur+0.5){scene.remove(qG);return}requestAnimationFrame(ql)};requestAnimationFrame(ql)}}

  // 💀 死骑 —— 灭杀打击：暗红重击+吸血
  if(hasSkill('death_strike')){const k='death_strike';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,5);
    if(tg&&tg.hp>0){resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);const lch=(sk.leechPct||0.25)+(l-1)*(sk.leechPctPerLv||0.05);
    const dG=new THREE.Group();const sl1=new THREE.Mesh(new THREE.PlaneGeometry(2.5,0.15),new THREE.MeshBasicMaterial({color:0xcc0000,transparent:true,opacity:0.9,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));sl1.position.y=1;sl1.rotation.z=Math.PI/4;dG.add(sl1);
    const sl2=sl1.clone();sl2.rotation.z=-Math.PI/4;dG.add(sl2);
    const br=new THREE.Mesh(new THREE.RingGeometry(0.5,1.2,16),new THREE.MeshBasicMaterial({color:0x880000,transparent:true,opacity:0.5,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));br.rotation.x=-Math.PI/2;br.position.y=0.35;dG.add(br);
    dG.position.copy(tg.mesh.position);scene.add(dG);emitGpuBurst(tg.mesh.position,0xcc0000,12,4,3,0.4,{gravity:5});addDynLight(tg.mesh.position,0xcc0000,2,6,0.3);
    let ds=0;const df=()=>{ds+=0.016;dG.children.forEach(c=>{if(c.material)c.material.opacity*=0.92;c.scale.setScalar(1+ds*2)});if(ds>=0.4){scene.remove(dG);return}requestAnimationFrame(df)};requestAnimationFrame(df);
    dmgEnemy(tg,dmg,{isSkill:true,skillName:'灭杀打击'});S.hp=Math.min(S.maxHp,S.hp+dmg*lch);
    for(let i=0;i<5;i++)setTimeout(()=>{if(heroMesh)emitGpuP(tg.mesh.position,0xff0000,{vx:(hp.x-tg.mesh.position.x)*2,vy:1,vz:(hp.z-tg.mesh.position.z)*2},2,0.3,{gravity:-1,shrink:true})},i*60)}}}

  // ☠️ 死骑 —— 亡者大军：食尸鬼群
  if(hasSkill('army_of_dead')){const k='army_of_dead';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const cnt=(sk.ghoulCount||4)+Math.floor((l-1)*(sk.ghoulCountPerLv||1));const gDur=sk.ghoulDur||10;const gDmg=calcSkillDmg(sk,l,effectiveAtk);
    const ghouls=[];for(let i=0;i<cnt;i++){
    const gG=new THREE.Group();gG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.6,6),new THREE.MeshStandardMaterial({color:0x445544,roughness:0.8})));gG.children[0].position.y=0.5;
    gG.add(new THREE.Mesh(new THREE.SphereGeometry(0.12,6,6),new THREE.MeshStandardMaterial({color:0x556655})));gG.children[1].position.y=0.9;
    gG.add(new THREE.Mesh(new THREE.SphereGeometry(0.04,4,4),new THREE.MeshBasicMaterial({color:0x44ff44})));gG.children[2].position.set(0.05,0.92,0.1);
    const ag=i*Math.PI*2/cnt;gG.position.set(hp.x+Math.cos(ag)*2,0,hp.z+Math.sin(ag)*2);scene.add(gG);ghouls.push({mesh:gG,life:gDur,at:1})}
    emitGpuBurst(hp,0x44ff44,20,4,3,0.5,{gravity:3});addDynLight(hp,0x44ff44,2,8,0.5);
    const gl=()=>{let all=true;ghouls.forEach(g=>{if(g.life<=0)return;all=false;g.life-=0.016;g.at-=0.016;
    const t=nearest(g.mesh.position,8);if(t&&t.hp>0){const d=new THREE.Vector3().subVectors(t.mesh.position,g.mesh.position).normalize();g.mesh.position.x+=d.x*3*0.016;g.mesh.position.z+=d.z*3*0.016;
    const _dx=g.mesh.position.x-t.mesh.position.x,_dz=g.mesh.position.z-t.mesh.position.z;if(g.at<=0&&Math.sqrt(_dx*_dx+_dz*_dz)<1.8){g.at=1;dmgEnemy(t,gDmg,{noCrit:false,isSkill:true,skillName:'亡者大军'});emitGpuBurst(t.mesh.position,0x44ff44,4,3,2,0.2,{gravity:4})}}
    if(g.life<1)g.mesh.children.forEach(c=>{if(c.material){c.material.transparent=true;c.material.opacity=g.life}});if(g.life<=0)scene.remove(g.mesh)});if(all)return;requestAnimationFrame(gl)};requestAnimationFrame(gl)}}

  // 🔵 死骑 —— 反魔法护罩：蓝色符文球
  if(hasSkill('anti_magic_shell')){const k='anti_magic_shell';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const aAmt=S.maxHp*((sk.absorbPct||0.25)+(l-1)*(sk.absorbPerLv||0.05));const sDur=sk.shellDur||4;
    S.passiveStacks.amsAbsorb=aAmt;S.passiveStacks.amsDur=sDur;S.passiveStacks.amsToAtk=sk.absorbToAtk||0.5;S.passiveStacks.amsTotalAbsorbed=0;
    const amG=new THREE.Group();amG.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.8,1),new THREE.MeshBasicMaterial({color:0x2266ff,transparent:true,opacity:0.2,wireframe:true,blending:THREE.AdditiveBlending,depthWrite:false})));
    const rr=new THREE.Mesh(new THREE.TorusGeometry(1.2,0.06,6,24),new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));rr.rotation.x=Math.PI/2;amG.add(rr);
    amG.position.copy(hp);amG.position.y=1;scene.add(amG);emitGpuBurst(hp,0x4488ff,12,3,2,0.3,{gravity:1});addDynLight(hp,0x2266ff,2,6,sDur);
    let am=0;const aa=()=>{am+=0.016;if(heroMesh)amG.position.copy(heroMesh.position).add({x:0,y:1,z:0});amG.rotation.y+=0.03;rr.rotation.z+=0.05;
    const f=am>sDur-0.5?Math.max(0,1-(am-(sDur-0.5))/0.5):1;amG.children.forEach(c=>{c.material.opacity=c.material.opacity>0.3?0.5*f:0.2*f});
    if(am>=sDur){scene.remove(amG);const aG2=(S.passiveStacks.amsTotalAbsorbed||0)*(S.passiveStacks.amsToAtk||0.5);if(aG2>0){S.attack+=aG2}S.passiveStacks.amsAbsorb=0;return}requestAnimationFrame(aa)};requestAnimationFrame(aa)}}

  // 🌙 德鲁伊 —— 月火术：月光柱+DOT
  if(hasSkill('moonfire')){const k='moonfire';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,12);
    if(tg&&tg.hp>0){resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);const dDmg=dmg*(sk.dotDmgPct||0.30);const dDur=sk.dotDur||4;
    const mG=new THREE.Group();mG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6,1.2,8,8,1,true),new THREE.MeshBasicMaterial({color:0xccccff,transparent:true,opacity:0.4,blending:THREE.AdditiveBlending,depthWrite:false})));mG.children[0].position.y=4;
    const mp=new THREE.Mesh(new THREE.CircleGeometry(1.5,16),new THREE.MeshBasicMaterial({color:0xaaaaff,transparent:true,opacity:0.3,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));mp.rotation.x=-Math.PI/2;mp.position.y=0.35;mG.add(mp);
    mG.position.copy(tg.mesh.position);scene.add(mG);emitGpuBurst(tg.mesh.position,0xccccff,12,3,2,0.4,{gravity:-0.5});addDynLight(tg.mesh.position,0xccccff,2,6,0.5);
    let mf2=0;const mfa=()=>{mf2+=0.016;mG.children.forEach(c=>{if(c.material)c.material.opacity=Math.max(0,c.material.opacity-0.012)});mG.children[0].position.y=4-mf2*3;if(mf2>=0.6){scene.remove(mG);return}requestAnimationFrame(mfa)};requestAnimationFrame(mfa);
    dmgEnemy(tg,dmg,{isSkill:true,skillName:'月火术'});
    const tks=Math.floor(dDur/(sk.dotTickRate||0.5));for(let i=0;i<tks;i++)setTimeout(()=>{if(tg.hp>0){dmgEnemy(tg,dDmg,{noCrit:true,isDot:true,isSkill:true,skillName:'月火术(灼烧)'});emitGpuP(tg.mesh.position,0xaaaaff,{vx:0,vy:1,vz:0},2,0.2,{gravity:0})}},i*(sk.dotTickRate||0.5)*1000)}}}

  // 🌱 德鲁伊 —— 野性成长：绿色藤蔓HOT
  if(hasSkill('wild_growth')){const k='wild_growth';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const hPct=(sk.hotPct||0.04)+(l-1)*(sk.hotPctPerLv||0.01);const hDur=sk.hotDur||6;const isLow=S.hp/S.maxHp<0.30;const fHP=isLow?hPct*(sk.lowHpMult||2):hPct;
    const vG=new THREE.Group();const vPts=[];for(let i=0;i<20;i++){const t=i/20;const a=t*Math.PI*4;vPts.push(new THREE.Vector3(Math.cos(a)*0.8*(1-t*0.5),t*3,Math.sin(a)*0.8*(1-t*0.5)))}
    vG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vPts),20,0.06,4,false),new THREE.MeshBasicMaterial({color:0x44cc44,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false})));
    vG.position.copy(hp);scene.add(vG);emitGpuBurst(hp,0x44cc44,10,2,2,0.3,{gravity:-0.5});
    let wg=0;const wl=()=>{wg+=0.016;if(heroMesh)vG.position.copy(heroMesh.position);vG.rotation.y+=0.02;vG.children[0].material.opacity=0.6*Math.max(0,1-wg/hDur);
    if(Math.floor(wg)>Math.floor(wg-0.016)){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*fHP);if(heroMesh)emitGpuP(heroMesh.position,0x44ff44,{vx:0,vy:1.5,vz:0},2,0.3,{gravity:-0.5})}
    if(wg>=hDur){scene.remove(vG);return}requestAnimationFrame(wl)};requestAnimationFrame(wl)}}

  // 🐱 德鲁伊 —— 凶猛撕咬：三道爪痕
  if(hasSkill('ferocious_bite')){const k='ferocious_bite';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,5);
    if(tg&&tg.hp>0){resetCd(k,sk,l);let dmg=calcSkillDmg(sk,l,effectiveAtk);dmg*=(1+(sk.catFormBonusPct||0.50));
    const cG=new THREE.Group();for(let i=0;i<3;i++){const cs=new THREE.Mesh(new THREE.PlaneGeometry(0.1,2),new THREE.MeshBasicMaterial({color:0xff8844,transparent:true,opacity:0.9,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));cs.position.set((i-1)*0.35,1,0);cs.rotation.z=0.2-i*0.1;cG.add(cs)}
    cG.position.copy(tg.mesh.position);cG.lookAt(hp);scene.add(cG);emitGpuBurst(tg.mesh.position,0xff6644,15,5,3,0.3,{gravity:6});addDynLight(tg.mesh.position,0xff6644,2,6,0.3);screenShake(0.08,0.12);
    let fb=0;const ff=()=>{fb+=0.016;cG.children.forEach(c=>{if(c.material)c.material.opacity*=0.9;c.scale.y=1+fb*2});if(fb>=0.4){scene.remove(cG);return}requestAnimationFrame(ff)};requestAnimationFrame(ff);
    dmgEnemy(tg,dmg,{isSkill:true,skillName:'凶猛撕咬'})}}}

  // 🦠 术士 —— 腐蚀术：暗影DOT弹+击杀扩散（使用统一投射物系统，修复命中bug）
  if(hasSkill('corruption')){const k='corruption';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,12);
    if(tg&&tg.hp>0){resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);const dPct=sk.dotDmgPct||0.40;const dDur=sk.dotDur||6;
    // 使用fireProjectile，命中后在主循环里检测AOE区域内的敌人施加DOT
    const projG=new THREE.Group();
    const core=new THREE.Mesh(new THREE.SphereGeometry(0.25,8,8),new THREE.MeshBasicMaterial({color:0x8822cc,transparent:true,opacity:.95}));projG.add(core);
    const glowSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0x6622aa,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));glowSpr.scale.setScalar(1.5);projG.add(glowSpr);
    projG.position.set(hp.x,1,hp.z);scene.add(projG);
    const d=new THREE.Vector3(tg.mesh.position.x-hp.x,0,tg.mesh.position.z-hp.z).normalize();
    S.projectiles.push({mesh:projG,dir:d,speed:18,dmg,life:3,sz:0.25,color:0x8822cc,trailTimer:0,
      trail:'fire',trailColor:0x6622aa,isSkill:true,skillName:'腐蚀术',
      _corruptionDot:true,_dotPct:dPct,_dotDur:dDur,_dotTickRate:sk.dotTickRate||0.5
    })}}}

  // 🔥 术士 —— 火焰之雨：持续大范围火焰
  if(hasSkill('rain_of_fire')){const k='rain_of_fire';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=(sk.radius||5)+(l-1)*(sk.radiusPerLv||0.4);const dur=sk.duration||3;const tR=sk.tickRate||0.3;
    const rfP=nearest(hp,12)?nearest(hp,12).mesh.position.clone():hp.clone();
    const rfG=new THREE.Group();const burnR=new THREE.Mesh(new THREE.RingGeometry(0.3,r,24),new THREE.MeshBasicMaterial({color:0xff2200,transparent:true,opacity:0.25,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));burnR.rotation.x=-Math.PI/2;burnR.position.y=0.35;rfG.add(burnR);
    rfG.position.copy(rfP);scene.add(rfG);addDynLight(rfP,0xff4400,2,r,dur);
    let rf=0,lTk2=0;const rfl=()=>{rf+=0.016;
    if(Math.random()<0.4&&rf<dur){const fx=rfP.x+(Math.random()-0.5)*r*1.5;const fz=rfP.z+(Math.random()-0.5)*r*1.5;
    emitGpuP({x:fx,y:6,z:fz},0xff4400+Math.floor(Math.random()*0x2200),{vx:0,vy:-10,vz:0},3+Math.random()*2,0.4,{gravity:3,shrink:true})}
    burnR.material.opacity=0.25*Math.max(0,1-rf/dur)*(0.7+Math.sin(rf*6)*0.3);
    if(rf<dur&&rf-lTk2>=tR){lTk2=rf;S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(rfP)<r){dmgEnemy(e,dmg,{isSkill:true,isFireDmg:true,skillName:'火焰之雨'});if(Math.random()<0.15)emitGpuBurst(e.mesh.position,0xff4400,4,3,2,0.2,{gravity:5})}})}
    if(rf>=dur+0.5){scene.remove(rfG);return}requestAnimationFrame(rfl)};requestAnimationFrame(rfl)}}

  // 🩸 术士 —— 黑暗契约：牺牲HP换攻击
  if(hasSkill('dark_pact')){const k='dark_pact';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const hpCost=S.hp*(sk.hpCostPct||0.10);S.hp=Math.max(1,S.hp-hpCost);
    const atkB=(sk.atkBoostPct||0.30)+(l-1)*(sk.atkBoostPerLv||0.05);const skDmgB=sk.skillDmgBoost||0.20;const bDur=sk.boostDur||20;
    const atkGain=S.attack*atkB;S.attack+=atkGain;
    S.passiveStacks.darkPactActive=bDur;S.passiveStacks.darkPactSkillDmg=skDmgB;
    const dpG=new THREE.Group();dpG.add(new THREE.Mesh(new THREE.SphereGeometry(1.5,12,12),new THREE.MeshBasicMaterial({color:0x660066,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending,depthWrite:false})));
    dpG.position.copy(hp);dpG.position.y=1;scene.add(dpG);emitGpuBurst(hp,0x880088,15,4,3,0.4,{gravity:2});addDynLight(hp,0x660066,2,6,0.5);screenFlash('#660066',0.1,80);
    let dp=0;const dpa=()=>{dp+=0.016;if(heroMesh)dpG.position.copy(heroMesh.position).add({x:0,y:1,z:0});dpG.children[0].material.opacity=0.3*Math.max(0,1-dp/2);if(dp>=2){scene.remove(dpG);return}requestAnimationFrame(dpa)};requestAnimationFrame(dpa);
    setTimeout(()=>{S.attack=Math.max(1,S.attack-atkGain);S.passiveStacks.darkPactActive=0},bDur*1000)}}

  // ✨ 圣骑士 —— 奉献：圣光区域持续伤害+回血
  if(hasSkill('consecration')){const k='consecration';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);const dmg=calcSkillDmg(sk,l,effectiveAtk);
    const r=(sk.radius||4)+(l-1)*(sk.radiusPerLv||0.3);const dur=sk.duration||4;const tR=sk.tickRate||0.5;const cP=hp.clone();
    const csG=new THREE.Group();
    const holyGround=new THREE.Mesh(new THREE.CircleGeometry(r,24),new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:0.2,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));holyGround.rotation.x=-Math.PI/2;holyGround.position.y=0.35;csG.add(holyGround);
    const holyRing=new THREE.Mesh(new THREE.RingGeometry(r-0.15,r,32),new THREE.MeshBasicMaterial({color:0xffaa33,transparent:true,opacity:0.5,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));holyRing.rotation.x=-Math.PI/2;holyRing.position.y=0.36;csG.add(holyRing);
    // 十字圣纹
    const cx1=new THREE.Mesh(new THREE.PlaneGeometry(r*1.5,0.1),new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:0.4,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));cx1.rotation.x=-Math.PI/2;cx1.position.y=0.37;csG.add(cx1);
    const cx2=cx1.clone();cx2.rotation.z=Math.PI/2;csG.add(cx2);
    csG.position.copy(cP);scene.add(csG);addDynLight(cP,0xffdd44,2,r*1.2,dur);
    let cs=0,lTk3=0;const csl=()=>{cs+=0.016;
    holyGround.material.opacity=0.2*Math.max(0,1-cs/dur)*(0.8+Math.sin(cs*3)*0.2);holyRing.material.opacity=0.5*Math.max(0,1-cs/dur);
    cx1.material.opacity=0.4*Math.max(0,1-cs/dur);cx2.material.opacity=cx1.material.opacity;
    if(Math.random()<0.1&&cs<dur)emitGpuP({x:cP.x+(Math.random()-0.5)*r,y:0.15,z:cP.z+(Math.random()-0.5)*r},0xffdd44,{vx:0,vy:1+Math.random(),vz:0},2,0.3,{gravity:-0.3});
    if(cs<dur&&cs-lTk3>=tR){lTk3=cs;
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(cP)<r)dmgEnemy(e,dmg,{isSkill:true,skillName:'奉献'})});
    if(heroMesh&&heroMesh.position.distanceTo(cP)<r)S.hp=Math.min(S.maxHp,S.hp+S.maxHp*(sk.healPct||0.005))}
    if(cs>=dur+0.3){scene.remove(csG);return}requestAnimationFrame(csl)};requestAnimationFrame(csl)}}

  // 🙌 圣骑士 —— 圣疗术：紧急全屏圣光爆发
  if(hasSkill('lay_on_hands')){const k='lay_on_hands';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;
  if(skillTimers[k]<=0&&S.hp/S.maxHp<0.35){
    const l=sklLv(k);const sk=skData(k);resetCd(k,sk,l);
    const hPct=(sk.healPct||0.50)+(l-1)*(sk.healPctPerLv||0.08);S.hp=Math.min(S.maxHp,S.hp+S.maxHp*hPct);
    lightBeam(hp,0xffdd44,2.5,1.0);screenFlash('#ffffaa',0.2,200);emitGpuBurst(hp,0xffdd44,20,5,3,0.5,{gravity:-1});addDynLight(hp,0xffdd44,3,10,0.8);screenShake(0.05,0.1);
    const el=document.createElement('div');el.className='kill-streak';el.textContent=`🙌 圣疗术！(+${Math.round(hPct*100)}%HP)`;document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1500)}}

  // 🔨 圣骑士 —— 愤怒之锤：金色旋转锤弹+斩杀（使用统一投射物系统，修复命中bug）
  if(hasSkill('hammer_of_wrath')){const k='hammer_of_wrath';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const l=sklLv(k);const sk=skData(k);const tg=nearest(hp,14);
    if(tg&&tg.hp>0){resetCd(k,sk,l);let dmg=calcSkillDmg(sk,l,effectiveAtk);
    if(tg.hp/tg.maxHp<(sk.executePct||0.35))dmg*=(sk.executeBonus||2);
    fireProjectile(hp,tg.mesh.position,0xffdd44,dmg,0.35,sk.projSpeed||22,{
      trail:'holy',trailColor:0xffaa33,isSkill:true,skillName:'愤怒之锤',
      onHit:'explode',explodeR:2,explodeDmgPct:0
    })}}}

  // === 合成技能 ===
  // 👊 泰坦之握 —— 火雷合体清屏
  if(S.comboSkills.includes('titangrip')){const k='titangrip';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id==='titangrip');
    skillTimers[k]=combo.cd;
    const dmg=combo.baseDmg+effectiveAtk*combo.atkRatio;
    aoeEffect(hp,combo.radius,0xff8844,1.2);explosion(hp,0xff8844,25);lightBeam(hp,0xffaa44,2,.8);screenFlash('#ff8844',.25,120);screenShake(.2,.3);
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<combo.radius){dmgEnemy(e,dmg,{isFireDmg:true,isSkill:true});if(Math.random()<.3)lightningBolt(hp,e.mesh.position,0xffaa44,.04,4)}})}}
  // 🌡️ 冰火两重天 —— 冰火交替轰击
  if(S.comboSkills.includes('icefire')){const k='icefire';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id==='icefire');
    skillTimers[k]=combo.cd;
    const dmg=combo.baseDmg+effectiveAtk*combo.atkRatio;
    screenShake(.1,.15);
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    S.enemies.forEach(e=>{if(e.hp>0){dmgEnemy(e,dmg,{isSkill:true,skillName:'冰火两重天'});if(Math.random()<.5){e.frozen=2;iceShatter(e.mesh.position,1,3)}else{explosion(e.mesh.position,0xff4400,4);fireTrail(e.mesh.position,0xff2200)}}})}}

  // ===========================================================================================
  //  10个职业专属合成技能 — 终极融合技
  // ===========================================================================================
  // ⚔️ 战士 —— 剑刃风暴：巨型旋转刀刃清全屏
  if(S.comboSkills.includes('bladestorm')){const k='bladestorm';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||1.5);const r=combo.radius||12;const dur=combo.duration||5;
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    const bsG=new THREE.Group();
    for(let i=0;i<6;i++){const a=i*Math.PI/3;const blade=new THREE.Mesh(new THREE.ConeGeometry(0.15,r*0.5,3),new THREE.MeshBasicMaterial({color:0xff4444,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}));blade.position.set(Math.cos(a)*r*0.3,1,Math.sin(a)*r*0.3);blade.rotation.z=Math.PI/2;bsG.add(blade)}
    const stormRing=new THREE.Mesh(new THREE.TorusGeometry(r*0.4,0.15,6,32),new THREE.MeshBasicMaterial({color:0xff6644,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));stormRing.rotation.x=Math.PI/2;stormRing.position.y=1;bsG.add(stormRing);
    bsG.position.copy(hp);scene.add(bsG);screenFlash('#ff2200',0.2,120);screenShake(0.15,0.3);addDynLight(hp,0xff4444,3,r,dur);
    let bs0=0,bsTk=0;const bsLoop=()=>{bs0+=0.016;if(heroMesh)bsG.position.copy(heroMesh.position);bsG.rotation.y+=0.2;
    bsG.children.forEach(c=>{if(c.material)c.material.opacity=0.8*Math.max(0,1-bs0/dur)});
    if(bs0<dur&&bs0-bsTk>=0.5){bsTk=bs0;S.enemies.forEach(e=>{if(e.hp>0&&heroMesh&&e.mesh.position.distanceTo(heroMesh.position)<r)dmgEnemy(e,dmg*0.15,{isSkill:true,skillName:'剑刃风暴'})});
    if(Math.random()<0.3)emitGpuBurst(heroMesh?heroMesh.position:hp,0xff4444,8,5,3,0.3,{gravity:4})}
    if(bs0>=dur){scene.remove(bsG);return}requestAnimationFrame(bsLoop)};requestAnimationFrame(bsLoop)}}

  // 🔥 法师 —— 活体流星：超大火焰陨石
  if(S.comboSkills.includes('living_meteor')){const k='living_meteor';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||2);const r=combo.radius||15;
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    const meteorPos=hp.clone();
    const mG=new THREE.Mesh(new THREE.DodecahedronGeometry(2,2),new THREE.MeshBasicMaterial({color:0xff4400}));
    const mGl=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff6600,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}));mGl.scale.setScalar(8);mG.add(mGl);
    mG.position.set(meteorPos.x,25,meteorPos.z);scene.add(mG);
    let mt=0;const mFall=()=>{mt+=0.016;mG.position.y=25-mt*20;mG.rotation.x+=0.1;mG.rotation.z+=0.05;
    if(Math.random()<0.6)emitGpuP(mG.position,0xff4400,{vx:(Math.random()-0.5)*3,vy:2,vz:(Math.random()-0.5)*3},5,0.4,{gravity:5,shrink:true});
    if(mG.position.y<=0.5){explosion(meteorPos,0xff4400,40);emitGpuBurst(meteorPos,0xff6600,50,10,6,0.8,{gravity:8});addDynLight(meteorPos,0xff4400,4,r,0.8);screenShake(0.25,0.4);screenFlash('#ff4400',0.3,200);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(meteorPos)<r)dmgEnemy(e,dmg,{isSkill:true,isFireDmg:true,skillName:'活体流星'})});scene.remove(mG);return}
    requestAnimationFrame(mFall)};requestAnimationFrame(mFall)}}

  // 🏹 猎人 —— 荒野狂怒：召唤兽群
  if(S.comboSkills.includes('wild_fury')){const k='wild_fury';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||1);
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    const bCnt=combo.beastCount||6;const bDur=combo.beastDur||10;
    emitGpuBurst(hp,0x44cc44,25,5,4,0.5,{gravity:3});screenFlash('#44aa44',0.1,80);addDynLight(hp,0x44cc44,2,10,0.5);
    for(let i=0;i<bCnt;i++){const bG=new THREE.Group();bG.add(new THREE.Mesh(new THREE.ConeGeometry(0.2,0.5,4),new THREE.MeshStandardMaterial({color:0x886633})));bG.children[0].rotation.x=-Math.PI/2;
    bG.add(new THREE.Mesh(new THREE.SphereGeometry(0.04,4,4),new THREE.MeshBasicMaterial({color:0xff4400})));bG.children[1].position.set(0.08,0.05,0.2);
    const ag=Math.random()*Math.PI*2;bG.position.set(hp.x+Math.cos(ag)*3,0.25,hp.z+Math.sin(ag)*3);scene.add(bG);
    let bt=0;const bl2=()=>{bt+=0.016;const t=nearest(bG.position,10);if(t&&t.hp>0){const d=new THREE.Vector3().subVectors(t.mesh.position,bG.position).normalize();bG.position.x+=d.x*5*0.016;bG.position.z+=d.z*5*0.016;bG.lookAt(t.mesh.position);
    const _dx=bG.position.x-t.mesh.position.x,_dz=bG.position.z-t.mesh.position.z;if(Math.sqrt(_dx*_dx+_dz*_dz)<1.2){dmgEnemy(t,dmg/bCnt,{noCrit:false,isSkill:true,skillName:'荒野狂怒'});emitGpuBurst(t.mesh.position,0x44cc44,3,2,2,0.15,{gravity:3});bt+=0.5}}
    if(bt>=bDur){scene.remove(bG);return}requestAnimationFrame(bl2)};requestAnimationFrame(bl2)}}}

  // 💜 牧师 —— 虚空爆发：引爆所有DOT
  if(S.comboSkills.includes('void_eruption')){const k='void_eruption';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||1.5);
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    screenFlash('#9944ff',0.2,150);screenShake(0.15,0.25);emitGpuBurst(hp,0x9944ff,30,6,4,0.6,{gravity:3});addDynLight(hp,0x9944ff,3,12,0.6);
    lightBeam(hp,0x9944ff,2,0.8);
    S.enemies.forEach(e=>{if(e.hp>0){let eDmg=dmg;if(e.cursed)eDmg*=2;dmgEnemy(e,eDmg,{isSkill:true,skillName:'虚空爆发'});explosion(e.mesh.position,0x9944ff,8);emitGpuBurst(e.mesh.position,0x7722cc,8,4,3,0.3,{gravity:4})}})}}

  // 🗡️ 盗贼 —— 死亡印记：标记+延迟爆炸
  if(S.comboSkills.includes('death_mark')){const k='death_mark';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||1.2);
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    const targets=nearestN(hp,8,5);emitGpuBurst(hp,0x44ff44,15,4,3,0.3,{gravity:3});
    targets.forEach((t,i)=>{if(t.hp>0){
    const markSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff0000,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false}));markSpr.scale.setScalar(1.5);markSpr.position.copy(t.mesh.position);markSpr.position.y+=2;scene.add(markSpr);
    S.particles.push({mesh:markSpr,life:combo.markDur||4,maxLife:combo.markDur||4,type:'aoe'});
    setTimeout(()=>{if(t.hp>0){dmgEnemy(t,dmg*(combo.detonateMult||1.5),{isSkill:true,skillName:'死亡印记'});explosion(t.mesh.position,0xff2244,15);emitGpuBurst(t.mesh.position,0xff0000,12,5,3,0.4,{gravity:5})}},(combo.markDur||4)*1000)}})}}

  // 🌊 萨满 —— 升腾：所有技能无CD
  if(S.comboSkills.includes('ascendance')){const k='ascendance';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    const noDur=combo.noCdDur||8;S.passiveStacks.ascendanceActive=noDur;
    lightBeam(hp,0x44aaff,2.5,1);screenFlash('#44aaff',0.15,120);emitGpuBurst(hp,0x44ccff,25,6,4,0.5,{gravity:2});addDynLight(hp,0x44aaff,3,10,noDur);
    // 所有技能CD归零持续noDur秒
    const ascTimer=setInterval(()=>{Object.keys(skillTimers).forEach(sk=>{if(skillTimers[sk]>0.5)skillTimers[sk]=0.1})},200);
    setTimeout(()=>{clearInterval(ascTimer);S.passiveStacks.ascendanceActive=0},noDur*1000)}}

  // ☠️ 死骑 —— 天启：召唤天启骑士
  if(S.comboSkills.includes('apocalypse')){const k='apocalypse';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||2);
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    const rCnt=combo.riderCount||4;const rDur=combo.riderDur||12;
    screenFlash('#44ff44',0.15,100);emitGpuBurst(hp,0x44ff44,30,6,4,0.6,{gravity:3});addDynLight(hp,0x44ff44,3,12,0.5);
    for(let i=0;i<rCnt;i++){const rG=new THREE.Group();rG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.25,1.2,6),new THREE.MeshStandardMaterial({color:0x333344})));rG.children[0].position.y=0.8;
    rG.add(new THREE.Mesh(new THREE.SphereGeometry(0.15,6,6),new THREE.MeshStandardMaterial({color:0x444455})));rG.children[1].position.y=1.5;
    rG.add(new THREE.Mesh(new THREE.SphereGeometry(0.05,4,4),new THREE.MeshBasicMaterial({color:0x44ff44})));rG.children[2].position.set(0.06,1.55,0.12);
    const ag=i*Math.PI*2/rCnt;rG.position.set(hp.x+Math.cos(ag)*3,0,hp.z+Math.sin(ag)*3);scene.add(rG);
    let rt=0,rAt=0.8;const rl2=()=>{rt+=0.016;rAt-=0.016;const t=nearest(rG.position,10);if(t&&t.hp>0){const d=new THREE.Vector3().subVectors(t.mesh.position,rG.position).normalize();rG.position.x+=d.x*4*0.016;rG.position.z+=d.z*4*0.016;
    const _dx=rG.position.x-t.mesh.position.x,_dz=rG.position.z-t.mesh.position.z;if(rAt<=0&&Math.sqrt(_dx*_dx+_dz*_dz)<1.8){rAt=0.8;dmgEnemy(t,dmg/rCnt,{noCrit:false,isSkill:true,skillName:'天启'});emitGpuBurst(t.mesh.position,0x44ff44,5,3,2,0.2,{gravity:4})}}
    if(rt<rDur-1){}else{rG.children.forEach(c=>{if(c.material){c.material.transparent=true;c.material.opacity=Math.max(0,(rDur-rt))}})}
    if(rt>=rDur){scene.remove(rG);return}requestAnimationFrame(rl2)};requestAnimationFrame(rl2)}}}

  // 🌿 德鲁伊 —— 化身：全形态强化
  if(S.comboSkills.includes('incarnation')){const k='incarnation';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||1.5);
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    const dur=combo.allFormDur||15;S.passiveStacks.incarnationActive=dur;
    const atkBoost=S.attack*0.5;S.attack+=atkBoost;S.hp=Math.min(S.maxHp*1.3,S.hp+S.maxHp*0.3);S.maxHp*=1.3;
    lightBeam(hp,0x44ff44,2,1);screenFlash('#44ff44',0.15,100);emitGpuBurst(hp,0x44cc44,20,5,3,0.5,{gravity:2});addDynLight(hp,0x44ff44,3,10,dur);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<10)dmgEnemy(e,dmg,{isSkill:true,skillName:'化身'})});
    setTimeout(()=>{S.attack=Math.max(1,S.attack-atkBoost);S.maxHp/=1.3;S.hp=Math.min(S.maxHp,S.hp);S.passiveStacks.incarnationActive=0},dur*1000)}}

  // 😈 术士 —— 召唤地狱火：巨型恶魔从天坠落
  if(S.comboSkills.includes('summon_infernal')){const k='summon_infernal';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||2);
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    const iDur=combo.infernalDur||15;const iPos=hp.clone();
    // 坠落特效
    const infG=new THREE.Group();infG.add(new THREE.Mesh(new THREE.SphereGeometry(1.2,8,8),new THREE.MeshStandardMaterial({color:0x442200,roughness:0.6})));
    infG.add(new THREE.Mesh(new THREE.SphereGeometry(0.08,4,4),new THREE.MeshBasicMaterial({color:0xff4400})));infG.children[1].position.set(0.3,0.8,1);
    infG.add(new THREE.Mesh(new THREE.SphereGeometry(0.08,4,4),new THREE.MeshBasicMaterial({color:0xff4400})));infG.children[2].position.set(-0.3,0.8,1);
    infG.position.set(iPos.x,20,iPos.z);scene.add(infG);
    let it=0;const iFall=()=>{it+=0.016;infG.position.y=20-it*15;
    if(Math.random()<0.5)emitGpuP(infG.position,0xff4400,{vx:(Math.random()-0.5)*3,vy:2,vz:(Math.random()-0.5)*3},4,0.3,{gravity:5,shrink:true});
    if(infG.position.y<=1.2){infG.position.y=1.2;explosion(iPos,0xff4400,30);emitGpuBurst(iPos,0xff6600,35,8,5,0.7,{gravity:8});screenShake(0.2,0.3);addDynLight(iPos,0xff4400,3,12,0.6);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(iPos)<8)dmgEnemy(e,dmg*0.5,{isSkill:true,isFireDmg:true,skillName:'召唤地狱火'})});
    // 地狱火战斗AI（2D碰撞+冷却计时器攻击）
    let it2=0,iAt=0.8;const iLoop=()=>{it2+=0.016;iAt-=0.016;const t=nearest(infG.position,12);if(t&&t.hp>0){const d=new THREE.Vector3().subVectors(t.mesh.position,infG.position).normalize();infG.position.x+=d.x*3*0.016;infG.position.z+=d.z*3*0.016;
    const _dx=infG.position.x-t.mesh.position.x,_dz=infG.position.z-t.mesh.position.z;if(iAt<=0&&Math.sqrt(_dx*_dx+_dz*_dz)<2.2){iAt=0.8;dmgEnemy(t,dmg/5,{noCrit:false,isSkill:true,isFireDmg:true,skillName:'地狱火'});emitGpuBurst(t.mesh.position,0xff4400,6,4,3,0.2,{gravity:5})}}
    if(it2<iDur-2){}else{infG.children.forEach(c=>{if(c.material){c.material.transparent=true;c.material.opacity=Math.max(0,(iDur-it2)/2)}})}
    if(it2>=iDur){scene.remove(infG);return}requestAnimationFrame(iLoop)};requestAnimationFrame(iLoop);return}
    requestAnimationFrame(iFall)};requestAnimationFrame(iFall)}}

  // ⚡ 圣骑士 —— 神圣风暴：圣光旋风+全体回血
  if(S.comboSkills.includes('divine_storm')){const k='divine_storm';if(!skillTimers[k])skillTimers[k]=0;skillTimers[k]-=dt;if(skillTimers[k]<=0){
    const combo=SKILL_COMBOS.find(c=>c.id===k);skillTimers[k]=combo.cd;const dmg=combo.baseDmg+effectiveAtk*(combo.atkRatio||1.5);const r=combo.radius||10;
    PD.dailyProgress.comboTriggers=(PD.dailyProgress.comboTriggers||0)+1;
    lightBeam(hp,0xffdd44,3,1.2);screenFlash('#ffdd44',0.2,150);emitGpuBurst(hp,0xffdd44,30,7,4,0.6,{gravity:3});addDynLight(hp,0xffdd44,4,r,0.8);screenShake(0.12,0.2);
    // 旋转圣光扇
    const dsG=new THREE.Group();for(let i=0;i<8;i++){const a=i*Math.PI/4;const fan=new THREE.Mesh(new THREE.PlaneGeometry(r*0.4,0.2),new THREE.MeshBasicMaterial({color:0xffdd44,transparent:true,opacity:0.7,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));fan.position.set(Math.cos(a)*r*0.3,1,Math.sin(a)*r*0.3);fan.rotation.y=a;dsG.add(fan)}
    dsG.position.copy(hp);scene.add(dsG);
    let ds=0;const dsAnim=()=>{ds+=0.016;dsG.rotation.y+=0.15;dsG.children.forEach(c=>{if(c.material)c.material.opacity=Math.max(0,0.7-ds)});if(ds>=0.8){scene.remove(dsG);return}requestAnimationFrame(dsAnim)};requestAnimationFrame(dsAnim);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r)dmgEnemy(e,dmg,{isSkill:true,skillName:'神圣风暴'})});
    S.hp=Math.min(S.maxHp,S.hp+S.maxHp*(combo.healPct||0.30))}}
}

// ==================== 基础攻击（10职业·数值驱动版） ====================
// 所有伤害公式：baseDmg = S.attack * heroCfg.atkRatio
// 攻击间隔：heroCfg.atkRate（秒），受狂暴等被动影响
// 攻击范围：heroCfg.atkRange
function baseAttack(dt){
  if(!heroMesh)return;
  baseAtkTimer-=dt;if(baseAtkTimer>0)return;
  const hp=heroMesh.position;const hero=PD.selectedHero;
  const cfg=ALL_HEROES[hero];if(!cfg)return;
  // 战神徽记攻击力加成
  const warcryBonus=S.equipEffects.warcry?(S.passiveStacks.warcryStacks||0)*0.03:0;
  const effectiveAtk=S.attack*(1+warcryBonus);
  const baseDmg=effectiveAtk*cfg.atkRatio;
  let atkRate=cfg.atkRate;
  // === 被动：狂战士(warrior) — 血量<30%时攻击力+40%，攻速+25% ===
  const berserkerActive=hero==='warrior'&&S.hp<S.maxHp*0.3;
  const berserkerAtkMult=berserkerActive?1.4:1;
  if(berserkerActive)atkRate*=0.75; // 攻速+25%
  // ===== 局内BUFF: 攻速加成 =====
  const _bfAtk=S.buffStats||{};
  if(_bfAtk.atkSpeed>0)atkRate*=(1-Math.min(0.35,_bfAtk.atkSpeed)); // 最多减35%间隔
  // === 被动：暗影突袭(rogue) — 暴击后下一次必暴击 ===
  const shadowCrit=hero==='rogue'&&S.passiveStacks.shadowNextCrit;
  const extraCritOpts=shadowCrit?{bonusCrit:1.0,bonusCritDmg:0.5}:{};
  baseAtkTimer=atkRate;
  // 触发攻击动画
  if(heroMesh&&heroMesh.userData.anim){
    const a=heroMesh.userData.anim;
    a.state=a.attackType==='cast'?'cast':(a.attackType==='hybrid'?'hybrid':'attack');
    a.attackTimer=0.4;
  }
  S.atkHitCount++;
  // ⚔️ 战士 — 近战AOE旋风
  if(hero==='warrior'){
    const r=cfg.atkRange;const dmg=baseDmg*berserkerAtkMult;
    aoeEffect(hp,r,0xcc3333,.3);screenShake(.03,.08);
    if(SFX.heroAtk)SFX.heroAtk('warrior');
    if(berserkerActive){screenFlash('#ff2200',.05,60)} // 狂暴视觉反馈
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r)dmgEnemy(e,dmg,{isFireDmg:false,...extraCritOpts})})}
  // 🔥 法师 — 远程多目标火球(点燃DOT由dmgEnemy中被动触发)
  else if(hero==='mage'){
    const dmg=baseDmg;if(SFX.heroAtk)SFX.heroAtk('mage');
    nearestN(hp,cfg.atkRange,2).forEach(t=>fireProjectile(hp,t.mesh.position,0xff6600,dmg,.2,22,{trail:'fire',trailColor:0xff4400,isFireDmg:true,...extraCritOpts}))}
  // 🏹 猎人 — 远程散射弹幕(低单体高数量)
  else if(hero==='hunter'){
    const dmg=baseDmg; // atkRatio=0.65已经偏低，靠数量补
    if(SFX.heroAtk)SFX.heroAtk('hunter');
    const count=Math.min(5,2+Math.floor(S.level/8)); // 随等级增加弹数
    nearestN(hp,cfg.atkRange,count).forEach(t=>fireProjectile(hp,t.mesh.position,0x88ff44,dmg,.1,26,{trail:'leaf',trailColor:0x66cc22,...extraCritOpts}))}
  // ✝️ 暗牧 — DOT暗影弹(回血由被动vampiric在dmgEnemy触发)
  else if(hero==='priest'){
    const dmg=baseDmg;if(SFX.heroAtk)SFX.heroAtk('priest');
    nearestN(hp,cfg.atkRange,3).forEach(t=>{fireProjectile(hp,t.mesh.position,0xbb88ff,dmg,.15,18,{trail:'holy',trailColor:0x9966cc,isDot:true,...extraCritOpts})})}
  // 🗡️ 盗贼 — 近战高爆发单体(高暴击率+暗影突袭被动)
  else if(hero==='rogue'){
    const dmg=baseDmg; // atkRatio=1.6，配合高暴击
    if(SFX.heroAtk)SFX.heroAtk('rogue');
    const t=nearest(hp,cfg.atkRange);
    if(t){dmgEnemy(t,dmg,{...extraCritOpts});explosion(t.mesh.position,0x444444,4);screenShake(.02,.05);
      // 暗影突袭视觉
      if(shadowCrit){lightBeam(t.mesh.position,0x7722cc,.8,.2);S.passiveStacks.shadowNextCrit=false}}}
  // 🌊 萨满 — 图腾混合(近战AOE+远程闪电)
  else if(hero==='shaman'){
    const meleeDmg=baseDmg*0.7;const rangeDmg=baseDmg*0.6;
    if(SFX.heroAtk)SFX.heroAtk('shaman');
    aoeEffect(hp,cfg.atkRange,0x2266bb,.3);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<cfg.atkRange)dmgEnemy(e,meleeDmg,extraCritOpts)});
    nearestN(hp,14,2).forEach(t=>{fireProjectile(hp,t.mesh.position,0x44aaff,rangeDmg,.15,16,extraCritOpts);
      if(Math.random()<.3)lightningBolt(hp,t.mesh.position,0x44aaff,.03,4)})}
  // 💀 死骑 — 近战冰霜+减速(冰霜光环被动在enemy loop中处理)
  else if(hero==='deathknight'){
    const r=cfg.atkRange;const dmg=baseDmg;
    if(SFX.heroAtk)SFX.heroAtk('deathknight');
    aoeEffect(hp,r,0x4488cc,.3);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r){dmgEnemy(e,dmg,extraCritOpts);e.frozen=0.5}})}
  // 🌿 德鲁伊 — 变形切换(>50%HP远程月火/≤50%近战熊形态)
  else if(hero==='druid'){
    if(S.hp<=S.maxHp*0.5){
      // 熊形态：近战AOE + 护甲加成 + 回血
      const r=3.5;const dmg=baseDmg*0.85;
      if(SFX.heroAtk)SFX.heroAtk('druid',{isBear:true});
      aoeEffect(hp,r,0x885522,.3);
      S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r)dmgEnemy(e,dmg,extraCritOpts)});
      S.hp=Math.min(S.maxHp,S.hp+S.maxHp*0.01*dt*60); // 每秒回血1%MaxHP
    }else{
      // 月火形态：高伤远程
      const dmg=baseDmg*1.15;
      if(SFX.heroAtk)SFX.heroAtk('druid',{isBear:false});
      nearestN(hp,cfg.atkRange,3).forEach(t=>fireProjectile(hp,t.mesh.position,0xffff44,dmg,.18,20,{trail:'leaf',trailColor:0xaacc00,...extraCritOpts}))}}
  // 👿 术士 — 诅咒+召唤(标记诅咒由souldrain被动在killEnemy中爆炸)
  else if(hero==='warlock'){
    const dmg=baseDmg;if(SFX.heroAtk)SFX.heroAtk('warlock');
    const t=nearest(hp,cfg.atkRange);
    if(t){fireProjectile(hp,t.mesh.position,0x9944cc,dmg,.22,16,{trail:'fire',trailColor:0x7722aa,...extraCritOpts});
      // 标记诅咒目标
      t.cursed=true;
      // AOE溅射
      S.enemies.forEach(e=>{if(e!==t&&e.hp>0&&e.mesh.position.distanceTo(t.mesh.position)<3)dmgEnemy(e,dmg*0.3,{noCrit:true})})}}
  // 🛡️ 圣骑士 — 近战AOE+圣光灼烧(护盾被动由tick处理)
  else if(hero==='paladin'){
    const r=cfg.atkRange;const dmg=baseDmg;
    if(SFX.heroAtk)SFX.heroAtk('paladin');
    aoeEffect(hp,r,0xffaa33,.3);
    const hasShield=S.passiveStacks.divineShield>0;
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r){
      dmgEnemy(e,dmg,extraCritOpts);
      // 护盾存在时附带圣光灼烧(额外20%伤害)
      if(hasShield)dmgEnemy(e,dmg*0.2,{noCrit:true,isFireDmg:true})}});
    // 少量回复
    if(Math.random()<.2){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.02);
      for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.05,4,4),new THREE.MeshBasicMaterial({color:0xffdd66,transparent:true,opacity:.6}));m.position.set(hp.x+(Math.random()-.5),1,hp.z+(Math.random()-.5));scene.add(m);S.particles.push({mesh:m,life:.5,maxLife:.5,type:'exp',vel:new THREE.Vector3(0,2+Math.random(),0)})}}}
  // === 装备特效：灰烬使者 — 每第5次攻击释放圣光波 ===
  if(S.equipEffects.ashbringer&&S.atkHitCount%5===0){
    const r=4;const dmg=effectiveAtk*0.8;
    aoeEffect(hp,r,0xffcc44,.5);lightBeam(hp,0xffcc44,1,.3);screenShake(.04,.08);
    S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(hp)<r)dmgEnemy(e,dmg,{noCrit:true,isSkill:false})})}
}

// ==================== 升级 & 技能选择 ====================
function gainXP(amt){
  // ===== 局内BUFF: 经验倍率加成 =====
  const buffXpMult=1+(S.buffStats?S.buffStats.xpMult:0);
  S.xp+=Math.round(amt*buffXpMult);
  while(S.xp>=S.xpNeed){S.xp-=S.xpNeed;S.level++;
  if(SFX.levelUp)SFX.levelUp();
  // 使用新的S曲线经验公式
  S.xpNeed=calcXpNeed(S.level);
  // 缓慢但有意义的成长
  S.attack+=NUM.ATK_PER_LEVEL;S.maxHp+=NUM.HP_PER_LEVEL;
  S.hp=Math.min(S.maxHp,S.hp+S.maxHp*NUM.HEAL_ON_LEVELUP);
  // 成长追踪
  if(S.growthLog){S.growthLog.levelAtk+=NUM.ATK_PER_LEVEL;S.growthLog.levelHp+=NUM.HP_PER_LEVEL}
  // 每3级增加暴击率（↑ 5→3级间隔，升级奖励更频繁）
  if(S.level%3===0){S.critRate=Math.min(0.4,S.critRate+0.02);if(S.growthLog)S.growthLog.levelCrit+=0.02}
  // 属性变化浮字
  showStatChangeFloat(`⚔+${NUM.ATK_PER_LEVEL.toFixed(1)} ❤+${NUM.HP_PER_LEVEL}`,'buff');
  showSkillPanel();checkCombos()}}

// ===== BUFF系统: 应用BUFF效果 =====
function applyBuff(buffDef){
  if(!S.buffs)S.buffs=[];
  if(!S.buffStats)S.buffStats={xpMult:0,goldMult:0,pickupRange:0,orbValue:0,atkPct:0,critRate:0,critDmg:0,atkSpeed:0,skillDmg:0,hpPct:0,armor:0,hpRegen:0,dodge:0,moveSpd:0,skillCd:0,eliteDmg:0,leech:0,thorns:0,killHeal:0,aoeSize:0};
  const existing=S.buffs.find(b=>b.id===buffDef.id);
  if(existing){
    existing.stacks++;
  }else{
    S.buffs.push({id:buffDef.id,name:buffDef.name,icon:buffDef.icon,stat:buffDef.stat,val:buffDef.val,stacks:1,color:buffDef.color,category:buffDef.category});
  }
  // 更新buffStats汇总
  S.buffStats[buffDef.stat]=(S.buffStats[buffDef.stat]||0)+buffDef.val;
  // ===== 立即生效的属性型BUFF =====
  if(buffDef.stat==='atkPct'){
    const gain=Math.round(S.attack*buffDef.val);
    S.attack+=gain;
    showStatChangeFloat(`⚔+${gain} (${buffDef.name})`,'buff');
    if(S.growthLog)S.growthLog.eventAtk+=gain;
  }else if(buffDef.stat==='hpPct'){
    const gain=Math.round(S.maxHp*buffDef.val);
    S.maxHp+=gain;S.hp=Math.min(S.maxHp,S.hp+gain);
    showStatChangeFloat(`❤+${gain} (${buffDef.name})`,'buff');
    if(S.growthLog)S.growthLog.eventHp+=gain;
  }else if(buffDef.stat==='critRate'){
    S.critRate=Math.min(0.6,S.critRate+buffDef.val);
    showStatChangeFloat(`🎯+${(buffDef.val*100).toFixed(0)}% 暴击`,'buff');
    if(S.growthLog)S.growthLog.eventCrit+=buffDef.val;
  }else if(buffDef.stat==='critDmg'){
    S.critDmg+=buffDef.val;
    showStatChangeFloat(`💥+${(buffDef.val*100).toFixed(0)}% 暴伤`,'buff');
  }else if(buffDef.stat==='armor'){
    S.armor+=buffDef.val;
    showStatChangeFloat(`🛡+${buffDef.val} 护甲`,'buff');
    if(S.growthLog)S.growthLog.eventArmor+=buffDef.val;
  }else if(buffDef.stat==='moveSpd'){
    const gain=S.speed*buffDef.val;
    S.speed+=gain;
    showStatChangeFloat(`👟+${gain.toFixed(1)} 速度`,'buff');
    if(S.growthLog)S.growthLog.eventSpd+=gain;
  }else{
    // 非立即型BUFF（经验/金币/拾取/回血等）在战斗循环中读取S.buffStats
    const label={xpMult:'📖经验',goldMult:'💰金币',pickupRange:'🧲拾取',orbValue:'✨经验球',
      atkSpeed:'🌪️攻速',skillDmg:'🔮技能伤害',hpRegen:'💚回血',dodge:'💨闪避',
      skillCd:'⏱️CD',eliteDmg:'💀精英伤害',leech:'🩸吸血',thorns:'🦔反伤',killHeal:'🍀击杀回血',aoeSize:'🌊范围'}[buffDef.stat]||buffDef.name;
    showStatChangeFloat(`${label}+${buffDef.stat==='armor'?buffDef.val:(buffDef.val*100).toFixed(0)+'%'}`,'buff');
  }
  updateBuffBar();
  if(SFX.buff)SFX.buff();
}

// ===== 随机获取BUFF选项 =====
function getRandBuffs(n){
  if(!BUFF_DB||!S.buffs)return[];
  const pool=[];
  BUFF_DB.forEach(b=>{
    const existing=S.buffs.find(x=>x.id===b.id);
    const curStacks=existing?existing.stacks:0;
    if(curStacks>=b.maxStack)return; // 已满层跳过
    // 权重：基础5，已有的+2（鼓励叠加）
    const wt=5+(existing?2:0);
    for(let i=0;i<wt;i++)pool.push(b);
  });
  const res=[],pk=new Set();
  while(res.length<n&&pool.length){
    const i=Math.floor(Math.random()*pool.length);const b=pool[i];
    if(!pk.has(b.id)){pk.add(b.id);res.push(b)}
    pool.splice(i,1);
  }
  return res;
}

// ===== 创建BUFF选项卡DOM =====
function createBuffCard(buff,panel){
  const existing=S.buffs.find(b=>b.id===buff.id);
  const curStacks=existing?existing.stacks:0;
  const c=document.createElement('div');
  c.className='skill-choice buff-choice';
  const stackLabel=curStacks>0?`<span class="buff-stack-badge">${curStacks} → ${curStacks+1}层</span>`
    :'<span class="buff-stack-badge buff-new">新!</span>';
  const maxHint=curStacks+1>=buff.maxStack?`<div class="skill-max-hint">🌟 即将满层</div>`:'';
  const valDisplay=buff.stat==='armor'?`+${buff.val}`:`+${(buff.val*100).toFixed(0)}%`;
  c.innerHTML=`<div class="skill-choice-icon">${buff.icon}</div>
    <div class="skill-choice-name">${buff.name} ${stackLabel}</div>
    <div class="buff-category" style="color:${buff.color}">${buff.category}增益</div>
    <div class="skill-choice-desc">${buff.desc}</div>
    <div class="buff-value" style="color:${buff.color}">${valDisplay}</div>
    <div class="buff-flavor">${buff.flavorText}</div>${maxHint}`;
  c.style.borderColor=buff.color+'66';
  c.onclick=()=>{
    applyBuff(buff);
    panel.classList.remove('active');gamePaused=false;updateSkillBar();checkCombos();
  };
  return c;
}

// ===== 技能选择即时反馈浮窗 =====
function showSkillPickFeedback(sk,prevLv,newLv,prevDps,prevTotalDps){
  const el=document.createElement('div');el.className='skill-pick-feedback';
  const isNew=prevLv===0;
  const newDmg=calcSkillDmg(sk,newLv,S.attack);
  const newCd=calcSkillCd(sk,newLv);
  const estDps=newCd>0?(newDmg/newCd):0;
  // 用理论DPS对比（升级前理论 vs 升级后理论），避免历史DPS与理论DPS不可比导致"DPS下降"的错误显示
  let dpsChange='';
  if(!isNew){
    const prevDmgTheory=calcSkillDmg(sk,prevLv,S.attack);
    const prevCdTheory=calcSkillCd(sk,prevLv);
    const prevDpsTheory=prevCdTheory>0?(prevDmgTheory/prevCdTheory):0;
    const diff=estDps-prevDpsTheory;
    if(diff>0)dpsChange=`<span class="spf-up">▲ +${diff>=100?(diff/1000).toFixed(1)+'k':Math.round(diff)} DPS</span>`;
    else if(diff===0)dpsChange='';
    // 理论DPS升级后不应该下降，但以防万一仍保留下降显示（极端情况）
    else if(diff<0)dpsChange=`<span class="spf-down">▼ ${Math.round(diff)} DPS</span>`;
  }
  const estDpsStr=estDps>=1000?(estDps/1000).toFixed(1)+'k':Math.round(estDps);
  const cdStr=newCd.toFixed(1)+'s';
  const dmgStr=newDmg>=1000?(newDmg/1000).toFixed(1)+'k':Math.round(newDmg);
  el.innerHTML=`<div class="spf-header">${sk.icon} <b>${sk.name}</b> ${isNew?'<span class="spf-new">新技能!</span>':`Lv.${prevLv}→${newLv}`}</div>
    <div class="spf-stats">
      <div class="spf-item"><span class="spf-label">单次伤害</span><span class="spf-val">${dmgStr}</span></div>
      <div class="spf-item"><span class="spf-label">冷却</span><span class="spf-val">${cdStr}</span></div>
      <div class="spf-item"><span class="spf-label">预估DPS</span><span class="spf-val spf-dps">${estDpsStr}</span></div>
    </div>
    ${dpsChange?`<div class="spf-change">${dpsChange}</div>`:''}`;
  document.getElementById('game-screen').appendChild(el);
  setTimeout(()=>{el.classList.add('fade-out');setTimeout(()=>el.remove(),500)},2500);
}

// ===== 创建技能选项卡DOM（抽取公共逻辑） =====
function createSkillCard(sk,panel,tb){
  const ex=S.skills.find(s=>s.id===sk.id);const curLv=ex?ex.level:0;const newLv=curLv+1;
  const c=document.createElement('div');c.className=`skill-choice rarity-${sk.rarity}`;
  const stats=getSkillUpgradeStats(sk,curLv,S.attack);
  const statsHtml=renderSkillStats(stats);
  const lvLabel=curLv>0?`<span class="skill-lv-badge lv-up">Lv${curLv} → ${newLv}</span>`:'<span class="skill-lv-badge lv-new">新!</span>';
  const maxLvHint=newLv>=sk.maxLevel?`<div class="skill-max-hint">🌟 即将满级</div>`:'';
  c.innerHTML=`<div class="skill-choice-icon">${sk.icon}</div><div class="skill-choice-name">${sk.name} ${lvLabel}</div><div class="skill-choice-rarity">${RARITY_NAME[sk.rarity]}</div><div class="skill-choice-desc">${sk.desc}</div>${statsHtml}${maxLvHint}`;
  c.onclick=()=>{
    // 记录选择前数据用于反馈对比
    const prevDmg=dmgStats.skillDmg[sk.name]||0;
    const prevDps=gameTime>0?(prevDmg/gameTime):0;
    const prevTotalDps=gameTime>0?(dmgStats.total/gameTime):0;
    if(ex)ex.level++;else S.skills.push({...sk,level:1});
    if(SFX.skillPick)SFX.skillPick();
    // === 技能选择即时反馈 ===
    showSkillPickFeedback(sk,curLv,newLv,prevDps,prevTotalDps);
    if(tb.doubleSkill>0&&Math.random()<tb.doubleSkill){
      updateSkillBar();checkCombos();
      const bonusEl=document.createElement('div');bonusEl.className='kill-streak';bonusEl.textContent='🌟 欧皇触发！额外选择一个技能！';
      document.getElementById('game-screen').appendChild(bonusEl);setTimeout(()=>bonusEl.remove(),1500);
      setTimeout(()=>showSkillPanel(),200);
      return;
    }
    panel.classList.remove('active');gamePaused=false;updateSkillBar();checkCombos();
  };
  return c;
}

function showSkillPanel(){
  gamePaused=true;if(SFX.skillPanel)SFX.skillPanel();const panel=document.getElementById('skill-panel'),ch=document.getElementById('skill-choices');ch.innerHTML='';
  const tb=S.talentBonus||{};
  const choiceCount=4+(tb.extraSkillChoice||0); // ↑ 3→4选1，更多选择更爽
  // ===== 决定BUFF/技能分配 =====
  let buffCount=0;
  if(typeof BUFF_DB!=='undefined'&&BUFF_DB.length>0&&S.level>=2){
    // Lv2起开始出现BUFF选项
    buffCount=Math.max(BUFF_MIN_PER_PANEL,Math.min(BUFF_MAX_PER_PANEL,
      Math.floor(Math.random()<0.5?1:2)));
    // 确保技能至少占1个位置
    buffCount=Math.min(buffCount,choiceCount-1);
  }
  const skillCount=choiceCount-buffCount;
  const skills=getRandSkills(skillCount);
  const buffs=getRandBuffs(buffCount);
  // ===== 混合排列：随机插入位置 =====
  const items=[];
  skills.forEach(sk=>items.push({type:'skill',data:sk}));
  buffs.forEach(bf=>items.push({type:'buff',data:bf}));
  // 随机打乱顺序
  for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]]}
  items.forEach(item=>{
    if(item.type==='skill'){
      ch.appendChild(createSkillCard(item.data,panel,tb));
    }else{
      ch.appendChild(createBuffCard(item.data,panel));
    }
  });
  // 更新面板标题
  const titleEl=panel.querySelector('.skill-panel-title');
  if(titleEl)titleEl.textContent=`⬆️ 升级！Lv.${S.level}`;
  document.getElementById('skill-refresh').style.display='block';panel.classList.add('active');
}
function getRandSkills(n){
  const tb=S.talentBonus||{};
  const legendBonus=tb.legendRate||0; // 天赋: 传说技能出现率提升
  const w={common:10,rare:5,epic:3,legendary:Math.max(1,1+Math.round(legendBonus*10)),signature:0};
  // 英雄偏好技能列表
  const heroCfg=ALL_HEROES[PD.selectedHero]||{};
  const heroId=PD.selectedHero;
  const favorSet=new Set(heroCfg.favorSkills||[]);
  const pool=[];
  SKILL_DB.forEach(s=>{
    // ===== 标志技能不在随机池中出现（开局自动获得） =====
    if(s.rarity==='signature')return;
    // ===== 职业专属技能：只对对应英雄开放 =====
    if(s.heroOnly&&s.heroOnly!==heroId)return;
    // 检查前置条件
    if(s.prereq){const pre=S.skills.find(sk=>sk.id===s.prereq.id);if(!pre||pre.level<s.prereq.lv)return}
    // 检查是否已满级
    const existing=S.skills.find(sk=>sk.id===s.id);
    if(existing&&existing.level>=s.maxLevel)return;
    let wt=w[s.rarity]||5;
    // ===== 职业专属技能权重加倍 =====
    if(s.heroOnly===heroId)wt*=2;
    // ===== 英雄偏好: 偏好技能权重×3 =====
    if(favorSet.has(s.id))wt*=3;
    // 已拥有的技能提升权重（鼓励升级）
    const ownBonus=existing?4:0;
    for(let i=0;i<wt+ownBonus;i++)pool.push(s)});
  // ===== 当前英雄标志技能升级机会（未满级时有概率出现） =====
  const sigSkill=SKILL_DB.find(s=>s.id===heroCfg.signatureSkill);
  if(sigSkill){
    const sigEx=S.skills.find(s=>s.id===sigSkill.id);
    if(sigEx&&sigEx.level<sigSkill.maxLevel){
      // 标志技能有较高权重出现以供升级
      for(let i=0;i<8;i++)pool.push(sigSkill);
    }
  }
  const res=[],pk=new Set();while(res.length<n&&pool.length){const i=Math.floor(Math.random()*pool.length);const s=pool[i];if(!pk.has(s.id)){pk.add(s.id);res.push(s)}pool.splice(i,1)}return res;
}
window.refreshSkills=function(){
  document.getElementById('skill-refresh').style.display='none';
  const tb=S.talentBonus||{};
  const refreshCount=5+(tb.extraSkillChoice||0); // ↑ 4→5选1，刷新比默认多1个
  const ch=document.getElementById('skill-choices');ch.innerHTML='';
  const panel=document.getElementById('skill-panel');
  // 刷新也混入BUFF
  let buffCount=0;
  if(typeof BUFF_DB!=='undefined'&&BUFF_DB.length>0&&S.level>=2){
    buffCount=Math.min(BUFF_MAX_PER_PANEL,Math.floor(Math.random()<0.4?1:2));
    buffCount=Math.min(buffCount,refreshCount-1);
  }
  const skillCount=refreshCount-buffCount;
  const skills=getRandSkills(skillCount);
  const buffs=getRandBuffs(buffCount);
  const items=[];
  skills.forEach(sk=>items.push({type:'skill',data:sk}));
  buffs.forEach(bf=>items.push({type:'buff',data:bf}));
  for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]]}
  items.forEach(item=>{
    if(item.type==='skill'){
      ch.appendChild(createSkillCard(item.data,panel,tb));
    }else{
      ch.appendChild(createBuffCard(item.data,panel));
    }
  });
};
// ===== BUFF栏HUD更新 =====
function updateBuffBar(){
  let bar=document.getElementById('hud-buffs');
  if(!bar){
    bar=document.createElement('div');bar.id='hud-buffs';bar.className='hud-buffs';
    const hudEl=document.getElementById('game-hud');
    if(hudEl)hudEl.appendChild(bar);
  }
  bar.innerHTML='';
  if(!S.buffs||!S.buffs.length)return;
  S.buffs.forEach(b=>{
    const slot=document.createElement('div');slot.className='buff-slot';
    slot.style.borderColor=b.color+'88';
    slot.innerHTML=`<span class="buff-slot-icon">${b.icon}</span>${b.stacks>1?`<span class="buff-slot-stack">×${b.stacks}</span>`:''}`;
    slot.title=`${b.name} ×${b.stacks}\n${BUFF_DB.find(x=>x.id===b.id)?.desc||''}`;
    bar.appendChild(slot);
  });
}
function updateSkillBar(){const bar=document.getElementById('hud-skills');bar.innerHTML='';
  // 按DPS贡献排序技能（降序）
  const skillsWithDps=S.skills.map(s=>{
    const dmg=dmgStats.skillDmg[s.name]||0;
    const dps=gameTime>0?(dmg/gameTime):0;
    return{skill:s,totalDmg:dmg,dps:dps};
  });
  skillsWithDps.sort((a,b)=>b.dps-a.dps);
  const maxSkillDps=skillsWithDps.length>0?skillsWithDps[0].dps:0;
  skillsWithDps.forEach((item,idx)=>{
    const s=item.skill;
    const sl=document.createElement('div');sl.className='skill-slot active';
    // CD信息
    const cdLeft=skillTimers[s.id]||0;
    const skData=SKILL_DB.find(x=>x.id===s.id);
    const totalCd=skData?calcSkillCd(skData,s.level):1;
    const cdPct=Math.max(0,Math.min(1,cdLeft/totalCd));
    // DPS排名标记
    const rankColors=['#c9a44a','#c0c0c0','#cd7f32'];
    const rankBadge=idx<3&&item.dps>0?`<span class="skill-rank" style="background:${rankColors[idx]}">${idx+1}</span>`:'';
    // DPS贡献百分比
    const totalAllDps=gameTime>0?(dmgStats.total/gameTime):0;
    const dpsPct=totalAllDps>0?Math.round(item.dps/totalAllDps*100):0;
    sl.innerHTML=`<span class="skill-icon-wrap">${s.icon}</span><span class="skill-level">Lv${s.level}</span>${rankBadge}<div class="skill-cd-overlay" style="height:${cdPct*100}%"></div>${cdPct>0?`<span class="skill-cd-text">${cdLeft.toFixed(1)}s</span>`:''}`;
    // Tooltip详情
    const dpsStr=item.dps>=1000?(item.dps/1000).toFixed(1)+'k':Math.round(item.dps);
    const dmgStr=item.totalDmg>=1000?(item.totalDmg/1000).toFixed(1)+'k':Math.round(item.totalDmg);
    const cdStr=totalCd.toFixed(1)+'s';
    sl.title=`${s.name} Lv.${s.level}\nDPS: ${dpsStr} (${dpsPct}%)\n总伤: ${dmgStr}\nCD: ${cdStr}${cdLeft>0?' (冷却中:'+cdLeft.toFixed(1)+'s)':''}`;
    bar.appendChild(sl);
  });
  S.comboSkills.forEach(cid=>{const c=SKILL_COMBOS.find(x=>x.id===cid);if(c){
    const sl=document.createElement('div');sl.className='skill-slot active';sl.style.borderColor='#ff8c00';
    const cdLeft=skillTimers[c.id]||0;const totalCd=c.cd||10;const cdPct=Math.max(0,Math.min(1,cdLeft/totalCd));
    const comboDmg=dmgStats.skillDmg[c.name]||0;const comboDps=gameTime>0?(comboDmg/gameTime):0;
    const dpsStr=comboDps>=1000?(comboDps/1000).toFixed(1)+'k':Math.round(comboDps);
    sl.innerHTML=`<span class="skill-icon-wrap">${c.icon}</span><span class="skill-level" style="background:#ff8c00">合</span><div class="skill-cd-overlay combo-cd" style="height:${cdPct*100}%"></div>${cdPct>0?`<span class="skill-cd-text">${cdLeft.toFixed(1)}s</span>`:''}`;
    sl.title=`${c.name} [合成]\nDPS: ${dpsStr}\nCD: ${totalCd}s${cdLeft>0?' (冷却中:'+cdLeft.toFixed(1)+'s)':''}`;
    bar.appendChild(sl)}})}
// 实时技能栏刷新（每帧更新CD遮罩，不重建DOM）
function updateSkillBarCD(){
  const bar=document.getElementById('hud-skills');if(!bar)return;
  const slots=bar.querySelectorAll('.skill-slot');
  let idx=0;
  const skillsWithDps=S.skills.map(s=>{const dmg=dmgStats.skillDmg[s.name]||0;return{skill:s,dps:gameTime>0?(dmg/gameTime):0};});
  skillsWithDps.sort((a,b)=>b.dps-a.dps);
  skillsWithDps.forEach(item=>{
    const s=item.skill;
    if(idx>=slots.length)return;
    const sl=slots[idx];idx++;
    const cdLeft=skillTimers[s.id]||0;
    const skd=SKILL_DB.find(x=>x.id===s.id);
    const totalCd=skd?calcSkillCd(skd,s.level):1;
    const cdPct=Math.max(0,Math.min(1,cdLeft/totalCd));
    const overlay=sl.querySelector('.skill-cd-overlay');if(overlay)overlay.style.height=cdPct*100+'%';
    const cdTxt=sl.querySelector('.skill-cd-text');
    if(cdPct>0){if(cdTxt)cdTxt.textContent=cdLeft.toFixed(1)+'s';else{const sp=document.createElement('span');sp.className='skill-cd-text';sp.textContent=cdLeft.toFixed(1)+'s';sl.appendChild(sp)}}
    else{if(cdTxt)cdTxt.remove()}
  });
  // 合成技CD
  S.comboSkills.forEach(cid=>{
    if(idx>=slots.length)return;
    const sl=slots[idx];idx++;
    const c=SKILL_COMBOS.find(x=>x.id===cid);if(!c)return;
    const cdLeft=skillTimers[c.id]||0;const totalCd=c.cd||10;const cdPct=Math.max(0,Math.min(1,cdLeft/totalCd));
    const overlay=sl.querySelector('.skill-cd-overlay');if(overlay)overlay.style.height=cdPct*100+'%';
    const cdTxt=sl.querySelector('.skill-cd-text');
    if(cdPct>0){if(cdTxt)cdTxt.textContent=cdLeft.toFixed(1)+'s';else{const sp=document.createElement('span');sp.className='skill-cd-text';sp.textContent=cdLeft.toFixed(1)+'s';sl.appendChild(sp)}}
    else{if(cdTxt)cdTxt.remove()}
  });
}

// ==================== BOSS阶段系统 ====================
function checkBossPhase(boss){
  if(!boss.isBoss||!boss.phases)return;
  const hpPct=boss.hp/boss.maxHp;
  let newPhase=0;
  for(let i=boss.phases.length-1;i>=0;i--){
    if(hpPct<=boss.phases[i].hpPct){newPhase=i;break;}
  }
  if(newPhase>S.bossPhase){
    S.bossPhase=newPhase;
    const phase=boss.phases[newPhase];
    // 阶段转换视觉反馈
    screenShake(.15,.2);screenFlash('#ff2200',.15,150);
    lightBeam(boss.mesh.position,0xff2200,2,.5);
    // 应用阶段属性
    boss.atk=boss.baseAtk*phase.atkMult;
    boss.speed=boss.baseSpd*phase.spdMult;
    boss.specInterval=phase.interval;
    boss.phaseSkills=phase.skills;
    // 阶段转换公告
    const el=document.createElement('div');el.className='kill-streak';
    el.textContent=newPhase>=boss.phases.length-1?`💀 ${boss.type.name} 进入狂暴！`:`⚠️ ${boss.type.name} 变得更强了！`;
    document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),2000);
  }
}

// ==================== 波次 ====================
function processWaves(dt){
  S.waveT+=dt;const ch=S.chapter||CHAPTERS.ch1;
  const waveDur=ch.waveDur||25;
  const bossWave=ch.id==='endless'?(S.wave%5===0):(S.wave===ch.waves);
  // BOSS波次触发：添加bossSpawning标志防止竞态
  if(bossWave&&!S.bossActive&&!S.bossSpawning&&S.waveT>2&&!S.boss){
    S.bossSpawning=true; // 标记BOSS正在生成中，阻止波次推进
    showBossWarn(ch.boss.name);
    setTimeout(()=>{if(gameActive){spawnBoss(ch.boss);S.bossSpawning=false}else{S.bossSpawning=false}},2500)
  }
  // 使用副本自定义的刷怪参数
  const spawnBase=ch.spawnBase||1.5;
  const spawnScale=ch.spawnScalePerWave||0.12;
  const maxEn=ch.maxEnemies||30;
  const batchMin=ch.batchMin||2;
  const batchMax=ch.batchMax||6;
  const rate=Math.max(.20,spawnBase-S.wave*spawnScale); // ↓ 下限0.20s，后期刷怪更密
  const max=Math.min(maxEn,15+S.wave*4); // ↑ *3→*4 最大怪物数增长更快
  spawnTimer-=dt;if(spawnTimer<=0&&S.enemies.length<max){
    spawnTimer=rate;
    const n=Math.min(batchMin+Math.floor(S.wave*0.8),batchMax); // ↑ 每批次数量增加更快
    for(let i=0;i<n;i++)spawnEnemy()}
  // 波次推进：BOSS波不能靠时间推进，必须靠击杀BOSS；同时bossSpawning期间也不推进
  if(S.waveT>=waveDur&&!S.bossActive&&!S.bossSpawning&&!bossWave){S.wave++;S.waveT=0;announceWaveEnhanced(S.wave);if(S.wave>PD.maxWave)PD.maxWave=S.wave}
}
function showBossWarn(name){const el=document.getElementById('boss-warning');document.getElementById('boss-warning-name').textContent=name;el.classList.add('active');if(SFX.bossWarn)SFX.bossWarn();setTimeout(()=>el.classList.remove('active'),2500)}
// 保留旧接口兼容
function announceWave(n){announceWaveEnhanced(n)}

// ==================== 英雄被动系统 ====================
function processPassives(dt){
  if(!heroMesh)return;
  const hero=PD.selectedHero;const hp=heroMesh.position;
  // 🏹 猎人被动：兽王 — 每30秒召唤野兽助战15秒
  if(hero==='hunter'){
    S.passiveTimers.beastmaster=(S.passiveTimers.beastmaster||0)+dt;
    if(S.passiveTimers.beastmaster>=30){
      S.passiveTimers.beastmaster=0;
      const beastDmg=S.attack*0.6;const beastDur=15;
      // 简化实现：每2秒对最近敌人造成伤害，持续15秒
      for(let tick=0;tick<Math.floor(beastDur/2);tick++){
        setTimeout(()=>{if(!gameActive||!heroMesh)return;
          const t=nearest(heroMesh.position,12);
          if(t&&t.hp>0){dmgEnemy(t,beastDmg,{noCrit:true});explosion(t.mesh.position,0x44aa44,3)}
        },tick*2000)}
      // 视觉反馈
      aoeEffect(hp,2,0x44aa44,.5);
      const el=document.createElement('div');el.className='kill-streak';el.textContent='🐺 野兽召唤！';
      document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1200);
    }
  }
  // 🌊 萨满被动：图腾 — 每20秒自动放置图腾(火/水/风轮替)
  if(hero==='shaman'){
    S.passiveTimers.totemic=(S.passiveTimers.totemic||0)+dt;
    if(S.passiveTimers.totemic>=20){
      S.passiveTimers.totemic=0;
      const type=S.passiveStacks.totemType%3;
      S.passiveStacks.totemType++;
      const totemPos=hp.clone();
      const totemDur=12;const totemR=4;
      if(type===0){
        // 火焰图腾：每秒对范围内敌人造成伤害
        aoeEffect(totemPos,totemR,0xff4400,.5);
        for(let tick=0;tick<totemDur;tick++)setTimeout(()=>{if(!gameActive)return;
          aoeEffect(totemPos,totemR*.5,0xff4400,.2);
          S.enemies.forEach(e=>{if(e.hp>0&&e.mesh.position.distanceTo(totemPos)<totemR)dmgEnemy(e,S.attack*0.15,{noCrit:true,isFireDmg:true})})},tick*1000);
      }else if(type===1){
        // 治疗图腾：每秒回血
        aoeEffect(totemPos,totemR,0x44ff44,.5);
        for(let tick=0;tick<totemDur;tick++)setTimeout(()=>{if(!gameActive||!heroMesh)return;
          if(heroMesh.position.distanceTo(totemPos)<totemR)S.hp=Math.min(S.maxHp,S.hp+S.maxHp*0.01)},tick*1000);
      }else{
        // 风暴图腾：每2秒对范围敌人释放闪电
        aoeEffect(totemPos,totemR,0x44aaff,.5);
        for(let tick=0;tick<Math.floor(totemDur/2);tick++)setTimeout(()=>{if(!gameActive)return;
          const targets=S.enemies.filter(e=>e.hp>0&&e.mesh.position.distanceTo(totemPos)<totemR*1.5);
          if(targets.length>0){const t=targets[Math.floor(Math.random()*targets.length)];
            lightningBolt(totemPos,t.mesh.position,0x44aaff,.04,5);dmgEnemy(t,S.attack*0.25,{noCrit:true})}},tick*2000);
      }
    }
  }
  // 🛡️ 圣骑士被动：神圣护盾 — 每25秒获得护盾(吸收15%MaxHP)
  if(hero==='paladin'){
    S.passiveTimers.divineProtect=(S.passiveTimers.divineProtect||0)+dt;
    if(S.passiveTimers.divineProtect>=25&&S.passiveStacks.divineShield<=0){
      S.passiveTimers.divineProtect=0;
      S.passiveStacks.divineShield=S.maxHp*0.15;
      aoeEffect(hp,2,0xffdd44,.5);
      const el=document.createElement('div');el.className='kill-streak';el.textContent='🛡️ 神圣护盾！';
      document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1000);
    }
  }
  // 装备特效：生命宝石 — 每秒回复0.3%MaxHP
  if(S.equipEffects.regen){
    S.hp=Math.min(S.maxHp,S.hp+S.maxHp*0.003*dt);
  }
  // ===== 天赋持续回血 =====
  const tb=S.talentBonus||{};
  if(tb.regen>0){
    S.hp=Math.min(S.maxHp,S.hp+S.maxHp*tb.regen*dt);
  }
  // ===== 局内BUFF: 持续回血 =====
  const _bfP=S.buffStats||{};
  if(_bfP.hpRegen>0){
    S.hp=Math.min(S.maxHp,S.hp+S.maxHp*_bfP.hpRegen*dt);
  }
}

// ==================== 输入系统 ====================
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false});

// ==================== 虚拟摇杆 ====================
const joystick={active:false,startX:0,startY:0,dx:0,dy:0,touchId:null};
const jBase=document.getElementById('joystick-base');
const jStick=document.getElementById('joystick-stick');
const jZone=document.getElementById('joystick-zone');

function handleJoystickStart(e){
  e.preventDefault();
  const touch=e.changedTouches?e.changedTouches[0]:e;
  joystick.active=true;
  joystick.touchId=touch.identifier||0;
  joystick.startX=touch.clientX;
  joystick.startY=touch.clientY;
  jBase.style.display='block';
  jBase.style.left=(touch.clientX-60)+'px';
  jBase.style.top=(touch.clientY-60)+'px';
  jStick.style.transform='translate(0,0)';
}
function handleJoystickMove(e){
  e.preventDefault();
  if(!joystick.active)return;
  const touches=e.changedTouches?e.changedTouches:null;
  let touch=null;
  if(touches){
    for(let i=0;i<touches.length;i++){if(touches[i].identifier===joystick.touchId){touch=touches[i];break}}
    if(!touch)return;
  }else{touch=e;}
  const dx=touch.clientX-joystick.startX;
  const dy=touch.clientY-joystick.startY;
  const dist=Math.sqrt(dx*dx+dy*dy);
  const maxDist=50;
  const clampDist=Math.min(dist,maxDist);
  const angle=Math.atan2(dy,dx);
  joystick.dx=(clampDist/maxDist)*Math.cos(angle);
  joystick.dy=(clampDist/maxDist)*Math.sin(angle);
  const dispX=clampDist*Math.cos(angle);
  const dispY=clampDist*Math.sin(angle);
  jStick.style.transform=`translate(${dispX}px,${dispY}px)`;
}
function handleJoystickEnd(e){
  e.preventDefault();
  if(!joystick.active)return;
  const touches=e.changedTouches;
  if(touches){
    let found=false;
    for(let i=0;i<touches.length;i++){if(touches[i].identifier===joystick.touchId){found=true;break}}
    if(!found)return;
  }
  joystick.active=false;
  joystick.dx=0;
  joystick.dy=0;
  joystick.touchId=null;
  jBase.style.display='none';
  jStick.style.transform='translate(0,0)';
}

if(jZone){
  jZone.addEventListener('touchstart',handleJoystickStart,{passive:false});
  jZone.addEventListener('touchmove',handleJoystickMove,{passive:false});
  jZone.addEventListener('touchend',handleJoystickEnd,{passive:false});
  jZone.addEventListener('touchcancel',handleJoystickEnd,{passive:false});
  // 鼠标模拟（PC端也可以用鼠标操控）
  jZone.addEventListener('mousedown',handleJoystickStart);
  window.addEventListener('mousemove',e=>{if(joystick.active)handleJoystickMove(e)});
  window.addEventListener('mouseup',handleJoystickEnd);
}

function processInput(){
  let dx=0,dz=0;
  // 键盘输入
  if(keys.w||keys.arrowup)dz=-1;if(keys.s||keys.arrowdown)dz=1;
  if(keys.a||keys.arrowleft)dx=-1;if(keys.d||keys.arrowright)dx=1;
  // 虚拟摇杆输入
  if(joystick.active){
    dx+=joystick.dx;
    dz+=joystick.dy;
  }
  const len=Math.sqrt(dx*dx+dz*dz);
  if(len>0)S.moveDir.set(dx/len,dz/len);else S.moveDir.set(0,0);
}

// ==================== 属性变化浮字 ====================
function showStatChangeFloat(text,type){
  const el=document.createElement('div');
  el.className='stat-change-float '+(type||'buff');
  el.textContent=text;
  el.style.left='70px';el.style.top='90px';
  document.getElementById('game-screen').appendChild(el);
  setTimeout(()=>el.remove(),1600);
}

// ==================== HUD ====================
function updateHUD(){
  document.getElementById('hp-bar').style.width=(S.hp/S.maxHp*100)+'%';document.getElementById('hp-text').textContent=`${Math.round(S.hp)}/${Math.round(S.maxHp)}`;
  document.getElementById('xp-bar').style.width=(S.xp/S.xpNeed*100)+'%';document.getElementById('xp-text').textContent=`${S.xp}/${S.xpNeed}`;
  document.getElementById('hud-level').textContent=S.level;document.getElementById('kill-count').textContent=S.kills;document.getElementById('gold-count').textContent=S.gold;document.getElementById('wave-num').textContent=S.wave;
  const m=Math.floor(gameTime/60),s=Math.floor(gameTime%60);document.getElementById('time-count').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  // 战斗属性指标
  const atkEl=document.getElementById('hcs-atk');if(atkEl)atkEl.textContent=Math.round(S.attack);
  const critEl=document.getElementById('hcs-crit');if(critEl)critEl.textContent=(S.critRate*100).toFixed(1)+'%';
  const armorEl=document.getElementById('hcs-armor');if(armorEl)armorEl.textContent=Math.round(S.armor);
  const spdEl=document.getElementById('hcs-spd');if(spdEl)spdEl.textContent=S.speed.toFixed(1);
  // 属性变化量(delta)
  if(S.initialAtk!==undefined){
    const ad=document.getElementById('hcs-atk-d');if(ad){const d=Math.round(S.attack-S.initialAtk);ad.textContent=d>0?'+'+d:'';ad.className='hcs-delta'+(d<0?' negative':'')}
    const cd=document.getElementById('hcs-crit-d');if(cd){const d=S.critRate-S.initialCrit;cd.textContent=d>0.001?'+'+(d*100).toFixed(1)+'%':'';cd.className='hcs-delta'+(d<0?' negative':'')}
    const ard=document.getElementById('hcs-armor-d');if(ard){const d=Math.round(S.armor-S.initialArmor);ard.textContent=d>0?'+'+d:'';ard.className='hcs-delta'+(d<0?' negative':'')}
    const sd=document.getElementById('hcs-spd-d');if(sd){const d=S.speed-S.initialSpd;sd.textContent=d>0.01?'+'+d.toFixed(1):'';sd.className='hcs-delta'+(d<0?' negative':'')}
  }
  // === 实时DPS迷你面板 ===
  updateMiniDps();
  // === 技能栏CD刷新 + 每3秒全量重建(更新DPS排序) ===
  if(!window._lastSkillBarRebuild)window._lastSkillBarRebuild=0;
  if(gameTime-window._lastSkillBarRebuild>=3){window._lastSkillBarRebuild=gameTime;updateSkillBar()}
  else{updateSkillBarCD()}
}
// ==================== 实时DPS迷你面板 ====================
let _dpsPanel=null,_dpsPanelOpen=true;
function updateMiniDps(){
  if(!_dpsPanel){
    _dpsPanel=document.createElement('div');_dpsPanel.id='hud-mini-dps';_dpsPanel.className='hud-mini-dps';
    _dpsPanel.innerHTML=`<div class="mdps-header" id="mdps-toggle"><span class="mdps-title">📊 DPS</span><span class="mdps-total" id="mdps-total">0</span><span class="mdps-arrow" id="mdps-arrow">▼</span></div><div class="mdps-body" id="mdps-body"></div>`;
    const hudEl=document.getElementById('game-hud');if(hudEl)hudEl.appendChild(_dpsPanel);
    document.getElementById('mdps-toggle').onclick=function(){_dpsPanelOpen=!_dpsPanelOpen;
      document.getElementById('mdps-body').style.display=_dpsPanelOpen?'block':'none';
      document.getElementById('mdps-arrow').textContent=_dpsPanelOpen?'▼':'▶';
    };
  }
  const totalDps=gameTime>0?(dmgStats.total/gameTime):0;
  const el=document.getElementById('mdps-total');
  if(el)el.textContent=totalDps>=1000?(totalDps/1000).toFixed(1)+'k':Math.round(totalDps);
  const body=document.getElementById('mdps-body');if(!body||!_dpsPanelOpen)return;
  // 构建排序的技能DPS列表
  const entries=[];
  if(dmgStats.basicAtkDmg>0){entries.push({name:'普攻',icon:'⚔️',dps:gameTime>0?dmgStats.basicAtkDmg/gameTime:0})}
  S.skills.forEach(s=>{const d=dmgStats.skillDmg[s.name]||0;if(d>0)entries.push({name:s.name,icon:s.icon,dps:gameTime>0?d/gameTime:0})});
  S.comboSkills.forEach(cid=>{const c=SKILL_COMBOS.find(x=>x.id===cid);if(c){const d=dmgStats.skillDmg[c.name]||0;if(d>0)entries.push({name:c.name,icon:c.icon,dps:gameTime>0?d/gameTime:0})}});
  entries.sort((a,b)=>b.dps-a.dps);
  const maxDps=entries.length>0?entries[0].dps:1;
  let html='';
  entries.slice(0,5).forEach((e,i)=>{
    const pct=Math.max(3,e.dps/maxDps*100);
    const colors=['#ff8c00','#c9a44a','#44ddff','#44ff88','#a335ee'];
    const dpsTxt=e.dps>=1000?(e.dps/1000).toFixed(1)+'k':Math.round(e.dps);
    const contribution=totalDps>0?Math.round(e.dps/totalDps*100):0;
    html+=`<div class="mdps-row"><span class="mdps-icon">${e.icon}</span><div class="mdps-bar-wrap"><div class="mdps-bar" style="width:${pct}%;background:${colors[i%5]}"></div></div><span class="mdps-val">${dpsTxt}<small class="mdps-pct">${contribution}%</small></span></div>`;
  });
  body.innerHTML=html;
}

// ==================== 结算 ====================
function showResult(victory){
  gameActive=false;if(SFX.stopBgm)SFX.stopBgm();
  if(victory&&SFX.victory)SFX.victory();
  const sc=document.getElementById('result-screen'),tt=document.getElementById('result-title');
  tt.textContent=victory?'🏆 通关成功！':'💀 英雄倒下了...';tt.className='result-title '+(victory?'victory':'defeat');
  const bh=document.getElementById('result-boss-hint');
  if(!victory&&S.boss)bh.textContent=`距击败${S.boss.type.name}仅剩 ${Math.max(1,Math.round(S.boss.hp/S.boss.maxHp*100))}%！`;else bh.textContent='';
  const m=Math.floor(gameTime/60),s=Math.floor(gameTime%60);const mul=(!PD.firstWinToday&&victory)?3:1;
  // 天赋奖励加成
  const talentBonus=SYS.calcTalentBonus(PD);
  const goldMult=1+(talentBonus.goldBonus||0);
  const xpMult=1+(talentBonus.xpBonus||0);
  // 奖励公式：基础金币(副本配置or局内收集) + 击杀奖励 + 波次奖励 + 精英击杀奖励
  const chReward=victory&&S.chapter?S.chapter.reward:{gold:0,xp:0,frags:0};
  const killGold=S.gold; // 局内已收集金币
  const waveBonus=S.wave*10;
  const eliteBonus=S.eliteKills*15;
  const gr=Math.round((killGold+chReward.gold+waveBonus+eliteBonus)*mul*goldMult);
  const xpReward=Math.round((S.kills*3+S.wave*20+S.level*10+chReward.xp)*mul*xpMult);
  // 碎片：专属碎片(绑定当前英雄) + 通用碎片(用于强化)
  const heroFrags=Math.max(chReward.frags,Math.floor(S.kills/25));
  const universalFrags=Math.max(1,Math.floor(S.kills/40))+Math.floor(S.wave/3);
  // 英雄经验（用于永久等级）
  const heroXp=Math.round((S.kills*2+S.wave*15+S.level*8+(victory?50:0))*mul);
  
  // 结算统计
  // 清理上次残留的动态元素
  const scrollBody=document.getElementById('result-scroll-body');
  scrollBody.querySelectorAll('.result-growth,.result-dps-wrap,.result-levelup,.result-stuck-guide').forEach(el=>el.remove());
  scrollBody.scrollTop=0;
  
  document.getElementById('result-stats').innerHTML=`<div class="result-stat"><div class="result-stat-value">${S.kills}</div><div class="result-stat-label">消灭怪物</div></div><div class="result-stat"><div class="result-stat-value">${S.level}</div><div class="result-stat-label">达到等级</div></div><div class="result-stat"><div class="result-stat-value">${m}:${String(s).padStart(2,'0')}</div><div class="result-stat-label">存活时间</div></div><div class="result-stat"><div class="result-stat-value">第${S.wave}波</div><div class="result-stat-label">最高波次</div></div>${S.eliteKills>0?`<div class="result-stat"><div class="result-stat-value">${S.eliteKills}</div><div class="result-stat-label">精英击杀</div></div>`:''}`;
  
  // ===== 属性成长摘要（紧凑行内模式） =====
  if(S.initialAtk!==undefined){
    const atkGain=Math.round(S.attack-S.initialAtk);
    const hpGain=Math.round(S.maxHp-S.initialHp);
    const critGain=S.critRate-S.initialCrit;
    const armorGain=Math.round(S.armor-S.initialArmor);
    const spdGain=S.speed-S.initialSpd;
    if(atkGain>0||hpGain>0||critGain>0.001||armorGain>0||spdGain>0.01){
      const growthDiv=document.createElement('div');growthDiv.className='result-growth';
      let gh=`<div class="rg-title">📈 本局属性成长</div>`;
      if(atkGain>0)gh+=`<div class="rg-row"><span class="rg-label"><span class="rg-icon">⚔️</span>攻击</span><span class="rg-vals"><span class="rg-init">${S.initialAtk}</span><span class="rg-arrow">→</span><span class="rg-final">${Math.round(S.attack)}</span><span class="hcs-delta">+${atkGain}</span></span></div>`;
      if(hpGain>0)gh+=`<div class="rg-row"><span class="rg-label"><span class="rg-icon">❤️</span>生命</span><span class="rg-vals"><span class="rg-init">${S.initialHp}</span><span class="rg-arrow">→</span><span class="rg-final">${Math.round(S.maxHp)}</span><span class="hcs-delta">+${hpGain}</span></span></div>`;
      if(critGain>0.001)gh+=`<div class="rg-row"><span class="rg-label"><span class="rg-icon">💥</span>暴击</span><span class="rg-vals"><span class="rg-init">${(S.initialCrit*100).toFixed(1)}%</span><span class="rg-arrow">→</span><span class="rg-final">${(S.critRate*100).toFixed(1)}%</span><span class="hcs-delta">+${(critGain*100).toFixed(1)}%</span></span></div>`;
      if(armorGain>0)gh+=`<div class="rg-row"><span class="rg-label"><span class="rg-icon">🛡️</span>护甲</span><span class="rg-vals"><span class="rg-init">${S.initialArmor}</span><span class="rg-arrow">→</span><span class="rg-final">${Math.round(S.armor)}</span><span class="hcs-delta">+${armorGain}</span></span></div>`;
      if(spdGain>0.01)gh+=`<div class="rg-row"><span class="rg-label"><span class="rg-icon">👟</span>速度</span><span class="rg-vals"><span class="rg-init">${S.initialSpd.toFixed(1)}</span><span class="rg-arrow">→</span><span class="rg-final">${S.speed.toFixed(1)}</span><span class="hcs-delta">+${spdGain.toFixed(1)}</span></span></div>`;
      // 来源说明
      if(S.growthLog){
        const g=S.growthLog;const sources=[];
        if(g.levelAtk>0||g.levelHp>0)sources.push(`升级(Lv.${S.level}): ⚔+${g.levelAtk.toFixed(1)} ❤+${g.levelHp}`);
        if(g.eventAtk>0||g.eventHp>0||g.eventCrit>0||g.eventArmor>0||g.eventSpd>0)sources.push('事件: '+(g.eventAtk>0?'⚔+'+g.eventAtk+' ':'')+(g.eventCrit>0?'💥+'+(g.eventCrit*100).toFixed(0)+'% ':'')+(g.eventArmor>0?'🛡+'+g.eventArmor:''));
        if(g.lootAtk>0||g.lootHp>0||g.lootCrit>0||g.lootArmor>0||g.lootSpd>0)sources.push('战利品: '+(g.lootAtk>0?'⚔+'+g.lootAtk+' ':'')+(g.lootCrit>0?'💥+'+(g.lootCrit*100).toFixed(0)+'% ':'')+(g.lootArmor>0?'🛡+'+g.lootArmor:''));
        if(sources.length>0)gh+=`<div class="rg-sources">${sources.join(' · ')}</div>`;
      }
      growthDiv.innerHTML=gh;
      scrollBody.appendChild(growthDiv);
    }
  }
  // ===== 局内BUFF汇总 =====
  if(S.buffs&&S.buffs.length>0){
    const buffDiv=document.createElement('div');buffDiv.className='result-growth';
    let bh='<div class="rg-title" style="color:#44ddff">⬆ 局内增益</div>';
    S.buffs.forEach(b=>{
      const valStr=b.stat==='armor'?`+${(b.val*b.stacks)}`:`+${(b.val*b.stacks*100).toFixed(0)}%`;
      bh+=`<div class="rg-row"><span class="rg-label"><span class="rg-icon">${b.icon}</span>${b.name}</span><span class="rg-vals"><span style="color:${b.color}">×${b.stacks} ${valStr}</span></span></div>`;
    });
    buffDiv.innerHTML=bh;
    scrollBody.appendChild(buffDiv);
  }
  // 奖励展示
  const heroName=ALL_HEROES[PD.selectedHero].name;
  const curHeroLv=(PD.heroes[PD.selectedHero]||{}).level||1;
  document.getElementById('result-rewards').innerHTML=`
    ${mul>1?'<div style="width:100%;text-align:center;color:#44ff44;font-size:12px;margin-bottom:4px">🎯 今日首胜 ×3倍奖励！</div>':''}
    <div class="reward-item"><div class="reward-icon">💰</div><div class="reward-text">${gr}金币${goldMult>1?`<span class="reward-bonus">×${goldMult.toFixed(1)}</span>`:''}</div></div>
    <div class="reward-item"><div class="reward-icon">⬆️</div><div class="reward-text">${heroXp} 经验</div></div>
    <div class="reward-item"><div class="reward-icon">🧩</div><div class="reward-text">${heroFrags} 碎片</div></div>
    <div class="reward-item"><div class="reward-icon">🔧</div><div class="reward-text">${universalFrags} 通碎</div></div>`;
  
  // 插入DPS伤害统计图表
  const dpsChartHtml=renderDpsChart();
  const dpsContainer=document.createElement('div');dpsContainer.className='result-dps-wrap';dpsContainer.style.width='100%';dpsContainer.style.maxWidth='380px';dpsContainer.innerHTML=dpsChartHtml;
  scrollBody.appendChild(dpsContainer);
  document.getElementById('btn-revive').classList.toggle('show',!victory&&!S.revived);
  
  // ========== 写入存档 ==========
  PD.gold+=gr;PD.totalGames++;PD.dailyProgress.games=(PD.dailyProgress.games||0)+1;
  // 英雄专属碎片
  const hd=PD.heroes[PD.selectedHero];
  if(hd){hd.frags=(hd.frags||0)+heroFrags}
  // 通用碎片
  PD.totalFrags=(PD.totalFrags||0)+universalFrags;
  // 英雄经验 → 永久等级
  const leveledUp=SYS.addHeroXp(PD, PD.selectedHero, heroXp);
  if(leveledUp){
    const newLv=(PD.heroes[PD.selectedHero]||{}).level||1;
    const bonus=calcHeroLevelBonus(newLv);
    // 在奖励区域追加升级提示
    const lvUpDiv=document.createElement('div');lvUpDiv.className='result-levelup';
    lvUpDiv.innerHTML=`<div class="rlv-icon">⬆️</div><div class="rlv-text">${heroName} 升至 Lv.${newLv}！<br><span class="rlv-bonus">攻击+${bonus.atk} 生命+${bonus.hp}</span></div>`;
    scrollBody.appendChild(lvUpDiv);
  }
  
  if(victory){PD.firstWinToday=true;if(S.chapter){PD.chapters[S.chapter.id]={unlocked:true,stars:3,cleared:true};
    const next={ch1:'ch2',ch2:'ch3',ch3:'ch4',ch4:'ch5',ch5:'ch6',ch6:'ch7'}[S.chapter.id];if(next&&!PD.chapters[next])PD.chapters[next]={unlocked:true,stars:0,cleared:false}}
    PD.consecutiveFails=0; // 通关重置失败计数
  }else{
    // 失败计数
    PD.consecutiveFails=(PD.consecutiveFails||0)+1;
    PD.lastFailChapter=S.chapter?S.chapter.id:'';
    // 卡关引导（连续失败≥2次）
    if(PD.consecutiveFails>=STUCK_GUIDE.FAIL_THRESHOLD){
      const guides=SYS.renderStuckGuide(PD,PD.lastFailChapter);
      if(guides.length>0){
        const guideDiv=document.createElement('div');guideDiv.className='result-stuck-guide';
        let guideHtml='<div class="rsg-title">💡 变强建议</div><div class="rsg-items">';
        guides.slice(0,3).forEach(g=>{
          guideHtml+=`<div class="rsg-item" onclick="backToMenu();setTimeout(()=>openPanel('${g.action}'),300)"><span class="rsg-icon">${g.icon}</span><div class="rsg-info"><div class="rsg-label">${g.label}</div><div class="rsg-desc">${g.desc}</div></div><span class="rsg-arrow">→</span></div>`;
        });
        guideHtml+='</div>';
        guideDiv.innerHTML=guideHtml;
        scrollBody.appendChild(guideDiv);
      }
    }
  }
  PD.bpXp=(PD.bpXp||0)+S.kills+S.wave*10;while(PD.bpXp>=100&&PD.bpLevel<50){PD.bpXp-=100;PD.bpLevel++}
  const quotes=["真正的英雄永不放弃 — 瓦里安","为了联盟！— 安度因","为了部落！— 沃金","我没有梦想只有意志 — 伊利丹"];
  document.getElementById('result-quote').textContent=quotes[Math.floor(Math.random()*quotes.length)];
  sc.classList.add('active');save();
}

// ==================== 音效控制 ====================
window.toggleSound=function(){
  if(!SFX.setMuted)return;
  const muted=!SFX.isMuted();SFX.setMuted(muted);
  const btn=document.getElementById('hud-sound-btn');
  if(btn){btn.textContent=muted?'🔇':'🔊';btn.classList.toggle('muted',muted)}
};
window.setSfxVolume=function(v){
  const vol=parseInt(v)/100;if(SFX.setSfxVol)SFX.setSfxVol(vol);
  const el=document.getElementById('sfx-vol-val');if(el)el.textContent=Math.round(v);
};
window.setBgmVolume=function(v){
  const vol=parseInt(v)/100;if(SFX.setBgmVol)SFX.setBgmVol(vol);
  const el=document.getElementById('bgm-vol-val');if(el)el.textContent=Math.round(v);
};

// ==================== 游戏控制 ====================
window.togglePause=function(){if(!gameActive)return;gamePaused=!gamePaused;
  document.getElementById('pause-panel').classList.toggle('active',gamePaused);
  if(gamePaused){
    const pk=document.getElementById('pause-kills');if(pk)pk.textContent=S.kills;
    const pw=document.getElementById('pause-wave');if(pw)pw.textContent=S.wave;
    const pt=document.getElementById('pause-time');if(pt){const m=Math.floor(gameTime/60);const s=Math.floor(gameTime%60);pt.textContent=m+':'+String(s).padStart(2,'0')}
    // ===== 渲染详细面板 =====
    const detail=document.getElementById('pause-detail');
    if(detail){
      let html='';
      // --- 属性详情 ---
      const atkDelta=Math.round(S.attack-(S.initialAtk||S.attack));
      const hpDelta=Math.round(S.maxHp-(S.initialHp||S.maxHp));
      const critDelta=S.critRate-(S.initialCrit||S.critRate);
      const armorDelta=Math.round(S.armor-(S.initialArmor||S.armor));
      const spdDelta=S.speed-(S.initialSpd||S.speed);
      html+=`<div class="pause-section"><div class="pause-section-title">📊 当前属性</div><div class="pause-attr-grid">
        <div class="pause-attr"><span class="pa-icon">⚔️</span><span class="pa-label">攻击</span><span class="pa-val">${Math.round(S.attack)}</span>${atkDelta>0?`<span class="pa-delta">+${atkDelta}</span>`:''}</div>
        <div class="pause-attr"><span class="pa-icon">❤️</span><span class="pa-label">生命</span><span class="pa-val">${Math.round(S.maxHp)}</span>${hpDelta>0?`<span class="pa-delta">+${hpDelta}</span>`:''}</div>
        <div class="pause-attr"><span class="pa-icon">💥</span><span class="pa-label">暴击</span><span class="pa-val">${(S.critRate*100).toFixed(1)}%</span>${critDelta>0.001?`<span class="pa-delta">+${(critDelta*100).toFixed(1)}%</span>`:''}</div>
        <div class="pause-attr"><span class="pa-icon">🛡️</span><span class="pa-label">护甲</span><span class="pa-val">${Math.round(S.armor)}</span>${armorDelta>0?`<span class="pa-delta">+${armorDelta}</span>`:''}</div>
        <div class="pause-attr"><span class="pa-icon">👟</span><span class="pa-label">速度</span><span class="pa-val">${S.speed.toFixed(1)}</span>${spdDelta>0.01?`<span class="pa-delta">+${spdDelta.toFixed(1)}</span>`:''}</div>
        <div class="pause-attr"><span class="pa-icon">💀</span><span class="pa-label">暴伤</span><span class="pa-val">×${S.critDmg.toFixed(1)}</span></div>
      </div></div>`;
      // --- 成长来源 ---
      if(S.growthLog){
        const g=S.growthLog;const hasGrowth=(g.levelAtk+g.eventAtk+g.lootAtk+g.levelHp+g.eventHp+g.lootHp)>0;
        if(hasGrowth){
          html+=`<div class="pause-section"><div class="pause-section-title">📈 本局成长来源</div><div style="font-size:11px;color:#b8a88c;line-height:1.6">`;
          if(g.levelAtk>0||g.levelHp>0)html+=`<div>📊 升级(Lv.${S.level})：${g.levelAtk>0?'⚔+'+g.levelAtk.toFixed(1)+' ':''}${g.levelHp>0?'❤+'+g.levelHp+' ':''}${g.levelCrit>0?'💥+'+(g.levelCrit*100).toFixed(0)+'%':''}</div>`;
          if(g.eventAtk>0||g.eventHp>0||g.eventSpd>0||g.eventCrit>0||g.eventArmor>0)html+=`<div>🏛️ 事件/神龛：${g.eventAtk>0?'⚔+'+g.eventAtk+' ':''}${g.eventHp>0?'❤+'+g.eventHp+' ':''}${g.eventSpd>0?'👟+'+g.eventSpd.toFixed(1)+' ':''}${g.eventCrit>0?'💥+'+(g.eventCrit*100).toFixed(0)+'% ':''}${g.eventArmor>0?'🛡+'+g.eventArmor:''}</div>`;
          if(g.lootAtk>0||g.lootHp>0||g.lootSpd>0||g.lootCrit>0||g.lootArmor>0)html+=`<div>📦 战利品：${g.lootAtk>0?'⚔+'+g.lootAtk+' ':''}${g.lootHp>0?'❤+'+g.lootHp+' ':''}${g.lootSpd>0?'👟+'+g.lootSpd.toFixed(1)+' ':''}${g.lootCrit>0?'💥+'+(g.lootCrit*100).toFixed(0)+'% ':''}${g.lootArmor>0?'🛡+'+g.lootArmor:''}</div>`;
          html+=`</div></div>`;
        }
      }
      // --- 技能列表(按DPS排序) ---
      if(S.skills&&S.skills.length>0){
        const totalDps=gameTime>0?(dmgStats.total/gameTime):0;
        // 按DPS降序排序
        const sorted=S.skills.map(sk=>{
          const d=dmgStats.skillDmg[sk.name]||0;const dps=gameTime>0?d/gameTime:0;
          const skd=SKILL_DB.find(x=>x.id===sk.id);
          const cd=skd?calcSkillCd(skd,sk.level):0;
          const dmgPer=skd?calcSkillDmg(skd,sk.level,S.attack):0;
          return{sk,dps,totalDmg:d,cd,dmgPer};
        }).sort((a,b)=>b.dps-a.dps);
        html+=`<div class="pause-section"><div class="pause-section-title">🔮 当前技能 (${S.skills.length}) — 按DPS排序</div><div class="pause-skill-list-enhanced">`;
        sorted.forEach((item,idx)=>{
          const sk=item.sk;const dps=item.dps;const pct=totalDps>0?Math.round(dps/totalDps*100):0;
          const dpsStr=dps>=1000?(dps/1000).toFixed(1)+'k':Math.round(dps);
          const dmgStr=item.totalDmg>=1000?(item.totalDmg/1000).toFixed(1)+'k':Math.round(item.totalDmg);
          const cdLeft=skillTimers[sk.id]||0;
          const rankIcon=idx===0&&dps>0?'🥇':idx===1&&dps>0?'🥈':idx===2&&dps>0?'🥉':'';
          const cdStatus=cdLeft>0?`<span class="psi-cd-active">⏱${cdLeft.toFixed(1)}s</span>`:`<span class="psi-cd-ready">✓ 就绪</span>`;
          html+=`<div class="pause-skill-item-enhanced">
            <span class="psi-rank">${rankIcon}</span>
            <span class="psi-icon">${sk.icon}</span>
            <div class="psi-info">
              <div class="psi-top"><span class="psi-name">${sk.name}</span><span class="psi-lv">Lv.${sk.level||1}</span>${cdStatus}</div>
              <div class="psi-bottom"><span class="psi-dps">DPS:${dpsStr}</span><span class="psi-pct">${pct}%</span><span class="psi-total">总伤:${dmgStr}</span><span class="psi-cdval">CD:${item.cd.toFixed(1)}s</span></div>
              ${dps>0?`<div class="psi-bar-wrap"><div class="psi-bar" style="width:${Math.max(3,pct)}%"></div></div>`:''}
            </div>
          </div>`;
        });
        html+=`</div></div>`;
      }
      // --- 装备信息 ---
      if(S.equipEffects&&Object.keys(S.equipEffects).length>0){
        html+=`<div class="pause-section"><div class="pause-section-title">⚔️ 装备特效</div><div class="pause-equip-list">`;
        Object.keys(S.equipEffects).forEach(eff=>{
          const eq=EQUIPMENT_DB.find(e=>e.effect===eff);
          if(eq)html+=`<div class="pause-equip-item"><span class="pei-icon">${eq.icon}</span><span class="pei-name">${eq.name}</span><span class="pei-stats">${eq.effectDesc||''}</span></div>`;
        });
        html+=`</div></div>`;
      }
      // --- BUFF列表 ---
      if(S.buffs&&S.buffs.length>0){
        html+=`<div class="pause-section"><div class="pause-section-title">⬆ 增益效果 (${S.buffs.length})</div><div class="pause-buff-list">`;
        S.buffs.forEach(b=>{
          const def=BUFF_DB.find(x=>x.id===b.id);
          const valStr=b.stat==='armor'?`+${(b.val*b.stacks)}`:`+${(b.val*b.stacks*100).toFixed(0)}%`;
          html+=`<div class="pause-buff-item" style="border-left:2px solid ${b.color}"><span class="pbi-icon">${b.icon}</span><span class="pbi-name">${b.name}</span><span class="pbi-stack" style="color:${b.color}">×${b.stacks}</span><span class="pbi-val" style="color:${b.color}">${valStr}</span></div>`;
        });
        html+=`</div></div>`;
      }
      detail.innerHTML=html;
    }
  }};
window.watchAdRevive=function(){if(S.revived)return;S.revived=true;S.hp=S.maxHp;gameActive=true;document.getElementById('result-screen').classList.remove('active')};
window.watchAdDouble=function(){PD.gold+=S.gold+S.kills*2;PD.totalFrags=(PD.totalFrags||0)+2;SYS.showRewardPopup([{icon:'💰',text:`额外${S.gold+S.kills*2}金币 + 2通用碎片`}]);save()};
window.backToMenu=function(){
  gameActive=false;gamePaused=false;
  ['result-screen','boss-hp-bar','pause-panel','skill-panel'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.classList.remove('active');
  });
  document.querySelectorAll('.popup').forEach(p=>p.classList.remove('active'));
  document.getElementById('game-hud').classList.remove('active');
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('main-menu').classList.add('active');
  // 清理场景
  cleanupBattle();
  SYS.refreshMainMenu(PD);
  // 刷新心流引导系统（解锁新按钮、更新任务、更新下一步提示）
  refreshFlowSystems();
};

function cleanupBattle(){
  // 停止BGM
  if(SFX.stopBgm)SFX.stopBgm();
  // 移除所有战斗相关对象
  S.enemies.forEach(e=>{try{scene.remove(e.mesh)}catch(ex){}});
  S.projectiles.forEach(p=>{try{scene.remove(p.mesh)}catch(ex){}});
  S.particles.forEach(p=>{try{scene.remove(p.mesh)}catch(ex){}});
  S.pickups.forEach(p=>{try{scene.remove(p.mesh)}catch(ex){}});
  if(heroMesh){try{scene.remove(heroMesh)}catch(ex){}}
  heroMesh=null;
  S.enemies=[];S.projectiles=[];S.particles=[];S.pickups=[];
  S.boss=null;S.bossActive=false;S.bossSpawning=false;
  S.buffs=[];S.buffStats=null;
  // 清理BUFF HUD
  const buffBar=document.getElementById('hud-buffs');if(buffBar)buffBar.innerHTML='';
  // 清理环境粒子
  if(ambientPSystem){try{scene.remove(ambientPSystem.points)}catch(ex){}ambientPSystem=null;}
}

window.startChapterBattle=function(){
  const chId=PD.selectedChapter||'ch1';const ch=CHAPTERS[chId];if(!ch)return;
  if(PD.stamina<10){
    // 体力不足提示 + 快捷购买入口
    const popup=document.getElementById('popup-reward');
    document.getElementById('popup-reward-title').textContent='⚡ 体力不足';
    document.getElementById('popup-reward-items').innerHTML=`
      <div class="popup-item"><div class="popup-item-icon">⚡</div><div>需要10体力，当前${PD.stamina}⚡</div></div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:center">
        <button class="btn-gold" style="padding:8px 16px;font-size:13px" onclick="document.getElementById('popup-reward').classList.remove('active');openPanel('shop');setTimeout(()=>switchShopTab(null,'stamina'),100)">💰 去购买体力</button>
      </div>`;
    popup.classList.add('active');
    return}
  PD.stamina-=10;save();document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.popup').forEach(p=>p.classList.remove('active'));
  document.getElementById('main-menu').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');
  document.getElementById('game-hud').classList.add('active');
  S.chapter=ch;const cfg=ALL_HEROES[PD.selectedHero];
  const hd=PD.heroes[PD.selectedHero]||{level:1,star:0};
  // ========== 永久加成汇总 ==========
  // 1. 英雄等级加成
  const lvBonus=calcHeroLevelBonus(hd.level||1);
  // 2. 星级倍率
  const starMult=HERO_STAR.STAT_MULT[hd.star||0];
  // 3. 天赋加成
  const talentBonus=SYS.calcTalentBonus(PD);
  // 4. 装备基础属性（支持6槽位 + 职业限定 + 套装效果）
  let eqAtk=0,eqHp=0,eqSpd=0,eqCrit=0,eqArmor=0;
  const eqEffects={};
  const eqSetPieces={};// 统计套装件数
  if(PD.equipment){Object.values(PD.equipment).forEach(eq=>{if(eq){const e=EQUIPMENT_DB.find(x=>x.id===eq);if(e){
    eqAtk+=e.atk;eqHp+=e.hp;eqSpd+=e.spd;eqCrit+=(e.critRate||0);eqArmor+=(e.armor||0);
    if(e.effect)eqEffects[e.effect]=true;
    if(e.setId){eqSetPieces[e.setId]=(eqSetPieces[e.setId]||0)+1}
  }}})}
  // 套装效果
  const activeSetBonuses={};
  if(typeof SET_BONUSES!=='undefined'){Object.entries(eqSetPieces).forEach(([setId,count])=>{
    const sb=SET_BONUSES[setId];
    if(sb&&sb.bonus2&&count>=2){activeSetBonuses[setId]=sb.bonus2;
      // 套装属性加成
      if(sb.bonus2.atkPct)eqAtk+=Math.round(cfg.atk*sb.bonus2.atkPct);
      if(sb.bonus2.skillDmgPct)eqEffects['set_skillDmg_'+setId]=sb.bonus2.skillDmgPct;
      if(sb.bonus2.dotDmgPct)eqEffects['set_dotDmg_'+setId]=sb.bonus2.dotDmgPct;
      if(sb.bonus2.critDmgBonus)eqCrit+=0; // 暴击伤害在战斗中读取
    }
  })}
  // 5. 装备强化加成
  const enhBonus=SYS.calcEquipEnhanceBonus(PD);
  // 6. 公会BUFF加成
  let guildAtkBonus=0,guildHpBonus=0;
  if(PD.guildJoined){
    const gLv=Math.min(10,Math.floor((PD.guildContrib||0)/500)+1);
    guildAtkBonus=gLv*2;guildHpBonus=gLv*10;
  }
  // ========== 最终属性计算 ==========
  const baseAtk=Math.round((cfg.atk+lvBonus.atk)*starMult);
  const baseHp=Math.round((cfg.hp+lvBonus.hp)*starMult);
  const allPctMult=1+(talentBonus.allPct||0);
  const finalAtk=Math.round((baseAtk+eqAtk+enhBonus.atk+talentBonus.atk+guildAtkBonus)*allPctMult);
  const finalHp=Math.round((baseHp+eqHp+enhBonus.hp+talentBonus.hp+guildHpBonus)*allPctMult);
  const finalSpd=cfg.spd+eqSpd+enhBonus.spd+(talentBonus.spd||0);
  const finalCrit=NUM.CRIT_CHANCE_BASE+cfg.critRate+eqCrit+enhBonus.critRate+(talentBonus.critRate||0);
  const finalCritDmg=cfg.critDmg+(talentBonus.critDmg||0);
  const finalArmor=cfg.armor+eqArmor+enhBonus.armor+(talentBonus.armor||0);
  document.getElementById('hud-icon').textContent=cfg.icon;document.getElementById('hud-chapter-name').textContent=`第${ch.num}章 · ${ch.name}`;
  // 初始化战斗状态（使用英雄配置+装备加成+等级+星级+天赋+强化）
  Object.assign(S,{
    hp:finalHp,maxHp:finalHp,
    xp:0,xpNeed:calcXpNeed(1), // 使用S曲线公式
    level:1,kills:0,gold:0,wave:1,waveT:0,
    speed:finalSpd,
    attack:finalAtk,
    // 暴击系统：全部汇总
    critRate:finalCrit,
    critDmg:finalCritDmg,
    // 护甲系统
    armor:finalArmor,
    skills:[],enemies:[],projectiles:[],particles:[],pickups:[],
    boss:null,bossActive:false,bossSpawning:false,bossPhase:0,
    killStreak:0,ksTimer:0,bossKillsThisGame:0,revived:false,comboSkills:[],
    eliteKills:0,
    // 被动系统初始化
    passiveTimers:{
      beastmaster:0,   // 猎人召唤CD
      totemic:0,       // 萨满图腾CD
      divineProtect:0  // 圣骑士护盾CD
    },
    passiveStacks:{
      shadowNextCrit:false,  // 盗贼暗影突袭
      warcryStacks:0,        // 战神徽记层数
      divineShield:0,        // 圣骑士护盾量
      totemType:0            // 萨满图腾轮替(0=火,1=水,2=风)
    },
    // 装备特效
    equipEffects:eqEffects,
    activeSetBonuses:activeSetBonuses, // 套装效果
    atkHitCount:0,
    // DOT列表
    dots:[],
    // 天赋特殊效果存储（战斗中读取）
    talentBonus:talentBonus,
    // ===== 局内BUFF系统 =====
    buffs:[],  // 已选BUFF列表 [{id,name,icon,stacks,stat,val}]
    buffStats:{  // BUFF效果汇总（实时读取）
      xpMult:0,goldMult:0,pickupRange:0,orbValue:0,
      atkPct:0,critRate:0,critDmg:0,atkSpeed:0,skillDmg:0,
      hpPct:0,armor:0,hpRegen:0,dodge:0,
      moveSpd:0,skillCd:0,eliteDmg:0,leech:0,thorns:0,killHeal:0,aoeSize:0
    }
  });
  // ===== 保存初始属性快照（用于成长追踪） =====
  S.initialAtk=S.attack;S.initialHp=S.maxHp;S.initialSpd=S.speed;
  S.initialCrit=S.critRate;S.initialArmor=S.armor;S.initialCritDmg=S.critDmg;
  // ===== 战力差距倍率 =====
  // 当英雄战力低于推荐战力时，怪物获得额外强度加成
  // 公式: max(1, recPower/heroPower)^0.4 — 平方根缓和，不至于完全打不过
  // 例: 战力150 vs recPower 1500(10倍差距) → 怪物强度×10^0.4=2.51倍
  // 例: 战力150 vs recPower 150(无差距) → 1倍
  const heroPower=S.attack*3+S.maxHp;
  const recP=ch.recPower||heroPower;
  S.powerGapMult=Math.max(1, Math.pow(recP/Math.max(1,heroPower), 0.4));
  // 成长来源追踪
  S.growthLog={levelAtk:0,levelHp:0,levelCrit:0,eventAtk:0,eventHp:0,eventSpd:0,eventCrit:0,eventArmor:0,lootAtk:0,lootHp:0,lootSpd:0,lootCrit:0,lootArmor:0};
  // 属性分解存储（给暂停面板和结算用）
  S.atkBreakdown={base:cfg.atk,level:lvBonus.atk,star:Math.round((cfg.atk+lvBonus.atk)*starMult-(cfg.atk+lvBonus.atk)),equip:eqAtk,enhance:enhBonus.atk,talent:talentBonus.atk,guild:guildAtkBonus};
  S.hpBreakdown={base:cfg.hp,level:lvBonus.hp,star:Math.round((cfg.hp+lvBonus.hp)*starMult-(cfg.hp+lvBonus.hp)),equip:eqHp,enhance:enhBonus.hp,talent:talentBonus.hp,guild:guildHpBonus};
  S.moveDir.set(0,0);gameTime=0;baseAtkTimer=0;spawnTimer=0;Object.keys(skillTimers).forEach(k=>delete skillTimers[k]);
  // ===== 天赋开局效果 =====
  // 开战护盾: 战斗开始获得MaxHP百分比护盾
  if(talentBonus.startShield>0){
    S.passiveStacks.divineShield=(S.passiveStacks.divineShield||0)+finalHp*talentBonus.startShield;
  }
  // 攻速加成: 降低基础攻击间隔
  if(talentBonus.atkSpeed>0){
    S._baseAtkRate=ALL_HEROES[PD.selectedHero].atkRate*(1-talentBonus.atkSpeed);
  }else{
    S._baseAtkRate=ALL_HEROES[PD.selectedHero].atkRate;
  }
  // 减速抗性存储
  S._slowRes=talentBonus.slowRes||0;
  // 重置新系统状态
  _lastMilestoneStreak=0;_lastMilestoneTotalKill=0;
  rapidKillCount=0;rapidKillTimer=0;if(rapidKillEl){rapidKillEl.remove();rapidKillEl=null}
  resetDmgStats();
  eventTimer=0;eventCooldown=30;S.activeEvent=null;clearShrineMarker();hideEventBanner();
  // 清理场景
  while(scene.children.length>0)scene.remove(scene.children[0]);
  scene.add(amb);scene.add(dirLight);scene.add(dirLight.target);scene.add(ptLight);
  try{createGround(chId)}catch(e){console.error('createGround error:',e)}
  try{
    heroMesh=createHero(PD.selectedHero);
    heroMesh.position.set(0,0,0);
  }catch(e){
    console.error('createHero error:',e);
    // fallback: 创建简单的英雄模型
    heroMesh=new THREE.Group();
    const fb=new THREE.Mesh(new THREE.CapsuleGeometry(.35,.6,8,12),new THREE.MeshStandardMaterial({color:0xff4444}));
    fb.position.y=1;fb.castShadow=true;heroMesh.add(fb);
    scene.add(heroMesh);heroMesh.position.set(0,0,0);
  }
  camera.position.set(0,22,16);camera.lookAt(0,0,0);
  // ===== 开局自动获得英雄标志技能 =====
  const _sigId=cfg.signatureSkill;
  if(_sigId){
    const _sigSk=SKILL_DB.find(s=>s.id===_sigId);
    if(_sigSk){
      S.skills.push({..._sigSk,level:1});
      // 开局公告标志技能
      setTimeout(()=>{
        if(!gameActive)return;
        const el=document.createElement('div');el.className='kill-streak';
        el.textContent=`${_sigSk.icon} ${cfg.name}标志技能：${_sigSk.name}！`;
        el.style.color='#ff4466';el.style.fontSize='16px';
        document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),2000);
      },500);
    }
  }
  updateSkillBar();gameActive=true;gamePaused=false;announceWave(1);
  // 启动战斗BGM
  if(SFX.startBgm)SFX.startBgm();
  // ===== 天赋: 开局获得免费技能 =====
  if(talentBonus.freeSkill>0){
    setTimeout(()=>{if(gameActive)showSkillPanel()},1000);
  }
  renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.render(scene,camera);
};

// ==================== 面板绑定 ====================
window.openPanel=function(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.add('active');
  try{
    if(id==='sign-in')SYS.renderSignIn(PD);else if(id==='heroes')SYS.renderHeroes(PD);else if(id==='chapter-select')SYS.renderChapters(PD);
    else if(id==='forge')SYS.renderForgeWithEnhance(PD);else if(id==='arena')SYS.renderArena(PD);else if(id==='guild')SYS.renderGuild(PD);
    else if(id==='shop')SYS.renderShop(PD,'featured');else if(id==='battlepass')SYS.renderBattlePass(PD);
    else if(id==='achievements')SYS.renderAchievements(PD);else if(id==='daily-quest')SYS.renderDailyQuests(PD);
    else if(id==='lucky-draw')SYS.renderLuckyDraw(PD);else if(id==='chest-open')SYS.renderChests(PD);
    else if(id==='talent')SYS.renderTalent(PD);else if(id==='enhance')SYS.renderEnhance(PD);
    else if(id==='codex'){SYS.renderEquipCodex(PD);SYS.renderBuildRecommends(PD)}
  }catch(e){console.error('Panel render error:',id,e)}
};
window.closePanel=function(id){const el=document.getElementById(id);if(el)el.classList.remove('active')};
window.closePopup=function(id){const el=document.getElementById(id);if(el)el.classList.remove('active')};
window.doSignIn=function(){SYS.doSignIn(PD)};
window.doFirstCharge=function(){SYS.doFirstCharge(PD)};
window.buyBattlePass=function(){SYS.buyBattlePass(PD)};
window._claimBpReward=function(lv,track){SYS.claimBpReward(PD,lv,track)};
window.doLuckyDraw=function(){SYS.doLuckyDraw(PD)};
window.switchShopTab=function(el,tab){SYS.switchShopTab(PD,el,tab)};
window.watchAdArena=function(){if(PD.arenaCharges<5){PD.arenaCharges++;save();SYS.renderArena(PD)}};
window._arenaFight=function(power){SYS.arenaFight(PD,power)};
window._joinGuild=function(){const name=prompt('输入公会名称：','艾泽拉斯勇士团');if(name)SYS.joinGuild(PD,name)};
window._joinRandomGuild=function(){SYS.joinGuild(PD,'银月骑士团')};
window._guildDonate=function(){SYS.guildDonate(PD)};
window._guildRaid=function(){SYS.guildRaid(PD)};
window._guildRank=function(){SYS.guildRank(PD)};
window._guildBuff=function(){SYS.guildBuff(PD)};
window._showEquipSwap=function(slot){SYS.showEquipSwap(PD,slot)};
window._doEquipSwap=function(slot,action,eqId){SYS.doEquipSwap(PD,slot,action,eqId)};
window._claimAchieve=function(id){SYS.claimAchievement(PD,id)};
window._claimQuest=function(idx){SYS.claimQuest(PD,idx)};
// 新增养成系统事件
window._heroUpStar=function(){SYS.heroUpStar(PD)};
window._chooseTalent=function(heroId,tree,tier,id,cost){SYS.chooseTalent(PD,heroId,tree,tier,id,cost)};
window._enhanceEquip=function(eqId){SYS.enhanceEquip(PD,eqId)};
// 装备图鉴+Build推荐 事件绑定
window._codexSwitchTab=function(el,tab){
  document.querySelectorAll('.codex-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const equipContent=document.getElementById('codex-equip-content');
  const buildContent=document.getElementById('codex-build-content');
  if(equipContent)equipContent.style.display=tab==='equip'?'':'none';
  if(buildContent){buildContent.style.display=tab==='build'?'':'none';if(tab==='build')SYS.renderBuildRecommends(PD)}
};
window._codexSetFilter=function(key,val){
  if(key==='ownedOnly')window._codexFilter_ownedOnly=!!val;
  if(!window._codexFilterState)window._codexFilterState={slot:'all',rarity:'all',ownedOnly:false};
  window._codexFilterState[key]=val;
  // 更新 systems.js 中的内部过滤器状态
  if(typeof SYS._setCodexFilter==='function')SYS._setCodexFilter(key,val);
  SYS.renderEquipCodex(PD);
};
window._codexShowDetail=function(eqId){SYS.codexShowDetail(PD,eqId)};
window._buildSelectHero=function(heroId){
  SYS.renderBuildRecommends(PD,heroId);
  document.querySelectorAll('.build-hero-btn').forEach(b=>b.classList.remove('active'));
  const activeBtn=document.querySelector(`.build-hero-btn[onclick*="'${heroId}'"]`);
  if(activeBtn)activeBtn.classList.add('active');
};

// ==================== 主循环 ====================
setLoadProgress(80,'初始化游戏系统...');
const clock=new THREE.Clock();
let loopStarted=false;

function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),.05);
  if(!gameActive||gamePaused){
    if(gameActive){if(bloomComposer){try{bloomComposer.render();}catch(e){renderer.render(scene,camera);}}else{renderer.render(scene,camera);}}
    return;
  }
  try{
  gameTime+=dt;processInput();
  if(!heroMesh){if(bloomComposer){try{bloomComposer.render();}catch(e){renderer.render(scene,camera);}}else{renderer.render(scene,camera);}return;}
  heroMesh.position.x+=S.moveDir.x*S.speed*dt;heroMesh.position.z+=S.moveDir.y*S.speed*dt;
  const bd=35;heroMesh.position.x=Math.max(-bd,Math.min(bd,heroMesh.position.x));heroMesh.position.z=Math.max(-bd,Math.min(bd,heroMesh.position.z));
  if(S.moveDir.length()>.1){
    const targetY=Math.atan2(S.moveDir.x,S.moveDir.y);
    // 平滑朝向插值（处理 -PI/PI 边界）
    let diff=targetY-heroMesh.rotation.y;
    while(diff>Math.PI)diff-=Math.PI*2;
    while(diff<-Math.PI)diff+=Math.PI*2;
    heroMesh.rotation.y+=diff*Math.min(1,12*dt);
  }
  // === 英雄动画驱动 ===
  const _isMoving=S.moveDir.length()>.1;
  const _isAttacking=heroMesh.userData.anim&&heroMesh.userData.anim.attackTimer>0;
  animateHero(heroMesh,dt,_isMoving,_isAttacking);
  if(heroMesh.userData.ring){heroMesh.userData.ring.rotation.z+=dt*2;const rs=heroMesh.userData.ring.scale.x;if(rs>1)heroMesh.userData.ring.scale.setScalar(Math.max(1,rs-dt*5));heroMesh.userData.ring.material.opacity=.3+Math.sin(gameTime*4)*.1}
  if(heroMesh.userData.ringOuter){heroMesh.userData.ringOuter.rotation.z-=dt*1.2;const pulse=.08+Math.sin(gameTime*2.5)*.04;heroMesh.userData.ringOuter.material.opacity=pulse;heroMesh.userData.ringOuter.scale.setScalar(1+Math.sin(gameTime*2)*.1)}
  if(heroMesh.userData.groundGlow){heroMesh.userData.groundGlow.material.opacity=.04+Math.sin(gameTime*3)*.02}
  if(heroMesh.userData.glow)heroMesh.userData.glow.material.opacity=.05+Math.sin(gameTime*3)*.03;
  camera.position.x+=(heroMesh.position.x-camera.position.x)*3*dt;camera.position.z+=(heroMesh.position.z+16-camera.position.z)*3*dt;
  camera.lookAt(heroMesh.position.x,0,heroMesh.position.z);dirLight.position.set(heroMesh.position.x+10,20,heroMesh.position.z+10);dirLight.target.position.copy(heroMesh.position);ptLight.position.set(heroMesh.position.x,5,heroMesh.position.z);
  baseAttack(dt);processSkills(dt);processWaves(dt);
  // === 英雄被动系统 tick ===
  processPassives(dt);
  // 敌人
  for(let i=S.enemies.length-1;i>=0;i--){const e=S.enemies[i];
    // NaN防护：修复hp变成NaN的怪物
    if(e.hp!==e.hp){e.hp=0;killEnemy(e);continue}
    if(e.hp<=0)continue;
    // --- 燃烧DOT处理 ---
    if(e.burning>0){
      e.burning-=dt;
      if(e.burnDmg>0){dmgEnemy(e,e.burnDmg*dt,{noCrit:true,isDot:true})}
      // 燃烧视觉：橙色闪烁
      try{e.mesh.children.forEach(c=>{if(c.material&&c.material.emissive)c.material.emissive.setHex(0xff4400)})}catch(ex){}
      if(e.burning<=0){e.burning=0;e.burnDmg=0}
    }
    if(e.frozen>0){e.frozen-=dt;try{e.mesh.children.forEach(c=>{if(c.material&&!c.material._fc){c.material._fc=c.material.color?c.material.color.getHex():0;c.material.color&&c.material.color.setHex(0x88ccff)}})}catch(ex){};if(e.frozen<=0)try{e.mesh.children.forEach(c=>{if(c.material&&c.material._fc!==undefined){c.material.color&&c.material.color.setHex(c.material._fc);delete c.material._fc}})}catch(ex){}}
    else{const d=new THREE.Vector3().subVectors(heroMesh.position,e.mesh.position).normalize();e.mesh.position.x+=d.x*e.speed*dt;e.mesh.position.z+=d.z*e.speed*dt;e.mesh.lookAt(heroMesh.position.x,e.mesh.position.y,heroMesh.position.z)}
    // === 怪物/BOSS动画 ===
    if(e.isBoss)animateBoss(e,dt);else animateEnemy(e,dt);
    const dist=e.mesh.position.distanceTo(heroMesh.position),hd=e.isBoss?2.5:1;
    if(dist<hd){
      const tb=S.talentBonus||{};
      // 无敌状态检查（时光倒流复活后）
      if(S.passiveStacks.invincible>0){S.passiveStacks.invincible-=dt;continue}
      // ===== 天赋闪避 =====
      if(tb.dodge>0&&Math.random()<tb.dodge){if(SFX.dodge)SFX.dodge();continue} // 闪避成功，完全不受伤
      // ===== 局内BUFF: 闪避 =====
      const _bfDodge=S.buffStats||{};
      if(_bfDodge.dodge>0&&Math.random()<_bfDodge.dodge){if(SFX.dodge)SFX.dodge();continue}
      // 护甲减伤公式: reduction = armor / (armor + 20)
      const armorReduce=S.armor>0?Math.min(0.75,S.armor/(S.armor+20)):0;
      let dmgTaken=e.atk*dt*(1-armorReduce);
      // ===== 天赋格挡 =====
      if(tb.block&&tb.block.chance>0&&Math.random()<tb.block.chance){
        dmgTaken*=(1-tb.block.reduce); // 格挡减伤
      }
      // 圣骑士护盾优先吸收伤害
      if(S.passiveStacks.divineShield>0){
        if(S.passiveStacks.divineShield>=dmgTaken){S.passiveStacks.divineShield-=dmgTaken;dmgTaken=0}
        else{dmgTaken-=S.passiveStacks.divineShield;S.passiveStacks.divineShield=0}
      }
      // ===== 盾墙减伤 =====
      if(S.passiveStacks.shieldWallActive>0){dmgTaken*=(1-(S.passiveStacks.shieldWallReduction||0.50));S.passiveStacks.shieldWallActive-=dt}
      // ===== 寒冰屏障吸收 =====
      if(S.passiveStacks.iceBarrier>0){
        if(S.passiveStacks.iceBarrier>=dmgTaken){S.passiveStacks.iceBarrier-=dmgTaken;dmgTaken=0}
        else{dmgTaken-=S.passiveStacks.iceBarrier;S.passiveStacks.iceBarrier=0}
      }
      // ===== 暗影形态减伤 =====
      if(S.passiveStacks.shadowFormActive&&S.passiveStacks.shadowFormDmgRed>0){dmgTaken*=(1-S.passiveStacks.shadowFormDmgRed)}
      // ===== 反魔法护罩吸收 =====
      if(S.passiveStacks.amsAbsorb>0){
        const absAmt=Math.min(S.passiveStacks.amsAbsorb,dmgTaken);
        S.passiveStacks.amsAbsorb-=absAmt;S.passiveStacks.amsTotalAbsorbed=(S.passiveStacks.amsTotalAbsorbed||0)+absAmt;dmgTaken-=absAmt;
      }
      // ===== 天赋触发护盾（受伤>10%HP时触发, CD30s） =====
      if(tb.shield>0&&dmgTaken>S.maxHp*0.10&&!S.passiveStacks._shieldCD){
        S.passiveStacks.divineShield=(S.passiveStacks.divineShield||0)+S.maxHp*tb.shield;
        S.passiveStacks._shieldCD=true;
        aoeEffect(heroMesh.position,2.5,0x44aaff,.5);
        setTimeout(()=>{if(S.passiveStacks)S.passiveStacks._shieldCD=false},30000);
      }
      S.hp-=dmgTaken;
      // 受伤音效（每200ms最多一次）
      if(dmgTaken>0&&SFX.heroDmg){const _hnt=Date.now();if(!S._lastHitSfx||_hnt-S._lastHitSfx>200){S._lastHitSfx=_hnt;SFX.heroDmg()}}
      // 触发英雄受击动画反馈
      if(dmgTaken>0&&heroMesh&&heroMesh.userData.anim){heroMesh.userData.anim.hitFlash=0.15}
      // 荆棘术反弹（使用数据驱动参数）
      if(hasSkill('thorns')){const l=sklLv('thorns');const sk=SKILL_DB.find(s=>s.id==='thorns');
        const reflPct=sk.reflectPct+(l-1)*sk.reflectPctPerLv;
        dmgEnemy(e,(e.atk*reflPct)*dt,{noCrit:true,skillName:'荆棘术'})}
      // ===== 天赋荆棘甲反弹 =====
      if(tb.thorns>0){dmgEnemy(e,e.atk*tb.thorns*dt,{noCrit:true,skillName:'荆棘甲'})}
      // ===== 局内BUFF: 反伤 =====
      if(_bfDodge.thorns>0){dmgEnemy(e,e.atk*_bfDodge.thorns*dt,{noCrit:true,skillName:'反伤甲'})}
      // 装备特效：坚韧(板甲) — 致命伤害免死
      if(S.hp<=0&&S.equipEffects.fortify&&!S.passiveStacks.fortifyCooldown){
        S.hp=S.maxHp*0.15;S.passiveStacks.fortifyCooldown=true;
        aoeEffect(heroMesh.position,3,0xffaa00,.6);screenFlash('#ffaa00',.2,150);
        const el=document.createElement('div');el.className='kill-streak';el.textContent='🛡️ 坚韧触发！';
        document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1500);
        setTimeout(()=>{if(S.passiveStacks)S.passiveStacks.fortifyCooldown=false},30000)} // 30秒CD
      // ===== 天赋免死概率(不灭意志) =====
      if(S.hp<=0&&tb.deathSave>0&&Math.random()<tb.deathSave&&!S.passiveStacks._deathSaveUsed){
        S.hp=1;S.passiveStacks._deathSaveUsed=true;
        screenFlash('#ffffff',.3,200);
        const el2=document.createElement('div');el2.className='kill-streak';el2.textContent='💀 不灭意志！';
        document.getElementById('game-screen').appendChild(el2);setTimeout(()=>el2.remove(),1500);
      }
    }
    // 死骑被动：冰霜光环(近身怪物持续受到冰霜伤害+减速)
    if(PD.selectedHero==='deathknight'&&dist<4.5&&!e.isBoss){
      const frostAuraDmg=S.attack*0.20*dt;
      dmgEnemy(e,frostAuraDmg,{noCrit:true});
      if(e.frozen<=0)e.speed=e.speed*0.985; // 微减速
    }
    if(e.hitFlash>0){e.hitFlash-=dt;try{e.mesh.children.forEach(c=>{if(c.material&&c.material.emissive&&!e.burning)c.material.emissive.setHex(0xffffff)})}catch(ex){}}
    else if(!e.burning) try{e.mesh.children.forEach(c=>{if(c.material&&c.material.emissive)c.material.emissive.setHex(0)})}catch(ex){};
    // --- BOSS特殊攻击（阶段驱动） ---
    if(e.isBoss&&e.mesh.userData.aura){
      e.mesh.userData.aura.rotation.z+=dt*1.5;
      const interval=e.specInterval||5;
      e.specTimer=(e.specTimer||interval)-dt;
      if(e.specTimer<=0){
        e.specTimer=interval;
        const bp=e.mesh.position;
        const skills=e.phaseSkills||['charge'];
        const skill=skills[Math.floor(Math.random()*skills.length)];
        // BOSS技能执行（基于阶段技能池）
        if(skill==='charge'||skill==='frost_strike'){
          // 冲锋/冰霜打击：快速冲向英雄+AOE
          aoeEffect(bp,4,0xff2200,.6);screenShake(.08,.12);
          if(heroMesh.position.distanceTo(bp)<5)S.hp-=e.atk*0.5;
        }else if(skill==='whirlwind'||skill==='knifestorm'){
          // 旋风/刀刃风暴：大范围AOE
          aoeEffect(bp,5,0xcc4422,.8);lightBeam(bp,0xff4400,1.5,.4);screenShake(.12,.15);
          if(heroMesh.position.distanceTo(bp)<5.5)S.hp-=e.atk*0.7;
        }else if(skill==='summon_adds'){
          // 召唤小怪
          for(let j=0;j<3;j++)spawnEnemy();
        }else if(skill==='poison_nova'||skill==='fire_nova'||skill==='frost_nova'||skill==='shadow_nova'){
          // 全屏新星：大范围伤害+效果
          aoeEffect(bp,8,skill.includes('fire')?0xff4400:skill.includes('frost')?0x4488ff:skill.includes('shadow')?0x7722cc:0x44ff44,.8);
          lightBeam(bp,0xff2200,2,.5);screenShake(.15,.2);screenFlash('#ff4400',.15,150);
          if(heroMesh.position.distanceTo(bp)<9)S.hp-=e.atk*0.8;
        }else if(skill==='magma_blast'||skill==='void_bolt'||skill==='frostbolt'||skill==='soul_charge'){
          // 远程弹射
          if(heroMesh)fireProjectile(bp,heroMesh.position,0xff4400,e.atk*0.6,.3,15,{trail:'fire',trailColor:0xff2200});
        }else if(skill==='lava_pool'||skill==='defile'){
          // 地面AOE持续伤害区域
          const tgt=heroMesh?heroMesh.position.clone():bp.clone();
          aoeEffect(tgt,3,0xff4400,3);
          for(let tick=0;tick<12;tick++)setTimeout(()=>{if(!gameActive||!heroMesh)return;
            if(heroMesh.position.distanceTo(tgt)<3.5)S.hp-=e.atk*0.15},tick*250);
        }else if(skill==='rain_of_fire'){
          // 火雨：多点随机AOE
          for(let j=0;j<5;j++){const rx=(Math.random()-.5)*12,rz=(Math.random()-.5)*12;
            const rp=new THREE.Vector3(bp.x+rx,0,bp.z+rz);
            setTimeout(()=>{if(!gameActive)return;aoeEffect(rp,2,0xff4400,.5);
              if(heroMesh&&heroMesh.position.distanceTo(rp)<2.5)S.hp-=e.atk*0.3},j*300+Math.random()*200)}
        }else if(skill==='remorseless_winter'){
          // 凛冬将至：持续环形伤害
          for(let tick=0;tick<8;tick++)setTimeout(()=>{if(!gameActive||!heroMesh||!e||e.hp<=0)return;
            aoeEffect(e.mesh.position,6,0x4488ff,.3);
            if(heroMesh.position.distanceTo(e.mesh.position)<6.5)S.hp-=e.atk*0.2},tick*300);
        }else if(skill==='harvest_soul'||skill==='finger_of_death'||skill==='doom'){
          // 高伤单体技能：大伤害+震屏
          lightBeam(heroMesh?heroMesh.position:bp,0xff0000,2,.5);screenShake(.2,.25);screenFlash('#ff0000',.2,200);
          S.hp-=e.atk*1.2;
        }else if(skill==='fury_of_frostmourne'){
          // 霜之哀伤之怒：全屏大伤害
          aoeEffect(bp,15,0x4488ff,1.5);iceShatter(bp,15,20);lightBeam(bp,0x4488ff,3,1);
          screenShake(.3,.4);screenFlash('#4488ff',.3,300);
          S.hp-=e.atk*2.0;
          S.enemies.forEach(e2=>{if(!e2.isBoss&&e2.hp>0)e2.frozen=3}); // 连小怪一起冻住
        }else if(skill==='chains_of_kel'||skill==='blood_frenzy'||skill==='throw_spear'||skill==='void_eruption'){
          // 通用技能：中等伤害+视觉
          aoeEffect(bp,4,0xff4400,.6);lightBeam(bp,0xff2200,1.5,.4);screenShake(.1,.15);
          if(heroMesh.position.distanceTo(bp)<5)S.hp-=e.atk*0.6;
        }
      }
    }
    // 精英怪光环旋转
    if(e.isElite&&e.mesh.userData.eliteRing)e.mesh.userData.eliteRing.rotation.z+=dt*2;
  }
  // 弹射物（带GPU粒子拖尾）
  for(let i=S.projectiles.length-1;i>=0;i--){const p=S.projectiles[i];p.mesh.position.addScaledVector(p.dir,p.speed*dt);p.life-=dt;
    // 投射物光晕脉动（sprite）
    if(p.mesh.children&&p.mesh.children[1]){const spr=p.mesh.children[1];if(spr.material)spr.material.opacity=.4+Math.sin(gameTime*12)*.2;}
    // GPU粒子拖尾（高效！）
    p.trailTimer=(p.trailTimer||0)+dt;
    if(p.trail&&p.trailTimer>.025){p.trailTimer=0;
      const pp=p.mesh.position;const tc=p.trailColor||p.color;
      fireTrail(pp,tc);
      // 额外动态光源（低频）
      if(Math.random()<.05)addDynLight(pp,tc,.8,4,.1);
    }
    let hit=false;for(const e of S.enemies){if(e.hp<=0)continue;const dx=e.mesh.position.x-p.mesh.position.x,dz=e.mesh.position.z-p.mesh.position.z;if(Math.sqrt(dx*dx+dz*dz)<(e.isBoss?2.5:1.2)){
      const projOpts={};if(p.isSkill)projOpts.isSkill=true;if(p.skillName)projOpts.skillName=p.skillName;if(p.isFireDmg)projOpts.isFireDmg=true;if(p.isDot)projOpts.isDot=true;if(p.bonusCrit)projOpts.bonusCrit=p.bonusCrit;if(p.bonusCritDmg)projOpts.bonusCritDmg=p.bonusCritDmg;
      if(p.dmg>0)dmgEnemy(e,p.dmg,projOpts);
      // 腐蚀术DOT：命中后给范围内敌人施加持续伤害
      if(p._corruptionDot){const ep2=p.mesh.position.clone();const dotDmg=p.dmg*p._dotPct;const tks=Math.floor(p._dotDur/p._dotTickRate);
        S.enemies.forEach(e3=>{if(e3.hp>0){const dx3=e3.mesh.position.x-ep2.x,dz3=e3.mesh.position.z-ep2.z;if(Math.sqrt(dx3*dx3+dz3*dz3)<2){
          e3.cursed=true;for(let ti=0;ti<tks;ti++)setTimeout(()=>{if(e3.hp>0){dmgEnemy(e3,dotDmg/tks,{noCrit:true,isDot:true,isSkill:true,skillName:'腐蚀术(DOT)'});emitGpuP(e3.mesh.position,0x8822cc,{vx:0,vy:1,vz:0},2,0.2,{gravity:0})}},ti*p._dotTickRate*1000)}}})}
      const expN=Math.max(3,Math.round((p.sz||.15)*30));
      explosion(p.mesh.position,p.color||0xff8800,expN);
      if(p.onHit==='explode'&&p.explodeR){const ep=p.mesh.position.clone();aoeEffect(ep,p.explodeR,0xff4400,.4);screenShake(.1,.12);S.enemies.forEach(e2=>{if(e2!==e&&e2.hp>0&&e2.mesh.position.distanceTo(ep)<p.explodeR)dmgEnemy(e2,p.dmg*.4,projOpts)})}
      hit=true;break}}
    if(hit||p.life<=0){scene.remove(p.mesh);S.projectiles.splice(i,1)}}
  // 粒子系统（全面升级：着色器+GPU粒子+动态光）
  for(let i=S.particles.length-1;i>=0;i--){const p=S.particles[i];p.life-=dt;const r=Math.max(0,p.life/p.maxLife);
    // 更新着色器材质时间
    if(p.shaderMat&&p.shaderMat.uniforms&&p.shaderMat.uniforms.time)p.shaderMat.uniforms.time.value=gameTime;
    if(p.type==='aoe'){
      // AOE: 着色器冲击波+环渐隐+外扩
      if(p.shaderMat&&p.shaderMat.uniforms.progress)p.shaderMat.uniforms.progress.value=1-r;
      if(p.shaderMat&&p.shaderMat.uniforms.opacity)p.shaderMat.uniforms.opacity.value=r*.6;
      p.mesh.children.forEach((c,idx)=>{if(c.material&&c.material.opacity!==undefined&&!c.material.uniforms){c.material.opacity=r*(idx===0?1:.4+idx*.1)}});
      p.mesh.scale.setScalar(1+(1-r)*.35);
      if(p.mesh.children[2])p.mesh.children[2].rotation.z+=dt*2
    }
    else if(p.type==='exp'&&p.vel){p.mesh.position.addScaledVector(p.vel,dt);p.vel.y-=15*dt;if(p.mesh.material)p.mesh.material.opacity=r;p.mesh.scale.setScalar(.5+r*.5)}
    else if(p.type==='smoke'&&p.vel){p.mesh.position.addScaledVector(p.vel,dt);p.vel.y-=2*dt;if(p.mesh.material)p.mesh.material.opacity=r*.3;p.mesh.scale.setScalar(1+(1-r)*2)}
    else if(p.type==='flash'){
      // 闪光：sprite快速爆开
      if(p.mesh.material)p.mesh.material.opacity=r*r;
      p.mesh.scale.setScalar(2+(1-r)*6);
    }
    else if(p.type==='shockwave'){
      const expand=1+(1-r)*(p.speed||4);p.mesh.scale.setScalar(expand);
      if(p.shaderMat&&p.shaderMat.uniforms.progress)p.shaderMat.uniforms.progress.value=1-r;
      if(p.shaderMat&&p.shaderMat.uniforms.opacity)p.shaderMat.uniforms.opacity.value=r*.5;
      else if(p.mesh.material&&p.mesh.material.opacity!==undefined)p.mesh.material.opacity=r*.5;
    }
    else if(p.type==='lightning'){
      // 闪电：白色核心快速闪烁渐隐
      const flicker=.7+Math.random()*.3;
      p.mesh.children.forEach(c=>{if(c.material&&c.material.opacity!==undefined)c.material.opacity=r*flicker})
    }
    else if(p.type==='beam'){
      // 光柱：着色器脉动+光环旋转+GPU粒子持续上升
      const pulse=.8+.2*Math.sin(gameTime*8);
      p.mesh.children.forEach((c,idx)=>{
        if(c.material&&c.material.uniforms&&c.material.uniforms.opacity)c.material.uniforms.opacity.value=r*.4*pulse;
        else if(c.material&&c.material.opacity!==undefined)c.material.opacity=r*(idx===0?.4:.5)*pulse;
      });
      // 光环旋转
      const haloChild=p.mesh.children[2];if(haloChild&&haloChild.rotation)haloChild.rotation.z+=dt*6;
      p.mesh.scale.setScalar(.85+r*.15+Math.sin(gameTime*8)*.03);
      // 持续喷射上升光粒
      if(Math.random()<.3*VFX.trailDensity){
        const gp=p.mesh.position;
        emitGpuP({x:gp.x+(Math.random()-.5)*.5,y:.5,z:gp.z+(Math.random()-.5)*.5},
          p.mesh.children[0]&&p.mesh.children[0].material&&p.mesh.children[0].material.uniforms?0xffffff:0xaaaaff,
          {x:(Math.random()-.5)*.3,y:3+Math.random()*2,z:(Math.random()-.5)*.3},1.5,.5,{gravity:-1});
      }
    }
    else if(p.type==='spin'){
      p.mesh.rotation.y+=dt*(p.speed||8);
      p.mesh.children.forEach(c=>{if(c.material&&c.material.opacity!==undefined)c.material.opacity=r*.8});
      // 刀刃拖尾GPU火花
      if(Math.random()<.2*VFX.trailDensity){
        const gp=p.mesh.position;const ang=p.mesh.rotation.y;
        const bladeR=2;
        emitGpuP({x:gp.x+Math.cos(ang)*bladeR,y:.8,z:gp.z+Math.sin(ang)*bladeR},0xffcc44,
          {x:(Math.random()-.5)*2,y:1+Math.random(),z:(Math.random()-.5)*2},2,.3,{gravity:4});
      }
    }
    else if(p.type==='ashbladesSpin'){
      // 灰烬使者：十字圣光剑气跟随英雄旋转
      p.mesh.rotation.y+=dt*(p.speed||8);
      if(heroMesh){p.mesh.position.x=heroMesh.position.x;p.mesh.position.z=heroMesh.position.z}
      p.mesh.children.forEach(c=>{if(c.material&&c.material.opacity!==undefined)c.material.opacity=r*.85});
      // 金色圣光剑气拖尾
      if(Math.random()<.35*VFX.trailDensity){
        const gp=p.mesh.position;const ang=p.mesh.rotation.y+Math.random()*Math.PI*2;
        const bR=2.5;
        emitGpuP({x:gp.x+Math.cos(ang)*bR,y:.8,z:gp.z+Math.sin(ang)*bR},
          Math.random()<.5?0xffdd44:0xffaa00,
          {x:Math.cos(ang+Math.PI/2)*2,y:1.5+Math.random(),z:Math.sin(ang+Math.PI/2)*2},2.5,.25,{gravity:3});
      }
    }
    else if(p.type==='demonEye'){
      // 萨格拉斯之眼：恶魔巨眼悬浮+旋转+脉动+邪能粒子
      // 外圈旋转
      if(p.mesh.children[0])p.mesh.children[0].rotation.z+=dt*2;
      // 眼球脉动
      const pulse=1+Math.sin(gameTime*6)*.08;
      if(p.mesh.children[1])p.mesh.children[1].scale.setScalar(pulse);
      // 瞳孔闪烁
      if(p.mesh.children[2]&&p.mesh.children[2].material)p.mesh.children[2].material.opacity=.7+Math.sin(gameTime*10)*.3;
      // 整体渐隐
      p.mesh.children.forEach(c=>{
        if(c.material&&c.material.opacity!==undefined&&c!==p.mesh.children[2]){
          c.material.opacity=Math.min(c.material.opacity,r*.7);
        }
      });
      // 向下射出邪能粒子
      if(Math.random()<.4*VFX.trailDensity&&p.targetPos){
        emitGpuP({x:p.targetPos.x+(Math.random()-.5),y:12,z:p.targetPos.z+(Math.random()-.5)},
          0xff44ff,{x:(Math.random()-.5),y:-8-Math.random()*4,z:(Math.random()-.5)},2,.5,{gravity:-1});
      }
    }
    else if(p.type==='healCross'){
      // 治疗之泉：十字上升+旋转+消散
      const progress=1-r;
      p.mesh.position.y+=dt*1.5;
      p.mesh.rotation.y+=dt*2;
      p.mesh.children.forEach(c=>{
        if(c.material&&c.material.opacity!==undefined)c.material.opacity=r*.8;
      });
      p.mesh.scale.setScalar(.6+r*.4+Math.sin(gameTime*8)*.05);
    }
    else if(p.type==='meteor'){
      // 陨石从天而降 — 着色器火焰+密集GPU火焰拖尾
      const progress=1-r;const tp=p.target;
      const curX=tp.x;const curY=25-progress*25;const curZ=tp.z-8+progress*8;
      p.mesh.position.set(curX,curY,curZ);
      // 着色器时间更新
      if(p.fireMat&&p.fireMat.uniforms.time)p.fireMat.uniforms.time.value=gameTime;
      if(p.fireMat&&p.fireMat.uniforms.opacity)p.fireMat.uniforms.opacity.value=.5+progress*.5;
      // 岩石自转
      if(p.rock)p.rock.rotation.set(gameTime*2,gameTime*3,gameTime);
      // 密集GPU火焰拖尾
      const trailN=Math.ceil(3*VFX.trailDensity);
      for(let j=0;j<trailN;j++){
        emitGpuP({x:curX+(Math.random()-.5)*.8,y:curY+(Math.random()-.5)*.5,z:curZ+(Math.random()-.5)*.8},
          Math.random()<.3?0xffaa44:0xff4400,
          {x:(Math.random()-.5)*2,y:1+Math.random()*3,z:(Math.random()-.5)*2-2},
          4+Math.random()*3,.4+Math.random()*.3,{gravity:1,shrink:true});
      }
      // 烟雾拖尾
      if(Math.random()<.4){
        emitGpuP({x:curX+(Math.random()-.5),y:curY+1,z:curZ-1},0x555555,
          {x:(Math.random()-.5),y:2+Math.random()*2,z:-2},6,.8,{gravity:-0.3,shrink:false});
      }
      // 动态光源跟随
      if(Math.random()<.15)addDynLight({x:curX,y:curY,z:curZ},0xff6600,3,10,.15);
    }
    else if(p.type==='groundfire'){
      // 地面灼烧：着色器火焰贴地+渐隐
      if(p.shaderMat&&p.shaderMat.uniforms.time)p.shaderMat.uniforms.time.value=gameTime;
      if(p.shaderMat&&p.shaderMat.uniforms.opacity)p.shaderMat.uniforms.opacity.value=r*.3;
      p.mesh.scale.setScalar(.8+r*.2);
      // 散发零星火花
      if(Math.random()<.15*VFX.trailDensity){
        const gp=p.mesh.position;
        emitGpuP({x:gp.x+(Math.random()-.5)*4,y:.3,z:gp.z+(Math.random()-.5)*4},
          0xff4400,{x:(Math.random()-.5),y:2+Math.random()*3,z:(Math.random()-.5)},2,.4,{gravity:3});
      }
    }
    else if(p.type==='frostSpike'){
      // 霜冻新星冰锥：从地面弹出后回落碎裂
      if(p.vel){p.mesh.position.addScaledVector(p.vel,dt);p.vel.y-=12*dt;p.vel.x*=.95;p.vel.z*=.95}
      if(p.mesh.material)p.mesh.material.opacity=r;
      p.mesh.scale.set(1+(.2*(1-r)),Math.max(.2,r),1+(.2*(1-r)));
      // 冰锥冰蓝色拖尾粒子
      if(r>.3&&Math.random()<.25*VFX.trailDensity){
        emitGpuP({x:p.mesh.position.x,y:p.mesh.position.y,z:p.mesh.position.z},0x88eeff,
          {x:(Math.random()-.5)*.5,y:.5+Math.random(),z:(Math.random()-.5)*.5},1.5,.2,{gravity:3});
      }
    }
    else if(p.type==='blizzardStorm'){
      // 暴风雪旋转雪暴圈
      p.mesh.rotation.y+=dt*(p.speed||3);
      p.mesh.children.forEach(c=>{if(c.material&&c.material.opacity!==undefined)c.material.opacity=r*.3});
      // 持续喷射飞雪GPU粒子
      if(Math.random()<.4*VFX.trailDensity){
        const gp=p.mesh.position;const ang=Math.random()*Math.PI*2;const dist=Math.random()*3;
        emitGpuP({x:gp.x+Math.cos(ang)*dist,y:3+Math.random()*2,z:gp.z+Math.sin(ang)*dist},
          0xccddff,{x:(Math.random()-.5)*2,y:-2-Math.random()*3,z:(Math.random()-.5)*2},1.5,.6,{gravity:1,shrink:false});
      }
    }
    else if(p.type==='icicleFall'){
      // 暴风雪冰柱：从天快速落向目标位置
      const progress=1-r;
      if(p.target&&p.startY!==undefined){
        p.mesh.position.y=p.startY-progress*(p.startY-.1);
        // 加速度效果
        const spd=progress*progress;
        p.mesh.position.y=p.startY-(spd)*(p.startY-.1);
      }
      if(p.mesh.material)p.mesh.material.opacity=.85;
    }
    else if(p.type==='frostSword'){
      // 霜之哀伤冰剑：从地下升起→悬停→消散
      const progress=1-r;
      if(progress<.3){
        const rise=progress/.3;
        p.mesh.position.y=-2+rise*3.5;
        p.mesh.rotation.z=Math.sin(rise*Math.PI*.5)*.1;
      }else if(progress<.7){
        p.mesh.position.y=1.5+Math.sin(gameTime*6)*.1;
        p.mesh.rotation.z=Math.sin(gameTime*4)*.05;
        if(Math.random()<.3*VFX.trailDensity){
          const gp=p.mesh.position;
          emitGpuP({x:gp.x+(Math.random()-.5)*.3,y:gp.y+Math.random()*3,z:gp.z+(Math.random()-.5)*.3},
            0x88ccff,{x:(Math.random()-.5)*.5,y:1+Math.random(),z:(Math.random()-.5)*.5},1.5,.3,{gravity:-0.5});
        }
      }else{
        const fade=(progress-.7)/.3;
        p.mesh.position.y=1.5+fade*2;
        p.mesh.children.forEach(c=>{if(c.material&&c.material.opacity!==undefined)c.material.opacity=(1-fade)*.9});
        p.mesh.scale.set(1-fade*.3,1+fade*.5,1-fade*.3);
      }
    }
    if(p.life<=0){scene.remove(p.mesh);S.particles.splice(i,1)}}
  // GPU粒子系统更新
  updateGpuParticles(dt);
  gpuPMat.uniforms.time.value=gameTime;
  // 动态光源更新
  updateDynLights(dt);
  // 环境氛围粒子更新
  updateAmbientParticles(dt);
  // 极速连杀衰减
  tickRapidKill(dt);
  // 动态事件系统
  trySpawnEvent(dt);processEvent(dt);
  // 屏幕边缘危险预警（每3帧更新一次节省性能）
  if(Math.random()<.33)updateEdgeWarnings();
  // 拾取
  const _tb=S.talentBonus||{};
  const _bs=S.buffStats||{};
  const _attractR=4*(1+(_tb.pickupRange||0)+(_bs.pickupRange||0));        // 天赋+BUFF: 拾取范围加成
  const _magnetR=_tb.xpMagnet>0?_attractR*2.5:0;     // 天赋: XP吸引(超远距离自动飞来)
  for(let i=S.pickups.length-1;i>=0;i--){const p=S.pickups[i];p.life-=dt;p.mesh.rotation.y+=dt*2;p.mesh.position.y=.5+Math.sin(gameTime*3+i)*.15;
    const d=p.mesh.position.distanceTo(heroMesh.position);
    // 天赋: XP磁铁 — XP球从更远距离自动飞来
    if(_magnetR>0&&p.type==='xp'&&d<_magnetR&&d>=_attractR){
      const dr=new THREE.Vector3().subVectors(heroMesh.position,p.mesh.position).normalize();p.mesh.position.addScaledVector(dr,6*dt)}
    if(d<_attractR){const dr=new THREE.Vector3().subVectors(heroMesh.position,p.mesh.position).normalize();p.mesh.position.addScaledVector(dr,10*dt)}
    if(d<1){
      if(p.type==='xp'){const orbMult=1+(_bs.orbValue||0);const xpVal=Math.round((NUM.XP_ORB_BASE+S.level*NUM.XP_ORB_SCALE)*orbMult);gainXP(xpVal);if(SFX.pickup)SFX.pickup('xp')}
      else if(p.type==='gold'){const goldBuff=1+(_bs.goldMult||0);const goldVal=Math.round((NUM.GOLD_PER_KILL_BASE+S.wave*NUM.GOLD_PER_KILL_WAVE)*goldBuff);S.gold+=goldVal;if(SFX.pickup)SFX.pickup('gold')}
      else if(p.type==='heal'){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*NUM.HEAL_ORB_VALUE);aoeEffect(heroMesh.position,1,0x44ff44,.3);if(SFX.pickup)SFX.pickup('heal')}
      else if(p.type==='chest'){openLootChest(p.tier||'elite')}
      scene.remove(p.mesh);S.pickups.splice(i,1)}
    else if(p.life<=0){scene.remove(p.mesh);S.pickups.splice(i,1)}}
  S.ksTimer-=dt;if(S.ksTimer<=0)S.killStreak=0;
  // 屏幕震动更新
  if(shakeDuration>0){shakeTimer+=dt;if(shakeTimer<shakeDuration){const decay=1-shakeTimer/shakeDuration;const ox=(Math.random()-.5)*shakeIntensity*decay*2;const oz=(Math.random()-.5)*shakeIntensity*decay*2;camera.position.x+=ox;camera.position.z+=oz}else{shakeDuration=0;shakeIntensity=0;shakeTimer=0}}
  // 受伤红光
  if(S.hp<S.maxHp*.3&&S.hp>0){const pulse=Math.sin(gameTime*4)*.5+.5;ptLight.color.setHex(pulse>.5?0xff2222:0xff8844);ptLight.intensity=.3+pulse*.2}else{ptLight.color.setHex(0xff8844);ptLight.intensity=.3}
  // ===== 天赋涅槃复活 + 时光倒流检测 =====
  if(S.hp<=0){
    const _rtb=S.talentBonus||{};
    // 天赋: 涅槃 — 死亡时概率复活
    if(_rtb.revive&&!S.passiveStacks._reviveUsed){
      const revChance=_rtb.revive.chance||(_rtb.revive>0?0.5:0);
      const revHp=_rtb.revive.hp||0.30;
      if(Math.random()<revChance){
        S.hp=S.maxHp*revHp;S.passiveStacks._reviveUsed=true;
        if(SFX.revive)SFX.revive();
        aoeEffect(heroMesh.position,4,0xff44ff,1.0);lightBeam(heroMesh.position,0xff44ff,1.8,.7);screenFlash('#ff88ff',.3,250);screenShake(.12,.25);
        S.passiveStacks.invincible=2; // 复活后2秒无敌
        const el=document.createElement('div');el.className='kill-streak';el.textContent=`🔥 涅槃重生！(${Math.round(revHp*100)}%HP)`;document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1500);
      }
    }
    // 时光倒流技能复活
    if(S.hp<=0&&hasSkill('timewarp')&&!S.revived){S.revived=true;
    const twLv=sklLv('timewarp');const twSk=SKILL_DB.find(s=>s.id==='timewarp');
    const revHpPct=twSk.reviveHpPct+(twLv-1)*twSk.reviveHpPctPerLv;
    const invDur=twSk.invincibleDur+(twLv-1)*twSk.invincibleDurPerLv;
    S.hp=S.maxHp*revHpPct;
    if(SFX.revive)SFX.revive();
    aoeEffect(heroMesh.position,5,0xffff00,1.2);lightBeam(heroMesh.position,0xffff00,2,.8);screenFlash('#ffffaa',.3,300);screenShake(.15,.3);iceShatter(heroMesh.position,5,15);
    // 复活后无敌
    S.passiveStacks.invincible=invDur;
    const el=document.createElement('div');el.className='kill-streak';el.textContent=`⏪ 时光倒流！(${Math.round(revHpPct*100)}%HP)`;document.getElementById('game-screen').appendChild(el);setTimeout(()=>el.remove(),1500)}
    else if(S.hp<=0){S.hp=0;if(SFX.heroDeath)SFX.heroDeath();if(SFX.stopBgm)SFX.stopBgm();showResult(false)}}
  }catch(loopErr){console.error('Loop error:',loopErr)}
  updateHUD();
  // 渲染管线：Bloom后处理 or 直出
  if(bloomComposer){try{bloomComposer.render();}catch(be){renderer.render(scene,camera);}}
  else{renderer.render(scene,camera);}
}

// ==================== 初始化 ====================
setLoadProgress(90,'准备主城界面...');

// 初始化主城
try{
  SYS.refreshMainMenu(PD);
  // 生成主城浮动粒子
  const _pCon=document.getElementById('mm-particles');
  if(_pCon){for(let i=0;i<15;i++){const p=document.createElement('div');p.className='mm-particle';
    p.style.left=Math.random()*100+'%';p.style.animationDuration=(8+Math.random()*12)+'s';p.style.animationDelay=(-Math.random()*15)+'s';
    p.style.width=p.style.height=(2+Math.random()*3)+'px';p.style.opacity=.1+Math.random()*.3;_pCon.appendChild(p)}}
  // === 心流引导系统初始化 ===
  SYS.applyProgressiveUnlock(PD);
  SYS.refreshQuestBar(PD);
  SYS.refreshNextStep(PD);
}catch(e){
  console.error('Main menu init error:',e);
}

// ==================== 心流系统事件绑定 ====================
// 主线任务条点击
window._doQuestAction=function(){
  const bar=document.getElementById('mm-quest-bar');
  if(bar&&bar.dataset.action)openPanel(bar.dataset.action);
};
// 智能下一步浮标点击
window._doNextStep=function(){
  const el=document.getElementById('mm-nextstep');
  if(el&&el.dataset.action)openPanel(el.dataset.action);
};
// 标记英雄面板已访问（用于任务检测）
const _origOpenPanel=window.openPanel;
window.openPanel=function(id){
  if(id==='heroes')PD._visitedHeroes=true;
  _origOpenPanel(id);
};

// ==================== 新手引导系统（增强版V2） ====================
(function initGuide(){
  // 使用增强版引导（带遮罩聚光灯）
  if(PD.totalGames===0&&!PD._guideV2Done&&!PD.guideCompleted){
    SYS.startEnhancedGuide(PD);
  }
})();

// ==================== 心流刷新——每次回到主城时自动刷新 ====================
function refreshFlowSystems(){
  try{
    SYS.applyProgressiveUnlock(PD);
    SYS.refreshQuestBar(PD);
    SYS.refreshNextStep(PD);
  }catch(e){console.error('Flow refresh error:',e)}
}

// 体力恢复定时器
setInterval(()=>{if(PD.stamina<PD.maxStamina){PD.stamina++;save();const el=document.getElementById('cur-stamina');if(el)el.textContent=PD.stamina}},300000);

// 窗口大小变化
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(bloomComposer)bloomComposer.resize(innerWidth,innerHeight)});

// 完成加载 → 平滑过渡到主城
setLoadProgress(100,'欢迎回到艾泽拉斯！');
setTimeout(()=>{
  const loadScreen=document.getElementById('loading-screen');
  const mainMenu=document.getElementById('main-menu');
  // 淡出Loading
  loadScreen.classList.add('fade-out');
  setTimeout(()=>{
    loadScreen.classList.remove('active');
    loadScreen.classList.remove('fade-out');
    mainMenu.classList.add('active');
    mainMenu.classList.add('entrance');
    setTimeout(()=>mainMenu.classList.remove('entrance'),800);
    // 启动渲染循环
    loop();
    loopStarted=true;
    console.log('Game loaded successfully!');
  },600);
},500);
})();
