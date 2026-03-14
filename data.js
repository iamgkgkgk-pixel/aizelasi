// =====================================================================
//  《艾泽拉斯幸存者》数据配置模块 — 金牌数值策划版 v2.0
// =====================================================================
//
//  【核心数值哲学】
//  1. 所有伤害 = 基础值 + 攻击力×缩放系数，确保英雄选择有意义
//  2. 升级曲线采用 S型曲线：前期快速（爽感）→ 中期稳定 → 后期放缓（挑战）
//  3. 怪物HP以章节为单位指数增长（1.8倍/章），波次内线性缩放
//  4. 技能CD分三档：高频低伤（割草快感）、中频中伤（节奏骨架）、低频高伤（高光时刻）
//  5. 英雄DPS预算一致，但伤害分布模式不同（AOE vs 单体 vs DOT vs 爆发）
//

// ==================== 数值公式常量 ====================
const NUM = {
  // 升级经验公式: xpNeed = BASE * (level^POWER) + level*LINEAR
  XP_BASE: 12,               // ↑ 8→12 提高基础经验需求
  XP_POWER: 1.85,            // ↑ 1.65→1.85 升级曲线更陡
  XP_LINEAR: 6,              // ↑ 4→6 线性部分增大
  // 每级属性成长
  ATK_PER_LEVEL: 1.8,        // ↓ 2.5→1.8 降低每级攻击成长
  HP_PER_LEVEL: 5,            // ↓ 8→5 降低每级生命成长
  HEAL_ON_LEVELUP: 0.12,     // ↓ 0.20→0.12 升级回血降低
  // 掉落XP球价值 = BASE + level*SCALE
  XP_ORB_BASE: 1,            // ↓ 2→1 球基础价值降低
  XP_ORB_SCALE: 0.3,         // ↓ 0.5→0.3 球随等级缩放降低
  // 怪物波次缩放: 实际属性 = 基础 * (1 + (wave-1)*WAVE_SCALE)
  WAVE_HP_SCALE: 0.15,       // ↑ 0.12→0.15 怪物HP增长加快
  WAVE_ATK_SCALE: 0.10,      // ↑ 0.08→0.10 怪物攻击增长加快
  WAVE_SPD_SCALE: 0.02,      // 每波速度+2% (不变)
  // 怪物经验掉落缩放
  WAVE_XP_SCALE: 0.03,       // ↓ 0.06→0.03 经验随波次增长放缓
  // 精英怪倍率
  ELITE_HP_MULT: 4.0,        // ↑ 3.5→4.0 精英更肉
  ELITE_ATK_MULT: 2.0,       // ↑ 1.8→2.0 精英更痛
  ELITE_XP_MULT: 3,          // ↓ 5→3 精英经验大幅降低
  ELITE_SIZE_MULT: 1.3,
  ELITE_CHANCE_BASE: 0.0,    // 第1波无精英
  ELITE_CHANCE_PER_WAVE: 0.025, // 每波+2.5%概率
  // BOSS阶段转换
  BOSS_PHASE2_HP: 0.6,       // 60%血量进入P2
  BOSS_PHASE3_HP: 0.25,      // 25%血量进入P3（狂暴）
  BOSS_ENRAGE_ATK_MULT: 1.5,
  BOSS_ENRAGE_SPD_MULT: 1.3,
  // 伤害公式: finalDmg = baseDmg + heroAtk * atkRatio
  // 技能DPS预算（每秒期望伤害 @Lv1, 不含攻击力）
  SKILL_DPS_COMMON: 25,      // 普通技能 ~25 DPS
  SKILL_DPS_RARE: 40,        // 精良技能 ~40 DPS
  SKILL_DPS_EPIC: 55,        // 史诗技能 ~55 DPS
  SKILL_DPS_LEGENDARY: 80,   // 传说技能 ~80 DPS
  // 技能每级成长
  SKILL_DMG_PER_LV: 0.12,    // ↓ 15%→12% 每级伤害成长放缓
  SKILL_CD_PER_LV: 0.06,     // ↓ 8%→6% 每级CD减少放缓
  // 暴击系统
  CRIT_CHANCE_BASE: 0.05,
  CRIT_DAMAGE_MULT: 2.0,
  // 金币掉落
  GOLD_PER_KILL_BASE: 1,
  GOLD_PER_KILL_WAVE: 0.3,
  GOLD_BOSS_MULT: 25,
  // 生命恢复球
  HEAL_ORB_CHANCE: 0.04,     // ↓ 6%→4%掉率
  HEAL_ORB_VALUE: 0.06,      // ↓ 8%→6%最大HP回复
};

// ==================== 10大英雄（差异化DPS预算版） ====================
// 设计原则：总DPS预算相近，但伤害分布不同
// atk = 影响技能伤害缩放; hp = 容错空间; spd = 位移速度
// critRate = 暴击率; critDmg = 暴击倍率
// passive = 被动特性（在战斗中动态生效）
// atkRate = 基础攻击间隔(秒); atkRange = 攻击范围; atkType = 攻击类型
const ALL_HEROES={
  warrior:{id:'warrior',name:'战士',icon:'⚔️',origin:'武器战',role:'近战AOE',color:0xcc3333,
    atk:22,hp:200,spd:4.5,critRate:0.08,critDmg:2.0,armor:3,
    atkRate:0.5,atkRange:3.5,atkType:'melee_aoe',atkRatio:1.0,
    passive:'berserker',passiveDesc:'血量低于30%时攻击力+40%，攻速+25%',
    signatureSkill:'sig_whirlwind',skill:'旋风斩',
    favorSkills:['frostnova','ashbringer','bloodthirst'], // 近战AOE偏好
    unlock:'初始解锁',unlockType:'free'},

  mage:{id:'mage',name:'法师',icon:'🔥',origin:'火法',role:'远程范围',color:0xff6600,
    atk:30,hp:120,spd:4.0,critRate:0.12,critDmg:2.2,armor:0,
    atkRate:0.4,atkRange:15,atkType:'ranged_multi',atkRatio:1.1,
    passive:'ignite',passiveDesc:'火焰攻击使敌人燃烧，3秒内额外造成30%伤害',
    signatureSkill:'sig_firestorm',skill:'烈焰风暴',
    favorSkills:['fireball','livingbomb','eyeofsargeras'], // 火焰法术偏好
    unlock:'初始解锁',unlockType:'free'},

  hunter:{id:'hunter',name:'猎人',icon:'🏹',origin:'兽王猎',role:'召唤+远程',color:0x33aa33,
    atk:20,hp:160,spd:5.0,critRate:0.10,critDmg:2.0,armor:1,
    atkRate:0.35,atkRange:18,atkType:'ranged_barrage',atkRatio:0.65,
    passive:'beastmaster',passiveDesc:'每30秒召唤一只野兽助战(持续15秒)，攻击力=英雄60%',
    signatureSkill:'sig_multishot',skill:'多重射击',
    favorSkills:['naturewrath','thunder','chainlight'], // 远程多目标偏好
    unlock:'第2天登录',unlockType:'day',unlockReq:2},

  priest:{id:'priest',name:'牧师',icon:'✝️',origin:'暗牧',role:'持续伤害',color:0x9966cc,
    atk:26,hp:130,spd:4.2,critRate:0.06,critDmg:2.0,armor:0,
    atkRate:0.55,atkRange:12,atkType:'ranged_dot',atkRatio:0.9,
    passive:'vampiric',passiveDesc:'DOT伤害的15%转化为生命恢复',
    signatureSkill:'sig_shadowword',skill:'暗言术',
    favorSkills:['heal','bloodthirst','timewarp'], // 生存+DOT偏好
    unlock:'通关第3章',unlockType:'chapter',unlockReq:'ch3'},

  rogue:{id:'rogue',name:'盗贼',icon:'🗡️',origin:'狂徒贼',role:'高爆发',color:0x444444,
    atk:35,hp:110,spd:5.5,critRate:0.25,critDmg:2.8,armor:1,
    atkRate:0.25,atkRange:4,atkType:'melee_burst',atkRatio:1.6,
    passive:'shadowstrike',passiveDesc:'暴击后下一次攻击必定暴击，且暴击伤害+50%',
    signatureSkill:'sig_shadowdance',skill:'影舞',
    favorSkills:['thunder','chainstorm','ashbringer'], // 爆发+暴击偏好
    unlock:'7日签到',unlockType:'signin',unlockReq:7},

  shaman:{id:'shaman',name:'萨满',icon:'🌊',origin:'增强萨',role:'图腾流',color:0x2266bb,
    atk:24,hp:170,spd:4.3,critRate:0.08,critDmg:2.0,armor:2,
    atkRate:0.6,atkRange:5,atkType:'totem_hybrid',atkRatio:0.8,
    passive:'totemic',passiveDesc:'每20秒自动放置一个图腾(火/水/风轮替)，持续12秒',
    signatureSkill:'sig_totemstorm',skill:'图腾风暴',
    favorSkills:['chainlight','heal','frostnova'], // 元素混合偏好
    unlock:'首充奖励',unlockType:'firstcharge'},

  deathknight:{id:'deathknight',name:'死骑',icon:'💀',origin:'冰DK',role:'减速控制',color:0x4488cc,
    atk:26,hp:220,spd:3.8,critRate:0.07,critDmg:2.0,armor:4,
    atkRate:0.55,atkRange:3.5,atkType:'melee_frost',atkRatio:0.95,
    passive:'frostpresence',passiveDesc:'近身怪物持续受到冰霜光环伤害(每秒ATK×20%)并减速30%',
    signatureSkill:'sig_wintercoming',skill:'凛冬将至',
    favorSkills:['frostnova','blizzard','frostmourne'], // 冰霜偏好
    unlock:'赛季奖励',unlockType:'season'},

  druid:{id:'druid',name:'德鲁伊',icon:'🌿',origin:'鸟德',role:'变形切换',color:0x44aa44,
    atk:23,hp:180,spd:4.5,critRate:0.08,critDmg:2.0,armor:2,
    atkRate:0.5,atkRange:12,atkType:'shapeshifter',atkRatio:0.85,
    passive:'shapeshift',passiveDesc:'血量>50%为远程月火形态(高伤害)，<50%自动切熊形态(+80%护甲,近战AOE,每秒回血1%)',
    signatureSkill:'sig_starfall',skill:'星辰坠落',
    favorSkills:['thorns','naturewrath','heal'], // 自然生存偏好
    unlock:'累计在线2h',unlockType:'online',unlockReq:120},

  warlock:{id:'warlock',name:'术士',icon:'👿',origin:'痛苦术',role:'诅咒召唤',color:0x7733aa,
    atk:28,hp:115,spd:4.0,critRate:0.10,critDmg:2.2,armor:0,
    atkRate:0.65,atkRange:14,atkType:'curse_summon',atkRatio:1.0,
    passive:'souldrain',passiveDesc:'被诅咒的敌人死亡时爆炸，对周围造成其最大HP×15%的伤害',
    signatureSkill:'sig_doomguard',skill:'末日守卫',
    favorSkills:['livingbomb','eyeofsargeras','dalaran'], // 高伤AOE偏好
    unlock:'累充¥100',unlockType:'totalcharge',unlockReq:100},

  paladin:{id:'paladin',name:'圣骑士',icon:'🛡️',origin:'惩戒骑',role:'AOE+护盾',color:0xffaa33,
    atk:21,hp:250,spd:4.0,critRate:0.06,critDmg:2.0,armor:5,
    atkRate:0.55,atkRange:3.5,atkType:'melee_holy',atkRatio:0.9,
    passive:'divineprotection',passiveDesc:'每25秒获得一个神圣护盾(吸收=最大HP×15%)，护盾存在时攻击附带圣光灼烧',
    signatureSkill:'sig_avengershield',skill:'复仇之盾',
    favorSkills:['heal','thorns','ashbringer'], // 坦克近战偏好
    unlock:'竞技场黄金',unlockType:'arena',unlockReq:'gold'}
};

