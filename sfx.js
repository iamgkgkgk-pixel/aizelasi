// ==================== 艾泽拉斯幸存者 — 音效引擎 (Web Audio API 纯合成) ====================
// 零依赖、零外部文件，全部由振荡器/噪声/滤波器实时合成
(function(){
'use strict';

// ===== AudioContext 懒初始化（需要用户交互后才能启动） =====
let ctx=null;
let masterGain=null;
let sfxGain=null;
let bgmGain=null;
let _resumed=false;
let _sfxVol=0.5;   // 音效音量 0-1
let _bgmVol=0.25;  // 背景音乐音量 0-1
let _muted=false;

function ensureCtx(){
  if(ctx)return ctx;
  try{
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    masterGain=ctx.createGain();masterGain.gain.value=1;masterGain.connect(ctx.destination);
    sfxGain=ctx.createGain();sfxGain.gain.value=_sfxVol;sfxGain.connect(masterGain);
    bgmGain=ctx.createGain();bgmGain.gain.value=_bgmVol;bgmGain.connect(masterGain);
  }catch(e){console.warn('Web Audio not supported',e)}
  return ctx;
}

// 首次用户交互时 resume
function resumeCtx(){
  if(_resumed)return;
  ensureCtx();
  if(ctx&&ctx.state==='suspended'){ctx.resume().catch(()=>{});_resumed=true}
  else _resumed=true;
}
// 绑定常见交互事件来解锁音频
['click','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,resumeCtx,{once:false,passive:true}));

// ===== 工具函数 =====
const now=()=>ctx?ctx.currentTime:0;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

// 创建白噪声缓冲
let _noiseBuf=null;
function noiseBuf(){
  if(_noiseBuf)return _noiseBuf;
  ensureCtx();if(!ctx)return null;
  const len=ctx.sampleRate*2;const buf=ctx.createBuffer(1,len,ctx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  _noiseBuf=buf;return buf;
}

// 快速创建振荡器 → gain → 输出
function osc(type,freq,startT,dur,vol=0.3,detune=0){
  if(!ctx)return null;
  const o=ctx.createOscillator();const g=ctx.createGain();
  o.type=type;o.frequency.value=freq;if(detune)o.detune.value=detune;
  g.gain.setValueAtTime(vol,startT);
  g.gain.exponentialRampToValueAtTime(0.001,startT+dur);
  o.connect(g);g.connect(sfxGain);
  o.start(startT);o.stop(startT+dur+0.05);
  return{osc:o,gain:g};
}

// 噪声突发（打击感核心）
function noiseBurst(startT,dur,vol=0.2,filterFreq=3000,filterType='bandpass'){
  if(!ctx)return;
  const nb=noiseBuf();if(!nb)return;
  const src=ctx.createBufferSource();src.buffer=nb;
  const f=ctx.createBiquadFilter();f.type=filterType;f.frequency.value=filterFreq;f.Q.value=1;
  const g=ctx.createGain();g.gain.setValueAtTime(vol,startT);g.gain.exponentialRampToValueAtTime(0.001,startT+dur);
  src.connect(f);f.connect(g);g.connect(sfxGain);
  src.start(startT);src.stop(startT+dur+0.05);
}

// 频率扫描（上升/下降的嗖嗖声）
function sweep(type,startFreq,endFreq,startT,dur,vol=0.15){
  if(!ctx)return;
  const o=ctx.createOscillator();const g=ctx.createGain();
  o.type=type;o.frequency.setValueAtTime(startFreq,startT);
  o.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),startT+dur);
  g.gain.setValueAtTime(vol,startT);g.gain.exponentialRampToValueAtTime(0.001,startT+dur);
  o.connect(g);g.connect(sfxGain);
  o.start(startT);o.stop(startT+dur+0.05);
}

// ==================== 打击/战斗音效 ====================

// 通用命中音效（轻量、不会打扰）
function sfxHit(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.04,0.12,2500,'bandpass');
  osc('square',180,t,0.03,0.08);
}

// 暴击音效（更重、更有冲击力）
function sfxCrit(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.06,0.25,4000,'highpass');
  osc('sawtooth',300,t,0.05,0.15);
  osc('square',150,t+0.02,0.08,0.12);
  sweep('sawtooth',600,200,t,0.08,0.1);
}

// 击杀音效（清脆的结束感）
function sfxKill(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',800,t,0.06,0.08);
  osc('sine',1200,t+0.04,0.06,0.06);
  noiseBurst(t,0.05,0.08,3000,'highpass');
}

// 精英击杀（更华丽）
function sfxEliteKill(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',600,t,0.08,0.12);
  osc('sine',900,t+0.06,0.08,0.1);
  osc('sine',1200,t+0.12,0.1,0.08);
  noiseBurst(t,0.08,0.15,5000,'highpass');
  sweep('sine',400,1600,t,0.15,0.08);
}

// BOSS击杀（史诗级）
function sfxBossKill(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 低频冲击
  osc('sine',60,t,0.3,0.25);
  osc('sawtooth',120,t,0.2,0.15);
  // 上升音阶
  [400,600,800,1000,1200].forEach((f,i)=>osc('sine',f,t+0.08+i*0.06,0.12,0.1));
  noiseBurst(t,0.15,0.2,6000,'highpass');
  noiseBurst(t+0.1,0.2,0.1,1000,'lowpass');
  // 尾音金属共鸣
  osc('sine',1400,t+0.4,0.4,0.06);
  osc('sine',1600,t+0.45,0.35,0.04);
}

// 英雄受伤
function sfxHeroDmg(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',120,t,0.08,0.12);
  noiseBurst(t,0.05,0.1,1500,'lowpass');
  osc('square',80,t+0.02,0.06,0.08);
}

// 英雄死亡
function sfxHeroDeath(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 下降悲壮音
  sweep('sawtooth',400,60,t,0.5,0.2);
  osc('sine',200,t,0.3,0.15);
  osc('sine',150,t+0.2,0.4,0.1);
  noiseBurst(t+0.1,0.3,0.15,800,'lowpass');
  // 低沉共鸣
  osc('sine',50,t+0.3,0.6,0.12);
}

// 闪避
function sfxDodge(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sine',800,2000,t,0.1,0.08);
  osc('sine',1500,t+0.05,0.05,0.04);
}

// ==================== 10职业基础攻击音效 ====================

// ⚔️ 战士 — 重型金属旋风
function sfxWarriorAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sawtooth',200,80,t,0.12,0.15);
  noiseBurst(t,0.08,0.15,2000,'bandpass');
  osc('square',100,t+0.03,0.06,0.1);
}

// 🔥 法师 — 轻盈火球发射
function sfxMageAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sine',400,1200,t,0.1,0.1);
  noiseBurst(t+0.02,0.06,0.06,4000,'highpass');
  osc('triangle',800,t+0.04,0.06,0.05);
}

