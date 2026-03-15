// =====================================================================
//  《艾泽拉斯幸存者》 主城系统模块 (IIFE, no ES modules)
// =====================================================================
(function(){
const {ALL_HEROES,CHAPTERS,SIGNIN_REWARDS,EQUIPMENT_DB,ARENA_RANKS,ARENA_RANK_NAMES,ARENA_RANK_ICONS,ARENA_RANK_REQ,BP_REWARDS,BP_MAX,BP_XP,ACHIEVEMENTS,QUEST_TEMPLATES,SHOP_DATA,DRAW_PRIZES,SKILL_DB,RARITY_NAME,RARITY_COLOR,
  HERO_LEVEL,TALENT_TREES,ENHANCE_DATA,HERO_STAR,STUCK_GUIDE,calcHeroXpNeed,calcHeroLevelBonus} = window.DATA;

// ==================== 持久化 ====================
const SAVE_KEY='azeroth_sv';
function loadSave(){try{const d=localStorage.getItem(SAVE_KEY);return d?JSON.parse(d):null}catch(e){return null}}
function saveToDisk(PD){try{localStorage.setItem(SAVE_KEY,JSON.stringify(PD))}catch(e){}}

function createDefaultPD(){
  return{
    name:'英雄',level:1,xp:0,xpNeed:100,gold:2000,diamond:500,stamina:120,maxStamina:120,
    heroes:{warrior:{unlocked:true,frags:0,level:1,xp:0,star:0},mage:{unlocked:true,frags:0,level:1,xp:0,star:0}},
    selectedHero:'warrior',chapters:{ch1:{unlocked:true,stars:0,cleared:false}},selectedChapter:'ch1',
    signInDay:0,lastSignDate:'',
    forgeSlots:[null,null,null,null],equipment:{weapon:null,armor:null,trinket:null,ring:null},
    equipEnhance:{},  // {itemId: enhanceLevel} 装备强化等级
    inventory:[],
    talents:{war:[],def:[],util:[]}, // 每条路线已选天赋ID列表
    arenaRank:'bronze',arenaPoints:0,arenaCharges:5,arenaWins:0,
    guildJoined:false,guildName:'',guildContrib:0,
    bpLevel:1,bpXp:0,bpPaid:false,bpClaimed:[],
    achievementsClaimed:[],
    dailyQuests:[],dailyProgress:{games:0,kills:0,bossKills:0,arenaFights:0},lastDailyReset:'',dailyChestsClaimed:0,
    drawChances:3,lastDrawDate:'',
    firstChargeDone:false,monthCard:0,totalCharged:0,
    totalKills:0,totalGames:0,totalBossKills:0,maxWave:0,maxKillStreak:0,
    firstWinToday:false,lastFirstWinDate:'',
    // 卡关追踪
    consecutiveFails:0, lastFailChapter:'',
    totalFrags:0, // 通用碎片（用于强化等）
    installDate:new Date().toDateString(),daysSinceInstall:0
  };
}

// ==================== 工具函数 ====================
function $(id){return document.getElementById(id)}
function getHeroCount(PD){return Object.values(PD.heroes).filter(h=>h.unlocked).length}
function getChaptersCleared(PD){return Object.values(PD.chapters).filter(c=>c.cleared).length}
function getDaysSince(dateStr){if(!dateStr)return 0;return Math.floor((Date.now()-new Date(dateStr).getTime())/(86400000))}

// ==================== 奖励弹窗 ====================
function showRewardPopup(items){
  $('popup-reward-title').textContent='🎉 获得奖励！';
  $('popup-reward-items').innerHTML=items.map(i=>`<div class="popup-item"><div class="popup-item-icon">${i.icon}</div><div>${i.text}</div></div>`).join('');
  $('popup-reward').classList.add('active');
}

// ==================== 主菜单刷新 ====================
function refreshMainMenu(PD){
  const hero=ALL_HEROES[PD.selectedHero];
  $('mm-avatar').textContent=hero.icon;
  $('mm-name').textContent=PD.name;
  // 显示当前选中英雄的等级（而非无效的账号等级PD.level）
  const _selHd=PD.heroes[PD.selectedHero];
  $('mm-level').textContent=(_selHd&&_selHd.level)||1;
  $('cur-diamond').textContent=PD.diamond;
  $('cur-gold').textContent=PD.gold;
  $('cur-stamina').textContent=PD.stamina;
  const maxStEl=$('max-stamina');if(maxStEl)maxStEl.textContent=PD.maxStamina;
  $('mm-hero-model').textContent=hero.icon;
  // 尝试用立绘替代emoji
  const heroImgEl=$('mm-hero-model');
  const heroImgPath='assets/heroes/'+hero.id+'.png';
  const _testImg=new Image();
  _testImg.onload=()=>{heroImgEl.textContent='';heroImgEl.style.backgroundImage='url('+heroImgPath+')';heroImgEl.style.backgroundSize='contain';heroImgEl.style.backgroundRepeat='no-repeat';heroImgEl.style.backgroundPosition='center';heroImgEl.style.width='160px';heroImgEl.style.height='160px';heroImgEl.style.margin='0 auto'};
  _testImg.onerror=()=>{heroImgEl.style.backgroundImage='';heroImgEl.textContent=hero.icon};
  _testImg.src=heroImgPath;
  $('mm-hero-tag').textContent=hero.name;
  // 显示英雄职业
  const roleEl=$('mm-hero-role');
  if(roleEl)roleEl.textContent=hero.origin+' · '+hero.role;
  // 显示总战力
  const pwrEl=$('mm-hero-power');
  if(pwrEl){
    const pw=calcTotalPower(PD);
    pwrEl.textContent='⚔️ 战力 '+pw.power;
  }
  // 签到红点
  const today=new Date().toDateString();
  const dot=$('dot-signin');if(dot)dot.classList.toggle('show',PD.lastSignDate!==today);
  // 锻造红点
  const fdot=$('dot-forge');
  if(fdot){const hasReady=PD.forgeSlots.some(s=>s&&Date.now()>=s.endTime);fdot.classList.toggle('show',hasReady)}
  // 宝箱浮动
  const cf=$('chest-float');
  if(cf){const hasReady=PD.forgeSlots.some(s=>s&&Date.now()>=s.endTime);cf.classList.toggle('show',hasReady)}
  // 检查每日重置
  checkDailyReset(PD);
  // 首充弹窗（新玩家，未首充）
  if(!PD.firstChargeDone&&PD.totalGames>=2){setTimeout(()=>$('popup-first-charge').classList.add('active'),1500)}
}

function checkDailyReset(PD){
  const today=new Date().toDateString();
  if(PD.lastDailyReset!==today){
    PD.lastDailyReset=today;
    PD.dailyProgress={games:0,kills:0,bossKills:0,arenaFights:0};
    PD.arenaCharges=5;PD.drawChances=3;PD.dailyChestsClaimed=0;PD.guildRaidDone=false;
    if(PD.lastFirstWinDate!==today)PD.firstWinToday=false;
    // 生成每日任务
    const shuffled=[...QUEST_TEMPLATES].sort(()=>Math.random()-.5);
    PD.dailyQuests=shuffled.slice(0,4).map(q=>({...q,progress:0,claimed:false}));
    // 计算安装天数
    PD.daysSinceInstall=getDaysSince(PD.installDate);
    saveToDisk(PD);
  }
}

// ==================== 签到 ====================
function renderSignIn(PD){
  const w=$('signin-week');w.innerHTML='';
  SIGNIN_REWARDS.forEach((r,i)=>{
    const claimed=i<PD.signInDay;const isToday=i===PD.signInDay;const locked=i>PD.signInDay;
    const d=document.createElement('div');
    d.className=`signin-day${claimed?' claimed':''}${isToday?' today':''}${locked?' locked':''}`;
    d.innerHTML=`<div class="sd-day">Day ${r.day}</div><div class="sd-icon">${r.icon}</div><div class="sd-reward">${r.text}</div>`;
    w.appendChild(d);
  });
  const btn=$('btn-signin');const today=new Date().toDateString();
  if(PD.lastSignDate===today){btn.textContent='已签到';btn.disabled=true;btn.style.opacity='.5'}
  else{btn.textContent='签到领取';btn.disabled=false;btn.style.opacity='1'}
}
function doSignIn(PD){
  const today=new Date().toDateString();
  if(PD.lastSignDate===today||PD.signInDay>=7)return;
  const r=SIGNIN_REWARDS[PD.signInDay];
  if(r.type==='diamond')PD.diamond+=r.amount;
  else if(r.type==='gold')PD.gold+=r.amount;
  else if(r.type==='fragment'){
    if(!PD.heroes[r.hero])PD.heroes[r.hero]={unlocked:false,frags:0};
    PD.heroes[r.hero].frags+=r.amount;
    if(PD.heroes[r.hero].frags>=10)PD.heroes[r.hero].unlocked=true;
  }
  else if(r.type==='chest')PD.diamond+=100;
  PD.signInDay++;PD.lastSignDate=today;
  PD.dailyProgress.signins=1;
  showRewardPopup([{icon:r.icon,text:r.text}]);
  renderSignIn(PD);refreshMainMenu(PD);saveToDisk(PD);
}

// ==================== 英雄面板（含等级/升星） ====================
function renderHeroes(PD){
  const grid=$('hero-grid');grid.innerHTML='';
  const detail=$('hero-detail');
  Object.values(ALL_HEROES).forEach(h=>{
    const pd=PD.heroes[h.id];const unlocked=pd&&pd.unlocked;const selected=PD.selectedHero===h.id;
    const card=document.createElement('div');
    card.className=`hg-card${selected?' selected':''}${!unlocked?' locked':''}`;
    const heroImgPath='assets/heroes/'+h.id+'.png';
    const starStr=unlocked&&pd.star>0?HERO_STAR.STAR_COLORS.slice(0,pd.star).join(''):'';
    const lvStr=unlocked?`<div class="hg-lv">Lv.${pd.level||1}</div>`:'';
    card.innerHTML=`<div class="hg-icon"><img src="${heroImgPath}" onerror="this.style.display='none';this.parentElement.textContent='${h.icon}'" style="width:48px;height:48px;object-fit:contain;display:block;margin:0 auto"></div><div class="hg-name">${h.name}</div>
      ${starStr?`<div class="hg-stars">${starStr}</div>`:''}${lvStr}
      ${!unlocked?`<div class="hg-lock-info">${h.unlock}</div><div class="hg-frag">${pd?pd.frags:0}/10</div>`:''}`;
    if(unlocked)card.onclick=()=>{PD.selectedHero=h.id;saveToDisk(PD);renderHeroes(PD);refreshMainMenu(PD)};
    grid.appendChild(card);
  });
  const sel=ALL_HEROES[PD.selectedHero];
  const selPd=PD.heroes[PD.selectedHero]||{level:1,xp:0,star:0,frags:0};
  const selImgPath='assets/heroes/'+sel.id+'.png';
  const lvBonus=calcHeroLevelBonus(selPd.level||1);
  const starMult=HERO_STAR.STAT_MULT[selPd.star||0];
  const finalAtk=Math.round((sel.atk+lvBonus.atk)*starMult);
  const finalHp=Math.round((sel.hp+lvBonus.hp)*starMult);
  const xpNeed=calcHeroXpNeed(selPd.level||1);
  const xpPct=Math.min(100,(selPd.xp||0)/xpNeed*100);
  const starDisp=selPd.star>0?HERO_STAR.STAR_COLORS.slice(0,selPd.star).join(''):'-';
  // 升星信息
  const canUpStar=selPd.star<HERO_STAR.MAX_STAR;
  const nextStarCost=canUpStar?HERO_STAR.FRAG_COST[selPd.star+1]:0;
  const hasFrags=(selPd.frags||0)>=nextStarCost;
  detail.innerHTML=`<div class="hd-top"><div class="hd-icon"><img src="${selImgPath}" onerror="this.style.display='none';this.parentElement.textContent='${sel.icon}'" style="width:64px;height:64px;object-fit:contain"></div><div class="hd-info"><h3>${sel.name} <span style="font-size:13px;color:#c9a44a">Lv.${selPd.level||1}</span></h3><p>${sel.origin} · ${sel.role}</p>
    <div class="hd-xp-bar"><div class="hd-xp-fill" style="width:${xpPct}%"></div><span class="hd-xp-text">${selPd.xp||0}/${xpNeed}</span></div></div></div>
    <div class="hd-stats">
      <div class="hd-stat"><div class="hd-stat-val">${finalAtk}</div><div class="hd-stat-label">攻击<span class="hd-bonus">(+${lvBonus.atk})</span></div></div>
      <div class="hd-stat"><div class="hd-stat-val">${finalHp}</div><div class="hd-stat-label">生命<span class="hd-bonus">(+${lvBonus.hp})</span></div></div>
      <div class="hd-stat"><div class="hd-stat-val">${sel.spd}</div><div class="hd-stat-label">速度</div></div>
      <div class="hd-stat"><div class="hd-stat-val">${starDisp}</div><div class="hd-stat-label">星级 ×${starMult}</div></div>
    </div>
    <div class="hd-skill">标志技能：<span>${sel.skill}</span></div>
    <div class="hd-sig-detail" style="background:rgba(255,68,102,.08);border:1px solid rgba(255,68,102,.2);border-radius:8px;padding:8px 10px;margin:6px 0">
      ${(()=>{const sigSk=SKILL_DB.find(s=>s.id===sel.signatureSkill);return sigSk?`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:20px">${sigSk.icon}</span><span style="color:#ff4466;font-weight:bold;font-size:13px">${sigSk.name}</span><span style="font-size:10px;color:#ff88aa;border:1px solid rgba(255,68,102,.3);padding:1px 5px;border-radius:4px">开局自动获得</span></div><div style="color:#e8dcc8;font-size:11px;line-height:1.4">${sigSk.desc}</div><div style="color:#8b7a60;font-size:10px;margin-top:3px">CD:${sigSk.cd}s · 最高${sigSk.maxLevel}级</div>`:''})()}
    </div>
    <div class="hd-favor" style="margin:4px 0;font-size:11px;color:#b8a88c">
      偏好技能：${(sel.favorSkills||[]).map(fid=>{const fsk=SKILL_DB.find(s=>s.id===fid);return fsk?`<span style="color:${RARITY_COLOR[fsk.rarity]};margin:0 2px" title="${fsk.name}">${fsk.icon}${fsk.name}</span>`:''}).join(' ')}
      <span style="color:#7a6e55;font-size:10px">（出现概率×3）</span>
    </div>
    <div class="hd-actions">
      ${canUpStar?`<button class="btn-sm btn-star${hasFrags?' ready':''}" onclick="window._heroUpStar()">⭐ 升星 (${selPd.frags||0}/${nextStarCost}碎片)</button>`:`<div class="hd-max-star">💫 已满星</div>`}
      <button class="btn-sm btn-talent" onclick="openPanel('talent')">🌟 天赋</button>
    </div>`;
}

// ==================== 副本选择 ====================
function renderChapters(PD){
  const list=$('chapter-list');list.innerHTML='';
  const detail=$('chapter-detail');
  const myPower=calcTotalPower(PD);
  Object.values(CHAPTERS).forEach(ch=>{
    const pd=PD.chapters[ch.id];const unlocked=pd&&pd.unlocked;
    const isUnlockable=checkChapterUnlock(ch,PD);
    const selected=PD.selectedChapter===ch.id;
    const item=document.createElement('div');
    item.className=`ch-item${selected?' selected':''}${!unlocked&&!isUnlockable?' locked':''}`;
    const stars=pd?'⭐'.repeat(pd.stars):'';
    // 战力判定: 绿=轻松 / 黄=挑战 / 红=危险
    const rec=ch.recPower||0;
    const ratio=rec>0?myPower.power/rec:9;
    const pwrClass=ratio>=1.2?'pw-easy':ratio>=0.7?'pw-hard':'pw-danger';
    const pwrLabel=ratio>=1.2?'轻松':ratio>=0.7?'挑战':'危险';
    item.innerHTML=`<div class="ch-num">${ch.num}</div><div class="ch-info"><div class="ch-name">${ch.name}</div><div class="ch-desc">${ch.desc}</div><div class="ch-stars">${stars}</div></div>
      <div class="ch-right">${unlocked||isUnlockable?`<div class="ch-pwr-tag ${pwrClass}">${pwrLabel}</div>`:`<div class="ch-lock">🔒</div>`}</div>`;
    if(unlocked||isUnlockable){
      if(isUnlockable&&!unlocked){PD.chapters[ch.id]={unlocked:true,stars:0,cleared:false};saveToDisk(PD)}
      item.onclick=()=>{PD.selectedChapter=ch.id;saveToDisk(PD);renderChapters(PD)};
    }
    list.appendChild(item);
  });
  const sel=CHAPTERS[PD.selectedChapter]||CHAPTERS.ch1;
  const recP=sel.recPower||0;
  const pRatio=recP>0?myPower.power/recP:9;
  const pBarPct=Math.min(100,Math.round(pRatio*100));
  const pColor=pRatio>=1.2?'#44ff44':pRatio>=0.7?'#ffaa00':'#ff4444';
  const pLabel=pRatio>=1.2?'✅ 战力充足':pRatio>=0.7?'⚠️ 有些挑战':'❌ 战力不足';
  detail.innerHTML=`
    <div class="cd-power-compare">
      <div class="cd-pwr-header"><span>⚔️ 我的战力 <b style="color:${pColor}">${myPower.power}</b></span><span>推荐战力 <b>${recP}</b></span></div>
      <div class="cd-pwr-bar"><div class="cd-pwr-fill" style="width:${pBarPct}%;background:${pColor}"></div><div class="cd-pwr-mark"></div></div>
      <div class="cd-pwr-label" style="color:${pColor}">${pLabel}</div>
    </div>
    ${renderPowerBreakdown(PD)}
    <div class="cd-boss">BOSS：💀 ${sel.boss.name} (HP:${sel.boss.hp})</div>
    <div class="cd-enemies">敌人：${sel.enemyTypes.map(e=>e.name).join('、')}</div>
    <div class="cd-reward">奖励：💰${sel.reward.gold} | ✨${sel.reward.xp}经验 | 🧩${sel.reward.frags}碎片</div>`;
  // 首胜标记
  const tag=$('first-win-tag');
  if(tag)tag.style.display=PD.firstWinToday?'none':'block';
}
function checkChapterUnlock(ch,PD){
  if(!ch.unlockReq)return true;
  if(PD.chapters[ch.unlockReq])return PD.chapters[ch.unlockReq].cleared;
  if(ch.unlockReq==='ch4')return PD.chapters.ch3&&PD.chapters.ch3.cleared;
  if(ch.unlockReq==='ch5')return PD.chapters.ch4&&PD.chapters.ch4.cleared;
  if(ch.unlockReq==='level15')return PD.level>=15;
  if(ch.unlockReq==='day7')return PD.daysSinceInstall>=7;
  if(ch.unlockReq==='season')return PD.daysSinceInstall>=7;
  return false;
}

// ==================== 锻造 ====================
function renderForge(PD){
  const slots=$('forge-slots');slots.innerHTML='';
  // 确保有6个锻造槽
  if(!PD.forgeSlots||PD.forgeSlots.length<6){
    const old=PD.forgeSlots||[null,null,null,null];
    PD.forgeSlots=[old[0]||null,old[1]||null,old[2]||null,old[3]||null,old[4]||null,old[5]||null];
  }
  for(let i=0;i<6;i++){
    const s=PD.forgeSlots[i];const slot=document.createElement('div');
    if(!s){
      slot.className='fg-slot';
      slot.innerHTML=`<div class="fg-icon">➕</div><div class="fg-name">空闲</div><div class="fg-status">点击开始锻造</div>`;
      slot.onclick=()=>startForge(PD,i);
    }else{
      const eq=EQUIPMENT_DB.find(e=>e.id===s.itemId);
      const now=Date.now();const ready=now>=s.endTime;
      slot.className=`fg-slot${ready?' ready':' forging'}`;
      if(ready){
        slot.innerHTML=`<div class="fg-icon">${eq.icon}</div><div class="fg-name">${eq.name}</div><div class="fg-status" style="color:#44ff44">✅ 完成！点击领取</div>`;
        slot.onclick=()=>claimForge(PD,i);
      }else{
        const left=Math.ceil((s.endTime-now)/1000);const m=Math.floor(left/60),sec=left%60;
        slot.innerHTML=`<div class="fg-icon">${eq.icon}</div><div class="fg-name">${eq.name}</div><div class="fg-status">⏰ ${m}:${String(sec).padStart(2,'0')}</div>`;
      }
    }
    slots.appendChild(slot);
  }
  // ===== 我的装备总览 =====
  renderMyEquipment(PD);
}
// ==================== 我的装备总览+换装 ====================
function renderMyEquipment(PD){
  let container=$('my-equipment');
  if(!container){
    container=document.createElement('div');container.id='my-equipment';
    const forgeBody=$('forge').querySelector('.panel-body');
    if(forgeBody)forgeBody.insertBefore(container,forgeBody.firstChild);
  }
  const slotNames={weapon:'⚔️ 武器',armor:'🛡️ 护甲',helmet:'⛑️ 头盔',boots:'👢 靴子',trinket:'💎 饰品',ring:'💍 戒指'};
  const slots=['weapon','armor','helmet','boots','trinket','ring'];
  // 确保PD.equipment有新槽位
  if(!PD.equipment.helmet)PD.equipment.helmet=null;
  if(!PD.equipment.boots)PD.equipment.boots=null;
  let html='<div class="my-equip-title">📋 当前装备</div><div class="my-equip-grid">';
  let totalAtk=0,totalHp=0,totalCrit=0,totalArmor=0;
  const equippedSets={};// 统计套装件数
  slots.forEach(slot=>{
    const eqId=PD.equipment[slot];
    const eq=eqId?EQUIPMENT_DB.find(e=>e.id===eqId):null;
    const enhLv=eq?(PD.equipEnhance[eqId]||0):0;
    const hasInv=PD.inventory.filter(id=>{const e=EQUIPMENT_DB.find(x=>x.id===id);return e&&e.slot===slot}).length>0;
    if(eq){
      totalAtk+=eq.atk;totalHp+=eq.hp;totalCrit+=(eq.critRate||0);totalArmor+=(eq.armor||0);
      if(eq.setId)equippedSets[eq.setId]=(equippedSets[eq.setId]||0)+1;
      const rarColor=RARITY_COLOR[eq.rarity]||'#aaa';
      html+=`<div class="my-equip-slot rarity-${eq.rarity}" onclick="window._showEquipSwap('${slot}')">
        <div class="mes-label">${slotNames[slot]}</div>
        <div class="mes-icon">${eq.icon}</div>
        <div class="mes-name" style="color:${rarColor}">${eq.name}${enhLv>0?' <span style="color:#c9a44a">+'+enhLv+'</span>':''}${eq.classReq?' <span style="font-size:10px;color:#8b7a60">['+((ALL_HEROES[eq.classReq]||{}).name||eq.classReq)+']</span>':''}</div>
        <div class="mes-stats">${eq.atk>0?'⚔'+eq.atk+' ':''}${eq.hp>0?'❤'+eq.hp+' ':''}${eq.armor>0?'🛡'+eq.armor+' ':''}${eq.critRate>0?'💥'+(eq.critRate*100).toFixed(0)+'%':''}${eq.spd>0?'💨'+eq.spd:''}</div>
        ${eq.effectDesc?'<div class="mes-effect">'+eq.effectDesc+'</div>':''}
        ${eq.setId?'<div class="mes-set" style="color:#c9a44a;font-size:10px">套装: '+(SET_BONUSES[eq.setId]||{}).name+'</div>':''}
        ${hasInv?'<div class="mes-swap-hint">点击换装</div>':''}
      </div>`;
    }else{
      html+=`<div class="my-equip-slot empty" onclick="window._showEquipSwap('${slot}')">
        <div class="mes-label">${slotNames[slot]}</div>
        <div class="mes-icon" style="opacity:.3">➕</div>
        <div class="mes-name" style="color:#7a6e55">未装备</div>
        ${hasInv?'<div class="mes-swap-hint">点击装备</div>':'<div class="mes-stats" style="color:#444">锻造获取</div>'}
      </div>`;
    }
  });
  html+='</div>';
  // 套装效果显示
  const activeSetHtml=Object.entries(equippedSets).filter(([id,cnt])=>cnt>=2&&SET_BONUSES[id]).map(([id,cnt])=>{
    const sb=SET_BONUSES[id];
    return `<div style="padding:4px 8px;background:rgba(201,164,74,0.1);border:1px solid rgba(201,164,74,0.3);border-radius:4px;margin:2px 0"><span style="color:#c9a44a">${sb.name} (${cnt}件)</span> <span style="color:#b8a88c;font-size:11px">${sb.bonus2.desc}</span></div>`;
  }).join('');
  // 装备总属性汇总
  html+=`<div class="my-equip-summary">
    <span>装备总属性：</span>
    ${totalAtk>0?`<span class="mes-sum-item">⚔${totalAtk}</span>`:''}
    ${totalHp>0?`<span class="mes-sum-item">❤${totalHp}</span>`:''}
    ${totalArmor>0?`<span class="mes-sum-item">🛡${totalArmor}</span>`:''}
    ${totalCrit>0?`<span class="mes-sum-item">💥${(totalCrit*100).toFixed(0)}%</span>`:''}
  </div>`;
  if(activeSetHtml)html+=`<div style="margin-top:6px">${activeSetHtml}</div>`;
  container.innerHTML=html;
}
function showEquipSwap(PD,slot){
  // 弹窗选择该槽位可用装备
  const available=PD.inventory.filter(id=>{const e=EQUIPMENT_DB.find(x=>x.id===id);return e&&e.slot===slot}).filter((v,i,a)=>a.indexOf(v)===i); // 去重
  const current=PD.equipment[slot];
  if(available.length===0&&!current){showRewardPopup([{icon:'🔨',text:'背包中没有该类型装备，去锻造吧！'}]);return}
  let items=[];
  // 卸下当前装备选项
  if(current){
    const curEq=EQUIPMENT_DB.find(e=>e.id===current);
    items.push({icon:curEq?curEq.icon:'❌',text:`卸下 ${curEq?curEq.name:'当前装备'}`,action:'unequip'});
  }
  // 可换的装备
  available.forEach(id=>{
    if(id===current)return; // 跳过已装备的
    const eq=EQUIPMENT_DB.find(e=>e.id===id);if(!eq)return;
    const enhLv=PD.equipEnhance[id]||0;
    items.push({icon:eq.icon,text:`${eq.name}${enhLv>0?' +'+enhLv:''} | ⚔${eq.atk} ❤${eq.hp}${eq.effectDesc?' | '+eq.effectDesc:''}`,action:'equip',eqId:id});
  });
  if(items.length===0){showRewardPopup([{icon:'✅',text:'当前已是最优装备！'}]);return}
  // 使用奖励弹窗展示选择
  $('popup-reward-title').textContent='🔧 更换装备';
  $('popup-reward-items').innerHTML=items.map((it,i)=>`<div class="popup-item" style="cursor:pointer;min-width:200px" onclick="window._doEquipSwap('${slot}','${it.action}','${it.eqId||''}');document.getElementById('popup-reward').classList.remove('active')"><div class="popup-item-icon">${it.icon}</div><div style="font-size:12px">${it.text}</div></div>`).join('');
  $('popup-reward').classList.add('active');
}
function doEquipSwap(PD,slot,action,eqId){
  if(action==='unequip'){
    PD.equipment[slot]=null;
  }else if(action==='equip'&&eqId){
    PD.equipment[slot]=eqId;
  }
  saveToDisk(PD);renderForge(PD);refreshMainMenu(PD);
  showRewardPopup([{icon:'✅',text:'装备已更换！'}]);
}
function startForge(PD,idx){
  if(PD.gold<200){showRewardPopup([{icon:'💰',text:'金币不足(需200)'}]);return}
  PD.gold-=200;
  const heroId=PD.selectedHero||'warrior';
  // 锻造池：通用装备 + 当前英雄的职业专属装备
  const pool=EQUIPMENT_DB.filter(e=>{
    if(e.classReq&&e.classReq!==heroId)return false; // 排除其他职业专属
    if(e.rarity==='mythic')return Math.random()<0.03; // 神话3%概率进池
    if(e.rarity==='legendary')return Math.random()<0.15; // 传说15%
    if(e.rarity==='epic')return Math.random()<0.35; // 史诗35%
    return Math.random()<0.6||e.rarity==='common';
  });
  const eq=pool[Math.floor(Math.random()*pool.length)]||EQUIPMENT_DB[0];
  PD.forgeSlots[idx]={itemId:eq.id,endTime:Date.now()+eq.forgeTime};
  PD.dailyProgress.forges=(PD.dailyProgress.forges||0)+1;
  saveToDisk(PD);renderForge(PD);refreshMainMenu(PD);
}
function claimForge(PD,idx){
  const s=PD.forgeSlots[idx];if(!s)return;
  const eq=EQUIPMENT_DB.find(e=>e.id===s.itemId);
  PD.inventory.push(eq.id);
  if(!PD.equipment[eq.slot])PD.equipment[eq.slot]=eq.id;
  PD.forgeSlots[idx]=null;
  showRewardPopup([{icon:eq.icon,text:`获得 ${eq.name}！`}]);
  saveToDisk(PD);renderForge(PD);refreshMainMenu(PD);
}

// ==================== 竞技场 ====================
function renderArena(PD){
  const info=$('arena-rank-info');
  const rank=PD.arenaRank;
  info.innerHTML=`<div class="ar-rank-icon">${ARENA_RANK_ICONS[rank]}</div>
    <div class="ar-rank-name">${ARENA_RANK_NAMES[rank]}</div>
    <div class="ar-rank-pts">${PD.arenaPoints} 积分</div>
    <div class="ar-rank-pos">胜场：${PD.arenaWins}</div>`;
  const opps=$('arena-opponents');opps.innerHTML='';
  const heroes=Object.values(ALL_HEROES);
  for(let i=0;i<3;i++){
    const h=heroes[Math.floor(Math.random()*heroes.length)];
    const power=800+Math.floor(Math.random()*500);
    const op=document.createElement('div');op.className='ao-item';
    op.innerHTML=`<div class="ao-icon">${h.icon}</div><div class="ao-info"><div class="ao-name">对手${i+1} · ${h.name}</div><div class="ao-power">战力 ${power}</div></div>
      <button class="ao-btn" onclick="window._arenaFight(${power})">挑战</button>`;
    opps.appendChild(op);
  }
  $('arena-charges').textContent=PD.arenaCharges;
}
function arenaFight(PD,power){
  if(PD.arenaCharges<=0){showRewardPopup([{icon:'🏟️',text:'挑战次数已用完'}]);return}
  PD.arenaCharges--;PD.dailyProgress.arenaFights=(PD.dailyProgress.arenaFights||0)+1;
  const myPower=ALL_HEROES[PD.selectedHero].atk*10+PD.level*50+Math.random()*200;
  const win=myPower>power;
  if(win){
    PD.arenaPoints+=30;PD.arenaWins++;PD.gold+=200;
    // 段位提升
    for(let i=ARENA_RANKS.length-1;i>=0;i--){if(PD.arenaPoints>=ARENA_RANK_REQ[ARENA_RANKS[i]]){PD.arenaRank=ARENA_RANKS[i];break}}
    showRewardPopup([{icon:'🏆',text:'胜利！+30积分 +200💰'}]);
  }else{
    PD.arenaPoints=Math.max(0,PD.arenaPoints-10);
    showRewardPopup([{icon:'💀',text:'惜败！-10积分'}]);
  }
  saveToDisk(PD);renderArena(PD);
}

// ==================== 公会 ====================
function renderGuild(PD){
  const body=$('guild-body');
  if(!PD.guildJoined){
    body.innerHTML=`<div class="guild-empty"><div class="guild-empty-icon">👥</div><div class="guild-empty-text">你还没有加入公会<br><span style="font-size:12px;color:#7a6e55">加入公会可以获得额外属性加成和专属副本</span></div>
      <button class="btn-gold" onclick="window._joinGuild()">⚔️ 创建公会</button>
      <div style="margin-top:12px"><button class="btn-sub" onclick="window._joinRandomGuild()">🔍 加入推荐公会</button></div></div>`;
  }else{
    const gLv=Math.min(10,Math.floor(PD.guildContrib/500)+1);
    const gAtkBonus=gLv*2;const gHpBonus=gLv*10;
    body.innerHTML=`<div class="guild-info">
      <div class="gi-name">⚔️ ${PD.guildName}</div>
      <div class="gi-level">公会等级 Lv.${gLv} <span style="font-size:10px;color:#44ff44">（全员攻击+${gAtkBonus} 生命+${gHpBonus}）</span></div>
      <div class="gi-members">成员 12/30 | 贡献 ${PD.guildContrib}</div>
      <div style="margin-top:8px;font-size:11px;color:#8b7a60">📊 公会排名: #${Math.max(1,50-PD.guildContrib)} / 服务器</div>
      </div>
      <div class="guild-actions">
        <div class="ga-btn" onclick="window._guildDonate()"><div class="ga-icon">💰</div><div class="ga-label">捐献(200💰)<br><span style="font-size:9px;color:#44ff44">+200贡献</span></div></div>
        <div class="ga-btn" onclick="window._guildRaid()"><div class="ga-icon">⚔️</div><div class="ga-label">公会副本<br><span style="font-size:9px;color:#c9a44a">${PD.guildRaidDone?'✅ 今日已挑战':'可挑战'}</span></div></div>
        <div class="ga-btn" onclick="window._guildRank()"><div class="ga-icon">📊</div><div class="ga-label">排行榜<br><span style="font-size:9px;color:#b8a88c">查看排名</span></div></div>
        <div class="ga-btn" onclick="window._guildBuff()"><div class="ga-icon">🛡️</div><div class="ga-label">公会BUFF<br><span style="font-size:9px;color:#44ddff">Lv.${gLv}加成中</span></div></div>
      </div>
      <div style="padding:12px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);margin-top:8px">
        <div style="font-size:13px;font-weight:bold;color:#c9a44a;margin-bottom:8px">📢 公会公告</div>
        <div style="font-size:11px;color:#b8a88c;line-height:1.6">欢迎加入${PD.guildName}！每日捐献可提升公会等级获得属性加成。<br>公会副本每日可挑战1次，全员协力击败Boss获得丰厚奖励。</div>
      </div>`;
  }
}
function joinGuild(PD,name){PD.guildJoined=true;PD.guildName=name||'艾泽拉斯勇士团';PD.guildRaidDone=false;saveToDisk(PD);renderGuild(PD)}
function guildDonate(PD){
  if(PD.gold<200){showRewardPopup([{icon:'💰',text:'金币不足'}]);return}
  PD.gold-=200;PD.guildContrib+=200;
  showRewardPopup([{icon:'👥',text:'+200公会贡献'},{icon:'⬆️',text:`公会等级 Lv.${Math.min(10,Math.floor(PD.guildContrib/500)+1)}`}]);saveToDisk(PD);renderGuild(PD);refreshMainMenu(PD);
}
function guildRaid(PD){
  if(PD.guildRaidDone){showRewardPopup([{icon:'⚔️',text:'今日已挑战过公会副本'}]);return}
  PD.guildRaidDone=true;PD.guildContrib+=100;
  const goldReward=300+Math.floor(Math.random()*200);const fragReward=2+Math.floor(Math.random()*3);
  PD.gold+=goldReward;PD.totalFrags=(PD.totalFrags||0)+fragReward;
  showRewardPopup([{icon:'⚔️',text:'公会副本通关！'},{icon:'💰',text:`${goldReward}金币`},{icon:'🧩',text:`${fragReward}碎片`}]);
  saveToDisk(PD);renderGuild(PD);refreshMainMenu(PD);
}
function guildRank(PD){
  const ranks=['🥇 暗夜精灵守卫团 · 贡献12800','🥈 铁炉堡矿工联盟 · 贡献9500','🥉 暴风城骑士团 · 贡献7200',
    `4. ⚔️ ${PD.guildName} · 贡献${PD.guildContrib}`,'5. 奥格瑞玛先锋队 · 贡献4100'];
  showRewardPopup(ranks.map(r=>({icon:'📊',text:r})));
}
function guildBuff(PD){
  const gLv=Math.min(10,Math.floor(PD.guildContrib/500)+1);
  showRewardPopup([{icon:'🛡️',text:`公会BUFF · Lv.${gLv}`},{icon:'⚔️',text:`全员攻击+${gLv*2}`},{icon:'❤️',text:`全员生命+${gLv*10}`}]);
}

// ==================== 商城 ====================
function renderShop(PD,tab){
  tab=tab||'featured';
  const items=SHOP_DATA[tab]||[];
  const content=$('shop-content');content.innerHTML='';
  // 体力Tab头部显示当前体力
  if(tab==='stamina'){
    const header=document.createElement('div');
    header.className='stamina-shop-header';
    header.innerHTML=`<div class="ssh-info"><span class="ssh-icon">⚡</span><span class="ssh-val">${PD.stamina}</span><span class="ssh-max">/${PD.maxStamina}</span></div><div class="ssh-bar-wrap"><div class="ssh-bar" style="width:${Math.min(100,PD.stamina/PD.maxStamina*100)}%"></div></div><div class="ssh-tip">体力每5分钟自动恢复1点 · 💰金币或💎钻石均可购买</div>`;
    content.appendChild(header);
  }
  items.forEach(function(item){
    const el=document.createElement('div');el.className='shop-item'+(item.tag==='HOT'?' hot':item.tag==='超值'?' hot':item.tag==='满血复活'?' hot':'');
    // 体力商品显示当前余量标记
    const tagHtml=item.tag?`<div class="si-tag si-tag-${item.tag==='HOT'?'hot':item.tag==='推荐'?'rec':item.tag==='超值'?'super':item.tag==='满血复活'?'full':'def'}">${item.tag}</div>`:'';
    el.innerHTML=`<div class="si-icon">${item.icon}</div><div class="si-info"><div class="si-name">${item.name}</div><div class="si-desc">${item.desc}</div></div>
      <div class="si-price">${item.orig?`<div class="si-orig">${item.orig}</div>`:''}
      <div class="si-now">${item.price}</div></div>${tagHtml}`;
    // 点击事件
    if(item.action==='buyStamina'){
      el.onclick=()=>buyStamina(PD,item.amount,item.costType,item.cost);
    }else if(item.action==='buyStaminaFull'){
      el.onclick=()=>buyStaminaFull(PD,item.costType,item.cost);
    }else{
      el.onclick=()=>showRewardPopup([{icon:item.icon,text:`模拟购买：${item.name}`}]);
    }
    content.appendChild(el);
  });
}
function switchShopTab(PD,el,tab){
  document.querySelectorAll('.shop-tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  else{const t=document.querySelector(`.shop-tab[data-tab="${tab}"]`);if(t)t.classList.add('active')}
  renderShop(PD,tab);
}
// ==================== 体力购买 ====================
function buyStamina(PD,amount,costType,cost){
  if(costType==='gold'){
    if(PD.gold<cost){showRewardPopup([{icon:'💰',text:`金币不足（需${cost}💰）`}]);return}
    PD.gold-=cost;
  }else{
    if(PD.diamond<cost){showRewardPopup([{icon:'💎',text:`钻石不足（需${cost}💎）`}]);return}
    PD.diamond-=cost;
  }
  PD.stamina=Math.min(PD.maxStamina*2,PD.stamina+amount);// 购买可超出上限但不超2倍
  saveToDisk(PD);refreshMainMenu(PD);
  showRewardPopup([{icon:'⚡',text:`+${amount}体力！当前${PD.stamina}⚡`}]);
  // 刷新商城体力Tab
  const activeTab=document.querySelector('.shop-tab.active');
  if(activeTab&&activeTab.dataset.tab==='stamina')renderShop(PD,'stamina');
}
function buyStaminaFull(PD,costType,cost){
  if(PD.stamina>=PD.maxStamina){showRewardPopup([{icon:'⚡',text:'体力已满！'}]);return}
  if(costType==='diamond'){
    if(PD.diamond<cost){showRewardPopup([{icon:'💎',text:`钻石不足（需${cost}💎）`}]);return}
    PD.diamond-=cost;
  }else{
    if(PD.gold<cost){showRewardPopup([{icon:'💰',text:`金币不足（需${cost}💰）`}]);return}
    PD.gold-=cost;
  }
  PD.stamina=PD.maxStamina;
  saveToDisk(PD);refreshMainMenu(PD);
  showRewardPopup([{icon:'🔋',text:`体力已充满！${PD.stamina}⚡`}]);
  const activeTab=document.querySelector('.shop-tab.active');
  if(activeTab&&activeTab.dataset.tab==='stamina')renderShop(PD,'stamina');
}

// ==================== BattlePass ====================
function renderBattlePass(PD){
  $('bp-level').textContent=PD.bpLevel;
  $('bp-bar').style.width=(PD.bpXp/BP_XP*100)+'%';
  $('bp-xp').textContent=`${PD.bpXp}/${BP_XP}`;
  const tracks=$('bp-tracks');tracks.innerHTML='';
  let unclaimedCount=0;
  for(let i=0;i<Math.min(BP_REWARDS.length,15);i++){
    const r=BP_REWARDS[i];
    const reached=PD.bpLevel>=r.level; // 已达到该等级
    const current=PD.bpLevel===r.level;
    const freeClaimed=(PD.bpClaimed||[]).includes('free_'+r.level);
    const paidClaimed=(PD.bpClaimed||[]).includes('paid_'+r.level);
    const canClaimFree=reached&&!freeClaimed;
    const canClaimPaid=reached&&PD.bpPaid&&!paidClaimed;
    if(canClaimFree)unclaimedCount++;
    if(canClaimPaid)unclaimedCount++;
    const row=document.createElement('div');
    row.className=`bp-row${current?' current':''}${freeClaimed&&(paidClaimed||!PD.bpPaid)?' claimed':''}`;
    // 免费轨道
    const freeHtml=canClaimFree
      ?`<div class="bp-free bp-claimable" onclick="window._claimBpReward(${r.level},'free')">${r.free.icon} ${r.free.text} <span style="color:#44ff44;font-size:10px">✋领取</span></div>`
      :freeClaimed
        ?`<div class="bp-free" style="opacity:.5">${r.free.icon} ${r.free.text} ✅</div>`
        :`<div class="bp-free">${r.free.icon} ${r.free.text}</div>`;
    // 付费轨道
    const paidHtml=canClaimPaid
      ?`<div class="bp-paid bp-claimable" onclick="window._claimBpReward(${r.level},'paid')">${r.paid.icon} ${r.paid.text} <span style="color:#44ff44;font-size:10px">✋领取</span></div>`
      :paidClaimed
        ?`<div class="bp-paid" style="opacity:.5">${r.paid.icon} ${r.paid.text} ✅</div>`
        :`<div class="bp-paid${!PD.bpPaid?' locked':''}">${r.paid.icon} ${r.paid.text}</div>`;
    row.innerHTML=`<div class="bp-lv">${r.level}</div>${freeHtml}${paidHtml}`;
    tracks.appendChild(row);
  }
  $('bp-unclaimed').textContent=unclaimedCount;
}
function claimBpReward(PD,level,track){
  if(!PD.bpClaimed)PD.bpClaimed=[];
  const key=track+'_'+level;
  if(PD.bpClaimed.includes(key))return;
  if(PD.bpLevel<level)return;
  if(track==='paid'&&!PD.bpPaid)return;
  PD.bpClaimed.push(key);
  const r=BP_REWARDS.find(x=>x.level===level);if(!r)return;
  const reward=track==='free'?r.free:r.paid;
  // 发放奖励
  const rewards=[];
  if(reward.text.includes('💰')){const gold=parseInt(reward.text.match(/\d+/))||100;PD.gold+=gold;rewards.push({icon:'💰',text:`${gold}金币`})}
  if(reward.text.includes('💎')){const dia=parseInt(reward.text.match(/\d+/))||50;PD.diamond+=dia;rewards.push({icon:'💎',text:`${dia}钻石`})}
  if(reward.text.includes('碎片')){const frags=parseInt(reward.text.match(/\d+/))||5;PD.totalFrags=(PD.totalFrags||0)+frags;rewards.push({icon:'🧩',text:`${frags}碎片`})}
  if(reward.text.includes('装备箱')){
    // 随机发放一件装备碎片
    PD.totalFrags=(PD.totalFrags||0)+10;rewards.push({icon:'📦',text:'10通用碎片'})
  }
  if(reward.text.includes('皮肤')){rewards.push({icon:'🎨',text:'限定皮肤已收藏'})}
  if(rewards.length===0)rewards.push({icon:reward.icon,text:reward.text});
  showRewardPopup(rewards);
  saveToDisk(PD);renderBattlePass(PD);refreshMainMenu(PD);
}

// ==================== 成就 ====================
function renderAchievements(PD){
  const list=$('achieve-list');list.innerHTML='';
  ACHIEVEMENTS.forEach(a=>{
    let val=0;
    if(a.stat==='totalKills')val=PD.totalKills;
    else if(a.stat==='totalBossKills')val=PD.totalBossKills;
    else if(a.stat==='maxWave')val=PD.maxWave;
    else if(a.stat==='maxKillStreak')val=PD.maxKillStreak;
    else if(a.stat==='heroCount')val=getHeroCount(PD);
    else if(a.stat==='chaptersCleared')val=getChaptersCleared(PD);
    const done=val>=a.req;const claimed=PD.achievementsClaimed.includes(a.id);
    const el=document.createElement('div');el.className=`ac-item${done?' done':''}`;
    el.innerHTML=`<div class="ac-icon">${a.icon}</div><div class="ac-info"><div class="ac-name">${a.name}</div><div class="ac-desc">${a.desc}</div>
      <div class="ac-prog"><div class="ac-prog-fill" style="width:${Math.min(100,val/a.req*100)}%"></div></div></div>
      <div class="ac-reward">${done&&!claimed?`<button class="btn-sm" onclick="window._claimAchieve('${a.id}')">领取</button>`:done?'✅':a.reward}</div>`;
    list.appendChild(el);
  });
}
function claimAchievement(PD,id){
  const a=ACHIEVEMENTS.find(x=>x.id===id);if(!a)return;
  PD.achievementsClaimed.push(id);
  showRewardPopup([{icon:'🏆',text:`成就达成：${a.name} | ${a.reward}`}]);
  if(a.reward.includes('💎'))PD.diamond+=parseInt(a.reward.match(/\d+/));
  if(a.reward.includes('💰'))PD.gold+=parseInt(a.reward.match(/\d+/));
  saveToDisk(PD);renderAchievements(PD);refreshMainMenu(PD);
}

// ==================== 每日任务 ====================
function renderDailyQuests(PD){
  const list=$('quest-list');list.innerHTML='';
  if(!PD.dailyQuests.length)PD.dailyQuests=QUEST_TEMPLATES.slice(0,4).map(q=>({...q,progress:0,claimed:false}));
  PD.dailyQuests.forEach((q,i)=>{
    const prog=PD.dailyProgress[q.type]||0;const done=prog>=q.req;
    const el=document.createElement('div');el.className=`q-item${q.claimed?' done':''}`;
    el.innerHTML=`<div class="q-icon">${q.icon}</div><div class="q-info"><div class="q-name">${q.name}</div><div class="q-prog">${Math.min(prog,q.req)}/${q.req}</div></div>
      <div class="q-reward">${done&&!q.claimed?`<button class="q-claim" onclick="window._claimQuest(${i})">领取</button>`:q.claimed?'✅':q.reward}</div>`;
    list.appendChild(el);
  });
  // 宝箱进度
  const bar=$('quest-chest-bar');
  const claimed=PD.dailyQuests.filter(q=>q.claimed).length;
  bar.innerHTML=`<div class="qcb-fill"><div class="qcb-fill-inner" style="width:${claimed/4*100}%"></div></div>
    ${[1,2,3,4].map(n=>`<div class="qcb-chest" style="opacity:${claimed>=n?'1':'.3'}">${claimed>=n?'📦':'🔒'}</div>`).join('')}`;
}
function claimQuest(PD,idx){
  const q=PD.dailyQuests[idx];if(!q||q.claimed)return;
  q.claimed=true;
  showRewardPopup([{icon:q.icon,text:`任务完成：${q.reward}`}]);
  if(q.reward.includes('💰'))PD.gold+=parseInt(q.reward.match(/\d+/)||200);
  if(q.reward.includes('💎'))PD.diamond+=parseInt(q.reward.match(/\d+/)||50);
  saveToDisk(PD);renderDailyQuests(PD);refreshMainMenu(PD);
}

// ==================== 抽奖 ====================
function renderLuckyDraw(PD){
  const container=$('draw-wheel').parentElement;
  const n=DRAW_PRIZES.length;
  // 用wrapper包裹转盘，指针放在wrapper上（不随转盘旋转）
  let existingWrap=container.querySelector('.draw-wheel-wrap');
  if(!existingWrap){
    existingWrap=document.createElement('div');
    existingWrap.className='draw-wheel-wrap';
    const wheel=$('draw-wheel');
    wheel.parentElement.insertBefore(existingWrap,wheel);
    existingWrap.appendChild(wheel);
  }
  const wheel=$('draw-wheel');
  // 重置旋转
  wheel.style.transition='none';
  wheel.style.transform='rotate(0deg)';
  wheel.innerHTML=DRAW_PRIZES.map((p,i)=>{
    const ang=i*360/n-90;const r=90;
    const x=130+r*Math.cos(ang*Math.PI/180)-30;
    const y=130+r*Math.sin(ang*Math.PI/180)-18;
    return `<div class="draw-prize-item" style="left:${x}px;top:${y}px"><span>${p.icon}</span><small>${p.text}</small></div>`;
  }).join('');
  $('draw-chances').textContent=PD.drawChances;
}
function doLuckyDraw(PD){
  const today=new Date().toDateString();
  if(PD.lastDrawDate!==today){PD.drawChances=3;PD.lastDrawDate=today}
  if(PD.drawChances<=0){showRewardPopup([{icon:'🎰',text:'今日次数已用完'}]);return}
  PD.drawChances--;
  const n=DRAW_PRIZES.length;
  // 按权重抽奖，记录中奖索引
  const totalW=DRAW_PRIZES.reduce((s,p)=>s+p.weight,0);
  let r=Math.random()*totalW,prizeIdx=0;
  for(let i=0;i<n;i++){r-=DRAW_PRIZES[i].weight;if(r<=0){prizeIdx=i;break}}
  const prize=DRAW_PRIZES[prizeIdx];
  // 转盘动画 — 使视觉停止位置对准中奖项
  // 奖品布局：第i个奖品中心角度 = i*360/n - 90（renderLuckyDraw中以-90度偏移起始）
  // CSS rotate(X deg)让转盘顺时针旋转X度，指针固定在顶部(12点方向)
  // 旋转后item i的视觉角度 = (i*slice-90) + X，要等于270(顶部)
  // 所以 X = 360 - prizeIdx*sliceAngle (mod 360)
  const sliceAngle=360/n;
  let targetDeg=((360-prizeIdx*sliceAngle)%360+360)%360;
  // 在扇区内随机微调（不超过扇区1/3），使动画更自然
  const jitter=(Math.random()-0.5)*sliceAngle*0.5;
  targetDeg+=jitter;
  // 加上多圈旋转（至少转4圈）确保视觉效果
  const fullSpins=1440; // 4圈
  const finalDeg=fullSpins+targetDeg;
  const wheel=$('draw-wheel');
  // 重置transition使连续抽奖不冲突
  wheel.style.transition='none';
  wheel.style.transform='rotate(0deg)';
  // 强制reflow
  void wheel.offsetHeight;
  wheel.style.transition='transform 3s cubic-bezier(.17,.67,.12,.99)';
  wheel.style.transform=`rotate(${finalDeg}deg)`;
  setTimeout(()=>{
    showRewardPopup([{icon:prize.icon,text:prize.text}]);
    if(prize.text.includes('金币'))PD.gold+=parseInt(prize.text)||500;
    if(prize.text.includes('钻石'))PD.diamond+=parseInt(prize.text.match(/\d+/))||50;
    if(prize.text.includes('体力'))PD.stamina=Math.min(PD.maxStamina,PD.stamina+30);
    if(prize.text.includes('碎片')){const fragAmt=parseInt(prize.text.match(/\d+/))||3;PD.totalFrags=(PD.totalFrags||0)+fragAmt}
    if(prize.text.includes('装备箱')){PD.totalFrags=(PD.totalFrags||0)+10}
    $('draw-chances').textContent=PD.drawChances;
    saveToDisk(PD);refreshMainMenu(PD);
  },3200);
}

// ==================== 宝箱 ====================
function renderChests(PD){
  const list=$('chest-list');list.innerHTML='';
  for(let i=0;i<4;i++){
    const s=PD.forgeSlots[i];const el=document.createElement('div');
    if(!s){el.className='cl-item';el.innerHTML=`<div class="cl-icon">📦</div><div class="cl-name">空闲槽位</div>`}
    else{
      const eq=EQUIPMENT_DB.find(e=>e.id===s.itemId);const ready=Date.now()>=s.endTime;
      el.className=`cl-item${ready?' ready':' forging'}`;
      if(ready)el.innerHTML=`<div class="cl-icon">📦</div><div class="cl-name">${eq?eq.name:'装备'}</div><div style="color:#44ff44">✅ 可领取</div>`;
      else{const left=Math.ceil((s.endTime-Date.now())/1000);el.innerHTML=`<div class="cl-icon">⏳</div><div class="cl-name">锻造中</div><div class="cl-timer">${Math.floor(left/60)}分钟</div>`}
    }
    list.appendChild(el);
  }
}

// ==================== 首充模拟 ====================
function doFirstCharge(PD){
  PD.firstChargeDone=true;PD.diamond+=680;
  if(!PD.heroes.shaman)PD.heroes.shaman={unlocked:false,frags:0};
  PD.heroes.shaman.unlocked=true;PD.heroes.shaman.frags=10;
  document.getElementById('popup-first-charge').classList.remove('active');
  showRewardPopup([{icon:'💎',text:'680钻石'},{icon:'🌊',text:'萨满英雄解锁！'},{icon:'🏅',text:'VIP1称号'}]);
  saveToDisk(PD);refreshMainMenu(PD);
}

// ==================== 月卡购买模拟 ====================
function buyBattlePass(PD){
  PD.bpPaid=true;
  showRewardPopup([{icon:'🎫',text:'赛季通行证已解锁！'}]);
  saveToDisk(PD);renderBattlePass(PD);
}

// ==================== 英雄升星 ====================
function heroUpStar(PD){
  const hd=PD.heroes[PD.selectedHero];if(!hd||!hd.unlocked)return;
  const curStar=hd.star||0;
  if(curStar>=HERO_STAR.MAX_STAR){showRewardPopup([{icon:'💫',text:'已满星！'}]);return}
  const cost=HERO_STAR.FRAG_COST[curStar+1];
  if((hd.frags||0)<cost){showRewardPopup([{icon:'🧩',text:`碎片不足！需要${cost}个，当前${hd.frags||0}个`}]);return}
  hd.frags-=cost;hd.star=curStar+1;
  const mult=HERO_STAR.STAT_MULT[hd.star];
  showRewardPopup([{icon:'⭐',text:`${ALL_HEROES[PD.selectedHero].name} 升至 ${hd.star} 星！属性×${mult}`}]);
  saveToDisk(PD);renderHeroes(PD);refreshMainMenu(PD);
}

// ==================== 天赋树系统（职业差异化） ====================
function renderTalent(PD){
  const body=$('talent-body');if(!body)return;
  body.innerHTML='';
  const heroId=PD.selectedHero||'warrior';
  const heroTrees=HERO_TALENT_TREES[heroId];
  if(!heroTrees){body.innerHTML='<div style="padding:20px;color:#b8a88c">该英雄暂无天赋树</div>';return}
  // 确保PD.talents存在并且包含当前英雄
  if(!PD.talents)PD.talents={};
  if(!PD.talents[heroId])PD.talents[heroId]={};
  const heroLv=(PD.heroes[heroId]||{}).level||1;
  const heroName=(ALL_HEROES[heroId]||{}).name||heroId;
  
  // 标题
  const header=document.createElement('div');
  header.style.cssText='text-align:center;margin-bottom:12px;padding:8px';
  header.innerHTML=`<div style="font-size:16px;font-weight:bold;color:#c9a44a">${(ALL_HEROES[heroId]||{}).icon||''} ${heroName} 天赋树</div><div style="font-size:12px;color:#b8a88c;margin-top:4px">三条专精路线，打造独一无二的Build</div>`;
  body.appendChild(header);
  
  Object.entries(heroTrees).forEach(([treeKey,tree])=>{
    const section=document.createElement('div');section.className='talent-tree';
    const selected=PD.talents[heroId][treeKey]||[];
    let html=`<div class="tt-header" style="border-left:3px solid ${tree.color}"><div class="tt-name">${tree.name}</div><div class="tt-desc">${tree.desc}</div><div class="tt-progress">${selected.filter(Boolean).length}/${tree.tiers.length}</div></div>`;
    html+=`<div class="tt-tiers">`;
    tree.tiers.forEach((tier,ti)=>{
      const unlocked=heroLv>=tier.lv;
      const alreadyChosen=selected[ti]||null;
      html+=`<div class="tt-tier${unlocked?' unlocked':' locked'}${alreadyChosen?' chosen':''}">`;
      html+=`<div class="tt-tier-header"><span class="tt-tier-lv">Lv.${tier.lv}</span><span class="tt-tier-cost">${alreadyChosen?'✅ 已选':'💰'+tier.cost}</span></div>`;
      html+=`<div class="tt-choices">`;
      tier.choices.forEach(c=>{
        const isChosen=alreadyChosen===c.id;
        const canChoose=unlocked&&!alreadyChosen&&PD.gold>=tier.cost;
        html+=`<div class="tt-choice${isChosen?' chosen':''}${canChoose?' available':''}" ${canChoose?`onclick="window._chooseTalent('${heroId}','${treeKey}',${ti},'${c.id}',${tier.cost})"`:''}>`;
        html+=`<div class="tt-ch-name">${c.name}</div><div class="tt-ch-desc">${c.desc}</div>`;
        html+=`</div>`;
      });
      html+=`</div></div>`;
    });
    html+=`</div>`;
    section.innerHTML=html;body.appendChild(section);
  });
}
function chooseTalent(PD,heroId,treeKey,tierIdx,talentId,cost){
  if(!PD.talents)PD.talents={};
  if(!PD.talents[heroId])PD.talents[heroId]={};
  if(!PD.talents[heroId][treeKey])PD.talents[heroId][treeKey]=[];
  const arr=PD.talents[heroId][treeKey];
  if(arr[tierIdx]){showRewardPopup([{icon:'🌟',text:'该层已选择！'}]);return}
  if(PD.gold<cost){showRewardPopup([{icon:'💰',text:`金币不足！需要${cost}`}]);return}
  const heroLv=(PD.heroes[heroId]||{}).level||1;
  const tree=HERO_TALENT_TREES[heroId][treeKey];
  if(!tree)return;
  const tier=tree.tiers[tierIdx];
  if(heroLv<tier.lv){showRewardPopup([{icon:'⬆️',text:`需要英雄等级${tier.lv}！当前${heroLv}`}]);return}
  PD.gold-=cost;arr[tierIdx]=talentId;
  const talent=tier.choices.find(c=>c.id===talentId);
  showRewardPopup([{icon:'🌟',text:`天赋「${talent.name}」已解锁！\n${talent.desc}`}]);
  saveToDisk(PD);renderTalent(PD);refreshMainMenu(PD);
}

// ==================== 装备强化 ====================
function renderEnhance(PD){
  const body=$('enhance-body');if(!body)return;
  body.innerHTML='';
  if(!PD.equipEnhance)PD.equipEnhance={};
  const slots=['weapon','armor','helmet','boots','trinket','ring'];
  const slotNames={weapon:'武器',armor:'护甲',helmet:'头盔',boots:'靴子',trinket:'饰品',ring:'戒指'};
  slots.forEach(slot=>{
    const eqId=PD.equipment[slot];
    const el=document.createElement('div');el.className='enh-slot';
    if(!eqId){
      el.innerHTML=`<div class="enh-empty"><div class="enh-slot-name">${slotNames[slot]}</div><div class="enh-empty-text">未装备</div></div>`;
    }else{
      const eq=EQUIPMENT_DB.find(e=>e.id===eqId);if(!eq){el.innerHTML='';body.appendChild(el);return}
      const enhLv=PD.equipEnhance[eqId]||0;
      const maxed=enhLv>=ENHANCE_DATA.MAX_LEVEL;
      const costs=maxed?null:ENHANCE_DATA.costs(eq.rarity,enhLv+1);
      const mult=1+enhLv*ENHANCE_DATA.STAT_PER_LEVEL;
      const rarMult=ENHANCE_DATA.RARITY_MULT[eq.rarity]||1;
      // 计算强化后属性
      const enhAtk=eq.atk>0?Math.round(eq.atk*mult*rarMult):0;
      const enhHp=eq.hp>0?Math.round(eq.hp*mult*rarMult):0;
      const canEnhance=!maxed&&PD.gold>=(costs?costs.gold:Infinity)&&(PD.totalFrags||0)>=(costs?costs.frags:Infinity);
      el.innerHTML=`<div class="enh-item rarity-${eq.rarity}">
        <div class="enh-icon">${eq.icon}</div>
        <div class="enh-info">
          <div class="enh-name">${eq.name} <span class="enh-lv">+${enhLv}</span></div>
          <div class="enh-stats">${enhAtk>0?`⚔${enhAtk} `:''}${enhHp>0?`❤${enhHp} `:''}${eq.armor>0?`🛡${eq.armor} `:''}${eq.critRate>0?`💥${(eq.critRate*100).toFixed(0)}% `:''}</div>
          ${eq.effectDesc?`<div class="enh-effect">${eq.effectDesc}</div>`:''}
        </div>
        ${maxed?`<div class="enh-max">MAX</div>`:`<button class="btn-sm btn-enhance${canEnhance?' ready':''}" onclick="window._enhanceEquip('${eqId}')">强化 +${enhLv+1}<br><span class="enh-cost">💰${costs.gold} 🧩${costs.frags}</span></button>`}
      </div>`;
    }
    body.appendChild(el);
  });
  // 显示通用碎片余量
  const fragInfo=document.createElement('div');fragInfo.className='enh-frag-info';
  fragInfo.innerHTML=`<span>🧩 通用碎片: ${PD.totalFrags||0}</span>`;
  body.appendChild(fragInfo);
}
function enhanceEquip(PD,eqId){
  if(!PD.equipEnhance)PD.equipEnhance={};
  const eq=EQUIPMENT_DB.find(e=>e.id===eqId);if(!eq)return;
  const enhLv=PD.equipEnhance[eqId]||0;
  if(enhLv>=ENHANCE_DATA.MAX_LEVEL){showRewardPopup([{icon:'🔨',text:'已达最高强化等级！'}]);return}
  const costs=ENHANCE_DATA.costs(eq.rarity,enhLv+1);
  if(PD.gold<costs.gold){showRewardPopup([{icon:'💰',text:`金币不足！需要${costs.gold}`}]);return}
  if((PD.totalFrags||0)<costs.frags){showRewardPopup([{icon:'🧩',text:`碎片不足！需要${costs.frags}`}]);return}
  PD.gold-=costs.gold;PD.totalFrags=(PD.totalFrags||0)-costs.frags;
  PD.equipEnhance[eqId]=enhLv+1;
  showRewardPopup([{icon:'🔨',text:`${eq.name} 强化至 +${enhLv+1}！`}]);
  saveToDisk(PD);renderEnhance(PD);refreshMainMenu(PD);
}

// ==================== 英雄经验结算 ====================
function addHeroXp(PD, heroId, xpAmount){
  const hd=PD.heroes[heroId];if(!hd||!hd.unlocked)return;
  if(!hd.level)hd.level=1;if(!hd.xp)hd.xp=0;
  hd.xp+=xpAmount;
  let leveledUp=false;
  while(hd.level<HERO_LEVEL.MAX_LEVEL){
    const need=calcHeroXpNeed(hd.level);
    if(hd.xp>=need){hd.xp-=need;hd.level++;leveledUp=true}else break;
  }
  if(hd.level>=HERO_LEVEL.MAX_LEVEL)hd.xp=0;
  return leveledUp;
}

// ==================== 计算天赋总加成（职业差异化版） ====================
function calcTalentBonus(PD){
  const bonus={atk:0,hp:0,armor:0,spd:0,critRate:0,critDmg:0,
    regen:0,killHeal:0,berserker:0,armorPen:0,eliteHeal:0,skillDmg:0,execute:0,
    leech:0,xpBonus:0,goldBonus:0,extraSkillChoice:0,pickupRange:0,legendRate:0,
    block:null,shield:0,thorns:0,slowRes:0,dodge:0,startShield:0,revive:null,eliteLoot:0,
    freeSkill:0,goldOnKill:0,xpMagnet:0,atkSpeed:0,critWave:0,deathSave:0,doubleSkill:0,allPct:0,
    // 新增天赋属性
    dotDmg:0,dotHealMult:0,dotSpread:0,skillCdPct:0,frozenDmgBonus:0,slowEnhance:0,
    petAtkPct:0,petDurPct:0,petCritRate:0,petCount:0,petHaste:0,petHeal:0,petArmor:0,
    berserkerFull:0,killFrenzy:0,critHaste:0,hpPct:0,healBoost:0,allHealBoost:0,
    bossDmg:0,atkHeal:0,poisonOnHit:0,poisonDmg:0,bleedOnHit:0,
    basicAtkDmg:0,basicAoeAtk:0,fireAoeOnHit:0,windFury:0};
  if(!PD.talents)return bonus;
  const heroId=PD.selectedHero||'warrior';
  const heroTalents=PD.talents[heroId];
  if(!heroTalents)return bonus;
  const heroTrees=HERO_TALENT_TREES[heroId];
  if(!heroTrees)return bonus;
  Object.entries(heroTrees).forEach(([treeKey,tree])=>{
    const selected=heroTalents[treeKey]||[];
    selected.forEach((talentId,ti)=>{
      if(!talentId)return;
      const tier=tree.tiers[ti];if(!tier)return;
      const talent=tier.choices.find(c=>c.id===talentId);if(!talent)return;
      const s=talent.stat,v=talent.val;
      // 特殊处理 revive（对象直接赋值）
      if(s==='revive'&&typeof v==='object'){bonus.revive=v;return}
      // 简单stat直接加
      if(typeof v==='number'){
        if(bonus[s]!==undefined)bonus[s]+=v;
      }else if(typeof v==='object'){
        // 复合stat — 遍历对象键值
        Object.entries(v).forEach(([k,val])=>{
          if(k==='chance'||k==='reduce'){
            if(!bonus.block)bonus.block={chance:0,reduce:0};
            bonus.block[k]+=val;
          }else if(bonus[k]!==undefined&&typeof bonus[k]==='number')bonus[k]+=val;
          else if(k==='hp')bonus.hp+=val;
          else if(k==='atk')bonus.atk+=val;
          else if(k==='armor')bonus.armor+=val;
          else if(k==='spd')bonus.spd+=val;
          else if(k==='critRate')bonus.critRate+=val;
          else if(k==='bonus')bonus.xpBonus+=val;
          else if(k==='magnet')bonus.xpMagnet+=val;
        });
      }
      // 特殊组合key
      if(s==='atk+crit'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.critRate+=v.critRate||0}
      if(s==='armor+hp'&&typeof v==='object'){bonus.armor+=v.armor||0;bonus.hp+=v.hp||0}
      if(s==='hp+armor'&&typeof v==='object'){bonus.hp+=v.hp||0;bonus.armor+=v.armor||0}
      if(s==='slowRes+spd'&&typeof v==='object'){bonus.slowRes+=v.slowRes||0;bonus.spd+=v.spd||0}
      if(s==='spd+dodge'&&typeof v==='object'){bonus.spd+=v.spd||0;bonus.dodge+=v.dodge||0}
      if(s==='xpMagnet+bonus'&&typeof v==='object'){bonus.xpMagnet+=v.magnet||0;bonus.xpBonus+=v.bonus||0}
      if(s==='atk+skillDmg'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.skillDmg+=v.skillDmg||0}
      if(s==='skillDmg+cd'&&typeof v==='object'){bonus.skillDmg+=v.skillDmg||0;bonus.skillCdPct+=v.skillCd||0}
      if(s==='hp+regen'&&typeof v==='object'){bonus.hp+=v.hp||0;bonus.regen+=v.regen||0}
      if(s==='atk+atkSpeed'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.atkSpeed+=v.atkSpeed||0}
      if(s==='critRate+dodge'&&typeof v==='object'){bonus.critRate+=v.critRate||0;bonus.dodge+=v.dodge||0}
      if(s==='gold+xp'&&typeof v==='object'){bonus.goldBonus+=v.goldBonus||0;bonus.xpBonus+=v.xpBonus||0}
      if(s==='atkSpeed+crit'&&typeof v==='object'){bonus.atkSpeed+=v.atkSpeed||0;bonus.critRate+=v.critRate||0}
      if(s==='critDmg+crit'&&typeof v==='object'){bonus.critDmg+=v.critDmg||0;bonus.critRate+=v.critRate||0}
      if(s==='atk+hp'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.hp+=v.hp||0}
      if(s==='allPct+hp'&&typeof v==='object'){bonus.allPct+=v.allPct||0;bonus.hp+=v.hp||0}
      if(s==='atk+dotDmg'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.dotDmg+=v.dotDmg||0}
      if(s==='atk+aura'&&typeof v==='object'){bonus.atk+=v.atk||0}
      if(s==='atk+leech'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.leech+=v.leech||0}
      if(s==='atk+armor'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.armor+=v.armor||0}
      if(s==='critRate+skillDmg'&&typeof v==='object'){bonus.critRate+=v.critRate||0;bonus.skillDmg+=v.skillDmg||0}
      if(s==='critRate+freeze'&&typeof v==='object'){bonus.critRate+=v.critRate||0}
      if(s==='atk+shadowDmg'&&typeof v==='object'){bonus.atk+=v.atk||0}
      if(s==='dodge+atkSpeed'&&typeof v==='object'){bonus.dodge+=v.dodge||0;bonus.atkSpeed+=v.atkSpeed||0}
      if(s==='dodge+healOnDodge'&&typeof v==='object'){bonus.dodge+=v.dodge||0}
      if(s==='dotDmg+skillDmg'&&typeof v==='object'){bonus.dotDmg+=v.dotDmg||0;bonus.skillDmg+=v.skillDmg||0}
      if(s==='skillDmg+crit'&&typeof v==='object'){bonus.skillDmg+=v.skillDmg||0;bonus.critRate+=v.critRate||0}
      if(s==='atk+atkHeal'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.atkHeal+=v.atkHeal||0}
    });
  });
  return bonus;
}

// ==================== 计算装备强化总加成 ====================
function calcEquipEnhanceBonus(PD){
  const bonus={atk:0,hp:0,spd:0,critRate:0,armor:0};
  if(!PD.equipEnhance||!PD.equipment)return bonus;
  Object.values(PD.equipment).forEach(eqId=>{
    if(!eqId)return;
    const eq=EQUIPMENT_DB.find(e=>e.id===eqId);if(!eq)return;
    const enhLv=PD.equipEnhance[eqId]||0;
    if(enhLv<=0)return;
    const mult=enhLv*ENHANCE_DATA.STAT_PER_LEVEL;
    const rarMult=ENHANCE_DATA.RARITY_MULT[eq.rarity]||1;
    bonus.atk+=Math.round(eq.atk*mult*rarMult);
    bonus.hp+=Math.round(eq.hp*mult*rarMult);
    bonus.spd+=eq.spd*mult*rarMult;
    bonus.critRate+=((eq.critRate||0)*mult*rarMult);
    bonus.armor+=Math.round((eq.armor||0)*mult*rarMult);
  });
  return bonus;
}

// ==================== 计算英雄总战力 ====================
function calcTotalPower(PD){
  const hero=ALL_HEROES[PD.selectedHero];
  const hd=PD.heroes[PD.selectedHero]||{level:1,star:0};
  const lvBonus=calcHeroLevelBonus(hd.level||1);
  const starMult=HERO_STAR.STAT_MULT[hd.star||0];
  const talentBonus=calcTalentBonus(PD);
  const enhBonus=calcEquipEnhanceBonus(PD);
  // 装备基础
  let eqAtk=0,eqHp=0;
  if(PD.equipment){Object.values(PD.equipment).forEach(eqId=>{if(eqId){const e=EQUIPMENT_DB.find(x=>x.id===eqId);if(e){eqAtk+=e.atk;eqHp+=e.hp}}})}
  // 公会BUFF
  let guildAtk=0,guildHp=0;
  if(PD.guildJoined){const gLv=Math.min(10,Math.floor((PD.guildContrib||0)/500)+1);guildAtk=gLv*2;guildHp=gLv*10}
  const totalAtk=Math.round(((hero.atk+lvBonus.atk)*starMult+eqAtk+enhBonus.atk+talentBonus.atk+guildAtk)*(1+talentBonus.allPct));
  const totalHp=Math.round(((hero.hp+lvBonus.hp)*starMult+eqHp+enhBonus.hp+talentBonus.hp+guildHp)*(1+talentBonus.allPct));
  return {atk:totalAtk, hp:totalHp, power:totalAtk*3+totalHp};
}

// ==================== 战力属性分解 ====================
function renderPowerBreakdown(PD){
  const hero=ALL_HEROES[PD.selectedHero];
  const hd=PD.heroes[PD.selectedHero]||{level:1,star:0};
  const lvBonus=calcHeroLevelBonus(hd.level||1);
  const starMult=HERO_STAR.STAT_MULT[hd.star||0];
  const talentBonus=calcTalentBonus(PD);
  const enhBonus=calcEquipEnhanceBonus(PD);
  let eqAtk=0,eqHp=0;
  if(PD.equipment){Object.values(PD.equipment).forEach(eqId=>{if(eqId){const e=EQUIPMENT_DB.find(x=>x.id===eqId);if(e){eqAtk+=e.atk;eqHp+=e.hp}}})}
  let guildAtk=0,guildHp=0;
  if(PD.guildJoined){const gLv=Math.min(10,Math.floor((PD.guildContrib||0)/500)+1);guildAtk=gLv*2;guildHp=gLv*10}
  const starAtkBonus=Math.round((hero.atk+lvBonus.atk)*starMult-(hero.atk+lvBonus.atk));
  const starHpBonus=Math.round((hero.hp+lvBonus.hp)*starMult-(hero.hp+lvBonus.hp));
  const rows=[
    {icon:'🦸',label:'英雄基础',atk:hero.atk,hp:hero.hp},
    {icon:'📊',label:`等级(Lv.${hd.level||1})`,atk:lvBonus.atk,hp:lvBonus.hp},
    {icon:'⭐',label:`星级(${hd.star||0}星×${starMult})`,atk:starAtkBonus,hp:starHpBonus},
    {icon:'⚔️',label:'装备基础',atk:eqAtk,hp:eqHp},
    {icon:'🔨',label:'装备强化',atk:enhBonus.atk,hp:enhBonus.hp},
    {icon:'🌟',label:'天赋加成',atk:talentBonus.atk,hp:talentBonus.hp},
    {icon:'👥',label:'公会BUFF',atk:guildAtk,hp:guildHp}
  ];
  let html='<div class="cd-power-breakdown"><div class="cd-pb-title">⚔️ 攻击力分解 / ❤️ 生命分解</div>';
  rows.forEach(r=>{
    if(r.atk===0&&r.hp===0)return;
    html+=`<div class="cd-pb-row"><span class="cd-pb-label"><span class="pb-icon">${r.icon}</span>${r.label}</span><span class="cd-pb-val${r.atk===0&&r.hp===0?' pb-zero':''}">⚔${r.atk} ❤${r.hp}</span></div>`;
  });
  if(talentBonus.allPct>0)html+=`<div class="cd-pb-row"><span class="cd-pb-label"><span class="pb-icon">✨</span>全属性加成</span><span class="cd-pb-val">×${(1+talentBonus.allPct).toFixed(2)}</span></div>`;
  html+='</div>';
  return html;
}

// ==================== 卡关引导 ====================
function renderStuckGuide(PD,chapterId){
  const checks=[];
  const hd=PD.heroes[PD.selectedHero]||{level:1,star:0};
  const hero=ALL_HEROES[PD.selectedHero];
  // 检查英雄等级
  const lvBonus=calcHeroLevelBonus(hd.level||1);
  if(lvBonus.atk<hero.atk*0.5)checks.push(STUCK_GUIDE.checks[0]); // 等级加成<基础50%
  // 检查天赋（新的每英雄独立天赋系统）
  if(!PD.talents)PD.talents={};
  const heroId=PD.selectedHero||'warrior';
  const heroTalents=PD.talents[heroId]||{};
  let totalTalents=0;
  Object.values(heroTalents).forEach(arr=>{if(Array.isArray(arr))totalTalents+=arr.filter(Boolean).length});
  const maxTalents=15;if(totalTalents<maxTalents*0.3)checks.push(STUCK_GUIDE.checks[1]);
  // 检查装备强化
  if(!PD.equipEnhance)PD.equipEnhance={};
  const eqSlots=Object.values(PD.equipment).filter(Boolean);
  const avgEnh=eqSlots.length>0?eqSlots.reduce((s,id)=>s+(PD.equipEnhance[id]||0),0)/eqSlots.length:0;
  if(avgEnh<3)checks.push(STUCK_GUIDE.checks[2]);
  // 检查升星
  if((hd.star||0)<2&&(hd.frags||0)>=HERO_STAR.FRAG_COST[(hd.star||0)+1])checks.push(STUCK_GUIDE.checks[3]);
  // 尝试其他英雄
  const unlockedHeroes=Object.entries(PD.heroes).filter(([k,v])=>v.unlocked);
  if(unlockedHeroes.length>1)checks.push(STUCK_GUIDE.checks[4]);
  return checks;
}

// ==================== 锻造面板改造（增加强化入口） ====================
function renderForgeWithEnhance(PD){
  renderForge(PD);
  // 在锻造面板底部增加强化入口
  const tip=document.querySelector('.forge-tip');
  if(tip){
    tip.innerHTML+=`<br><button class="btn-sm" style="margin-top:8px" onclick="openPanel('enhance')">🔨 装备强化</button>`;
  }
}

// ==================== 装备图鉴系统 ====================
let _codexFilter={slot:'all',rarity:'all',search:'',ownedOnly:false};
function _setCodexFilter(key,val){_codexFilter[key]=val}
function renderEquipCodex(PD){
  const body=$('codex-body');if(!body)return;
  const F=_codexFilter;
  // Tab栏 — 装备图鉴 / Build推荐
  let html=`<div class="codex-tabs">
    <div class="codex-tab active" data-tab="equip" onclick="window._codexSwitchTab(this,'equip')">📖 装备图鉴</div>
    <div class="codex-tab" data-tab="build" onclick="window._codexSwitchTab(this,'build')">⚔️ Build推荐</div>
  </div>`;
  // 筛选栏
  html+=`<div class="codex-filters">
    <select class="codex-select" onchange="window._codexSetFilter('slot',this.value)">
      <option value="all"${F.slot==='all'?' selected':''}>全部槽位</option>
      ${EQUIP_SLOT_ORDER.map(s=>`<option value="${s}"${F.slot===s?' selected':''}>${EQUIP_SLOT_NAMES[s]}</option>`).join('')}
    </select>
    <select class="codex-select" onchange="window._codexSetFilter('rarity',this.value)">
      <option value="all"${F.rarity==='all'?' selected':''}>全部品质</option>
      ${RARITY_ORDER.map(r=>`<option value="${r}"${F.rarity===r?' selected':''}>${RARITY_NAME[r]}</option>`).join('')}
    </select>
    <label class="codex-check"><input type="checkbox" ${F.ownedOnly?'checked':''} onchange="window._codexSetFilter('ownedOnly',this.checked)">仅已拥有</label>
  </div>`;
  // 收集进度
  const owned=new Set(PD.inventory||[]);
  Object.values(PD.equipment||{}).forEach(id=>{if(id)owned.add(id)});
  const total=EQUIPMENT_DB.length;
  const ownedCount=owned.size;
  const pct=Math.round(ownedCount/total*100);
  html+=`<div class="codex-progress">
    <div class="codex-prog-text">收集进度 <b>${ownedCount}</b>/<b>${total}</b> (${pct}%)</div>
    <div class="codex-prog-bar"><div class="codex-prog-fill" style="width:${pct}%"></div></div>
  </div>`;
  // 装备列表（按槽位分组）
  html+=`<div class="codex-content" id="codex-equip-content">`;
  const grouped={};
  EQUIPMENT_DB.forEach(eq=>{
    if(F.slot!=='all'&&eq.slot!==F.slot)return;
    if(F.rarity!=='all'&&eq.rarity!==F.rarity)return;
    if(F.ownedOnly&&!owned.has(eq.id))return;
    if(!grouped[eq.slot])grouped[eq.slot]=[];
    grouped[eq.slot].push(eq);
  });
  const slotOrder=F.slot!=='all'?[F.slot]:EQUIP_SLOT_ORDER;
  slotOrder.forEach(slot=>{
    const items=grouped[slot];
    if(!items||items.length===0)return;
    // 按品质排序
    items.sort((a,b)=>RARITY_ORDER.indexOf(a.rarity)-RARITY_ORDER.indexOf(b.rarity));
    html+=`<div class="codex-group">
      <div class="codex-group-title">${EQUIP_SLOT_NAMES[slot]} <span class="codex-group-count">${items.length}件</span></div>
      <div class="codex-cards">`;
    items.forEach(eq=>{
      const isOwned=owned.has(eq.id);
      const enhLv=PD.equipEnhance?PD.equipEnhance[eq.id]||0:0;
      const isEquipped=Object.values(PD.equipment||{}).includes(eq.id);
      const rarCol=RARITY_COLOR[eq.rarity]||'#aaa';
      const heroReq=eq.classReq?ALL_HEROES[eq.classReq]:null;
      const setInfo=eq.setId?SET_BONUSES[eq.setId]:null;
      html+=`<div class="codex-card rarity-${eq.rarity}${isOwned?' owned':''}${isEquipped?' equipped':''}" onclick="window._codexShowDetail('${eq.id}')">
        <div class="cc-owned-badge">${isEquipped?'装备中':isOwned?'已拥有':''}</div>
        <div class="cc-icon">${eq.icon}</div>
        <div class="cc-name" style="color:${rarCol}">${eq.name}${enhLv>0?'<span class="cc-enh">+'+enhLv+'</span>':''}</div>
        <div class="cc-rarity" style="color:${rarCol}">${RARITY_NAME[eq.rarity]}</div>
        ${heroReq?`<div class="cc-class">${heroReq.icon} ${heroReq.name}专属</div>`:''}
        <div class="cc-stats">${eq.atk>0?'⚔'+eq.atk+' ':''}${eq.hp>0?'❤'+eq.hp+' ':''}${eq.armor>0?'🛡'+eq.armor+' ':''}${eq.critRate>0?'💥'+(eq.critRate*100).toFixed(0)+'%':''}${eq.spd>0?' 💨'+eq.spd:''}</div>
        ${eq.effectDesc?`<div class="cc-effect">${eq.effectDesc}</div>`:''}
        ${setInfo?`<div class="cc-set">${setInfo.name}</div>`:''}
      </div>`;
    });
    html+=`</div></div>`;
  });
  if(Object.keys(grouped).length===0){
    html+=`<div class="codex-empty">没有找到匹配的装备</div>`;
  }
  html+=`</div>`;
  // Build推荐区（默认隐藏）
  html+=`<div class="codex-content" id="codex-build-content" style="display:none"></div>`;
  body.innerHTML=html;
}

function renderBuildRecommends(PD,overrideHero){
  const container=$('codex-build-content');if(!container)return;
  const heroId=overrideHero||PD.selectedHero||'warrior';
  const hero=ALL_HEROES[heroId];
  // 筛选当前英雄+通用的Build
  let builds=BUILD_RECOMMENDS.filter(b=>b.heroId===heroId);
  // 如果当前英雄没有build，显示所有
  const showAll=builds.length===0;
  if(showAll)builds=BUILD_RECOMMENDS;
  let html=`<div class="build-hero-select">
    <div class="build-hero-label">选择英雄查看推荐Build：</div>
    <div class="build-hero-grid">`;
  Object.values(ALL_HEROES).forEach(h=>{
    const cnt=BUILD_RECOMMENDS.filter(b=>b.heroId===h.id).length;
    html+=`<div class="build-hero-btn${h.id===heroId?' active':''}" onclick="window._buildSelectHero('${h.id}')">
      <span class="bhb-icon">${h.icon}</span><span class="bhb-name">${h.name}</span><span class="bhb-cnt">${cnt}套</span>
    </div>`;
  });
  html+=`</div></div>`;

  // Build卡片列表
  builds.forEach(build=>{
    const bHero=ALL_HEROES[build.heroId];
    html+=`<div class="build-card tier-${build.tier.toLowerCase()}">
      <div class="bc-header">
        <div class="bc-tier">${build.tier}</div>
        <div class="bc-title">${build.name}</div>
        <div class="bc-hero">${bHero.icon} ${bHero.name}</div>
      </div>
      <div class="bc-desc">${build.desc}</div>
      
      <div class="bc-section">
        <div class="bc-section-title">🎯 推荐技能</div>
        <div class="bc-skills">`;
    build.skills.forEach(sid=>{
      const sk=SKILL_DB.find(s=>s.id===sid)||SKILL_COMBOS.find(s=>s.id===sid);
      if(!sk)return;
      const rarCol=RARITY_COLOR[sk.rarity]||'#aaa';
      html+=`<div class="bc-skill-tag" style="border-color:${rarCol}"><span class="bst-icon">${sk.icon}</span><span class="bst-name">${sk.name}</span></div>`;
    });
    html+=`</div></div>
      
      <div class="bc-section">
        <div class="bc-section-title">🌟 关键天赋</div>
        <div class="bc-talents">`;
    if(build.talents){
      const trees=HERO_TALENT_TREES[build.heroId];
      Object.entries(build.talents).forEach(([treeKey,ids])=>{
        const tree=trees?trees[treeKey]:null;
        if(!tree)return;
        ids.forEach(tid=>{
          let talentName=tid;
          for(const tier of tree.tiers){
            const found=tier.choices.find(c=>c.id===tid);
            if(found){talentName=found.name;break}
          }
          html+=`<span class="bc-talent-tag" style="border-color:${tree.color}">${talentName}</span>`;
        });
      });
    }
    html+=`</div></div>

      <div class="bc-section">
        <div class="bc-section-title">🛡️ 推荐装备</div>
        <div class="bc-equips">`;
    build.equips.forEach(eid=>{
      const eq=EQUIPMENT_DB.find(e=>e.id===eid);
      if(!eq)return;
      const rarCol=RARITY_COLOR[eq.rarity]||'#aaa';
      const isOwned=(PD.inventory||[]).includes(eid)||Object.values(PD.equipment||{}).includes(eid);
      html+=`<div class="bc-equip-tag${isOwned?' owned':''}" style="border-color:${rarCol}">
        <span>${eq.icon}</span><span style="color:${rarCol}">${eq.name}</span>${isOwned?'<span class="bc-eq-owned">✓</span>':''}
      </div>`;
    });
    // 套装效果检测
    const setIds=build.equips.map(eid=>EQUIPMENT_DB.find(e=>e.id===eid)).filter(Boolean).map(e=>e.setId).filter(Boolean);
    const setCounts={};setIds.forEach(s=>setCounts[s]=(setCounts[s]||0)+1);
    Object.entries(setCounts).filter(([,c])=>c>=2).forEach(([sid])=>{
      const sb=SET_BONUSES[sid];
      if(sb)html+=`<div class="bc-set-bonus">${sb.name}: ${sb.bonus2.desc}</div>`;
    });
    html+=`</div></div>

      <div class="bc-section">
        <div class="bc-section-title">🔗 乘数效应分析</div>
        <div class="bc-synergies">`;
    build.synergy.forEach(syn=>{
      html+=`<div class="bc-synergy">
        <div class="bc-syn-header"><span class="bc-syn-icon">${syn.icon}</span><span class="bc-syn-title">${syn.title}</span><span class="bc-syn-mult">${syn.mult}</span></div>
        <div class="bc-syn-detail">${syn.detail}</div>
      </div>`;
    });
    html+=`</div>
        <div class="bc-total-mult">
          <span class="bc-tm-label">总乘数效应</span>
          <span class="bc-tm-val">${build.totalMult}</span>
        </div>
      </div>

      <div class="bc-ratings">
        <div class="bc-rating"><div class="bc-r-label">攻击</div><div class="bc-r-bar"><div class="bc-r-fill bc-r-atk" style="width:${build.ratingAtk*10}%"></div></div><div class="bc-r-val">${build.ratingAtk}</div></div>
        <div class="bc-rating"><div class="bc-r-label">防御</div><div class="bc-r-bar"><div class="bc-r-fill bc-r-def" style="width:${build.ratingDef*10}%"></div></div><div class="bc-r-val">${build.ratingDef}</div></div>
        <div class="bc-rating"><div class="bc-r-label">续航</div><div class="bc-r-bar"><div class="bc-r-fill bc-r-surv" style="width:${build.ratingSurvival*10}%"></div></div><div class="bc-r-val">${build.ratingSurvival}</div></div>
      </div>
    </div>`;
  });

  container.innerHTML=html;
}

function codexShowDetail(PD,eqId){
  const eq=EQUIPMENT_DB.find(e=>e.id===eqId);if(!eq)return;
  const isOwned=(PD.inventory||[]).includes(eqId)||Object.values(PD.equipment||{}).includes(eqId);
  const isEquipped=Object.values(PD.equipment||{}).includes(eqId);
  const enhLv=PD.equipEnhance?PD.equipEnhance[eqId]||0:0;
  const rarCol=RARITY_COLOR[eq.rarity]||'#aaa';
  const heroReq=eq.classReq?ALL_HEROES[eq.classReq]:null;
  const setInfo=eq.setId?SET_BONUSES[eq.setId]:null;
  // 计算强化后属性
  const mult=enhLv>0?1+enhLv*ENHANCE_DATA.STAT_PER_LEVEL:1;
  const rarMult=ENHANCE_DATA.RARITY_MULT[eq.rarity]||1;
  // 查找使用此装备的推荐Build
  const relatedBuilds=BUILD_RECOMMENDS.filter(b=>b.equips.includes(eqId));
  
  let html=`<div class="codex-detail-overlay" onclick="this.remove()">
    <div class="codex-detail" onclick="event.stopPropagation()">
      <div class="cdet-close" onclick="this.closest('.codex-detail-overlay').remove()">✕</div>
      <div class="cdet-header rarity-${eq.rarity}">
        <div class="cdet-icon">${eq.icon}</div>
        <div class="cdet-info">
          <div class="cdet-name" style="color:${rarCol}">${eq.name}${enhLv>0?' <span class="cdet-enh">+'+enhLv+'</span>':''}</div>
          <div class="cdet-rarity" style="color:${rarCol}">${RARITY_NAME[eq.rarity]}${heroReq?' · '+heroReq.icon+heroReq.name+'专属':' · 通用'}</div>
          <div class="cdet-slot">${EQUIP_SLOT_NAMES[eq.slot]}</div>
        </div>
        <div class="cdet-status">${isEquipped?'<span class="cdet-equipped">装备中</span>':isOwned?'<span class="cdet-owned">已拥有</span>':'<span class="cdet-notowned">未拥有</span>'}</div>
      </div>
      
      <div class="cdet-section">
        <div class="cdet-section-title">基础属性</div>
        <div class="cdet-attrs">
          ${eq.atk>0?`<div class="cdet-attr"><span class="cda-icon">⚔️</span><span class="cda-label">攻击力</span><span class="cda-val">+${eq.atk}</span>${enhLv>0?`<span class="cda-enh">→+${Math.round(eq.atk*mult*rarMult)}</span>`:''}</div>`:''}
          ${eq.hp>0?`<div class="cdet-attr"><span class="cda-icon">❤️</span><span class="cda-label">生命值</span><span class="cda-val">+${eq.hp}</span>${enhLv>0?`<span class="cda-enh">→+${Math.round(eq.hp*mult*rarMult)}</span>`:''}</div>`:''}
          ${eq.hp<0?`<div class="cdet-attr"><span class="cda-icon">💔</span><span class="cda-label">生命值</span><span class="cda-val cda-neg">${eq.hp}</span></div>`:''}
          ${eq.armor>0?`<div class="cdet-attr"><span class="cda-icon">🛡️</span><span class="cda-label">护甲</span><span class="cda-val">+${eq.armor}</span></div>`:''}
          ${eq.armor<0?`<div class="cdet-attr"><span class="cda-icon">🛡️</span><span class="cda-label">护甲</span><span class="cda-val cda-neg">${eq.armor}</span></div>`:''}
          ${eq.critRate>0?`<div class="cdet-attr"><span class="cda-icon">💥</span><span class="cda-label">暴击率</span><span class="cda-val">+${(eq.critRate*100).toFixed(0)}%</span></div>`:''}
          ${eq.spd>0?`<div class="cdet-attr"><span class="cda-icon">💨</span><span class="cda-label">移速</span><span class="cda-val">+${eq.spd}</span></div>`:''}
        </div>
      </div>
      
      ${eq.effectDesc?`<div class="cdet-section">
        <div class="cdet-section-title">✨ 特殊效果</div>
        <div class="cdet-effect-box">${eq.effectDesc}</div>
      </div>`:''}
      
      ${setInfo?`<div class="cdet-section">
        <div class="cdet-section-title">🔗 套装效果</div>
        <div class="cdet-set">
          <div class="cdet-set-name">${setInfo.name}</div>
          <div class="cdet-set-pieces">所需装备: ${setInfo.pieces.map(pid=>{const pe=EQUIPMENT_DB.find(e=>e.id===pid);return pe?pe.icon+pe.name:pid}).join(' + ')}</div>
          <div class="cdet-set-bonus">2件套: ${setInfo.bonus2.desc}</div>
        </div>
      </div>`:''}
      
      <div class="cdet-section">
        <div class="cdet-section-title">📋 获取方式</div>
        <div class="cdet-acquire">🔨 锻造 (${Math.round(eq.forgeTime/3600)}小时)</div>
      </div>
      
      ${relatedBuilds.length>0?`<div class="cdet-section">
        <div class="cdet-section-title">⚔️ 推荐搭配</div>
        <div class="cdet-builds">${relatedBuilds.map(b=>{
          const bh=ALL_HEROES[b.heroId];
          return `<div class="cdet-build-tag" onclick="window._buildSelectHero('${b.heroId}');window._codexSwitchTab(document.querySelector('.codex-tab[data-tab=build]'),'build');this.closest('.codex-detail-overlay').remove()">
            <span class="cdb-tier">${b.tier}</span><span>${bh.icon}</span><span>${b.name}</span>
          </div>`;
        }).join('')}</div>
      </div>`:''}
    </div>
  </div>`;
  const overlay=document.createElement('div');
  overlay.innerHTML=html;
  document.body.appendChild(overlay.firstElementChild);
}

// ==================== 心流引导系统 ====================
// === 渐进解锁规则：系统 → 解锁条件 ===
const UNLOCK_RULES={
  // 底部导航（核心系统）
  fight:    ()=>true,                          // 出战——始终可用
  signin:   ()=>true,                          // 签到——始终可用
  heroes:   (PD)=>PD.totalGames>=1,            // 英雄——打完第1局
  forge:    (PD)=>PD.totalGames>=2||getChaptersCleared(PD)>=1, // 锻造——通关第1章或打完2局
  talent:   (PD)=>{const hd=PD.heroes[PD.selectedHero];return hd&&(hd.level||1)>=3}, // 天赋——英雄等级3
  arena:    (PD)=>getChaptersCleared(PD)>=1,   // 竞技场——通关第1章
  shop:     (PD)=>PD.totalGames>=3,            // 商城——打完3局
  // 右侧快捷入口（辅助系统）
  'daily-quest': (PD)=>PD.totalGames>=1,       // 每日任务——打完1局
  'lucky-draw':  (PD)=>PD.totalGames>=2,       // 抽奖——打完2局
  enhance:      (PD)=>PD.inventory&&PD.inventory.length>=1, // 强化——拥有1件装备
  battlepass:   (PD)=>PD.totalGames>=3||PD.daysSinceInstall>=1, // 通行证——3局或次日
  achievements: (PD)=>PD.totalGames>=2,        // 成就——打完2局
  codex:        (PD)=>PD.inventory&&PD.inventory.length>=2,  // 图鉴——拥有2件装备
  guild:        (PD)=>PD.daysSinceInstall>=2||getChaptersCleared(PD)>=3 // 公会——3天或通3章
};

// 应用渐进解锁——隐藏未解锁的按钮，新解锁的显示NEW动画
function applyProgressiveUnlock(PD){
  if(!PD._unlocked)PD._unlocked=[];
  const allBtns=document.querySelectorAll('[data-unlock]');
  allBtns.forEach(btn=>{
    const key=btn.dataset.unlock;
    const rule=UNLOCK_RULES[key];
    if(!rule)return;
    const unlocked=rule(PD);
    if(unlocked){
      btn.classList.remove('sys-locked');
      // 检测是否为新解锁
      if(!PD._unlocked.includes(key)){
        PD._unlocked.push(key);
        btn.classList.add('sys-new');
        setTimeout(()=>btn.classList.remove('sys-new'),5000);
      }
    }else{
      btn.classList.add('sys-locked');
    }
  });
}

// === 主线任务链——线性引导玩家核心路径 ===
const QUEST_CHAIN=[
  {id:'q_first_battle', icon:'⚔️', title:'初入战场',  desc:'完成第一场战斗',
    check:(PD)=>PD.totalGames>=1,        action:'chapter-select'},
  {id:'q_signin',       icon:'📅', title:'领取签到',  desc:'去签到页领取今日奖励',
    check:(PD)=>PD.signInDay>=1,         action:'sign-in'},
  {id:'q_second_battle',icon:'⚔️', title:'再战一局',  desc:'完成第二场战斗，适应战场节奏',
    check:(PD)=>PD.totalGames>=2,        action:'chapter-select'},
  {id:'q_check_heroes', icon:'🦸', title:'英雄殿堂',  desc:'查看你的英雄，了解技能和属性',
    check:(PD)=>PD._visitedHeroes,       action:'heroes'},
  {id:'q_forge_equip',  icon:'🔨', title:'锻造装备',  desc:'在锻造炉打造你的第一件装备',
    check:(PD)=>PD.inventory&&PD.inventory.length>=1, action:'forge'},
  {id:'q_clear_ch1',    icon:'💀', title:'击败霍格',  desc:'通关第1章·艾尔文森林',
    check:(PD)=>PD.chapters.ch1&&PD.chapters.ch1.cleared, action:'chapter-select'},
  {id:'q_arena_try',    icon:'🏟️', title:'竞技场初试',desc:'在竞技场挑战一次对手',
    check:(PD)=>(PD.dailyProgress.arenaFights||0)>=1||PD.arenaWins>=1, action:'arena'},
  {id:'q_talent',       icon:'🌟', title:'天赋觉醒',  desc:'为英雄点亮第一个天赋',
    check:(PD)=>{
      if(!PD.talents)return false;
      const ht=PD.talents[PD.selectedHero];
      if(!ht)return false;
      return Object.values(ht).some(arr=>Array.isArray(arr)&&arr.some(Boolean));
    }, action:'talent'},
  {id:'q_clear_ch2',    icon:'💀', title:'击败范克里夫',desc:'通关第2章·西部荒野',
    check:(PD)=>PD.chapters.ch2&&PD.chapters.ch2.cleared, action:'chapter-select'},
  {id:'q_enhance',      icon:'🔨', title:'装备强化',  desc:'强化一件装备提升战力',
    check:(PD)=>{if(!PD.equipEnhance)return false;return Object.values(PD.equipEnhance).some(v=>v>=1)},
    action:'enhance'},
  {id:'q_clear_ch3',    icon:'💀', title:'荆棘谷之王',desc:'通关第3章·荆棘谷',
    check:(PD)=>PD.chapters.ch3&&PD.chapters.ch3.cleared, action:'chapter-select'},
  {id:'q_guild',        icon:'👥', title:'加入公会',  desc:'创建或加入一个公会',
    check:(PD)=>PD.guildJoined,          action:'guild'},
];

// 获取当前主线任务
function getCurrentQuest(PD){
  for(let i=0;i<QUEST_CHAIN.length;i++){
    if(!QUEST_CHAIN[i].check(PD))return QUEST_CHAIN[i];
  }
  return null; // 全部完成
}

// 刷新主线任务条UI
function refreshQuestBar(PD){
  const bar=$('mm-quest-bar');if(!bar)return;
  const quest=getCurrentQuest(PD);
  if(!quest){bar.style.display='none';return}
  bar.style.display='flex';
  $('mqb-icon').textContent=quest.icon;
  $('mqb-title').textContent='主线·'+quest.title;
  $('mqb-desc').textContent=quest.desc;
  // 保存当前任务action供点击使用
  bar.dataset.action=quest.action;
}

// === 智能"下一步"提示——根据玩家状态推荐最重要的行动 ===
function refreshNextStep(PD){
  const el=$('mm-nextstep');if(!el)return;
  const hint=calcNextStep(PD);
  if(!hint){el.style.display='none';return}
  el.style.display='block';
  $('mns-icon').textContent=hint.icon;
  $('mns-text').textContent=hint.text;
  $('mns-hint').textContent=hint.hint;
  el.dataset.action=hint.action;
}

function calcNextStep(PD){
  const today=new Date().toDateString();
  // 1. 未签到——优先签到
  if(PD.lastSignDate!==today&&PD.signInDay<7)
    return {icon:'📅',text:'签到领奖',hint:'今日签到奖励已就绪',action:'sign-in'};
  // 2. 从未打过——直接引导出战
  if(PD.totalGames===0)
    return {icon:'⚔️',text:'开始冒险！',hint:'点击进入第1章·艾尔文森林',action:'chapter-select'};
  // 3. 有锻造完成——领取
  if(PD.forgeSlots&&PD.forgeSlots.some(s=>s&&Date.now()>=s.endTime))
    return {icon:'📦',text:'装备就绪',hint:'锻造完成，点击领取装备',action:'forge'};
  // 4. 每日任务有可领取
  if(PD.dailyQuests&&PD.dailyQuests.some(q=>{const prog=PD.dailyProgress[q.type]||0;return prog>=q.req&&!q.claimed}))
    return {icon:'📋',text:'领取任务奖励',hint:'有已完成的每日任务',action:'daily-quest'};
  // 5. 今日首胜未拿
  if(!PD.firstWinToday)
    return {icon:'⚔️',text:'今日首胜×3',hint:'首胜三倍奖励还没拿',action:'chapter-select'};
  // 6. 有未装备的更好装备
  if(PD.inventory&&PD.inventory.length>0){
    const emptySlots=['weapon','armor','helmet','boots','trinket','ring'].filter(s=>!PD.equipment[s]);
    if(emptySlots.length>0)
      return {icon:'🔨',text:'装备空位',hint:emptySlots.length+'个装备槽未装备',action:'forge'};
  }
  // 7. 有碎片可升星
  const hd=PD.heroes[PD.selectedHero];
  if(hd&&(hd.star||0)<5){
    const nextCost=window.DATA&&window.DATA.HERO_STAR?window.DATA.HERO_STAR.FRAG_COST[(hd.star||0)+1]:999;
    if((hd.frags||0)>=nextCost)
      return {icon:'⭐',text:'可以升星！',hint:'碎片足够为英雄升星',action:'heroes'};
  }
  // 8. 竞技场次数满
  if(PD.arenaCharges>=5&&UNLOCK_RULES.arena(PD))
    return {icon:'🏟️',text:'竞技场',hint:'5次挑战次数可用',action:'arena'};
  // 9. 抽奖次数
  if(PD.drawChances>0&&UNLOCK_RULES['lucky-draw'](PD))
    return {icon:'🎰',text:'幸运转盘',hint:'今日还有'+PD.drawChances+'次免费抽奖',action:'lucky-draw'};
  // 10. 默认——继续推图
  return {icon:'⚔️',text:'继续冒险',hint:'挑战下一章节',action:'chapter-select'};
}

// === 新手引导（增强版：带遮罩聚光灯） ===
function startEnhancedGuide(PD){
  if(PD.totalGames>0||PD._guideV2Done)return;
  const steps=[
    {target:'.mm-hero-preview',text:'<b>欢迎来到艾泽拉斯！</b><br>这是你的英雄，每个职业都有独特的标志技能。',pos:'bottom'},
    {target:'.mm-quest-bar',text:'<b>主线任务</b>会告诉你接下来该做什么。<br>跟着它走就不会迷路！',pos:'bottom'},
    {target:'.nav-btn-main',text:'准备好了吗？点击<b>「出战」</b>开始你的第一场割草冒险！',pos:'top'},
  ];
  let step=0;
  let overlayEl=null,spotEl=null,popEl=null;

  function showStep(){
    clearGuideEls();
    if(step>=steps.length){PD._guideV2Done=true;return}
    const s=steps[step];
    const targetEl=document.querySelector(s.target);
    if(!targetEl){step++;showStep();return}

    const rect=targetEl.getBoundingClientRect();
    const pad=8;

    // 聚光灯遮罩
    overlayEl=document.createElement('div');overlayEl.className='guide-overlay';
    spotEl=document.createElement('div');spotEl.className='guide-spotlight';
    spotEl.style.left=(rect.left-pad)+'px';spotEl.style.top=(rect.top-pad)+'px';
    spotEl.style.width=(rect.width+pad*2)+'px';spotEl.style.height=(rect.height+pad*2)+'px';
    overlayEl.appendChild(spotEl);

    // 弹窗
    popEl=document.createElement('div');popEl.className='guide-popup';
    popEl.innerHTML=`<div class="guide-popup-step">${step+1} / ${steps.length}</div>
      <div class="guide-popup-text">${s.text}</div>
      <div class="guide-popup-btns">
        <button class="guide-btn-skip" onclick="window._guideSkip()">跳过</button>
        <button class="guide-btn-next" onclick="window._guideNext()">${step===steps.length-1?'开始冒险！':'下一步'}</button>
      </div>`;

    // 定位弹窗
    if(s.pos==='bottom'){
      popEl.style.top=(rect.bottom+12)+'px';popEl.style.left=Math.max(10,rect.left+rect.width/2-140)+'px';
    }else{
      popEl.style.bottom=(window.innerHeight-rect.top+12)+'px';popEl.style.left=Math.max(10,rect.left+rect.width/2-140)+'px';
    }
    overlayEl.appendChild(popEl);
    document.body.appendChild(overlayEl);
  }
  function clearGuideEls(){
    if(overlayEl&&overlayEl.parentNode)overlayEl.remove();
    overlayEl=null;spotEl=null;popEl=null;
  }
  window._guideNext=function(){step++;showStep()};
  window._guideSkip=function(){clearGuideEls();PD._guideV2Done=true};

  // 延迟启动，等主城UI渲染完成
  setTimeout(showStep,2000);
}

// ==================== 暴露到全局 ====================
window.SYS={
  loadSave,saveToDisk,createDefaultPD,showRewardPopup,refreshMainMenu,
  renderSignIn,doSignIn,renderHeroes,renderChapters,renderForge,renderForgeWithEnhance,
  renderArena,arenaFight,renderGuild,joinGuild,guildDonate,guildRaid,guildRank,guildBuff,showEquipSwap,doEquipSwap,
  renderShop,switchShopTab,buyStamina,buyStaminaFull,renderBattlePass,renderAchievements,claimAchievement,
  renderDailyQuests,claimQuest,renderLuckyDraw,doLuckyDraw,renderChests,
  doFirstCharge,buyBattlePass,claimBpReward,
  // 新增养成系统
  heroUpStar,renderTalent,chooseTalent,renderEnhance,enhanceEquip,
  addHeroXp,calcTalentBonus,calcEquipEnhanceBonus,calcTotalPower,renderStuckGuide,
  // 装备图鉴+Build推荐
  renderEquipCodex,renderBuildRecommends,codexShowDetail,_setCodexFilter,
  // 心流引导系统
  applyProgressiveUnlock,refreshQuestBar,refreshNextStep,startEnhancedGuide,getCurrentQuest
};
})();