// ==================== 8个副本（指数级难度曲线） ====================
// HP基础值设计: ch1=15 → ch7=15*1.8^6 ≈ 510 (34倍跨度)
// 每个副本3种怪：炮灰(低HP高速)、标准(中等)、精英型(高HP低速高伤)
// BOSS增加阶段机制
const CHAPTERS={
  ch1:{id:'ch1',num:1,name:'艾尔文森林',desc:'狗头人与豺狼人出没',bgColor:0x1a2a1a,
    boss:{name:'霍格',hp:500,atk:12,spd:2.0,color:0x884422,sz:2.0,
      phases:[
        {hpPct:1.0,skills:['charge'],atkMult:1.0,spdMult:1.0,interval:5},
        {hpPct:0.5,skills:['charge','whirlwind'],atkMult:1.3,spdMult:1.2,interval:4}
      ]},
    waves:8,waveDur:25,recPower:150,
    reward:{gold:400,xp:150,frags:1},unlockReq:null,
    // 刷怪节奏：初始慢→渐快
    spawnBase:1.8,spawnScalePerWave:0.15,maxEnemies:20,batchMin:2,batchMax:5,
    enemyTypes:[
      {name:'狗头人',color:0x886644,sz:0.6,hp:15,atk:3,spd:2.0,xp:2,type:'fodder'},
      {name:'豺狼人',color:0xaa7744,sz:0.7,hp:24,atk:5,spd:1.8,xp:3,type:'standard'}]},

  ch2:{id:'ch2',num:2,name:'西部荒野',desc:'迪菲亚兄弟会地盘',bgColor:0x2a2210,
    boss:{name:'范克里夫',hp:1200,atk:18,spd:2.5,color:0xaa2222,sz:2.2,
      phases:[
        {hpPct:1.0,skills:['knifestorm'],atkMult:1.0,spdMult:1.0,interval:6},
        {hpPct:0.6,skills:['knifestorm','summon_adds'],atkMult:1.2,spdMult:1.1,interval:5},
        {hpPct:0.25,skills:['knifestorm','poison_nova'],atkMult:1.5,spdMult:1.4,interval:3}
      ]},
    waves:9,waveDur:28,recPower:400,
    reward:{gold:700,xp:280,frags:2},unlockReq:'ch1',
    spawnBase:1.6,spawnScalePerWave:0.12,maxEnemies:25,batchMin:2,batchMax:6,
    enemyTypes:[
      {name:'迪菲亚打手',color:0xcc4422,sz:0.65,hp:28,atk:6,spd:2.2,xp:3,type:'standard'},
      {name:'迪菲亚盗贼',color:0xcc2222,sz:0.6,hp:20,atk:10,spd:2.8,xp:4,type:'fast'},
      {name:'迪菲亚法师',color:0xcc6622,sz:0.6,hp:18,atk:14,spd:1.6,xp:5,type:'caster'}]},

  ch3:{id:'ch3',num:3,name:'荆棘谷',desc:'巨魔与猛兽横行',bgColor:0x0a2a0a,
    boss:{name:'血领主曼多基尔',hp:2200,atk:24,spd:2.2,color:0x882244,sz:2.5,
      phases:[
        {hpPct:1.0,skills:['charge','throw_spear'],atkMult:1.0,spdMult:1.0,interval:5},
        {hpPct:0.6,skills:['charge','throw_spear','blood_frenzy'],atkMult:1.3,spdMult:1.3,interval:4},
        {hpPct:0.2,skills:['charge','blood_frenzy','summon_adds'],atkMult:1.6,spdMult:1.5,interval:3}
      ]},
    waves:10,waveDur:28,recPower:800,
    reward:{gold:1000,xp:420,frags:3},unlockReq:'ch2',
    spawnBase:1.5,spawnScalePerWave:0.12,maxEnemies:30,batchMin:3,batchMax:7,
    enemyTypes:[
      {name:'丛林巨魔',color:0x44aa66,sz:0.7,hp:45,atk:8,spd:2.0,xp:4,type:'standard'},
      {name:'银背猩猩',color:0x666633,sz:0.85,hp:70,atk:12,spd:1.5,xp:6,type:'tank'},
      {name:'猛虎',color:0xcc8844,sz:0.65,hp:30,atk:15,spd:3.2,xp:5,type:'fast'}]},

  ch4:{id:'ch4',num:4,name:'灼热峡谷',desc:'黑铁矮人与火元素',bgColor:0x2a1008,
    boss:{name:'拉格纳罗斯',hp:4000,atk:32,spd:1.8,color:0xff4400,sz:3.0,
      phases:[
        {hpPct:1.0,skills:['magma_blast','lava_pool'],atkMult:1.0,spdMult:1.0,interval:5},
        {hpPct:0.5,skills:['magma_blast','lava_pool','fire_nova'],atkMult:1.4,spdMult:1.0,interval:4},
        {hpPct:0.2,skills:['magma_blast','fire_nova','summon_adds'],atkMult:1.8,spdMult:1.2,interval:2.5}
      ]},
    waves:10,waveDur:30,recPower:1500,
    reward:{gold:1500,xp:600,frags:4},unlockReq:'ch3',
    spawnBase:1.4,spawnScalePerWave:0.10,maxEnemies:35,batchMin:3,batchMax:8,
    enemyTypes:[
      {name:'黑铁矮人',color:0x884422,sz:0.6,hp:60,atk:10,spd:2.0,xp:5,type:'standard'},
      {name:'火元素',color:0xff6622,sz:0.7,hp:80,atk:16,spd:1.4,xp:7,type:'caster'},
      {name:'熔岩犬',color:0xff4400,sz:0.55,hp:40,atk:8,spd:3.0,xp:4,type:'fast'}]},

  ch5:{id:'ch5',num:5,name:'东瘟疫之地',desc:'天灾军团的腐化之地',bgColor:0x1a1a2a,
    boss:{name:'克尔苏加德之影',hp:7000,atk:40,spd:2.0,color:0x6644aa,sz:2.8,
      phases:[
        {hpPct:1.0,skills:['frostbolt','frost_nova'],atkMult:1.0,spdMult:1.0,interval:4},
        {hpPct:0.6,skills:['frostbolt','frost_nova','summon_adds'],atkMult:1.3,spdMult:1.1,interval:3.5},
        {hpPct:0.2,skills:['frostbolt','chains_of_kel','frost_nova'],atkMult:1.7,spdMult:1.3,interval:2}
      ]},
    waves:10,waveDur:30,recPower:2800,
    reward:{gold:2200,xp:900,frags:5},unlockReq:'ch4',
    spawnBase:1.3,spawnScalePerWave:0.10,maxEnemies:40,batchMin:3,batchMax:8,
    enemyTypes:[
      {name:'食尸鬼',color:0x44aa44,sz:0.6,hp:55,atk:9,spd:2.8,xp:5,type:'fast'},
      {name:'憎恶',color:0x668844,sz:0.95,hp:120,atk:18,spd:1.0,xp:10,type:'tank'},
      {name:'亡灵法师',color:0x664488,sz:0.6,hp:45,atk:22,spd:1.5,xp:8,type:'caster'}]},

  ch6:{id:'ch6',num:6,name:'海加尔山',desc:'燃烧军团大举入侵',bgColor:0x2a0a0a,
    boss:{name:'阿克蒙德',hp:12000,atk:50,spd:1.5,color:0x882200,sz:3.5,
      phases:[
        {hpPct:1.0,skills:['soul_charge','rain_of_fire'],atkMult:1.0,spdMult:1.0,interval:5},
        {hpPct:0.55,skills:['soul_charge','rain_of_fire','finger_of_death'],atkMult:1.4,spdMult:1.2,interval:3.5},
        {hpPct:0.2,skills:['soul_charge','finger_of_death','doom'],atkMult:2.0,spdMult:1.5,interval:2}
      ]},
    waves:10,waveDur:30,recPower:5000,
    reward:{gold:3500,xp:1500,frags:6},unlockReq:'ch5',
    spawnBase:1.2,spawnScalePerWave:0.08,maxEnemies:45,batchMin:4,batchMax:10,
    enemyTypes:[
      {name:'恶魔卫兵',color:0xaa4422,sz:0.75,hp:90,atk:14,spd:2.2,xp:7,type:'standard'},
      {name:'地狱火',color:0xff4400,sz:0.95,hp:150,atk:22,spd:0.9,xp:12,type:'tank'},
      {name:'末日守卫',color:0x882200,sz:0.85,hp:100,atk:28,spd:1.8,xp:10,type:'caster'}]},

  ch7:{id:'ch7',num:7,name:'诺森德',desc:'巫妖王的领地',bgColor:0x0a1a2a,
    boss:{name:'巫妖王',hp:20000,atk:60,spd:2.2,color:0x4488ff,sz:3.5,
      phases:[
        {hpPct:1.0,skills:['frost_strike','remorseless_winter'],atkMult:1.0,spdMult:1.0,interval:4},
        {hpPct:0.65,skills:['frost_strike','remorseless_winter','defile'],atkMult:1.3,spdMult:1.2,interval:3},
        {hpPct:0.35,skills:['frost_strike','defile','harvest_soul','summon_adds'],atkMult:1.5,spdMult:1.3,interval:2.5},
        {hpPct:0.1,skills:['fury_of_frostmourne'],atkMult:2.5,spdMult:2.0,interval:1.5}
      ]},
    waves:12,waveDur:30,recPower:9000,
    reward:{gold:6000,xp:3000,frags:8},unlockReq:'ch6',
    spawnBase:1.1,spawnScalePerWave:0.08,maxEnemies:50,batchMin:4,batchMax:10,
    enemyTypes:[
      {name:'维库人',color:0x8888aa,sz:0.8,hp:110,atk:16,spd:2.0,xp:8,type:'standard'},
      {name:'冰霜巨龙',color:0x88ccff,sz:1.05,hp:180,atk:30,spd:1.3,xp:15,type:'tank'},
      {name:'瓦格里',color:0xaaaacc,sz:0.7,hp:80,atk:24,spd:2.6,xp:10,type:'fast'}]},

  endless:{id:'endless',num:8,name:'扭曲虚空',desc:'无尽挑战',bgColor:0x0a0a1a,
    boss:{name:'虚空领主',hp:5000,atk:35,spd:2.0,color:0x6622aa,sz:3.0,
      phases:[
        {hpPct:1.0,skills:['void_bolt','shadow_nova'],atkMult:1.0,spdMult:1.0,interval:4},
        {hpPct:0.5,skills:['void_bolt','shadow_nova','summon_adds'],atkMult:1.4,spdMult:1.2,interval:3},
        {hpPct:0.2,skills:['void_bolt','void_eruption'],atkMult:2.0,spdMult:1.5,interval:2}
      ]},
    waves:999,waveDur:25,recPower:3000,
    reward:{gold:0,xp:0,frags:0},unlockReq:'ch5',
    // 无尽模式特殊：每5波BOSS，怪物属性指数增长
    spawnBase:1.3,spawnScalePerWave:0.06,maxEnemies:50,batchMin:3,batchMax:10,
    endlessScale:true, // 标记为无尽缩放模式
    enemyTypes:[
      {name:'虚空行者',color:0x6622aa,sz:0.7,hp:70,atk:12,spd:2.0,xp:6,type:'standard'},
      {name:'扭曲畸体',color:0x883388,sz:0.85,hp:100,atk:18,spd:1.8,xp:8,type:'tank'},
      {name:'暗影精英',color:0x7744bb,sz:0.75,hp:80,atk:22,spd:2.4,xp:9,type:'fast'}]}
};