// 🏹 猎人 — 弓弦嗖嗖
function sfxHunterAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sawtooth',1500,300,t,0.06,0.08);
  noiseBurst(t,0.03,0.1,6000,'highpass');
  osc('triangle',2000,t,0.02,0.06);
}

// ✝️ 暗牧 — 阴暗能量波动
function sfxPriestAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',200,t,0.12,0.08);
  osc('sine',250,t,0.12,0.06); // 微失谐产生诡异颤音
  sweep('triangle',300,150,t,0.1,0.06);
  noiseBurst(t+0.03,0.05,0.04,1200,'bandpass');
}

// 🗡️ 盗贼 — 快速利刃
function sfxRogueAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.03,0.18,8000,'highpass');
  sweep('sawtooth',2000,400,t,0.04,0.1);
}

// 🌊 萨满 — 图腾震波+闪电
function sfxShamanAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('square',150,t,0.06,0.1);
  osc('sine',500,t+0.03,0.05,0.06);
  noiseBurst(t+0.02,0.04,0.06,3000,'bandpass');
  // 远程闪电部分
  sweep('sawtooth',800,2500,t+0.06,0.04,0.04);
}

// 💀 死骑 — 冰霜重击
function sfxDeathknightAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',80,t,0.1,0.15);
  osc('square',120,t,0.08,0.1);
  noiseBurst(t+0.02,0.06,0.08,1800,'bandpass');
  // 冰冻晶体碎裂
  osc('sine',2000,t+0.05,0.03,0.04);
  osc('sine',2500,t+0.06,0.02,0.03);
}

// 🌿 德鲁伊 — 月火/熊爪
function sfxDruidAtk(isBear){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  if(isBear){
    // 熊形态：沉重撕裂
    osc('sawtooth',100,t,0.1,0.12);
    noiseBurst(t,0.06,0.12,1500,'lowpass');
    osc('square',80,t+0.02,0.08,0.08);
  }else{
    // 月火形态：空灵魔法
    osc('sine',600,t,0.1,0.06);
    osc('sine',900,t+0.03,0.08,0.05);
    sweep('triangle',500,1200,t,0.08,0.05);
  }
}

// 👿 术士 — 暗影邪能
function sfxWarlockAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',180,t,0.1,0.1);
  osc('sawtooth',190,t,0.1,0.08); // 微失谐邪恶感
  sweep('square',250,100,t+0.05,0.08,0.06);
  noiseBurst(t+0.03,0.05,0.05,2000,'bandpass');
}

// 🛡️ 圣骑士 — 圣光重击
function sfxPaladinAtk(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',300,t,0.08,0.1);
  osc('sine',600,t+0.02,0.06,0.06);
  osc('triangle',450,t+0.01,0.07,0.05);
  noiseBurst(t,0.05,0.08,2500,'bandpass');
}

// ==================== 技能音效 ====================

// 🔥 火球术 — 炽热燃烧飞射
function sfxFireball(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sawtooth',300,1500,t,0.12,0.12);
  noiseBurst(t,0.1,0.1,3000,'bandpass');
  osc('triangle',700,t+0.05,0.08,0.06);
}

// ❄️ 霜冻新星 — 冰面碎裂+冰晶扩散
function sfxFrostNova(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 冰面碎裂（低频冲击+高频碎裂声）
  osc('sine',60,t,0.12,0.12);
  noiseBurst(t,0.04,0.18,8000,'highpass'); // 碎裂高频噪声
  noiseBurst(t+0.02,0.06,0.12,5000,'bandpass'); // 冰块质感
  // 冰晶碎片散射（多个高频短促音）
  for(let i=0;i<5;i++){
    osc('sine',2200+i*600+Math.random()*400,t+0.04+i*0.025,0.04,0.05);
  }
  // 冰面滑移扩散声（下降sweep模拟冰面蔓延）
  sweep('sine',4000,600,t+0.03,0.18,0.06);
  // 冰块撞击（短促钝响）
  osc('triangle',300,t+0.01,0.05,0.08);
  osc('triangle',180,t+0.03,0.06,0.06);
}

// ⚡ 雷霆一击 — 霹雳电弧+雷鸣轰响
function sfxThunder(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 初始闪电冲击（极短高频白噪声 = 电弧音）
  noiseBurst(t,0.02,0.25,9000,'highpass');
  // 雷鸣低频冲击
  osc('sawtooth',80,t,0.12,0.18);
  osc('sine',50,t+0.02,0.15,0.12);
  // 电弧噼啪（快速高频方波脉冲）
  osc('square',2500,t,0.015,0.12);
  osc('square',3200,t+0.008,0.012,0.08);
  for(let i=0;i<4;i++){
    noiseBurst(t+0.03+i*0.025,0.015,0.1,6000+Math.random()*4000,'highpass');
  }
  // 电流嗡鸣尾音
  sweep('sawtooth',4000,80,t+0.02,0.12,0.06);
  osc('sawtooth',120,t+0.1,0.08,0.04);
}

// 💚 治疗之泉 — 温暖治愈
function sfxHeal(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',400,t,0.3,0.08);
  osc('sine',600,t+0.1,0.25,0.06);
  osc('sine',800,t+0.2,0.2,0.05);
  osc('triangle',500,t+0.05,0.25,0.04);
}

// 🌿 荆棘术 — 荆条缠绕反弹
function sfxThorns(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',400,t,0.05,0.06);
  osc('sawtooth',350,t+0.03,0.05,0.05);
  noiseBurst(t,0.04,0.06,4000,'bandpass');
}

// 💥 活体炸弹 — 定时爆炸
function sfxLivingBomb(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 附着声
  osc('sine',500,t,0.05,0.06);
  // 延迟爆炸
  osc('sawtooth',80,t+0.08,0.15,0.2);
  noiseBurst(t+0.08,0.12,0.2,2500,'bandpass');
  osc('square',60,t+0.1,0.1,0.12);
  sweep('sawtooth',500,50,t+0.08,0.15,0.1);
}

// 🌨️ 暴风雪 — 寒风呼啸+冰粒碰撞+冰面碎裂
function sfxBlizzard(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 风声（持续噪声）
  noiseBurst(t,0.45,0.07,2500,'bandpass');
  noiseBurst(t+0.05,0.4,0.05,4000,'highpass');
  // 寒风呼啸sweep
  sweep('sine',1200,300,t,0.35,0.04);
  sweep('triangle',800,200,t+0.1,0.25,0.03);
  // 冰粒碰撞（密集的高频短促音）
  for(let i=0;i<5;i++){
    osc('sine',2000+Math.random()*1500,t+i*0.08,0.04,0.03);
    noiseBurst(t+i*0.08+0.02,0.02,0.04,7000,'highpass'); // 冰碎片
  }
  // 冰面质感
  osc('triangle',400,t+0.15,0.1,0.03);
}

