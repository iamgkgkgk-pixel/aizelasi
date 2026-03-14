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
  $('mm-level').textContent=PD.level;
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
  detail.innerHTML=`<div class="hd-top"><div class="hd-icon"><img src="${selImgPath}" onerror="this.style.display='none';this.parentElement.textContent='${sel.icon}'" style="width:64px;height:64px;object-fit:contain"></div><div class="hd-info"><h3>${sel.name} <span style="font-size:13px;color:#ffd700">Lv.${selPd.level||1}</span></h3><p>${sel.origin} · ${sel.role}</p>
    <div class="hd-xp-bar"><div class="hd-xp-fill" style="width:${xpPct}%"></div><span class="hd-xp-text">${selPd.xp||0}/${xpNeed}</span></div></div></div>
    <div class="hd-stats">
      <div class="hd-stat"><div class="hd-stat-val">${finalAtk}</div><div class="hd-stat-label">攻击<span class="hd-bonus">(+${lvBonus.atk})</span></div></div>
      <div class="hd-stat"><div class="hd-stat-val">${finalHp}</div><div class="hd-stat-label">生命<span class="hd-bonus">(+${lvBonus.hp})</span></div></div>
      <div class="hd-stat"><div class="hd-stat-val">${sel.spd}</div><div class="hd-stat-label">速度</div></div>
      <div class="hd-stat"><div class="hd-stat-val">${starDisp}</div><div class="hd-stat-label">星级 ×${starMult}</div></div>
    </div>
    <div class="hd-skill">标志技能：<span>${sel.skill}</span></div>
    <div class="hd-sig-detail" style="background:rgba(255,68,102,.08);border:1px solid rgba(255,68,102,.2);border-radius:8px;padding:8px 10px;margin:6px 0">
      ${(()=>{const sigSk=SKILL_DB.find(s=>s.id===sel.signatureSkill);return sigSk?`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:20px">${sigSk.icon}</span><span style="color:#ff4466;font-weight:bold;font-size:13px">${sigSk.name}</span><span style="font-size:10px;color:#ff88aa;border:1px solid rgba(255,68,102,.3);padding:1px 5px;border-radius:4px">开局自动获得</span></div><div style="color:#ccc;font-size:11px;line-height:1.4">${sigSk.desc}</div><div style="color:#888;font-size:10px;margin-top:3px">CD:${sigSk.cd}s · 最高${sigSk.maxLevel}级</div>`:''})()}
    </div>
    <div class="hd-favor" style="margin:4px 0;font-size:11px;color:#aaa">
      偏好技能：${(sel.favorSkills||[]).map(fid=>{const fsk=SKILL_DB.find(s=>s.id===fid);return fsk?`<span style="color:${RARITY_COLOR[fsk.rarity]};margin:0 2px" title="${fsk.name}">${fsk.icon}${fsk.name}</span>`:''}).join(' ')}
      <span style="color:#666;font-size:10px">（出现概率×3）</span>
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
  for(let i=0;i<4;i++){
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
}
function startForge(PD,idx){
  if(PD.gold<200){showRewardPopup([{icon:'💰',text:'金币不足(需200)'}]);return}
  PD.gold-=200;
  const pool=EQUIPMENT_DB.filter(e=>Math.random()<.6||e.rarity==='common');
  const eq=pool[Math.floor(Math.random()*pool.length)];
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
    body.innerHTML=`<div class="guild-empty"><div class="guild-empty-icon">👥</div><div class="guild-empty-text">你还没有加入公会<br><span style="font-size:12px;color:#666">加入公会可以获得额外属性加成和专属副本</span></div>
      <button class="btn-gold" onclick="window._joinGuild()">⚔️ 创建公会</button>
      <div style="margin-top:12px"><button class="btn-sub" onclick="window._joinRandomGuild()">🔍 加入推荐公会</button></div></div>`;
  }else{
    const gLv=Math.min(10,Math.floor(PD.guildContrib/500)+1);
    const gAtkBonus=gLv*2;const gHpBonus=gLv*10;
    body.innerHTML=`<div class="guild-info">
      <div class="gi-name">⚔️ ${PD.guildName}</div>
      <div class="gi-level">公会等级 Lv.${gLv} <span style="font-size:10px;color:#44ff44">（全员攻击+${gAtkBonus} 生命+${gHpBonus}）</span></div>
      <div class="gi-members">成员 12/30 | 贡献 ${PD.guildContrib}</div>
      <div style="margin-top:8px;font-size:11px;color:#888">📊 公会排名: #${Math.max(1,50-PD.guildContrib)} / 服务器</div>
      </div>
      <div class="guild-actions">
        <div class="ga-btn" onclick="window._guildDonate()"><div class="ga-icon">💰</div><div class="ga-label">捐献(200💰)<br><span style="font-size:9px;color:#44ff44">+200贡献</span></div></div>
        <div class="ga-btn" onclick="window._guildRaid()"><div class="ga-icon">⚔️</div><div class="ga-label">公会副本<br><span style="font-size:9px;color:#ffd700">${PD.guildRaidDone?'✅ 今日已挑战':'可挑战'}</span></div></div>
        <div class="ga-btn" onclick="window._guildRank()"><div class="ga-icon">📊</div><div class="ga-label">排行榜<br><span style="font-size:9px;color:#aaa">查看排名</span></div></div>
        <div class="ga-btn" onclick="window._guildBuff()"><div class="ga-icon">🛡️</div><div class="ga-label">公会BUFF<br><span style="font-size:9px;color:#44ddff">Lv.${gLv}加成中</span></div></div>
      </div>
      <div style="padding:12px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);margin-top:8px">
        <div style="font-size:13px;font-weight:bold;color:#ffd700;margin-bottom:8px">📢 公会公告</div>
        <div style="font-size:11px;color:#aaa;line-height:1.6">欢迎加入${PD.guildName}！每日捐献可提升公会等级获得属性加成。<br>公会副本每日可挑战1次，全员协力击败Boss获得丰厚奖励。</div>
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
  for(let i=0;i<Math.min(BP_REWARDS.length,15);i++){
    const r=BP_REWARDS[i];const current=PD.bpLevel===r.level;const claimed=PD.bpLevel>r.level;
    const row=document.createElement('div');row.className=`bp-row${current?' current':''}${claimed?' claimed':''}`;
    row.innerHTML=`<div class="bp-lv">${r.level}</div><div class="bp-free">${r.free.icon} ${r.free.text}</div>
      <div class="bp-paid${!PD.bpPaid?' locked':''}">${r.paid.icon} ${r.paid.text}</div>`;
    tracks.appendChild(row);
  }
  $('bp-unclaimed').textContent=PD.bpPaid?0:Math.max(0,PD.bpLevel-1);
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
  const wheel=$('draw-wheel');
  const n=DRAW_PRIZES.length;
  wheel.innerHTML=DRAW_PRIZES.map((p,i)=>{
    const ang=i*360/n-90;const r=90;
    const x=130+r*Math.cos(ang*Math.PI/180)-30;
    const y=130+r*Math.sin(ang*Math.PI/180)-18;
    return `<div class="draw-prize-item" style="left:${x}px;top:${y}px"><span>${p.icon}</span><small>${p.text.replace(/[0-9]+/,'').trim()}</small></div>`;
  }).join('');
  $('draw-chances').textContent=PD.drawChances;
}
function doLuckyDraw(PD){
  const today=new Date().toDateString();
  if(PD.lastDrawDate!==today){PD.drawChances=3;PD.lastDrawDate=today}
  if(PD.drawChances<=0){showRewardPopup([{icon:'🎰',text:'今日次数已用完'}]);return}
  PD.drawChances--;
  const totalW=DRAW_PRIZES.reduce((s,p)=>s+p.weight,0);
  let r=Math.random()*totalW,prize=DRAW_PRIZES[0];
  for(const p of DRAW_PRIZES){r-=p.weight;if(r<=0){prize=p;break}}
  // 转盘动画
  const wheel=$('draw-wheel');const deg=1440+Math.random()*360;
  wheel.style.transform=`rotate(${deg}deg)`;
  setTimeout(()=>{
    showRewardPopup([{icon:prize.icon,text:prize.text}]);
    if(prize.text.includes('金币'))PD.gold+=parseInt(prize.text)||500;
    if(prize.text.includes('钻石'))PD.diamond+=parseInt(prize.text.match(/\d+/))||50;
    if(prize.text.includes('体力'))PD.stamina=Math.min(PD.maxStamina,PD.stamina+30);
    $('draw-chances').textContent=PD.drawChances;
    saveToDisk(PD);refreshMainMenu(PD);
  },3000);
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

// ==================== 天赋树系统 ====================
function renderTalent(PD){
  const body=$('talent-body');if(!body)return;
  body.innerHTML='';
  // 确保PD.talents存在
  if(!PD.talents)PD.talents={war:[],def:[],util:[]};
  const heroLv=(PD.heroes[PD.selectedHero]||{}).level||1;
  
  Object.entries(TALENT_TREES).forEach(([treeKey,tree])=>{
    const section=document.createElement('div');section.className='talent-tree';
    const selected=PD.talents[treeKey]||[];
    let html=`<div class="tt-header" style="border-left:3px solid ${tree.color}"><div class="tt-name">${tree.name}</div><div class="tt-desc">${tree.desc}</div><div class="tt-progress">${selected.length}/${tree.tiers.length}</div></div>`;
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
        html+=`<div class="tt-choice${isChosen?' chosen':''}${canChoose?' available':''}" ${canChoose?`onclick="window._chooseTalent('${treeKey}',${ti},'${c.id}',${tier.cost})"`:''}>`;
        html+=`<div class="tt-ch-name">${c.name}</div><div class="tt-ch-desc">${c.desc}</div>`;
        html+=`</div>`;
      });
      html+=`</div></div>`;
    });
    html+=`</div>`;
    section.innerHTML=html;body.appendChild(section);
  });
}
function chooseTalent(PD,treeKey,tierIdx,talentId,cost){
  if(!PD.talents)PD.talents={war:[],def:[],util:[]};
  const arr=PD.talents[treeKey];
  if(arr[tierIdx]){showRewardPopup([{icon:'🌟',text:'该层已选择！'}]);return}
  if(PD.gold<cost){showRewardPopup([{icon:'💰',text:`金币不足！需要${cost}`}]);return}
  const heroLv=(PD.heroes[PD.selectedHero]||{}).level||1;
  const tier=TALENT_TREES[treeKey].tiers[tierIdx];
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
  const slots=['weapon','armor','trinket','ring'];
  const slotNames={weapon:'武器',armor:'护甲',trinket:'饰品',ring:'戒指'};
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

// ==================== 计算天赋总加成 ====================
function calcTalentBonus(PD){
  const bonus={atk:0,hp:0,armor:0,spd:0,critRate:0,critDmg:0,
    regen:0,killHeal:0,berserker:0,armorPen:0,eliteHeal:0,skillDmg:0,execute:0,
    leech:0,xpBonus:0,goldBonus:0,extraSkillChoice:0,pickupRange:0,legendRate:0,
    block:null,shield:0,thorns:0,slowRes:0,dodge:0,startShield:0,revive:null,eliteLoot:0,
    freeSkill:0,goldOnKill:0,xpMagnet:0,atkSpeed:0,critWave:0,deathSave:0,doubleSkill:0,allPct:0};
  if(!PD.talents)return bonus;
  Object.entries(TALENT_TREES).forEach(([treeKey,tree])=>{
    const selected=PD.talents[treeKey]||[];
    selected.forEach((talentId,ti)=>{
      if(!talentId)return;
      const tier=tree.tiers[ti];if(!tier)return;
      const talent=tier.choices.find(c=>c.id===talentId);if(!talent)return;
      const s=talent.stat,v=talent.val;
      // 特殊处理 revive（对象直接赋值，不走通用逻辑）
      if(s==='revive'&&typeof v==='object'){bonus.revive=v;return}
      // 简单stat直接加
      if(typeof v==='number'){
        if(bonus[s]!==undefined)bonus[s]+=v;
      }else if(typeof v==='object'){
        // 复合stat
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
      // 特殊：atk+crit 等组合key
      if(s==='atk+crit'&&typeof v==='object'){bonus.atk+=v.atk||0;bonus.critRate+=v.critRate||0}
      if(s==='armor+hp'&&typeof v==='object'){bonus.armor+=v.armor||0;bonus.hp+=v.hp||0}
      if(s==='hp+armor'&&typeof v==='object'){bonus.hp+=v.hp||0;bonus.armor+=v.armor||0}
      if(s==='slowRes+spd'&&typeof v==='object'){bonus.slowRes+=v.slowRes||0;bonus.spd+=v.spd||0}
      if(s==='spd+dodge'&&typeof v==='object'){bonus.spd+=v.spd||0;bonus.dodge+=v.dodge||0}
      if(s==='xpMagnet+bonus'&&typeof v==='object'){bonus.xpMagnet+=v.magnet||0;bonus.xpBonus+=v.bonus||0}
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
  const totalAtk=Math.round(((hero.atk+lvBonus.atk)*starMult+eqAtk+enhBonus.atk+talentBonus.atk)*(1+talentBonus.allPct));
  const totalHp=Math.round(((hero.hp+lvBonus.hp)*starMult+eqHp+enhBonus.hp+talentBonus.hp)*(1+talentBonus.allPct));
  return {atk:totalAtk, hp:totalHp, power:totalAtk*3+totalHp};
}

// ==================== 卡关引导 ====================
function renderStuckGuide(PD,chapterId){
  const checks=[];
  const hd=PD.heroes[PD.selectedHero]||{level:1,star:0};
  const hero=ALL_HEROES[PD.selectedHero];
  // 检查英雄等级
  const lvBonus=calcHeroLevelBonus(hd.level||1);
  if(lvBonus.atk<hero.atk*0.5)checks.push(STUCK_GUIDE.checks[0]); // 等级加成<基础50%
  // 检查天赋
  if(!PD.talents)PD.talents={war:[],def:[],util:[]};
  const totalTalents=(PD.talents.war||[]).filter(Boolean).length+(PD.talents.def||[]).filter(Boolean).length+(PD.talents.util||[]).filter(Boolean).length;
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

// ==================== 暴露到全局 ====================
window.SYS={
  loadSave,saveToDisk,createDefaultPD,showRewardPopup,refreshMainMenu,
  renderSignIn,doSignIn,renderHeroes,renderChapters,renderForge,renderForgeWithEnhance,
  renderArena,arenaFight,renderGuild,joinGuild,guildDonate,guildRaid,guildRank,guildBuff,
  renderShop,switchShopTab,buyStamina,buyStaminaFull,renderBattlePass,renderAchievements,claimAchievement,
  renderDailyQuests,claimQuest,renderLuckyDraw,doLuckyDraw,renderChests,
  doFirstCharge,buyBattlePass,
  // 新增养成系统
  heroUpStar,renderTalent,chooseTalent,renderEnhance,enhanceEquip,
  addHeroXp,calcTalentBonus,calcEquipEnhanceBonus,calcTotalPower,renderStuckGuide
};
})();