// ==================== 技能树（完整数值参数版） ====================
// 每个技能包含: baseDmg(基础伤害), atkRatio(攻击力缩放), cd(冷却时间), 每级成长参数
// maxLevel: 技能最高等级
// dmgGrowth: 每级伤害增长率(乘法)
// cdReduction: 每级CD减少(秒)
// 特殊参数由各技能自定义
const SKILL_DB=[
  // ===== 5个基础技能 (common) — 高频割草手感 =====
  {id:'fireball',name:'火球术',icon:'🔥',rarity:'common',maxLevel:8,
    desc:'发射火球，命中造成伤害',
    baseDmg:18,atkRatio:0.6,cd:1.0,cdMin:0.35,cdReduction:0.08,dmgGrowth:0.18,
    projSpeed:22,projCount:1,projCountPerLv:0.4, // Lv3=2发,Lv5=3发,Lv8=4发
    prereq:null},

  {id:'frostnova',name:'霜冻新星',icon:'❄️',rarity:'common',maxLevel:8,
    desc:'以自身为中心释放冰环，造成伤害并减速',
    baseDmg:22,atkRatio:0.5,cd:2.2,cdMin:1.0,cdReduction:0.12,dmgGrowth:0.16,
    radius:3.5,radiusPerLv:0.4,freezeDur:1.8,freezePerLv:0.2,
    prereq:null},

  {id:'thunder',name:'雷霆一击',icon:'⚡',rarity:'common',maxLevel:8,
    desc:'对周围敌人释放闪电伤害',
    baseDmg:20,atkRatio:0.55,cd:1.6,cdMin:0.7,cdReduction:0.10,dmgGrowth:0.17,
    radius:4.5,radiusPerLv:0.35,chainChance:0.35,chainChancePerLv:0.05,
    prereq:null},

  {id:'heal',name:'治疗之泉',icon:'💚',rarity:'common',maxLevel:8,
    desc:'定时恢复生命值',
    baseDmg:0,atkRatio:0,cd:7.0,cdMin:3.0,cdReduction:0.5,dmgGrowth:0,
    healPct:0.08,healPctPerLv:0.015, // 基础回8%HP，每级+1.5%
    prereq:null},

  {id:'thorns',name:'荆棘术',icon:'🌿',rarity:'common',maxLevel:8,
    desc:'被攻击时反弹伤害',
    baseDmg:8,atkRatio:0.25,cd:0,cdMin:0,cdReduction:0,dmgGrowth:0.20,
    reflectPct:0.30,reflectPctPerLv:0.08, // 反弹30%伤害，每级+8%
    prereq:null},

  // ===== 5个进阶技能 (rare) — 需要前置Lv3 =====
  {id:'livingbomb',name:'活体炸弹',icon:'💥',rarity:'rare',maxLevel:6,
    desc:'发射爆炸火球，命中后敌人爆炸伤及周围',
    baseDmg:35,atkRatio:0.8,cd:1.3,cdMin:0.6,cdReduction:0.10,dmgGrowth:0.20,
    explodeRadius:2.5,explodeRadiusPerLv:0.3,explodeDmgPct:0.45,explodeDmgPctPerLv:0.05,
    projSpeed:18,
    prereq:{id:'fireball',lv:3}},

  {id:'blizzard',name:'暴风雪',icon:'🌨️',rarity:'rare',maxLevel:6,
    desc:'在目标区域降下冰雹，持续造成伤害并减速',
    baseDmg:12,atkRatio:0.35,cd:3.0,cdMin:1.5,cdReduction:0.15,dmgGrowth:0.18,
    radius:3.5,radiusPerLv:0.4,duration:2.0,durationPerLv:0.2,tickRate:0.25,freezeOnHit:1.2,
    prereq:{id:'frostnova',lv:3}},

  {id:'chainlight',name:'闪电链',icon:'⛓️',rarity:'rare',maxLevel:6,
    desc:'闪电在敌人间弹射，每次弹射伤害递减',
    baseDmg:25,atkRatio:0.65,cd:1.8,cdMin:0.7,cdReduction:0.12,dmgGrowth:0.18,
    bounceCount:4,bounceCountPerLv:1,bounceDmgDecay:0.85,bounceRange:8,
    prereq:{id:'thunder',lv:3}},

  {id:'bloodthirst',name:'血之渴望',icon:'🩸',rarity:'rare',maxLevel:6,
    desc:'击杀敌人时回复生命',
    baseDmg:0,atkRatio:0,cd:0,cdMin:0,cdReduction:0,dmgGrowth:0,
    healOnKillPct:0.025,healOnKillPctPerLv:0.008, // 基础回2.5%MaxHP/击杀
    prereq:{id:'heal',lv:3}},

  {id:'naturewrath',name:'自然之怒',icon:'🍃',rarity:'rare',maxLevel:6,
    desc:'发射追踪飞弹攻击多个敌人',
    baseDmg:14,atkRatio:0.45,cd:1.6,cdMin:0.8,cdReduction:0.10,dmgGrowth:0.16,
    projCount:2,projCountPerLv:0.8,projSpeed:20,homing:true,
    prereq:{id:'thorns',lv:3}},

  // ===== 2个史诗技能 (epic) — 需要前置Lv3 =====
  {id:'chainstorm',name:'连锁闪电',icon:'🌩️',rarity:'epic',maxLevel:5,
    desc:'粗壮电弧在敌群间疯狂跳跃，每次跳跃可重复命中',
    baseDmg:30,atkRatio:0.75,cd:1.6,cdMin:0.5,cdReduction:0.12,dmgGrowth:0.20,
    jumpCount:6,jumpCountPerLv:2,jumpDmgDecay:0.88,jumpRange:10,
    prereq:{id:'chainlight',lv:3}},

  {id:'forkedlight',name:'叉状闪电',icon:'🔱',rarity:'epic',maxLevel:5,
    desc:'从英雄射出分叉闪电扫荡前方敌群，附带溅射',
    baseDmg:28,atkRatio:0.7,cd:1.4,cdMin:0.6,cdReduction:0.10,dmgGrowth:0.18,
    forkCount:3,forkCountPerLv:1,splashRadius:2.0,splashDmgPct:0.35,range:12,
    prereq:{id:'thunder',lv:3}},

  // ===== 5个传说技能 (legendary) — 单局稀有·高光时刻 =====
  {id:'ashbringer',name:'灰烬使者',icon:'🗡️',rarity:'legendary',maxLevel:3,
    desc:'召唤灰烬使者持续旋转割草',
    baseDmg:45,atkRatio:1.2,cd:8.0,cdMin:4.0,cdReduction:1.5,dmgGrowth:0.25,
    spinRadius:4.0,spinRadiusPerLv:0.5,spinDuration:3.0,spinDurPerLv:0.5,hitRate:0.1,
    prereq:null},

  {id:'frostmourne',name:'霜之哀伤',icon:'🥶',rarity:'legendary',maxLevel:3,
    desc:'全屏冰封，冻结所有敌人并造成大量伤害',
    baseDmg:50,atkRatio:1.0,cd:12.0,cdMin:6.0,cdReduction:2.0,dmgGrowth:0.30,
    freezeAll:true,freezeDur:3.0,freezeDurPerLv:0.5,radius:15,
    prereq:null},

  {id:'eyeofsargeras',name:'萨格拉斯之眼',icon:'👁️',rarity:'legendary',maxLevel:3,
    desc:'天空中出现巨眼持续射线轰炸',
    baseDmg:22,atkRatio:0.6,cd:10.0,cdMin:5.0,cdReduction:1.5,dmgGrowth:0.25,
    beamDuration:2.5,beamDurPerLv:0.5,hitRadius:3.0,hitRadiusPerLv:0.3,tickRate:0.2,
    prereq:null},

  {id:'dalaran',name:'达拉然坠落',icon:'🏰',rarity:'legendary',maxLevel:3,
    desc:'整个达拉然从天而降砸向敌群',
    baseDmg:100,atkRatio:2.0,cd:18.0,cdMin:10.0,cdReduction:3.0,dmgGrowth:0.30,
    impactRadius:7.0,impactRadiusPerLv:0.5,groundBurnDur:2.0,groundBurnDmg:15,
    prereq:null},

  {id:'timewarp',name:'时光倒流',icon:'⏪',rarity:'legendary',maxLevel:3,
    desc:'死亡后原地满血复活',
    baseDmg:0,atkRatio:0,cd:0,cdMin:0,cdReduction:0,dmgGrowth:0,
    reviveHpPct:0.6,reviveHpPctPerLv:0.15, // Lv1=60%, Lv2=75%, Lv3=90%
    invincibleDur:2.0,invincibleDurPerLv:0.5, // 复活后无敌时间
    prereq:null},

  // ===== 10个英雄标志技能 (signature) — 开局自动获得·独一无二 =====
  {id:'sig_whirlwind',name:'旋风斩',icon:'🌀',rarity:'signature',maxLevel:5,heroOnly:'warrior',
    desc:'释放旋风在身周持续割草，随等级增大范围和伤害',
    baseDmg:15,atkRatio:0.7,cd:3.0,cdMin:1.2,cdReduction:0.35,dmgGrowth:0.22,
    radius:4.0,radiusPerLv:0.5,spinHits:3,spinHitsPerLv:1,
    prereq:null},

  {id:'sig_firestorm',name:'烈焰风暴',icon:'🔥',rarity:'signature',maxLevel:5,heroOnly:'mage',
    desc:'召唤烈焰风暴轰击区域，持续造成火焰伤害',
    baseDmg:20,atkRatio:0.8,cd:4.0,cdMin:1.8,cdReduction:0.40,dmgGrowth:0.20,
    radius:4.5,radiusPerLv:0.4,duration:2.0,durationPerLv:0.3,tickRate:0.3,
    prereq:null},

  {id:'sig_multishot',name:'多重射击',icon:'🏹',rarity:'signature',maxLevel:5,heroOnly:'hunter',
    desc:'向周围发射一圈追踪箭矢，命中所有敌人',
    baseDmg:12,atkRatio:0.5,cd:3.5,cdMin:1.5,cdReduction:0.35,dmgGrowth:0.18,
    arrowCount:6,arrowCountPerLv:2,projSpeed:24,homing:true,
    prereq:null},

  {id:'sig_shadowword',name:'暗言术',icon:'💜',rarity:'signature',maxLevel:5,heroOnly:'priest',
    desc:'标记周围敌人，持续造成暗影伤害并回复生命',
    baseDmg:10,atkRatio:0.45,cd:4.0,cdMin:2.0,cdReduction:0.35,dmgGrowth:0.20,
    markCount:4,markCountPerLv:1,markDur:3.0,markDurPerLv:0.3,healPct:0.20,
    prereq:null},

  {id:'sig_shadowdance',name:'影舞',icon:'🌑',rarity:'signature',maxLevel:5,heroOnly:'rogue',
    desc:'瞬移到敌人身后连续暴击攻击，无敌期间不受伤害',
    baseDmg:25,atkRatio:1.0,cd:5.0,cdMin:2.5,cdReduction:0.45,dmgGrowth:0.25,
    strikeCount:3,strikeCountPerLv:1,invincDur:0.8,invincDurPerLv:0.1,
    prereq:null},

  {id:'sig_totemstorm',name:'图腾风暴',icon:'🌊',rarity:'signature',maxLevel:5,heroOnly:'shaman',
    desc:'同时释放火/水/风三图腾造成大范围元素伤害',
    baseDmg:18,atkRatio:0.6,cd:6.0,cdMin:3.0,cdReduction:0.50,dmgGrowth:0.20,
    totemRadius:5.0,totemRadPerLv:0.4,totemDur:4.0,totemDurPerLv:0.4,
    prereq:null},

  {id:'sig_wintercoming',name:'凛冬将至',icon:'❄️',rarity:'signature',maxLevel:5,heroOnly:'deathknight',
    desc:'释放冰霜冲击波冻结并伤害大范围敌人',
    baseDmg:22,atkRatio:0.65,cd:5.0,cdMin:2.0,cdReduction:0.50,dmgGrowth:0.22,
    freezeRadius:6.0,freezeRadPerLv:0.5,freezeDur:2.0,freezeDurPerLv:0.3,
    prereq:null},

  {id:'sig_starfall',name:'星辰坠落',icon:'⭐',rarity:'signature',maxLevel:5,heroOnly:'druid',
    desc:'从天空召唤星辰陨石雨随机轰炸敌群',
    baseDmg:16,atkRatio:0.55,cd:4.5,cdMin:2.0,cdReduction:0.40,dmgGrowth:0.20,
    meteorCount:4,meteorCountPerLv:1,impactR:2.5,impactRPerLv:0.2,
    prereq:null},

  {id:'sig_doomguard',name:'末日守卫',icon:'😈',rarity:'signature',maxLevel:5,heroOnly:'warlock',
    desc:'召唤末日守卫持续攻击敌人，对被诅咒的目标伤害翻倍',
    baseDmg:20,atkRatio:0.7,cd:8.0,cdMin:4.0,cdReduction:0.70,dmgGrowth:0.22,
    guardDur:6.0,guardDurPerLv:0.5,guardAtkRate:0.8,cursedMult:2.0,
    prereq:null},

  {id:'sig_avengershield',name:'复仇之盾',icon:'🛡️',rarity:'signature',maxLevel:5,heroOnly:'paladin',
    desc:'投掷神圣之盾弹射多个敌人，击中后获得护盾',
    baseDmg:18,atkRatio:0.6,cd:4.0,cdMin:1.8,cdReduction:0.40,dmgGrowth:0.20,
    bounceCount:3,bounceCountPerLv:1,shieldPct:0.05,shieldPctPerLv:0.01,bounceRange:8,
    prereq:null},
];