// ⛓️ 闪电链 — 连锁电弧跳跃
function sfxChainLightning(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 初始电击爆发
  noiseBurst(t,0.03,0.2,8000,'highpass');
  osc('sawtooth',120,t,0.05,0.14);
  osc('square',2800,t,0.02,0.1);
  // 链式跳跃电弧（每次音高上升+音量递减，模拟跳跃感）
  for(let i=0;i<4;i++){
    const dt2=0.05+i*0.07;
    noiseBurst(t+dt2,0.025,0.12-i*0.02,7000+i*1000,'highpass');
    osc('square',1800+i*500,t+dt2,0.025,0.06-i*0.01);
    // 每次跳跃之间的电流嗡鸣
    osc('sawtooth',200+i*60,t+dt2,0.03,0.03);
  }
}

// 🩸 血之渴望 — 暗红汲取
function sfxBloodthirst(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sine',200,600,t,0.15,0.08);
  osc('sine',300,t+0.05,0.1,0.06);
  osc('triangle',250,t+0.03,0.12,0.05);
}

// 🍃 自然之怒 — 绿色藤蔓抽打
function sfxNatureWrath(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('triangle',600,1200,t,0.08,0.08);
  noiseBurst(t+0.02,0.04,0.06,4000,'bandpass');
  osc('sine',800,t+0.04,0.06,0.04);
  osc('triangle',1000,t+0.06,0.05,0.03);
}

// 🌩️ 连锁闪电 — 暴怒电弧风暴
function sfxChainStorm(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 初始霹雳（极强冲击）
  noiseBurst(t,0.05,0.25,9000,'highpass');
  osc('sawtooth',60,t,0.12,0.2);
  osc('square',3500,t,0.02,0.12);
  // 连锁电弧疯狂跳跃
  for(let i=0;i<6;i++){
    noiseBurst(t+0.03+i*0.05,0.025,0.14-i*0.015,6000+i*800,'highpass');
    osc('sawtooth',1200+i*350,t+0.03+i*0.05,0.025,0.05);
    // 电流尾音
    osc('square',100+i*30,t+0.04+i*0.05,0.02,0.02);
  }
  // 雷鸣余音
  sweep('square',5000,60,t+0.02,0.22,0.05);
  osc('sine',40,t+0.15,0.15,0.06);
}

// 🔱 叉状闪电 — 三叉电弧分裂
function sfxForkedLight(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 主干电弧
  noiseBurst(t,0.04,0.22,8000,'highpass');
  osc('sawtooth',100,t,0.08,0.16);
  // 三叉分裂（三个方向同时放电）
  osc('square',2200,t,0.025,0.1);
  osc('square',2800,t+0.01,0.025,0.08);
  osc('square',3400,t+0.02,0.025,0.06);
  // 分支电弧噼啪
  for(let i=0;i<3;i++){
    noiseBurst(t+0.04+i*0.035,0.025,0.09,7000,'highpass');
    osc('sawtooth',150+i*40,t+0.04+i*0.035,0.03,0.04);
  }
  // 电流消散
  sweep('sawtooth',3000,200,t+0.08,0.1,0.04);
}

// 🗡️ 灰烬使者 — 圣光旋转割草
function sfxAshbringer(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 拔剑音
  noiseBurst(t,0.04,0.1,5000,'highpass');
  // 圣光升腾
  osc('sine',400,t,0.15,0.12);
  osc('sine',600,t+0.05,0.12,0.1);
  osc('sine',800,t+0.1,0.15,0.08);
  // 旋转嗡鸣
  sweep('triangle',300,900,t+0.1,0.3,0.06);
  osc('sawtooth',200,t+0.1,0.3,0.05);
}

// 🥶 霜之哀伤 — 拔剑寒气+全屏冰封碎裂
function sfxFrostmourne(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 拔剑寒气（下行sweep = 冷气蔓延）
  sweep('sine',2500,80,t,0.35,0.15);
  noiseBurst(t,0.15,0.1,2500,'bandpass'); // 风声
  // 冰面碎裂（密集高频脉冲）
  noiseBurst(t+0.1,0.06,0.15,8000,'highpass');
  for(let i=0;i<4;i++){
    osc('sine',1800+i*500+Math.random()*300,t+0.15+i*0.04,0.05,0.05);
  }
  // 冰封扩散低频冲击
  osc('sine',50,t+0.15,0.5,0.15);
  osc('sine',80,t+0.2,0.4,0.12);
  // 冰块大量碎裂声
  noiseBurst(t+0.2,0.25,0.1,6000,'highpass');
  noiseBurst(t+0.25,0.15,0.06,3000,'bandpass');
  // 深沉共鸣（神器级冰剑的威严感）
  osc('sine',40,t+0.35,0.5,0.1);
  osc('triangle',120,t+0.3,0.3,0.04);
}

// 👁️ 萨格拉斯之眼 — 天空射线轰炸
function sfxEyeOfSargeras(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 眼睛睁开
  sweep('sine',100,800,t,0.3,0.12);
  osc('sawtooth',150,t,0.2,0.1);
  // 射线
  noiseBurst(t+0.2,0.4,0.15,4000,'bandpass');
  sweep('sawtooth',500,3000,t+0.2,0.3,0.08);
  osc('square',200,t+0.25,0.3,0.06);
  // 爆炸点
  for(let i=0;i<4;i++){
    osc('sawtooth',60,t+0.3+i*0.1,0.08,0.1);
    noiseBurst(t+0.3+i*0.1,0.06,0.08,2000,'bandpass');
  }
}

// 🏰 达拉然坠落 — 达拉然从天砸下
function sfxDalaran(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 下降呼啸
  sweep('sawtooth',2000,40,t,0.6,0.2);
  noiseBurst(t,0.4,0.1,3000,'bandpass');
  // 坠落震动
  osc('sine',30,t+0.5,0.8,0.25);
  osc('sine',50,t+0.5,0.6,0.2);
  // 地面爆炸
  noiseBurst(t+0.5,0.3,0.25,1500,'lowpass');
  noiseBurst(t+0.55,0.2,0.15,5000,'highpass');
  // 碎裂余音
  for(let i=0;i<5;i++) osc('sine',200+i*150,t+0.6+i*0.05,0.15,0.04);
}

// ⏪ 时光倒流 — 时间扭转
function sfxTimewarp(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 时间停止
  sweep('sine',1000,200,t,0.2,0.12);
  // 倒转效果
  for(let i=0;i<8;i++){
    osc('sine',800-i*80,t+0.2+i*0.04,0.05,0.06);
  }
  // 时间恢复
  sweep('sine',200,1200,t+0.5,0.3,0.1);
  osc('triangle',600,t+0.6,0.2,0.06);
}

// ===== 标志技能音效 =====

// 战士·旋风斩
function sfxWhirlwind(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sawtooth',150,500,t,0.2,0.12);
  sweep('sawtooth',500,150,t+0.2,0.2,0.1);
  noiseBurst(t,0.35,0.1,2000,'bandpass');
  osc('square',100,t+0.05,0.1,0.08);
}

// 法师·烈焰风暴
function sfxFlameStorm(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.3,0.15,3000,'bandpass');
  sweep('sawtooth',200,800,t,0.15,0.1);
  osc('sawtooth',100,t+0.1,0.2,0.08);
  for(let i=0;i<3;i++) noiseBurst(t+0.1+i*0.08,0.06,0.06,4000+i*1000,'highpass');
}

// 猎人·多重射击
function sfxMultiShot(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  for(let i=0;i<4;i++){
    sweep('triangle',1800,400,t+i*0.04,0.05,0.06);
    noiseBurst(t+i*0.04,0.02,0.06,7000,'highpass');
  }
}

// 暗牧·暗言术
function sfxShadowWord(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',150,t,0.2,0.1);
  osc('sine',160,t,0.2,0.08);
  sweep('sawtooth',250,80,t+0.05,0.2,0.06);
  noiseBurst(t+0.1,0.1,0.05,1000,'lowpass');
}

// 盗贼·影舞
function sfxShadowDance(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.03,0.15,8000,'highpass');
  sweep('sawtooth',3000,200,t,0.06,0.12);
  osc('sine',200,t+0.04,0.06,0.06);
  noiseBurst(t+0.08,0.03,0.1,6000,'highpass');
}

// 萨满·图腾风暴 — 图腾落地+元素爆发+闪电
function sfxTotemStorm(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 图腾落地冲击
  osc('square',100,t,0.1,0.12);
  osc('square',150,t+0.05,0.08,0.08);
  noiseBurst(t,0.08,0.1,3000,'bandpass');
  // 闪电电弧（图腾释放闪电）
  noiseBurst(t+0.1,0.03,0.1,7000,'highpass');
  osc('square',2000,t+0.1,0.02,0.06);
  sweep('sawtooth',600,2500,t+0.1,0.06,0.05);
  // 元素共鸣
  noiseBurst(t+0.15,0.04,0.06,5000,'highpass');
}

// 死骑·凛冬将至 — 冰刺裂地+冰面碎裂风暴
function sfxRemorselessWinter(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 冰面开裂（低频冲击+地面碎裂声）
  osc('sine',40,t,0.15,0.15);
  noiseBurst(t,0.08,0.12,3000,'bandpass'); // 冰面碎裂质感
  noiseBurst(t+0.03,0.06,0.1,7000,'highpass'); // 冰碎片飞溅
  // 冰刺从地面刺出（上行sweep）
  sweep('sine',200,2000,t+0.05,0.2,0.08);
  // 寒气扩散
  noiseBurst(t+0.1,0.4,0.08,2000,'bandpass');
  sweep('triangle',1500,300,t+0.1,0.35,0.06);
  // 多根冰锥碎裂声
  for(let i=0;i<5;i++){
    osc('sine',2000+i*400+Math.random()*300,t+0.1+i*0.05,0.035,0.04);
    noiseBurst(t+0.12+i*0.05,0.02,0.03,6000+i*500,'highpass');
  }
  // 冰封低频余音
  osc('sine',60,t+0.3,0.3,0.08);
}

// 德鲁伊·星辰坠落
function sfxStarfall(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  for(let i=0;i<5;i++){
    const dt2=i*0.12;
    sweep('sine',2000,400,t+dt2,0.1,0.06);
    osc('sine',1200-i*100,t+dt2+0.08,0.06,0.04);
    noiseBurst(t+dt2+0.08,0.04,0.05,3000,'bandpass');
  }
}

// 术士·末日守卫
function sfxDoomguard(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',80,t,0.2,0.15);
  osc('sawtooth',85,t,0.2,0.12);
  sweep('square',100,400,t+0.1,0.15,0.08);
  noiseBurst(t+0.15,0.1,0.1,2000,'bandpass');
  osc('sine',500,t+0.2,0.1,0.06);
}

// 圣骑士·复仇之盾
function sfxAvengerShield(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.04,0.12,5000,'bandpass');
  osc('sine',500,t,0.1,0.1);
  osc('sine',700,t+0.03,0.08,0.07);
  // 弹射
  for(let i=0;i<3;i++){
    osc('triangle',600+i*200,t+0.1+i*0.08,0.06,0.05);
    noiseBurst(t+0.1+i*0.08,0.03,0.06,4000,'highpass');
  }
}

// ===== 合成技音效 =====
function sfxTitanGrip(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',40,t,0.5,0.2);
  sweep('sawtooth',200,800,t,0.3,0.15);
  noiseBurst(t+0.15,0.3,0.2,2000,'bandpass');
  for(let i=0;i<4;i++) osc('sine',400+i*200,t+0.2+i*0.05,0.1,0.06);
}
function sfxIceFire(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 冰（冰面碎裂声）
  noiseBurst(t,0.08,0.12,7000,'highpass');
  osc('sine',1800,t,0.06,0.08);
  osc('sine',2400,t+0.02,0.04,0.06);
  sweep('sine',3000,500,t,0.1,0.06);
  // 火
  noiseBurst(t+0.12,0.15,0.15,2500,'bandpass');
  sweep('sawtooth',300,1000,t+0.12,0.12,0.1);
  osc('sawtooth',80,t+0.22,0.15,0.12);
}
function sfxSoulReap(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sine',300,800,t,0.15,0.08);
  osc('sine',200,t+0.05,0.15,0.06);
  osc('triangle',500,t+0.1,0.1,0.05);
}

// ==================== 职业专属技能音效（补全） ====================

// ❄️ 凛冬将至（sig_wintercoming）— 冰刺裂地
function sfxWinterComing(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 大地开裂
  osc('sine',35,t,0.2,0.18);
  noiseBurst(t,0.06,0.15,4000,'bandpass');
  // 冰刺从地面升起
  sweep('sine',150,2200,t+0.05,0.15,0.1);
  noiseBurst(t+0.08,0.05,0.12,8000,'highpass'); // 冰碎裂
  // 冰面蔓延
  noiseBurst(t+0.12,0.3,0.08,2500,'bandpass');
  sweep('triangle',2000,300,t+0.12,0.3,0.05);
  // 多根冰刺碎裂
  for(let i=0;i<4;i++){
    osc('sine',2500+i*400,t+0.1+i*0.04,0.03,0.04);
    noiseBurst(t+0.12+i*0.04,0.02,0.03,7000,'highpass');
  }
  osc('sine',50,t+0.25,0.3,0.08);
}

// 🧊 寒冰屏障 — 冰盾激活
function sfxIceBarrier(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 冰盾凝聚
  sweep('sine',500,2000,t,0.15,0.08);
  osc('sine',1200,t+0.05,0.1,0.06);
  osc('sine',1600,t+0.08,0.08,0.05);
  // 冰面形成声
  noiseBurst(t+0.05,0.08,0.06,5000,'highpass');
  osc('triangle',800,t+0.1,0.12,0.04);
  // 低频冰盾稳定嗡鸣
  osc('sine',200,t+0.12,0.2,0.03);
}