// ==================== 技能合成（需要特定组合 + 更高等级门槛） ====================
const SKILL_COMBOS=[
  {id:'titangrip',name:'泰坦之握',icon:'👊',desc:'发射巨型火雷球，全屏大范围清场',
    req:['fireball','thunder'],reqLv:4,
    baseDmg:80,atkRatio:1.5,cd:8.0,radius:10,
    bonusDesc:'火球和雷霆的合体终极技'},
  {id:'icefire',name:'冰火两重天',icon:'🌡️',desc:'全屏冰火交替轰击，先冻后炸',
    req:['blizzard','livingbomb'],reqLv:2,
    baseDmg:40,atkRatio:0.8,cd:6.0,
    bonusDesc:'暴风雪和活体炸弹的完美融合'},
  {id:'soulreap',name:'灵魂收割',icon:'👻',desc:'击杀产生追踪灵魂攻击其他敌人',
    req:['bloodthirst','naturewrath'],reqLv:2,
    soulDmg:25,soulAtkRatio:0.5,soulSpeed:12,soulCount:2,
    bonusDesc:'血之渴望和自然之怒的灵魂共鸣'},
];

const RARITY_NAME={common:'普通',rare:'精良',epic:'史诗',legendary:'传说',signature:'标志'};
const RARITY_COLOR={common:'#aaaaaa',rare:'#44ff44',epic:'#aa44ff',legendary:'#ff8800',signature:'#ff4466'};

// ==================== 签到奖励 ====================
const SIGNIN_REWARDS=[
  {day:1,icon:'💎',text:'50💎',type:'diamond',amount:50},
  {day:2,icon:'💰',text:'100💰',type:'gold',amount:100},
  {day:3,icon:'🏹',text:'猎人碎片×10',type:'fragment',hero:'hunter',amount:10},
  {day:4,icon:'💎',text:'200💎',type:'diamond',amount:200},
  {day:5,icon:'📦',text:'紫装箱',type:'chest',amount:1},
  {day:6,icon:'💎',text:'500💎',type:'diamond',amount:500},
  {day:7,icon:'🗡️',text:'盗贼碎片×10',type:'fragment',hero:'rogue',amount:10},
];

// ==================== 装备（扩展：增加暴击/护甲/特效） ====================
const EQUIPMENT_DB=[
  // 武器
  {id:'sword1',name:'铜剑',icon:'🗡️',rarity:'common',slot:'weapon',atk:3,hp:0,spd:0,critRate:0,armor:0,forgeTime:7200},
  {id:'sword2',name:'精铁长剑',icon:'⚔️',rarity:'rare',slot:'weapon',atk:7,hp:0,spd:0,critRate:0.02,armor:0,forgeTime:14400},
  {id:'sword3',name:'暗影之牙',icon:'🔪',rarity:'epic',slot:'weapon',atk:14,hp:0,spd:0.1,critRate:0.05,armor:0,forgeTime:28800,
    effect:'shadow',effectDesc:'攻击有15%概率造成暗影爆发(额外50%伤害)'},
  {id:'sword4',name:'灰烬使者',icon:'⚔️',rarity:'legendary',slot:'weapon',atk:22,hp:20,spd:0.15,critRate:0.08,armor:0,forgeTime:43200,
    effect:'ashbringer',effectDesc:'每第5次攻击释放圣光波(范围伤害)'},
  // 护甲
  {id:'armor1',name:'皮甲',icon:'🛡️',rarity:'common',slot:'armor',atk:0,hp:15,spd:0,critRate:0,armor:1,forgeTime:7200},
  {id:'armor2',name:'锁甲',icon:'🦺',rarity:'rare',slot:'armor',atk:0,hp:35,spd:0,critRate:0,armor:2,forgeTime:14400},
  {id:'armor3',name:'板甲',icon:'🛡️',rarity:'epic',slot:'armor',atk:0,hp:60,spd:0,critRate:0,armor:4,forgeTime:28800,
    effect:'fortify',effectDesc:'受到致命伤害时，30秒CD内免死一次并回复15%HP'},
  // 饰品
  {id:'trinket1',name:'生命宝石',icon:'💎',rarity:'rare',slot:'trinket',atk:0,hp:25,spd:0,critRate:0,armor:0,forgeTime:14400,
    effect:'regen',effectDesc:'每秒恢复0.3%最大生命值'},
  {id:'trinket2',name:'战神徽记',icon:'🏅',rarity:'epic',slot:'trinket',atk:5,hp:10,spd:0,critRate:0.06,armor:0,forgeTime:28800,
    effect:'warcry',effectDesc:'击杀敌人叠加战意(最多10层)，每层+3%攻击力'},
  // 戒指
  {id:'ring1',name:'铜戒指',icon:'💍',rarity:'common',slot:'ring',atk:2,hp:5,spd:0,critRate:0.01,armor:0,forgeTime:7200},
  {id:'ring2',name:'黄金指环',icon:'💍',rarity:'rare',slot:'ring',atk:5,hp:10,spd:0.05,critRate:0.03,armor:0,forgeTime:14400},
  {id:'ring3',name:'风暴之戒',icon:'💍',rarity:'epic',slot:'ring',atk:8,hp:15,spd:0.1,critRate:0.05,armor:0,forgeTime:28800,
    effect:'storm',effectDesc:'技能伤害+12%'},
];

// ==================== 竞技场 ====================
const ARENA_RANKS=['bronze','silver','gold','platinum','diamond','master','legend'];
const ARENA_RANK_NAMES={bronze:'青铜',silver:'白银',gold:'黄金',platinum:'铂金',diamond:'钻石',master:'大师',legend:'传说'};
const ARENA_RANK_ICONS={bronze:'🥉',silver:'🥈',gold:'🥇',platinum:'💎',diamond:'💠',master:'👑',legend:'⭐'};
const ARENA_RANK_REQ={bronze:0,silver:100,gold:300,platinum:600,diamond:1000,master:1500,legend:2000};

// ==================== BattlePass ====================
const BP_MAX=50,BP_XP=100;
const BP_REWARDS=Array.from({length:50},(_,i)=>{
  const lv=i+1;
  const fr=lv%5===0?{icon:'📦',text:'装备箱'}:lv%3===0?{icon:'🧩',text:`碎片×${lv}`}:{icon:'💰',text:`${lv*100}💰`};
  const pr=lv%10===0?{icon:'🎨',text:'限定皮肤'}:lv%5===0?{icon:'💎',text:`${lv*20}💎`}:{icon:'💎',text:`${lv*10}💎`};
  return{level:lv,free:fr,paid:pr};
});

// ==================== 成就 ====================
const ACHIEVEMENTS=[
  {id:'kill100',name:'初露锋芒',desc:'累计消灭100怪物',icon:'⚔️',req:100,stat:'totalKills',reward:'💎50'},
  {id:'kill1000',name:'百战余生',desc:'累计消灭1000怪物',icon:'⚔️',req:1000,stat:'totalKills',reward:'💎200'},
  {id:'kill5000',name:'屠魔者',desc:'累计消灭5000怪物',icon:'⚔️',req:5000,stat:'totalKills',reward:'💎500'},
  {id:'boss5',name:'BOSS猎手',desc:'累计击杀5个BOSS',icon:'💀',req:5,stat:'totalBossKills',reward:'💎100'},
  {id:'boss20',name:'BOSS终结者',desc:'累计击杀20个BOSS',icon:'💀',req:20,stat:'totalBossKills',reward:'💎300'},
  {id:'wave10',name:'持久战',desc:'最高存活10波',icon:'🌊',req:10,stat:'maxWave',reward:'💰1000'},
  {id:'wave20',name:'不屈意志',desc:'最高存活20波(无尽)',icon:'🌊',req:20,stat:'maxWave',reward:'💎300'},
  {id:'streak50',name:'连杀达人',desc:'50连杀',icon:'🔥',req:50,stat:'maxKillStreak',reward:'💎100'},
  {id:'streak200',name:'杀戮机器',desc:'200连杀',icon:'🔥',req:200,stat:'maxKillStreak',reward:'💎300'},
  {id:'hero3',name:'收藏家',desc:'解锁3英雄',icon:'🦸',req:3,stat:'heroCount',reward:'💎200'},
  {id:'hero5',name:'英雄殿堂',desc:'解锁5英雄',icon:'🦸',req:5,stat:'heroCount',reward:'💎500'},
  {id:'chapter3',name:'冒险者',desc:'通关3副本',icon:'📖',req:3,stat:'chaptersCleared',reward:'💰2000'},
  {id:'chapter7',name:'艾泽拉斯之王',desc:'通关全部副本',icon:'📖',req:7,stat:'chaptersCleared',reward:'💎1000'},
  {id:'elite50',name:'精英猎手',desc:'消灭50个精英怪',icon:'💪',req:50,stat:'totalEliteKills',reward:'💎200'},
  {id:'maxlv30',name:'极限突破',desc:'单局达到30级',icon:'⬆️',req:30,stat:'maxLevelReached',reward:'💎300'},
];

// ==================== 每日任务 ====================
const QUEST_TEMPLATES=[
  {id:'q_play1',name:'完成1局副本',icon:'⚔️',req:1,type:'games',reward:'💰200'},
  {id:'q_play3',name:'完成3局副本',icon:'⚔️',req:3,type:'games',reward:'💰500'},
  {id:'q_kill50',name:'消灭50怪物',icon:'💀',req:50,type:'kills',reward:'💰300'},
  {id:'q_kill200',name:'消灭200怪物',icon:'💀',req:200,type:'kills',reward:'💎50'},
  {id:'q_boss1',name:'击败BOSS',icon:'👹',req:1,type:'bossKills',reward:'💰400'},
  {id:'q_arena1',name:'竞技场1次',icon:'🏟️',req:1,type:'arenaFights',reward:'💰300'},
  {id:'q_elite3',name:'消灭3个精英怪',icon:'💪',req:3,type:'eliteKills',reward:'💰500'},
  {id:'q_combo1',name:'触发1次技能合成',icon:'🔮',req:1,type:'comboTriggers',reward:'💎30'},
];