// 🌍 地震术 — 大地震动+雷鸣
function sfxEarthquake(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 地面震动（极低频）
  osc('sine',25,t,0.4,0.2);
  osc('sine',40,t,0.35,0.15);
  // 岩石碎裂
  noiseBurst(t,0.15,0.12,1500,'lowpass');
  noiseBurst(t+0.05,0.1,0.08,3000,'bandpass');
  // 闪电增强（萨满元素电系）
  noiseBurst(t+0.1,0.03,0.06,7000,'highpass');
  osc('square',1500,t+0.1,0.02,0.04);
  // 持续震动
  for(let i=0;i<3;i++){
    osc('sine',30+i*10,t+0.1+i*0.08,0.1,0.06);
    noiseBurst(t+0.15+i*0.08,0.05,0.04,2000,'bandpass');
  }
}

// 💫 英勇飞跃 — 跳跃+落地冲击
function sfxHeroicLeap(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 起跳
  sweep('sine',200,800,t,0.1,0.08);
  // 落地冲击
  osc('sine',50,t+0.12,0.15,0.2);
  noiseBurst(t+0.12,0.1,0.15,2000,'bandpass');
  osc('sawtooth',100,t+0.14,0.08,0.1);
  noiseBurst(t+0.15,0.06,0.06,4000,'highpass');
}

// 🪓 斩杀 — 重斧劈砍
function sfxExecuteStrike(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sawtooth',300,80,t,0.08,0.18);
  noiseBurst(t,0.05,0.2,3000,'bandpass');
  osc('square',80,t+0.02,0.08,0.12);
  osc('sine',60,t+0.05,0.1,0.08);
}

// 🛡️ 盾墙 — 金属盾牌激活
function sfxShieldWall(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',300,t,0.1,0.08);
  osc('sine',500,t+0.03,0.08,0.06);
  noiseBurst(t,0.06,0.08,3000,'bandpass');
  osc('triangle',200,t+0.08,0.15,0.04);
}

// ☄️ 炎爆术 — 蓄力大火球
function sfxPyroblast(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sawtooth',200,1200,t,0.15,0.15);
  noiseBurst(t+0.05,0.12,0.12,3000,'bandpass');
  osc('sawtooth',100,t+0.08,0.12,0.1);
  osc('triangle',600,t+0.1,0.08,0.06);
  // 爆炸
  osc('sine',60,t+0.15,0.15,0.12);
  noiseBurst(t+0.15,0.1,0.1,2000,'lowpass');
}

// 🔮 奥术冲击 — 奥术能量脉冲
function sfxArcaneBlast(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',400,t,0.08,0.08);
  osc('sine',600,t+0.02,0.06,0.06);
  sweep('triangle',800,300,t,0.1,0.06);
  noiseBurst(t+0.03,0.04,0.05,4000,'bandpass');
}

// 💣 爆炸陷阱
function sfxExplosiveTrap(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',800,t,0.04,0.05); // 放置音
  osc('sine',50,t+0.06,0.12,0.15);
  noiseBurst(t+0.06,0.1,0.12,2000,'bandpass');
}

// 🎯 瞄准射击
function sfxAimedShot(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('triangle',2000,400,t,0.05,0.1);
  noiseBurst(t,0.03,0.12,7000,'highpass');
  osc('sine',1000,t+0.03,0.04,0.05);
}

// 🧠 心灵震爆
function sfxMindBlast(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',150,t,0.15,0.1);
  osc('sine',160,t,0.15,0.08);
  sweep('sawtooth',300,80,t+0.05,0.15,0.06);
  noiseBurst(t+0.08,0.08,0.06,2000,'bandpass');
}

// 💀 剔骨
function sfxEviscerate(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.03,0.15,6000,'highpass');
  sweep('sawtooth',1500,300,t,0.05,0.1);
  osc('square',100,t+0.02,0.05,0.08);
}

// 🌀 刃舞
function sfxBladeDance(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  for(let i=0;i<3;i++){
    sweep('sawtooth',1200,400,t+i*0.05,0.04,0.06);
    noiseBurst(t+i*0.05,0.02,0.05,5000,'highpass');
  }
}

// 🌋 熔岩爆裂
function sfxLavaBurst(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',100,t,0.1,0.12);
  sweep('sawtooth',200,800,t,0.1,0.1);
  noiseBurst(t+0.03,0.08,0.1,2500,'bandpass');
  osc('sine',60,t+0.08,0.1,0.08);
}

// 🌧️ 治疗之雨
function sfxHealingRain(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.3,0.05,4000,'highpass'); // 雨声
  osc('sine',500,t,0.15,0.05);
  osc('sine',700,t+0.08,0.12,0.04);
  sweep('triangle',300,800,t,0.2,0.03);
}

// 💀 灭杀打击 — 冰霜重击吸血
function sfxDeathStrike(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',80,t,0.08,0.14);
  noiseBurst(t,0.05,0.1,2500,'bandpass');
  // 冰霜质感
  osc('sine',1800,t+0.03,0.03,0.04);
  noiseBurst(t+0.04,0.03,0.05,6000,'highpass');
  // 吸血回音
  sweep('sine',400,200,t+0.06,0.1,0.04);
}

// ☠️ 亡者大军 — 召唤亡灵
function sfxArmyOfDead(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',60,t,0.3,0.12);
  osc('sawtooth',65,t,0.3,0.1);
  sweep('sine',100,300,t+0.1,0.2,0.06);
  noiseBurst(t+0.15,0.15,0.06,1500,'lowpass');
  // 骨骼碎裂
  for(let i=0;i<3;i++) noiseBurst(t+0.1+i*0.06,0.03,0.04,4000,'bandpass');
}

// 🔵 反魔法护罩 — 冰霜护盾
function sfxAntiMagicShell(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sine',300,1500,t,0.12,0.06);
  osc('sine',800,t+0.05,0.1,0.05);
  // 冰霜质感
  noiseBurst(t+0.06,0.06,0.04,6000,'highpass');
  osc('triangle',600,t+0.08,0.15,0.03);
}

// 🌙 月火术
function sfxMoonfire(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',700,t,0.08,0.06);
  osc('sine',1000,t+0.03,0.06,0.05);
  sweep('triangle',600,1400,t,0.06,0.05);
  noiseBurst(t+0.04,0.04,0.03,3000,'highpass');
}

// 🐱 凶猛撕咬
function sfxFerociousBite(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.04,0.15,4000,'bandpass');
  osc('sawtooth',150,t,0.06,0.12);
  sweep('sawtooth',800,200,t,0.05,0.08);
}