// ==================== 商城 ====================
const SHOP_DATA={
  featured:[
    {name:'⭐首充大礼包',desc:'680💎+萨满+VIP1+紫装',icon:'⭐',orig:'¥68',price:'¥6',tag:'HOT'},
    {name:'新手加速包',desc:'300💎+1000💰+30⚡',icon:'🎁',orig:'¥30',price:'¥12',tag:''},
  ],
  monthly:[
    {name:'小月卡',desc:'即送300💎 每日100💎',icon:'🌙',orig:'',price:'¥30',tag:''},
    {name:'大月卡',desc:'即送680💎 每日200💎+50⚡',icon:'🌕',orig:'',price:'¥68',tag:'HOT'},
  ],
  diamond:[
    {name:'60💎',desc:'',icon:'💎',orig:'',price:'¥6',tag:''},
    {name:'300💎',desc:'赠30💎',icon:'💎',orig:'',price:'¥30',tag:''},
    {name:'680💎',desc:'赠80💎',icon:'💎',orig:'',price:'¥68',tag:'HOT'},
  ],
  stamina:[
    {name:'⚡体力×20',desc:'用金币补充少量体力',icon:'⚡',orig:'',price:'500💰',tag:'',action:'buyStamina',amount:20,costType:'gold',cost:500},
    {name:'⚡体力×50',desc:'用金币补充体力',icon:'⚡',orig:'800💰',price:'600💰',tag:'推荐',action:'buyStamina',amount:50,costType:'gold',cost:600},
    {name:'⚡体力×100',desc:'用金币大量补充体力',icon:'⚡',orig:'1500💰',price:'1000💰',tag:'超值',action:'buyStamina',amount:100,costType:'gold',cost:1000},
    {name:'⚡体力×30',desc:'用钻石补充体力',icon:'💎',orig:'',price:'30💎',tag:'',action:'buyStamina',amount:30,costType:'diamond',cost:30},
    {name:'⚡体力×80',desc:'用钻石补充大量体力',icon:'💎',orig:'80💎',price:'60💎',tag:'HOT',action:'buyStamina',amount:80,costType:'diamond',cost:60},
    {name:'⚡体力全满',desc:'直接将体力恢复满',icon:'🔋',orig:'120💎',price:'80💎',tag:'满血复活',action:'buyStaminaFull',costType:'diamond',cost:80},
  ],
  gift:[
    {name:'英雄援助',desc:'强力装备+复活币×5',icon:'💪',orig:'¥30',price:'¥6',tag:'限时'},
    {name:'命运碎片',desc:'英雄碎片×3',icon:'🧩',orig:'¥30',price:'¥12',tag:'限时'},
  ]
};

// ==================== 抽奖 ====================
const DRAW_PRIZES=[
  {icon:'💰',text:'500金币',weight:30},
  {icon:'💰',text:'1000金币',weight:15},
  {icon:'💎',text:'50钻石',weight:20},
  {icon:'💎',text:'100钻石',weight:10},
  {icon:'🧩',text:'碎片×3',weight:15},
  {icon:'📦',text:'装备箱',weight:8},
  {icon:'⚡',text:'30体力',weight:15},
];

// ==================== 数值工具函数（暴露给战斗系统） ====================
// 计算升级所需经验
function calcXpNeed(level){
  return Math.floor(NUM.XP_BASE * Math.pow(level, NUM.XP_POWER) + level * NUM.XP_LINEAR);
}
// 计算技能实际伤害 = (baseDmg * (1 + (lv-1)*dmgGrowth)) + heroAtk * atkRatio
function calcSkillDmg(skillData, skillLv, heroAtk){
  const base = skillData.baseDmg * (1 + (skillLv - 1) * skillData.dmgGrowth);
  return base + heroAtk * skillData.atkRatio;
}
// 计算技能实际CD = max(cdMin, cd * (1 - (lv-1)*cdReduction/cd))
function calcSkillCd(skillData, skillLv){
  const reduced = skillData.cd - (skillLv - 1) * skillData.cdReduction;
  return Math.max(skillData.cdMin, reduced);
}
// 生成技能升级属性描述（用于技能选择面板）
// 返回 [{label, curVal, newVal, unit, isNew}] 数组
function getSkillUpgradeStats(sk, curLv, heroAtk){
  const newLv=curLv+1;
  const stats=[];
  const r=(v,d)=>d===0?Math.round(v):+v.toFixed(d); // 四舍五入工具

  // 1. 伤害类技能（baseDmg > 0）
  if(sk.baseDmg>0){
    const curDmg=calcSkillDmg(sk,Math.max(1,curLv),heroAtk||0);
    const newDmg=calcSkillDmg(sk,newLv,heroAtk||0);
    stats.push({label:'伤害',curVal:curLv>0?r(curDmg,0):null,newVal:r(newDmg,0),unit:'',isNew:curLv===0});
  }

  // 2. CD类（cd > 0）
  if(sk.cd>0){
    const curCd=calcSkillCd(sk,Math.max(1,curLv));
    const newCd=calcSkillCd(sk,newLv);
    stats.push({label:'冷却',curVal:curLv>0?r(curCd,2):null,newVal:r(newCd,2),unit:'秒',isNew:curLv===0,lower:true});
  }

  // 3. 投射物数量
  if(sk.projCountPerLv){
    const curN=Math.floor(sk.projCount+(Math.max(1,curLv)-1)*sk.projCountPerLv);
    const newN=Math.floor(sk.projCount+(newLv-1)*sk.projCountPerLv);
    stats.push({label:'数量',curVal:curLv>0?curN:null,newVal:newN,unit:'发',isNew:curLv===0});
  }

  // 4. 范围类
  if(sk.radiusPerLv){
    const curR=sk.radius+(Math.max(1,curLv)-1)*sk.radiusPerLv;
    const newR=sk.radius+(newLv-1)*sk.radiusPerLv;
    stats.push({label:'范围',curVal:curLv>0?r(curR,1):null,newVal:r(newR,1),unit:'',isNew:curLv===0});
  }

  // 5. 冰冻时间
  if(sk.freezePerLv){
    const curF=sk.freezeDur+(Math.max(1,curLv)-1)*sk.freezePerLv;
    const newF=sk.freezeDur+(newLv-1)*sk.freezePerLv;
    stats.push({label:'冰冻',curVal:curLv>0?r(curF,1):null,newVal:r(newF,1),unit:'秒',isNew:curLv===0});
  }

  // 6. 连锁概率
  if(sk.chainChancePerLv){
    const curC=sk.chainChance+(Math.max(1,curLv)-1)*sk.chainChancePerLv;
    const newC=sk.chainChance+(newLv-1)*sk.chainChancePerLv;
    stats.push({label:'连锁率',curVal:curLv>0?r(curC*100,0):null,newVal:r(newC*100,0),unit:'%',isNew:curLv===0});
  }

  // 7. 治疗百分比
  if(sk.healPctPerLv){
    const curH=sk.healPct+(Math.max(1,curLv)-1)*sk.healPctPerLv;
    const newH=sk.healPct+(newLv-1)*sk.healPctPerLv;
    stats.push({label:'回复',curVal:curLv>0?r(curH*100,1):null,newVal:r(newH*100,1),unit:'%HP',isNew:curLv===0});
  }

  // 8. 反弹伤害
  if(sk.reflectPctPerLv){
    const curR2=sk.reflectPct+(Math.max(1,curLv)-1)*sk.reflectPctPerLv;
    const newR2=sk.reflectPct+(newLv-1)*sk.reflectPctPerLv;
    stats.push({label:'反弹',curVal:curLv>0?r(curR2*100,0):null,newVal:r(newR2*100,0),unit:'%',isNew:curLv===0});
  }

  // 9. 爆炸范围
  if(sk.explodeRadiusPerLv){
    const curE=sk.explodeRadius+(Math.max(1,curLv)-1)*sk.explodeRadiusPerLv;
    const newE=sk.explodeRadius+(newLv-1)*sk.explodeRadiusPerLv;
    stats.push({label:'爆炸范围',curVal:curLv>0?r(curE,1):null,newVal:r(newE,1),unit:'',isNew:curLv===0});
  }

  // 10. 爆炸伤害比例
  if(sk.explodeDmgPctPerLv){
    const curED=sk.explodeDmgPct+(Math.max(1,curLv)-1)*sk.explodeDmgPctPerLv;
    const newED=sk.explodeDmgPct+(newLv-1)*sk.explodeDmgPctPerLv;
    stats.push({label:'溅射伤害',curVal:curLv>0?r(curED*100,0):null,newVal:r(newED*100,0),unit:'%',isNew:curLv===0});
  }

  // 11. 暴风雪持续时间
  if(sk.durationPerLv){
    const curD=sk.duration+(Math.max(1,curLv)-1)*sk.durationPerLv;
    const newD=sk.duration+(newLv-1)*sk.durationPerLv;
    stats.push({label:'持续',curVal:curLv>0?r(curD,1):null,newVal:r(newD,1),unit:'秒',isNew:curLv===0});
  }

  // 12. 弹射次数
  if(sk.bounceCountPerLv){
    const curB=sk.bounceCount+(Math.max(1,curLv)-1)*sk.bounceCountPerLv;
    const newB=sk.bounceCount+(newLv-1)*sk.bounceCountPerLv;
    stats.push({label:'弹射',curVal:curLv>0?curB:null,newVal:newB,unit:'次',isNew:curLv===0});
  }

  // 13. 击杀回血
  if(sk.healOnKillPctPerLv){
    const curK=sk.healOnKillPct+(Math.max(1,curLv)-1)*sk.healOnKillPctPerLv;
    const newK=sk.healOnKillPct+(newLv-1)*sk.healOnKillPctPerLv;
    stats.push({label:'击杀回血',curVal:curLv>0?r(curK*100,1):null,newVal:r(newK*100,1),unit:'%HP',isNew:curLv===0});
  }

  // 14. 跳跃次数（连锁闪电）
  if(sk.jumpCountPerLv){
    const curJ=sk.jumpCount+(Math.max(1,curLv)-1)*sk.jumpCountPerLv;
    const newJ=sk.jumpCount+(newLv-1)*sk.jumpCountPerLv;
    stats.push({label:'跳跃',curVal:curLv>0?curJ:null,newVal:newJ,unit:'次',isNew:curLv===0});
  }

  // 15. 分叉数量
  if(sk.forkCountPerLv){
    const curFK=sk.forkCount+(Math.max(1,curLv)-1)*sk.forkCountPerLv;
    const newFK=sk.forkCount+(newLv-1)*sk.forkCountPerLv;
    stats.push({label:'分叉',curVal:curLv>0?curFK:null,newVal:newFK,unit:'条',isNew:curLv===0});
  }

  // 16. 旋转范围（灰烬使者）
  if(sk.spinRadiusPerLv){
    const curSR=sk.spinRadius+(Math.max(1,curLv)-1)*sk.spinRadiusPerLv;
    const newSR=sk.spinRadius+(newLv-1)*sk.spinRadiusPerLv;
    stats.push({label:'旋转范围',curVal:curLv>0?r(curSR,1):null,newVal:r(newSR,1),unit:'',isNew:curLv===0});
  }

  // 17. 旋转持续（灰烬使者）
  if(sk.spinDurPerLv){
    const curSD=sk.spinDuration+(Math.max(1,curLv)-1)*sk.spinDurPerLv;
    const newSD=sk.spinDuration+(newLv-1)*sk.spinDurPerLv;
    stats.push({label:'旋转时长',curVal:curLv>0?r(curSD,1):null,newVal:r(newSD,1),unit:'秒',isNew:curLv===0});
  }

  // 18. 冰封持续（霜之哀伤）
  if(sk.freezeDurPerLv){
    const curFD=sk.freezeDur+(Math.max(1,curLv)-1)*sk.freezeDurPerLv;
    const newFD=sk.freezeDur+(newLv-1)*sk.freezeDurPerLv;
    stats.push({label:'冰封',curVal:curLv>0?r(curFD,1):null,newVal:r(newFD,1),unit:'秒',isNew:curLv===0});
  }

  // 19. 射线持续（萨格拉斯之眼）
  if(sk.beamDurPerLv){
    const curBD=sk.beamDuration+(Math.max(1,curLv)-1)*sk.beamDurPerLv;
    const newBD=sk.beamDuration+(newLv-1)*sk.beamDurPerLv;
    stats.push({label:'射线持续',curVal:curLv>0?r(curBD,1):null,newVal:r(newBD,1),unit:'秒',isNew:curLv===0});
  }

  // 20. 射线范围（萨格拉斯之眼）
  if(sk.hitRadiusPerLv){
    const curHR=sk.hitRadius+(Math.max(1,curLv)-1)*sk.hitRadiusPerLv;
    const newHR=sk.hitRadius+(newLv-1)*sk.hitRadiusPerLv;
    stats.push({label:'射线范围',curVal:curLv>0?r(curHR,1):null,newVal:r(newHR,1),unit:'',isNew:curLv===0});
  }

  // 21. 坠落范围（达拉然）
  if(sk.impactRadiusPerLv){
    const curIR=sk.impactRadius+(Math.max(1,curLv)-1)*sk.impactRadiusPerLv;
    const newIR=sk.impactRadius+(newLv-1)*sk.impactRadiusPerLv;
    stats.push({label:'冲击范围',curVal:curLv>0?r(curIR,1):null,newVal:r(newIR,1),unit:'',isNew:curLv===0});
  }

  // 22. 复活血量（时光倒流）
  if(sk.reviveHpPctPerLv){
    const curRH=sk.reviveHpPct+(Math.max(1,curLv)-1)*sk.reviveHpPctPerLv;
    const newRH=sk.reviveHpPct+(newLv-1)*sk.reviveHpPctPerLv;
    stats.push({label:'复活血量',curVal:curLv>0?r(curRH*100,0):null,newVal:r(newRH*100,0),unit:'%',isNew:curLv===0});
  }

  // 23. 无敌时间（时光倒流）
  if(sk.invincibleDurPerLv){
    const curIV=sk.invincibleDur+(Math.max(1,curLv)-1)*sk.invincibleDurPerLv;
    const newIV=sk.invincibleDur+(newLv-1)*sk.invincibleDurPerLv;
    stats.push({label:'无敌时间',curVal:curLv>0?r(curIV,1):null,newVal:r(newIV,1),unit:'秒',isNew:curLv===0});
  }

  return stats;
}

// 将属性变化数组渲染为HTML字符串
// 颜色规则: 绿色=变好, 红色=变糟, 白色=不变
function renderSkillStats(stats){
  if(!stats||!stats.length)return '';
  let html='<div class="skill-stats">';
  stats.forEach(s=>{
    html+=`<div class="skill-stat-row">`;
    html+=`<span class="stat-label">${s.label}</span>`;
    if(s.isNew){
      // ★ 新获得技能：显示初始值（青色高亮）
      html+=`<span class="stat-vals"><span class="stat-new-val">${s.newVal}<span class="stat-unit">${s.unit}</span></span></span>`;
    }else{
      // ★ 升级技能：旧值 → 新值 (+差值)
      const diff=+(s.newVal-s.curVal).toFixed(2);
      const changed=diff!==0;
      // lower=true 表示越低越好（如CD），所以降低是好的
      const isBetter=s.lower?diff<0:diff>0;
      const isWorse=s.lower?diff>0:diff<0;
      const cls=changed?(isBetter?'stat-better':isWorse?'stat-worse':'stat-same'):'stat-same';
      // 差值符号和显示
      const absDiff=Math.abs(diff);
      const diffStr=changed?(isBetter?(s.lower?'−':'+')+absDiff:(s.lower?'+':'−')+absDiff):'';
      html+=`<span class="stat-vals">`;
      html+=`<span class="stat-old">${s.curVal}<span class="stat-unit">${s.unit}</span></span>`;
      html+=`<span class="stat-arrow">→</span>`;
      html+=`<span class="${cls}">${s.newVal}<span class="stat-unit">${s.unit}</span></span>`;
      if(diffStr) html+=`<span class="stat-diff ${cls}">(${diffStr})</span>`;
      html+=`</span>`;
    }
    html+=`</div>`;
  });
  html+='</div>';
  return html;
}

// 计算怪物波次缩放后属性
function calcEnemyStats(baseEnemy, wave, chapter){
  const wm = 1 + (wave - 1) * NUM.WAVE_HP_SCALE;
  const am = 1 + (wave - 1) * NUM.WAVE_ATK_SCALE;
  const sm = 1 + (wave - 1) * NUM.WAVE_SPD_SCALE;
  const xm = 1 + (wave - 1) * NUM.WAVE_XP_SCALE;
  // 无尽模式额外指数缩放
  let endlessMult = 1;
  if(chapter && chapter.endlessScale && wave > 5){
    endlessMult = Math.pow(1.12, wave - 5); // 每波额外+12%
  }
  return {
    hp: Math.round(baseEnemy.hp * wm * endlessMult),
    atk: +(baseEnemy.atk * am * endlessMult).toFixed(1),
    spd: +(baseEnemy.spd * sm).toFixed(2),
    xp: Math.round(baseEnemy.xp * xm * endlessMult)
  };
}
// 计算BOSS波次缩放(无尽模式专用)
function calcBossStats(baseBoss, bossCount){
  const mult = Math.pow(1.5, bossCount); // 每次BOSS出现属性×1.5
  return {
    hp: Math.round(baseBoss.hp * mult),
    atk: +(baseBoss.atk * mult).toFixed(1)
  };
}
// 判断是否暴击
function rollCrit(critRate){
  return Math.random() < critRate;
}
// 计算最终伤害(含暴击+护甲减免)
function calcFinalDmg(rawDmg, isCrit, critDmg, targetArmor){
  let dmg = isCrit ? rawDmg * critDmg : rawDmg;
  // 护甲减伤公式: reduction = armor / (armor + 20)，最高75%
  if(targetArmor > 0){
    const reduction = Math.min(0.75, targetArmor / (targetArmor + 20));
    dmg *= (1 - reduction);
  }
  return Math.max(1, Math.round(dmg));
}
// 精英怪概率判定
function isEliteSpawn(wave){
  return Math.random() < Math.min(0.4, NUM.ELITE_CHANCE_BASE + (wave - 1) * NUM.ELITE_CHANCE_PER_WAVE);
}

// ==================== 英雄永久等级系统 ====================
// 英雄等级经验公式: xpNeed = 50 + level^1.8 * 15
// 每级: ATK+1.5, HP+5, 每5级额外ATK+3,HP+15
const HERO_LEVEL = {
  XP_BASE: 50,
  XP_POWER: 1.8,
  XP_SCALE: 15,
  MAX_LEVEL: 50,
  ATK_PER_LV: 1.5,
  HP_PER_LV: 5,
  ATK_BONUS_5LV: 3,   // 每5级额外攻击
  HP_BONUS_5LV: 15,    // 每5级额外生命
};
function calcHeroXpNeed(lv){
  return Math.floor(HERO_LEVEL.XP_BASE + Math.pow(lv, HERO_LEVEL.XP_POWER) * HERO_LEVEL.XP_SCALE);
}
function calcHeroLevelBonus(lv){
  const atkBase = (lv-1) * HERO_LEVEL.ATK_PER_LV;
  const hpBase = (lv-1) * HERO_LEVEL.HP_PER_LV;
  const milestone5 = Math.floor((lv-1)/5);
  return {
    atk: Math.round(atkBase + milestone5 * HERO_LEVEL.ATK_BONUS_5LV),
    hp: Math.round(hpBase + milestone5 * HERO_LEVEL.HP_BONUS_5LV)
  };
}