// 🦠 腐蚀术
function sfxCorruption(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',180,t,0.12,0.08);
  osc('sine',190,t,0.12,0.06);
  sweep('sawtooth',200,80,t+0.04,0.1,0.05);
  noiseBurst(t+0.06,0.06,0.04,1500,'lowpass');
}

// 🔥 火焰之雨
function sfxRainOfFire(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.25,0.08,2500,'bandpass');
  sweep('sawtooth',300,800,t,0.2,0.06);
  for(let i=0;i<3;i++){
    osc('sawtooth',80,t+0.08+i*0.06,0.06,0.06);
    noiseBurst(t+0.1+i*0.06,0.04,0.04,3000,'bandpass');
  }
}

// ✨ 奉献
function sfxConsecration(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',350,t,0.1,0.08);
  osc('sine',550,t+0.03,0.08,0.06);
  osc('triangle',450,t+0.06,0.1,0.04);
  noiseBurst(t+0.03,0.06,0.04,3000,'bandpass');
}

// 🔨 愤怒之锤
function sfxHammerOfWrath(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',400,t,0.08,0.1);
  sweep('triangle',800,300,t,0.06,0.08);
  noiseBurst(t+0.02,0.04,0.08,4000,'bandpass');
  osc('sine',600,t+0.04,0.06,0.05);
}

// 🙌 圣疗术
function sfxLayOnHands(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  [400,600,800,1000].forEach((f,i)=>osc('sine',f,t+i*0.06,0.15,0.08));
  osc('triangle',500,t,0.3,0.04);
  sweep('sine',300,1000,t,0.3,0.05);
}

// 🙏 愈合祷言
function sfxPrayerOfMending(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',500,t,0.2,0.06);
  osc('sine',700,t+0.08,0.15,0.05);
  osc('triangle',400,t+0.04,0.18,0.03);
}

// 👤 暗影形态（被动，无CD触发时不会播放，但保留以防）
// 🧥 暗影斗篷
function sfxCloakOfShadows(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sine',1000,200,t,0.1,0.06);
  noiseBurst(t,0.05,0.06,6000,'highpass');
  osc('sine',300,t+0.05,0.1,0.04);
}

// 🦁 狂野怒火
function sfxBestialWrath(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sawtooth',100,t,0.15,0.1);
  osc('sawtooth',150,t+0.05,0.1,0.08);
  sweep('square',200,600,t,0.12,0.06);
  noiseBurst(t+0.08,0.06,0.05,3000,'bandpass');
}

// 🩸 黑暗契约
function sfxDarkPact(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sine',400,100,t,0.15,0.08);
  osc('sawtooth',120,t+0.05,0.12,0.06);
  noiseBurst(t+0.08,0.08,0.05,1500,'lowpass');
  osc('sine',250,t+0.1,0.1,0.04);
}

// 🌱 野性成长
function sfxWildGrowth(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',400,t,0.2,0.06);
  osc('sine',550,t+0.06,0.18,0.05);
  osc('triangle',350,t+0.03,0.2,0.03);
  sweep('sine',300,700,t,0.2,0.03);
}

// ==================== 游戏事件音效 ====================

// 升级
function sfxLevelUp(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  [500,700,900,1200].forEach((f,i)=>osc('sine',f,t+i*0.06,0.15,0.1));
  osc('triangle',600,t,0.3,0.05);
  noiseBurst(t+0.2,0.06,0.04,5000,'highpass');
}

// BOSS警告
function sfxBossWarn(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  // 低沉号角
  osc('sawtooth',80,t,0.5,0.18);
  osc('sawtooth',120,t+0.1,0.4,0.12);
  osc('sawtooth',80,t+0.6,0.5,0.15);
  // 心跳
  osc('sine',50,t+0.3,0.1,0.12);
  osc('sine',50,t+0.5,0.1,0.1);
  noiseBurst(t+0.8,0.2,0.06,1000,'lowpass');
}

// 新波次
function sfxWave(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',300,t,0.1,0.08);
  osc('sine',500,t+0.08,0.1,0.06);
  noiseBurst(t+0.05,0.06,0.04,3000,'highpass');
}

// 开箱/战利品
function sfxLoot(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  [600,800,1000,1300,1600].forEach((f,i)=>osc('sine',f,t+i*0.05,0.1,0.07));
  noiseBurst(t+0.15,0.08,0.04,5000,'highpass');
}

// 拾取（XP/金币/回血球）
function sfxPickup(type){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  if(type==='gold'){
    osc('sine',1200,t,0.05,0.06);
    osc('sine',1800,t+0.03,0.04,0.04);
  }else if(type==='heal'){
    osc('sine',500,t,0.08,0.05);
    osc('sine',700,t+0.04,0.06,0.04);
  }else{
    osc('triangle',1000,t,0.04,0.04);
    osc('triangle',1400,t+0.02,0.03,0.03);
  }
}

// 获得BUFF
function sfxBuff(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',400,t,0.12,0.07);
  osc('sine',600,t+0.06,0.1,0.06);
  osc('sine',800,t+0.1,0.08,0.05);
  sweep('triangle',300,900,t,0.15,0.04);
}

// 技能选择/升级面板打开
function sfxSkillPanel(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',600,t,0.08,0.05);
  osc('sine',900,t+0.06,0.06,0.04);
}

// 选择技能确认
function sfxSkillPick(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',500,t,0.06,0.08);
  osc('sine',800,t+0.04,0.06,0.06);
  osc('sine',1200,t+0.08,0.08,0.05);
}

// 胜利号角
function sfxVictory(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  [400,500,600,800].forEach((f,i)=>osc('sine',f,t+i*0.1,0.3,0.1));
  [400,500,600,800].forEach((f,i)=>osc('triangle',f*1.01,t+i*0.1,0.3,0.05));
  osc('sine',1000,t+0.5,0.5,0.08);
  noiseBurst(t+0.4,0.2,0.04,5000,'highpass');
}

// 复活
function sfxRevive(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  sweep('sine',200,1200,t,0.4,0.12);
  osc('sine',600,t+0.2,0.3,0.08);
  osc('sine',900,t+0.3,0.2,0.06);
  noiseBurst(t+0.3,0.1,0.04,4000,'highpass');
}

// 按钮点击
function sfxClick(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  osc('sine',800,t,0.03,0.04);
  osc('sine',1200,t+0.01,0.02,0.03);
}

// 爆炸/AOE通用
function sfxExplosion(intensity){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  const vol=clamp(intensity||0.5,0.1,0.6);
  osc('sine',40+Math.random()*20,t,0.15,vol*0.3);
  noiseBurst(t,0.1,vol*0.25,2000,'bandpass');
  noiseBurst(t+0.02,0.06,vol*0.15,4000,'highpass');
}

// 闪电视觉音效
function sfxLightningBolt(){
  ensureCtx();if(!ctx||_muted)return;const t=now();
  noiseBurst(t,0.04,0.12,7000,'highpass');
  osc('square',2500,t,0.02,0.06);
  osc('sawtooth',100,t,0.05,0.08);
}

// ==================== 背景氛围音乐（战斗中循环生成） ====================
let _bgmLoop=null;
let _bgmNodes=[];
let _bgmPlaying=false;

function startBgm(){
  ensureCtx();if(!ctx||_bgmPlaying)return;
  _bgmPlaying=true;
  _scheduleBgm();
}

function _scheduleBgm(){
  if(!_bgmPlaying||!ctx)return;
  const t=now();
  // 低频脉冲鼓点
  const bpm=90;const beatDur=60/bpm;
  for(let i=0;i<8;i++){
    const bt=t+i*beatDur;
    // 底鼓
    if(i%2===0){
      const o1=ctx.createOscillator();const g1=ctx.createGain();
      o1.type='sine';o1.frequency.setValueAtTime(80,bt);o1.frequency.exponentialRampToValueAtTime(30,bt+0.15);
      g1.gain.setValueAtTime(0.06,bt);g1.gain.exponentialRampToValueAtTime(0.001,bt+0.2);
      o1.connect(g1);g1.connect(bgmGain);o1.start(bt);o1.stop(bt+0.25);
      _bgmNodes.push(o1);
    }
    // Hi-hat
    if(i%2===1||i%4===0){
      const nb=noiseBuf();if(nb){
        const src=ctx.createBufferSource();src.buffer=nb;
        const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=8000;
        const g=ctx.createGain();g.gain.setValueAtTime(0.015,bt);g.gain.exponentialRampToValueAtTime(0.001,bt+0.05);
        src.connect(f);f.connect(g);g.connect(bgmGain);
        src.start(bt);src.stop(bt+0.08);_bgmNodes.push(src);
      }
    }
  }
  // 氛围Pad（低音持续音）
  const padDur=8*beatDur;
  const notes=[55,65.41,73.42,82.41]; // A1, C2, D2, E2
  const padNote=notes[Math.floor(Math.random()*notes.length)];
  const po=ctx.createOscillator();const pg=ctx.createGain();
  po.type='triangle';po.frequency.value=padNote;
  pg.gain.setValueAtTime(0,t);pg.gain.linearRampToValueAtTime(0.03,t+0.5);
  pg.gain.linearRampToValueAtTime(0.03,t+padDur-0.5);pg.gain.linearRampToValueAtTime(0,t+padDur);
  const pf=ctx.createBiquadFilter();pf.type='lowpass';pf.frequency.value=200;
  po.connect(pf);pf.connect(pg);pg.connect(bgmGain);
  po.start(t);po.stop(t+padDur+0.1);_bgmNodes.push(po);

  // 偶尔加入高频旋律片段
  if(Math.random()<0.4){
    const melodyNotes=[330,392,440,523,587,659]; // E4-E5
    const startBeat=Math.floor(Math.random()*4)*2;
    for(let j=0;j<3;j++){
      const nt=t+(startBeat+j)*beatDur;
      const freq=melodyNotes[Math.floor(Math.random()*melodyNotes.length)];
      const mo=ctx.createOscillator();const mg=ctx.createGain();
      mo.type='sine';mo.frequency.value=freq;
      mg.gain.setValueAtTime(0.015,nt);mg.gain.exponentialRampToValueAtTime(0.001,nt+beatDur*0.8);
      mo.connect(mg);mg.connect(bgmGain);
      mo.start(nt);mo.stop(nt+beatDur+0.1);_bgmNodes.push(mo);
    }
  }

  // 调度下一个8拍
  _bgmLoop=setTimeout(()=>_scheduleBgm(),padDur*1000-200);
}

function stopBgm(){
  _bgmPlaying=false;
  if(_bgmLoop){clearTimeout(_bgmLoop);_bgmLoop=null}
  _bgmNodes.forEach(n=>{try{n.stop()}catch(e){}});
  _bgmNodes=[];
}

// ==================== 音量控制 ====================
function setSfxVol(v){_sfxVol=clamp(v);if(sfxGain)sfxGain.gain.value=_sfxVol}
function setBgmVol(v){_bgmVol=clamp(v);if(bgmGain)bgmGain.gain.value=_bgmVol}
function setMuted(m){
  _muted=!!m;
  if(masterGain)masterGain.gain.value=_muted?0:1;
  if(_muted)stopBgm();
}
function isMuted(){return _muted}
function getSfxVol(){return _sfxVol}
function getBgmVol(){return _bgmVol}

// ==================== 技能ID → 音效映射 ====================
const SKILL_SFX_MAP={
  // 通用技能
  'fireball':sfxFireball, 'frostnova':sfxFrostNova, 'thunder':sfxThunder,
  'heal':sfxHeal,
  'livingbomb':sfxLivingBomb, 'blizzard':sfxBlizzard, 'chainlight':sfxChainLightning,
  'naturewrath':sfxNatureWrath,
  'chainstorm':sfxChainStorm, 'forkedlight':sfxForkedLight,
  'ashbringer':sfxAshbringer, 'frostmourne':sfxFrostmourne,
  'eyeofsargeras':sfxEyeOfSargeras, 'dalaran':sfxDalaran, 'timewarp':sfxTimewarp,
  // 标志技能
  'sig_whirlwind':sfxWhirlwind, 'sig_firestorm':sfxFlameStorm, 'sig_multishot':sfxMultiShot,
  'sig_shadowword':sfxShadowWord, 'sig_shadowdance':sfxShadowDance,
  'sig_totemstorm':sfxTotemStorm, 'sig_remorseless':sfxRemorselessWinter,
  'sig_starfall':sfxStarfall, 'sig_doomguard':sfxDoomguard, 'sig_avenger':sfxAvengerShield,
  'sig_wintercoming':sfxWinterComing, // 凛冬将至
  // 合成技
  'titangrip':sfxTitanGrip, 'icefire':sfxIceFire, 'soulreap':sfxSoulReap,
  // 职业专属技能 — 战士
  'heroic_leap':sfxHeroicLeap, 'execute_strike':sfxExecuteStrike, 'shield_wall':sfxShieldWall,
  // 职业专属技能 — 法师
  'pyroblast':sfxPyroblast, 'arcane_blast':sfxArcaneBlast, 'ice_barrier':sfxIceBarrier,
  // 职业专属技能 — 猎人
  'explosive_trap':sfxExplosiveTrap, 'aimed_shot':sfxAimedShot, 'bestial_wrath':sfxBestialWrath,
  // 职业专属技能 — 牧师
  'mind_blast':sfxMindBlast, 'prayer_of_mending':sfxPrayerOfMending,
  // 职业专属技能 — 盗贼
  'eviscerate':sfxEviscerate, 'cloak_of_shadows':sfxCloakOfShadows, 'blade_dance':sfxBladeDance,
  // 职业专属技能 — 萨满
  'lava_burst':sfxLavaBurst, 'healing_rain':sfxHealingRain, 'earthquake':sfxEarthquake,
  // 职业专属技能 — 死骑
  'death_strike':sfxDeathStrike, 'army_of_dead':sfxArmyOfDead, 'anti_magic_shell':sfxAntiMagicShell,
  // 职业专属技能 — 德鲁伊
  'moonfire':sfxMoonfire, 'wild_growth':sfxWildGrowth, 'ferocious_bite':sfxFerociousBite,
  // 职业专属技能 — 术士
  'corruption':sfxCorruption, 'rain_of_fire':sfxRainOfFire, 'dark_pact':sfxDarkPact,
  // 职业专属技能 — 圣骑士
  'consecration':sfxConsecration, 'lay_on_hands':sfxLayOnHands, 'hammer_of_wrath':sfxHammerOfWrath,
};
// 注意：thorns/bloodthirst/timewarp 等被动技能（cd=0）不在映射中，不播放音效