// ==================== 天赋树系统 ====================
// 3条路线 × 5层，每层3个天赋选1个
// 解锁条件: 英雄等级≥层级*3, 消耗金币
const TALENT_TREES = {
  war: { // 战斗路线 — 提升伤害输出
    name:'⚔️ 战争之路',desc:'提升攻击与伤害',color:'#ff4444',
    tiers:[
      {lv:1,cost:500,choices:[
        {id:'w1a',name:'锋锐',desc:'攻击力+8',stat:'atk',val:8},
        {id:'w1b',name:'暴怒',desc:'暴击率+3%',stat:'critRate',val:0.03},
        {id:'w1c',name:'嗜血',desc:'击杀回血1%',stat:'killHeal',val:0.01}
      ]},
      {lv:5,cost:1200,choices:[
        {id:'w2a',name:'战神',desc:'攻击力+15',stat:'atk',val:15},
        {id:'w2b',name:'致命打击',desc:'暴击伤害+30%',stat:'critDmg',val:0.3},
        {id:'w2c',name:'连击',desc:'攻速+10%',stat:'atkSpeed',val:0.10}
      ]},
      {lv:10,cost:2500,choices:[
        {id:'w3a',name:'狂暴',desc:'低血量(<30%)时攻击+25%',stat:'berserker',val:0.25},
        {id:'w3b',name:'穿刺',desc:'无视15%护甲',stat:'armorPen',val:0.15},
        {id:'w3c',name:'噬魂',desc:'击杀精英回血10%',stat:'eliteHeal',val:0.10}
      ]},
      {lv:18,cost:5000,choices:[
        {id:'w4a',name:'毁灭',desc:'攻击力+25, 暴击率+5%',stat:'atk+crit',val:{atk:25,critRate:0.05}},
        {id:'w4b',name:'屠夫',desc:'技能伤害+12%',stat:'skillDmg',val:0.12},
        {id:'w4c',name:'处决',desc:'对<30%HP敌人伤害+30%',stat:'execute',val:0.30}
      ]},
      {lv:28,cost:10000,choices:[
        {id:'w5a',name:'泰坦之力',desc:'全属性+10%',stat:'allPct',val:0.10},
        {id:'w5b',name:'灭世',desc:'每次技能暴击释放冲击波',stat:'critWave',val:1},
        {id:'w5c',name:'不灭意志',desc:'致死伤害时10%概率免死',stat:'deathSave',val:0.10}
      ]}
    ]
  },
  def: { // 防御路线 — 提升生存能力
    name:'🛡️ 守护之路',desc:'提升生命与防御',color:'#44aaff',
    tiers:[
      {lv:1,cost:500,choices:[
        {id:'d1a',name:'坚韧',desc:'生命值+30',stat:'hp',val:30},
        {id:'d1b',name:'铁壁',desc:'护甲+2',stat:'armor',val:2},
        {id:'d1c',name:'再生',desc:'每秒回血0.2%',stat:'regen',val:0.002}
      ]},
      {lv:5,cost:1200,choices:[
        {id:'d2a',name:'生命之泉',desc:'生命值+60',stat:'hp',val:60},
        {id:'d2b',name:'格挡',desc:'15%概率减伤50%',stat:'block',val:{chance:0.15,reduce:0.50}},
        {id:'d2c',name:'回春',desc:'每秒回血0.5%',stat:'regen',val:0.005}
      ]},
      {lv:10,cost:2500,choices:[
        {id:'d3a',name:'钢铁之躯',desc:'护甲+5, 生命+40',stat:'armor+hp',val:{armor:5,hp:40}},
        {id:'d3b',name:'生命汲取',desc:'造成伤害的3%转为治疗',stat:'leech',val:0.03},
        {id:'d3c',name:'坚盾',desc:'受伤>10%HP时触发护盾(CD30s)',stat:'shield',val:0.15}
      ]},
      {lv:18,cost:5000,choices:[
        {id:'d4a',name:'不朽',desc:'生命值+100, 护甲+3',stat:'hp+armor',val:{hp:100,armor:3}},
        {id:'d4b',name:'荆棘甲',desc:'反弹25%近战伤害',stat:'thorns',val:0.25},
        {id:'d4c',name:'守望者',desc:'减速抗性+50%, 移速+0.5',stat:'slowRes+spd',val:{slowRes:0.50,spd:0.5}}
      ]},
      {lv:28,cost:10000,choices:[
        {id:'d5a',name:'永恒壁垒',desc:'全属性+10%',stat:'allPct',val:0.10},
        {id:'d5b',name:'圣盾术',desc:'战斗开始获得20%HP护盾',stat:'startShield',val:0.20},
        {id:'d5c',name:'涅槃',desc:'死亡时50%概率复活(30%HP)',stat:'revive',val:{chance:0.50,hp:0.30}}
      ]}
    ]
  },
  util: { // 辅助路线 — 提升资源获取
    name:'🌟 命运之路',desc:'提升经验与掉落',color:'#ffd700',
    tiers:[
      {lv:1,cost:500,choices:[
        {id:'u1a',name:'博学',desc:'经验获取+15%',stat:'xpBonus',val:0.15},
        {id:'u1b',name:'贪婪',desc:'金币掉落+20%',stat:'goldBonus',val:0.20},
        {id:'u1c',name:'移速',desc:'移动速度+0.3',stat:'spd',val:0.3}
      ]},
      {lv:5,cost:1200,choices:[
        {id:'u2a',name:'学者',desc:'经验获取+25%',stat:'xpBonus',val:0.25},
        {id:'u2b',name:'宝藏猎人',desc:'精英掉宝概率+30%',stat:'eliteLoot',val:0.30},
        {id:'u2c',name:'迅捷',desc:'移动速度+0.5',stat:'spd',val:0.5}
      ]},
      {lv:10,cost:2500,choices:[
        {id:'u3a',name:'天才',desc:'技能选项+1个',stat:'extraSkillChoice',val:1},
        {id:'u3b',name:'拾荒者',desc:'拾取范围+40%',stat:'pickupRange',val:0.40},
        {id:'u3c',name:'幸运星',desc:'传说技能出现率+20%',stat:'legendRate',val:0.20}
      ]},
      {lv:18,cost:5000,choices:[
        {id:'u4a',name:'天命',desc:'开局获得1个免费技能',stat:'freeSkill',val:1},
        {id:'u4b',name:'点石成金',desc:'击杀必掉金币',stat:'goldOnKill',val:1},
        {id:'u4c',name:'风行者',desc:'移速+0.8, 闪避+8%',stat:'spd+dodge',val:{spd:0.8,dodge:0.08}}
      ]},
      {lv:28,cost:10000,choices:[
        {id:'u5a',name:'先知',desc:'全属性+10%',stat:'allPct',val:0.10},
        {id:'u5b',name:'欧皇',desc:'每次选技能有5%概率免费多选1个',stat:'doubleSkill',val:0.05},
        {id:'u5c',name:'光环',desc:'吸引范围内XP自动飞来+经验+30%',stat:'xpMagnet+bonus',val:{magnet:1,bonus:0.30}}
      ]}
    ]
  }
};

// ==================== 装备强化系统 ====================
// 强化等级1-10，每级消耗递增，属性按比例增长
const ENHANCE_DATA = {
  MAX_LEVEL: 10,
  // 强化费用: baseCost * level^1.5
  costs: function(rarity, level){
    const baseCost = {common:100,rare:200,epic:400,legendary:800}[rarity]||200;
    const gold = Math.round(baseCost * Math.pow(level, 1.5));
    const frags = Math.max(1, Math.floor(level / 2)); // 每2级需要1碎片
    return {gold, frags};
  },
  // 强化属性增长: 每级+原属性*10%
  STAT_PER_LEVEL: 0.10,
  // 装备品质额外乘数
  RARITY_MULT: {common:1.0, rare:1.2, epic:1.5, legendary:2.0}
};

// ==================== 英雄升星系统 ====================
// 0星(初始) → 1星 → 2星 → 3星 → 4星 → 5星
// 每星需要碎片，提供属性百分比加成
const HERO_STAR = {
  MAX_STAR: 5,
  // 升星碎片需求
  FRAG_COST: [0, 10, 20, 40, 80, 150], // 0→1需10, 1→2需20...
  // 升星属性加成(乘法)
  STAT_MULT: [1.00, 1.08, 1.18, 1.30, 1.45, 1.65], // 0星=1x, 5星=1.65x
  // 升星解锁的额外技能槽
  EXTRA_SKILL_SLOT: [0, 0, 0, 1, 1, 2], // 3星+1, 5星+2
  // 升星星星颜色
  STAR_COLORS: ['⭐','⭐','⭐','🌟','🌟','💫'],
};

// ==================== 卡关引导配置 ====================
const STUCK_GUIDE = {
  // 连续失败N次触发引导
  FAIL_THRESHOLD: 2,
  // 引导优先级（检查顺序）
  checks: [
    {id:'heroLevel', label:'英雄等级不足', desc:'提升英雄等级获得永久属性加成',action:'heroes',icon:'⬆️'},
    {id:'talent', label:'天赋未解锁', desc:'解锁天赋获得强大的永久被动效果',action:'talent',icon:'🌟'},
    {id:'equip', label:'装备可强化', desc:'强化装备提升战斗属性',action:'forge',icon:'🔨'},
    {id:'star', label:'英雄可升星', desc:'升星大幅提升英雄全属性',action:'heroes',icon:'⭐'},
    {id:'tryOther', label:'尝试其他英雄', desc:'不同英雄有不同优势，试试其他职业',action:'heroes',icon:'🦸'},
  ]
};

// ==================== 暴露到全局 ====================
window.DATA={ALL_HEROES,CHAPTERS,SKILL_DB,SKILL_COMBOS,RARITY_NAME,RARITY_COLOR,SIGNIN_REWARDS,EQUIPMENT_DB,
  ARENA_RANKS,ARENA_RANK_NAMES,ARENA_RANK_ICONS,ARENA_RANK_REQ,BP_MAX,BP_XP,BP_REWARDS,
  ACHIEVEMENTS,QUEST_TEMPLATES,SHOP_DATA,DRAW_PRIZES,NUM,
  HERO_LEVEL,TALENT_TREES,ENHANCE_DATA,HERO_STAR,STUCK_GUIDE,
  calcXpNeed,calcSkillDmg,calcSkillCd,calcEnemyStats,calcBossStats,rollCrit,calcFinalDmg,isEliteSpawn,
  calcHeroXpNeed,calcHeroLevelBonus};