// ===== 技能音效智能节流系统 =====
// 问题：短CD技能（<2s）频繁触发音效非常刺耳，多个技能叠加更严重
// 方案：① 单技能独立节流 ② 全局节流防止音效轰炸 ③ 高频技能降低音量+随机跳过
const _skillSfxThrottle={}; // 每个技能的上次播放时间
let _globalSkillSfxLast=0;  // 全局上次技能音效时间
const GLOBAL_SKILL_SFX_MIN_GAP=180; // 全局最小间隔(ms)，防止多技能同时发声

// 短CD技能的额外配置：最小播放间隔 + 随机跳过概率 + 音量衰减
const SKILL_SFX_LIMITS={
  // 基础短CD技能 — 最容易造成音效轰炸
  'fireball':{minGap:800,skipChance:0.4,volScale:0.5},
  'thunder':{minGap:700,skipChance:0.3,volScale:0.6},
  'livingbomb':{minGap:700,skipChance:0.3,volScale:0.6},
  'chainlight':{minGap:700,skipChance:0.25,volScale:0.65},
  'naturewrath':{minGap:700,skipChance:0.35,volScale:0.55},
  // 进阶短CD技能
  'chainstorm':{minGap:600,skipChance:0.2,volScale:0.7},
  'forkedlight':{minGap:600,skipChance:0.2,volScale:0.7},
  // 中等CD的签名技能（不那么频繁但也做轻微限制）
  'sig_whirlwind':{minGap:500,skipChance:0.1,volScale:0.8},
  'sig_firestorm':{minGap:500,skipChance:0.1,volScale:0.8},
  'sig_multishot':{minGap:500,skipChance:0.1,volScale:0.8},
  'sig_avenger':{minGap:500,skipChance:0.1,volScale:0.8},
  // 职业专属短CD技能
  'arcane_blast':{minGap:600,skipChance:0.35,volScale:0.5},
  'moonfire':{minGap:700,skipChance:0.3,volScale:0.55},
  'corruption':{minGap:700,skipChance:0.3,volScale:0.55},
  'eviscerate':{minGap:600,skipChance:0.2,volScale:0.65},
  'blade_dance':{minGap:600,skipChance:0.2,volScale:0.65},
  'lava_burst':{minGap:600,skipChance:0.2,volScale:0.65},
  'death_strike':{minGap:600,skipChance:0.2,volScale:0.65},
  'ferocious_bite':{minGap:500,skipChance:0.15,volScale:0.7},
};

// 职业攻击音效映射
const HERO_ATK_SFX={
  'warrior':sfxWarriorAtk, 'mage':sfxMageAtk, 'hunter':sfxHunterAtk,
  'priest':sfxPriestAtk, 'rogue':sfxRogueAtk, 'shaman':sfxShamanAtk,
  'deathknight':sfxDeathknightAtk, 'druid':null, /* 特殊处理 */
  'warlock':sfxWarlockAtk, 'paladin':sfxPaladinAtk,
};

// 按技能ID播放（带智能节流）
function playSkillSfx(skillId){
  const fn=SKILL_SFX_MAP[skillId];
  if(!fn)return; // 被动技能（thorns/bloodthirst/timewarp）无映射，直接跳过

  const t=Date.now();
  // ① 全局节流：距离上次任意技能音效太近则跳过
  if(t-_globalSkillSfxLast<GLOBAL_SKILL_SFX_MIN_GAP)return;

  const limit=SKILL_SFX_LIMITS[skillId];
  if(limit){
    // ② 单技能节流：距离同一技能上次播放太近则跳过
    const lastPlay=_skillSfxThrottle[skillId]||0;
    if(t-lastPlay<limit.minGap)return;
    // ③ 随机跳过：高频技能有概率静默，减轻听觉疲劳
    if(Math.random()<limit.skipChance)return;
    // ④ 音量衰减：短CD技能音效降低音量
    if(limit.volScale<1&&sfxGain){
      const origVol=sfxGain.gain.value;
      sfxGain.gain.value=origVol*limit.volScale;
      fn();
      // 恢复原音量（下一帧）
      setTimeout(()=>{if(sfxGain)sfxGain.gain.value=origVol},50);
    }else{
      fn();
    }
  }else{
    // 长CD技能（传说/史诗大招）：无限制，全音量播放
    fn();
  }
  _skillSfxThrottle[skillId]=t;
  _globalSkillSfxLast=t;
}

// 按职业播放攻击音效（攻击也做基本节流）
let _heroAtkSfxLast=0;
const HERO_ATK_SFX_MIN_GAP=250; // 攻击音效最小间隔250ms
function playHeroAtkSfx(heroId,extra){
  const t=Date.now();
  if(t-_heroAtkSfxLast<HERO_ATK_SFX_MIN_GAP)return;
  _heroAtkSfxLast=t;
  if(heroId==='druid'){sfxDruidAtk(extra&&extra.isBear);return}
  const fn=HERO_ATK_SFX[heroId];if(fn)fn();
}

// ==================== 全局导出 ====================
window.SFX={
  // 打击反馈
  hit:sfxHit, crit:sfxCrit, kill:sfxKill, eliteKill:sfxEliteKill, bossKill:sfxBossKill,
  heroDmg:sfxHeroDmg, heroDeath:sfxHeroDeath, dodge:sfxDodge,
  // 职业攻击
  heroAtk:playHeroAtkSfx,
  // 技能
  skill:playSkillSfx,
  // 事件
  levelUp:sfxLevelUp, bossWarn:sfxBossWarn, wave:sfxWave, loot:sfxLoot,
  pickup:sfxPickup, buff:sfxBuff, skillPanel:sfxSkillPanel, skillPick:sfxSkillPick,
  victory:sfxVictory, revive:sfxRevive, click:sfxClick,
  explosion:sfxExplosion, lightning:sfxLightningBolt,
  // BGM
  startBgm, stopBgm,
  // 控制
  setSfxVol, setBgmVol, setMuted, isMuted, getSfxVol, getBgmVol,
};

})();
