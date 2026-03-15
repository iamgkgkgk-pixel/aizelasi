// =====================================================================
//  《艾泽拉斯幸存者》数据配置模块 — 金牌数值策划版 v2.0
// =====================================================================
//
//  【核心数值哲学】
//  1. 所有伤害 = 基础值 + 攻击力×缩放系数，确保英雄选择有意义
//  2. 升级曲线采用 S型曲线：前期快速（爽感）→ 中期稳定 → 后期放缓（挑战）
//  3. 怪物HP以章节为单位指数增长（1.8倍/章），波次内线性缩放，不可一刀秒杀
//  4. 技能CD分三档：高频低伤（割草快感）、中频中伤（节奏骨架）、低频高伤（高光时刻）
//  5. 英雄DPS预算一致，但伤害分布模式不同（AOE vs 单体 vs DOT vs 爆发）
//

// ==================== 数值公式常量 ====================
const NUM = {
  // 升级经验公式: xpNeed = BASE * (level^POWER) + level*LINEAR
  XP_BASE: 8,                // ↓ 12→8 降低基础经验需求，前期升级快
  XP_POWER: 1.55,            // ↓ 1.85→1.55 升级曲线更平缓，持续有升级感
  XP_LINEAR: 4,              // ↓ 6→4 线性部分减小
  // 每级属性成长 — 幅度大一些，升级有实质性感知
  ATK_PER_LEVEL: 3.0,        // ↑ 1.8→3.0 每级攻击成长翻倍，升级即变强
  HP_PER_LEVEL: 10,           // ↑ 5→10 每级生命成长翻倍
  HEAL_ON_LEVELUP: 0.20,     // ↑ 0.12→0.20 升级回血增加，爽快感
  // 掉落XP球价值 = BASE + level*SCALE
  XP_ORB_BASE: 1,            // ↓ 2→1 球基础价值降低
  XP_ORB_SCALE: 0.3,         // ↓ 0.5→0.3 球随等级缩放降低
  // 怪物波次缩放: 实际属性 = 基础 * (1 + (wave-1)*WAVE_SCALE)
  // 设计：8波ch1→最终波怪物HP=base*(1+7*0.25)=2.75倍，配合精英+BOSS制造压力
  WAVE_HP_SCALE: 0.25,       // ↑ 0.15→0.25 怪物HP每波增长25%
  WAVE_ATK_SCALE: 0.18,      // ↑ 0.10→0.18 怪物攻击每波增长18%
  WAVE_SPD_SCALE: 0.03,      // ↑ 0.02→0.03 怪物速度也缓慢提升
  // 怪物经验掉落缩放 — 同步增加，确保玩家升级能跟上难度
  WAVE_XP_SCALE: 0.10,       // ↑ 0.03→0.10 怪物经验随波次大幅增长
  // 精英怪倍率
  ELITE_HP_MULT: 5.0,        // ↑ 4.0→5.0 精英更肉
  ELITE_ATK_MULT: 2.5,       // ↑ 2.0→2.5 精英更痛
  ELITE_XP_MULT: 5,          // ↑ 3→5 精英给更多经验，奖励冒险
  ELITE_SIZE_MULT: 1.3,
  ELITE_CHANCE_BASE: 0.03,   // ↑ 0→0.03 第1波就有小概率出精英
  ELITE_CHANCE_PER_WAVE: 0.04, // ↑ 0.025→0.04 精英出现更频繁
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
// 设计原则：普攻是稳定输出基底，不是机关枪！间隔1.0~1.6s，靠技能填充CD空窗
// DPS预算 ≈ atk * atkRatio / atkRate，各职业保持接近
const ALL_HEROES={
  warrior:{id:'warrior',name:'战士',icon:'⚔️',origin:'武器战',role:'近战AOE',color:0xcc3333,
    atk:22,hp:200,spd:4.5,critRate:0.08,critDmg:2.0,armor:3,
    atkRate:1.1,atkRange:3.5,atkType:'melee_aoe',atkRatio:1.0,
    passive:'berserker',passiveDesc:'血量低于30%时攻击力+40%，攻速+25%',
    signatureSkill:'sig_whirlwind',skill:'旋风斩',
    favorSkills:['frostnova','ashbringer','bloodthirst','heroic_leap','execute_strike','shield_wall'], // 近战AOE偏好+职业技能
    unlock:'初始解锁',unlockType:'free'},

  mage:{id:'mage',name:'法师',icon:'🔥',origin:'火法',role:'远程范围',color:0xff6600,
    atk:30,hp:120,spd:4.0,critRate:0.12,critDmg:2.2,armor:0,
    atkRate:1.0,atkRange:15,atkType:'ranged_multi',atkRatio:1.1,
    passive:'ignite',passiveDesc:'火焰攻击使敌人燃烧，3秒内额外造成30%伤害',
    signatureSkill:'sig_firestorm',skill:'烈焰风暴',
    favorSkills:['fireball','livingbomb','eyeofsargeras','pyroblast','arcane_blast','ice_barrier'], // 火焰法术偏好+职业技能
    unlock:'初始解锁',unlockType:'free'},

  hunter:{id:'hunter',name:'猎人',icon:'🏹',origin:'兽王猎',role:'召唤+远程',color:0x33aa33,
    atk:20,hp:160,spd:5.0,critRate:0.10,critDmg:2.0,armor:1,
    atkRate:0.9,atkRange:18,atkType:'ranged_barrage',atkRatio:0.65,
    passive:'beastmaster',passiveDesc:'每30秒召唤一只野兽助战(持续15秒)，攻击力=英雄60%',
    signatureSkill:'sig_multishot',skill:'多重射击',
    favorSkills:['naturewrath','thunder','chainlight','explosive_trap','aimed_shot','bestial_wrath'], // 远程多目标偏好+职业技能
    unlock:'第2天登录',unlockType:'day',unlockReq:2},

  priest:{id:'priest',name:'牧师',icon:'✝️',origin:'暗牧',role:'持续伤害',color:0x9966cc,
    atk:26,hp:130,spd:4.2,critRate:0.06,critDmg:2.0,armor:0,
    atkRate:1.2,atkRange:12,atkType:'ranged_dot',atkRatio:0.9,
    passive:'vampiric',passiveDesc:'DOT伤害的15%转化为生命恢复',
    signatureSkill:'sig_shadowword',skill:'暗言术',
    favorSkills:['heal','bloodthirst','timewarp','mind_blast','shadow_form','prayer_of_mending'], // 生存+DOT偏好+职业技能
    unlock:'通关第3章',unlockType:'chapter',unlockReq:'ch3'},

  rogue:{id:'rogue',name:'盗贼',icon:'🗡️',origin:'狂徒贼',role:'高爆发',color:0x444444,
    atk:35,hp:110,spd:5.5,critRate:0.25,critDmg:2.8,armor:1,
    atkRate:0.7,atkRange:4,atkType:'melee_burst',atkRatio:1.6,
    passive:'shadowstrike',passiveDesc:'暴击后下一次攻击必定暴击，且暴击伤害+50%',
    signatureSkill:'sig_shadowdance',skill:'影舞',
    favorSkills:['thunder','chainstorm','ashbringer','eviscerate','cloak_of_shadows','blade_dance'], // 爆发+暴击偏好+职业技能
    unlock:'7日签到',unlockType:'signin',unlockReq:7},

  shaman:{id:'shaman',name:'萨满',icon:'🌊',origin:'增强萨',role:'图腾流',color:0x2266bb,
    atk:24,hp:170,spd:4.3,critRate:0.08,critDmg:2.0,armor:2,
    atkRate:1.3,atkRange:5,atkType:'totem_hybrid',atkRatio:0.8,
    passive:'totemic',passiveDesc:'每20秒自动放置一个图腾(火/水/风轮替)，持续12秒',
    signatureSkill:'sig_totemstorm',skill:'图腾风暴',
    favorSkills:['chainlight','heal','frostnova','lava_burst','healing_rain','earthquake'], // 元素混合偏好+职业技能
    unlock:'首充奖励',unlockType:'firstcharge'},

  deathknight:{id:'deathknight',name:'死骑',icon:'💀',origin:'冰DK',role:'减速控制',color:0x4488cc,
    atk:26,hp:220,spd:3.8,critRate:0.07,critDmg:2.0,armor:4,
    atkRate:1.2,atkRange:3.5,atkType:'melee_frost',atkRatio:0.95,
    passive:'frostpresence',passiveDesc:'近身怪物持续受到冰霜光环伤害(每秒ATK×20%)并减速30%',
    signatureSkill:'sig_wintercoming',skill:'凛冬将至',
    favorSkills:['frostnova','blizzard','frostmourne','death_strike','army_of_dead','anti_magic_shell'], // 冰霜偏好+职业技能
    unlock:'赛季奖励',unlockType:'season'},

  druid:{id:'druid',name:'德鲁伊',icon:'🌿',origin:'鸟德',role:'变形切换',color:0x44aa44,
    atk:23,hp:180,spd:4.5,critRate:0.08,critDmg:2.0,armor:2,
    atkRate:1.1,atkRange:12,atkType:'shapeshifter',atkRatio:0.85,
    passive:'shapeshift',passiveDesc:'血量>50%为远程月火形态(高伤害)，<50%自动切熊形态(+80%护甲,近战AOE,每秒回血1%)',
    signatureSkill:'sig_starfall',skill:'星辰坠落',
    favorSkills:['thorns','naturewrath','heal','moonfire','wild_growth','ferocious_bite'], // 自然生存偏好+职业技能
    unlock:'累计在线2h',unlockType:'online',unlockReq:120},

  warlock:{id:'warlock',name:'术士',icon:'👿',origin:'痛苦术',role:'诅咒召唤',color:0x7733aa,
    atk:28,hp:115,spd:4.0,critRate:0.10,critDmg:2.2,armor:0,
    atkRate:1.4,atkRange:14,atkType:'curse_summon',atkRatio:1.0,
    passive:'souldrain',passiveDesc:'被诅咒的敌人死亡时爆炸，对周围造成其最大HP×15%的伤害',
    signatureSkill:'sig_doomguard',skill:'末日守卫',
    favorSkills:['livingbomb','eyeofsargeras','dalaran','corruption','rain_of_fire','dark_pact'], // 高伤AOE偏好+职业技能
    unlock:'累充¥100',unlockType:'totalcharge',unlockReq:100},

  paladin:{id:'paladin',name:'圣骑士',icon:'🛡️',origin:'惩戒骑',role:'AOE+护盾',color:0xffaa33,
    atk:21,hp:250,spd:4.0,critRate:0.06,critDmg:2.0,armor:5,
    atkRate:1.2,atkRange:3.5,atkType:'melee_holy',atkRatio:0.9,
    passive:'divineprotection',passiveDesc:'每25秒获得一个神圣护盾(吸收=最大HP×15%)，护盾存在时攻击附带圣光灼烧',
    signatureSkill:'sig_avengershield',skill:'复仇之盾',
    favorSkills:['heal','thorns','ashbringer','consecration','lay_on_hands','hammer_of_wrath'], // 坦克近战偏好+职业技能
    unlock:'竞技场黄金',unlockType:'arena',unlockReq:'gold'}
};

// ==================== 8个副本（指数级难度曲线） ====================
// HP基础值设计: ch1=40 → ch7=40*1.8^6 ≈ 1360 (34倍跨度)
// 每个副本3种怪：炮灰(低HP高速)、标准(中等)、精英型(高HP低速高伤)
// BOSS增加阶段机制
// 设计原则：小怪不能被普攻一刀秒杀！最弱的炮灰也需要2-3下
const CHAPTERS={
  ch1:{id:'ch1',num:1,name:'艾尔文森林',desc:'狗头人与豺狼人出没',bgColor:0x1a2a1a,
    boss:{name:'霍格',hp:800,atk:15,spd:2.0,color:0x884422,sz:2.0,
      phases:[
        {hpPct:1.0,skills:['charge'],atkMult:1.0,spdMult:1.0,interval:5},
        {hpPct:0.5,skills:['charge','whirlwind'],atkMult:1.3,spdMult:1.2,interval:4}
      ]},
    waves:8,waveDur:25,recPower:150,
    reward:{gold:400,xp:150,frags:1},unlockReq:null,
    // 刷怪节奏：初始慢→渐快
    spawnBase:1.8,spawnScalePerWave:0.15,maxEnemies:20,batchMin:2,batchMax:5,
    enemyTypes:[
      {name:'狗头人',color:0x886644,sz:0.6,hp:40,atk:4,spd:2.0,xp:2,type:'fodder'},
      {name:'豺狼人',color:0xaa7744,sz:0.7,hp:65,atk:7,spd:1.8,xp:3,type:'standard'}]},

  ch2:{id:'ch2',num:2,name:'西部荒野',desc:'迪菲亚兄弟会地盘',bgColor:0x2a2210,
    boss:{name:'范克里夫',hp:1800,atk:22,spd:2.5,color:0xaa2222,sz:2.2,
      phases:[
        {hpPct:1.0,skills:['knifestorm'],atkMult:1.0,spdMult:1.0,interval:6},
        {hpPct:0.6,skills:['knifestorm','summon_adds'],atkMult:1.2,spdMult:1.1,interval:5},
        {hpPct:0.25,skills:['knifestorm','poison_nova'],atkMult:1.5,spdMult:1.4,interval:3}
      ]},
    waves:9,waveDur:28,recPower:400,
    reward:{gold:700,xp:280,frags:2},unlockReq:'ch1',
    spawnBase:1.6,spawnScalePerWave:0.12,maxEnemies:25,batchMin:2,batchMax:6,
    enemyTypes:[
      {name:'迪菲亚打手',color:0xcc4422,sz:0.65,hp:75,atk:8,spd:2.2,xp:3,type:'standard'},
      {name:'迪菲亚盗贼',color:0xcc2222,sz:0.6,hp:50,atk:14,spd:2.8,xp:4,type:'fast'},
      {name:'迪菲亚法师',color:0xcc6622,sz:0.6,hp:45,atk:18,spd:1.6,xp:5,type:'caster'}]},

  ch3:{id:'ch3',num:3,name:'荆棘谷',desc:'巨魔与猛兽横行',bgColor:0x0a2a0a,
    boss:{name:'血领主曼多基尔',hp:3200,atk:30,spd:2.2,color:0x882244,sz:2.5,
      phases:[
        {hpPct:1.0,skills:['charge','throw_spear'],atkMult:1.0,spdMult:1.0,interval:5},
        {hpPct:0.6,skills:['charge','throw_spear','blood_frenzy'],atkMult:1.3,spdMult:1.3,interval:4},
        {hpPct:0.2,skills:['charge','blood_frenzy','summon_adds'],atkMult:1.6,spdMult:1.5,interval:3}
      ]},
    waves:10,waveDur:28,recPower:800,
    reward:{gold:1000,xp:420,frags:3},unlockReq:'ch2',
    spawnBase:1.5,spawnScalePerWave:0.12,maxEnemies:30,batchMin:3,batchMax:7,
    enemyTypes:[
      {name:'丛林巨魔',color:0x44aa66,sz:0.7,hp:110,atk:11,spd:2.0,xp:4,type:'standard'},
      {name:'银背猩猩',color:0x666633,sz:0.85,hp:170,atk:16,spd:1.5,xp:6,type:'tank'},
      {name:'猛虎',color:0xcc8844,sz:0.65,hp:75,atk:20,spd:3.2,xp:5,type:'fast'}]},

  ch4:{id:'ch4',num:4,name:'灼热峡谷',desc:'黑铁矮人与火元素',bgColor:0x2a1008,
    boss:{name:'拉格纳罗斯',hp:6000,atk:40,spd:1.8,color:0xff4400,sz:3.0,
      phases:[
        {hpPct:1.0,skills:['magma_blast','lava_pool'],atkMult:1.0,spdMult:1.0,interval:5},
        {hpPct:0.5,skills:['magma_blast','lava_pool','fire_nova'],atkMult:1.4,spdMult:1.0,interval:4},
        {hpPct:0.2,skills:['magma_blast','fire_nova','summon_adds'],atkMult:1.8,spdMult:1.2,interval:2.5}
      ]},
    waves:10,waveDur:30,recPower:1500,
    reward:{gold:1500,xp:600,frags:4},unlockReq:'ch3',
    spawnBase:1.4,spawnScalePerWave:0.10,maxEnemies:35,batchMin:3,batchMax:8,
    enemyTypes:[
      {name:'黑铁矮人',color:0x884422,sz:0.6,hp:150,atk:14,spd:2.0,xp:5,type:'standard'},
      {name:'火元素',color:0xff6622,sz:0.7,hp:200,atk:22,spd:1.4,xp:7,type:'caster'},
      {name:'熔岩犬',color:0xff4400,sz:0.55,hp:100,atk:11,spd:3.0,xp:4,type:'fast'}]},

  ch5:{id:'ch5',num:5,name:'东瘟疫之地',desc:'天灾军团的腐化之地',bgColor:0x1a1a2a,
    boss:{name:'克尔苏加德之影',hp:10000,atk:50,spd:2.0,color:0x6644aa,sz:2.8,
      phases:[
        {hpPct:1.0,skills:['frostbolt','frost_nova'],atkMult:1.0,spdMult:1.0,interval:4},
        {hpPct:0.6,skills:['frostbolt','frost_nova','summon_adds'],atkMult:1.3,spdMult:1.1,interval:3.5},
        {hpPct:0.2,skills:['frostbolt','chains_of_kel','frost_nova'],atkMult:1.7,spdMult:1.3,interval:2}
      ]},
    waves:10,waveDur:30,recPower:2800,
    reward:{gold:2200,xp:900,frags:5},unlockReq:'ch4',
    spawnBase:1.3,spawnScalePerWave:0.10,maxEnemies:40,batchMin:3,batchMax:8,
    enemyTypes:[
      {name:'食尸鬼',color:0x44aa44,sz:0.6,hp:140,atk:12,spd:2.8,xp:5,type:'fast'},
      {name:'憎恶',color:0x668844,sz:0.95,hp:280,atk:24,spd:1.0,xp:10,type:'tank'},
      {name:'亡灵法师',color:0x664488,sz:0.6,hp:110,atk:28,spd:1.5,xp:8,type:'caster'}]},

  ch6:{id:'ch6',num:6,name:'海加尔山',desc:'燃烧军团大举入侵',bgColor:0x2a0a0a,
    boss:{name:'阿克蒙德',hp:16000,atk:60,spd:1.5,color:0x882200,sz:3.5,
      phases:[
        {hpPct:1.0,skills:['soul_charge','rain_of_fire'],atkMult:1.0,spdMult:1.0,interval:5},
        {hpPct:0.55,skills:['soul_charge','rain_of_fire','finger_of_death'],atkMult:1.4,spdMult:1.2,interval:3.5},
        {hpPct:0.2,skills:['soul_charge','finger_of_death','doom'],atkMult:2.0,spdMult:1.5,interval:2}
      ]},
    waves:10,waveDur:30,recPower:5000,
    reward:{gold:3500,xp:1500,frags:6},unlockReq:'ch5',
    spawnBase:1.2,spawnScalePerWave:0.08,maxEnemies:45,batchMin:4,batchMax:10,
    enemyTypes:[
      {name:'恶魔卫兵',color:0xaa4422,sz:0.75,hp:220,atk:18,spd:2.2,xp:7,type:'standard'},
      {name:'地狱火',color:0xff4400,sz:0.95,hp:360,atk:28,spd:0.9,xp:12,type:'tank'},
      {name:'末日守卫',color:0x882200,sz:0.85,hp:250,atk:35,spd:1.8,xp:10,type:'caster'}]},

  ch7:{id:'ch7',num:7,name:'诺森德',desc:'巫妖王的领地',bgColor:0x0a1a2a,
    boss:{name:'巫妖王',hp:28000,atk:75,spd:2.2,color:0x4488ff,sz:3.5,
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
      {name:'维库人',color:0x8888aa,sz:0.8,hp:280,atk:22,spd:2.0,xp:8,type:'standard'},
      {name:'冰霜巨龙',color:0x88ccff,sz:1.05,hp:440,atk:38,spd:1.3,xp:15,type:'tank'},
      {name:'瓦格里',color:0xaaaacc,sz:0.7,hp:200,atk:30,spd:2.6,xp:10,type:'fast'}]},

  endless:{id:'endless',num:8,name:'扭曲虚空',desc:'无尽挑战',bgColor:0x0a0a1a,
    boss:{name:'虚空领主',hp:8000,atk:45,spd:2.0,color:0x6622aa,sz:3.0,
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
      {name:'虚空行者',color:0x6622aa,sz:0.7,hp:180,atk:16,spd:2.0,xp:6,type:'standard'},
      {name:'扭曲畸体',color:0x883388,sz:0.85,hp:250,atk:22,spd:1.8,xp:8,type:'tank'},
      {name:'暗影精英',color:0x7744bb,sz:0.75,hp:160,atk:28,spd:2.4,xp:9,type:'fast'}]}
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
    desc:'发射火球，命中造成伤害。每3级+1发，最多4发',
    baseDmg:18,atkRatio:0.6,cd:1.0,cdMin:0.35,cdReduction:0.08,dmgGrowth:0.18,
    projSpeed:22,projCount:1,projCountPerLv:0.4, // Lv3=2发,Lv5=3发,Lv8=4发
    prereq:null},

  {id:'frostnova',name:'霜冻新星',icon:'❄️',rarity:'common',maxLevel:8,
    desc:'以自身为中心释放冰环(半径3.5)，造成伤害并减速1.8秒。升级+0.4范围+0.2秒减速',
    baseDmg:22,atkRatio:0.5,cd:2.2,cdMin:1.0,cdReduction:0.12,dmgGrowth:0.16,
    radius:3.5,radiusPerLv:0.4,freezeDur:1.8,freezePerLv:0.2,
    prereq:null},

  {id:'thunder',name:'雷霆一击',icon:'⚡',rarity:'common',maxLevel:8,
    desc:'对周围敌人释放闪电伤害(半径4.5)，35%概率连锁。升级+0.35范围+5%连锁率',
    baseDmg:20,atkRatio:0.55,cd:1.6,cdMin:0.7,cdReduction:0.10,dmgGrowth:0.17,
    radius:4.5,radiusPerLv:0.35,chainChance:0.35,chainChancePerLv:0.05,
    prereq:null},

  {id:'heal',name:'治疗之泉',icon:'💚',rarity:'common',maxLevel:8,
    desc:'每7秒恢复8%最大HP。升级+1.5%回复量-0.5秒CD',
    baseDmg:0,atkRatio:0,cd:7.0,cdMin:3.0,cdReduction:0.5,dmgGrowth:0,
    healPct:0.08,healPctPerLv:0.015, // 基础回8%HP，每级+1.5%
    prereq:null},

  {id:'thorns',name:'荆棘术',icon:'🌿',rarity:'common',maxLevel:8,
    desc:'被攻击时反弹30%伤害。升级+8%反弹比例',
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
    desc:'在目标区域降下冰雹，持续2秒造成伤害并减速。升级+0.2秒持续+0.4范围',
    baseDmg:12,atkRatio:0.35,cd:3.0,cdMin:1.5,cdReduction:0.15,dmgGrowth:0.18,
    radius:3.5,radiusPerLv:0.4,duration:2.0,durationPerLv:0.2,tickRate:0.25,freezeOnHit:1.2,
    prereq:{id:'frostnova',lv:3}},

  {id:'chainlight',name:'闪电链',icon:'⛓️',rarity:'rare',maxLevel:6,
    desc:'闪电在敌人间弹射4次，每次伤害衰减15%。升级+1次弹射',
    baseDmg:25,atkRatio:0.65,cd:1.8,cdMin:0.7,cdReduction:0.12,dmgGrowth:0.18,
    bounceCount:4,bounceCountPerLv:1,bounceDmgDecay:0.85,bounceRange:8,
    prereq:{id:'thunder',lv:3}},

  {id:'bloodthirst',name:'血之渴望',icon:'🩸',rarity:'rare',maxLevel:6,
    desc:'击杀敌人时回复2.5%最大HP。升级+0.8%回复量',
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
    desc:'天空巨眼射线轰炸(半径3)持续2.5秒，每0.2秒一击。升级+0.5秒持续+0.3半径-1.5秒CD',
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

  // ===== 职业专属技能 (class_skill) — 只有对应职业可学习 =====
  // 战士专属
  {id:'heroic_leap',name:'英勇飞跃',icon:'💫',rarity:'rare',maxLevel:6,heroOnly:'warrior',
    desc:'跳向敌群密集处，落地造成AOE伤害(半径4)并减速2秒。升级+0.3范围',
    baseDmg:30,atkRatio:0.8,cd:3.5,cdMin:1.5,cdReduction:0.3,dmgGrowth:0.20,
    radius:4.0,radiusPerLv:0.3,slowPct:0.4,slowDur:2.0,prereq:null},
  {id:'execute_strike',name:'斩杀',icon:'🪓',rarity:'epic',maxLevel:5,heroOnly:'warrior',
    desc:'对低血量(<30%)敌人造成巨额伤害，击杀回怒',
    baseDmg:50,atkRatio:1.5,cd:4.0,cdMin:2.0,cdReduction:0.3,dmgGrowth:0.25,
    executePct:0.30,bonusDmg:2.5,prereq:null},
  {id:'shield_wall',name:'盾墙',icon:'🛡️',rarity:'rare',maxLevel:6,heroOnly:'warrior',
    desc:'每25秒自动触发盾墙，减少50%伤害持续3秒。升级+5%减伤+0.3秒持续',
    baseDmg:0,atkRatio:0,cd:25,cdMin:12,cdReduction:2.0,dmgGrowth:0,
    dmgReduction:0.50,dmgRedPerLv:0.05,wallDur:3.0,wallDurPerLv:0.3,prereq:null},

  // 法师专属
  {id:'pyroblast',name:'炎爆术',icon:'☄️',rarity:'rare',maxLevel:6,heroOnly:'mage',
    desc:'蓄力释放巨型火球，造成超高单体伤害',
    baseDmg:55,atkRatio:1.4,cd:5.0,cdMin:2.5,cdReduction:0.4,dmgGrowth:0.22,
    projSpeed:16,explosionR:2.0,prereq:null},
  {id:'arcane_blast',name:'奥术冲击',icon:'🔮',rarity:'epic',maxLevel:5,heroOnly:'mage',
    desc:'连续释放时伤害递增(最多+80%)，消耗增加',
    baseDmg:25,atkRatio:0.7,cd:1.2,cdMin:0.4,cdReduction:0.1,dmgGrowth:0.18,
    stackMult:0.20,maxStacks:4,prereq:null},
  {id:'ice_barrier',name:'寒冰屏障',icon:'🧊',rarity:'rare',maxLevel:6,heroOnly:'mage',
    desc:'每20秒获得冰盾(吸收20%HP伤害)，冰盾存在时技能CD-20%。升级+3%护盾',
    baseDmg:0,atkRatio:0,cd:20,cdMin:10,cdReduction:1.5,dmgGrowth:0,
    shieldPct:0.20,shieldPctPerLv:0.03,cdBonus:0.20,prereq:null},

  // 猎人专属
  {id:'explosive_trap',name:'爆炸陷阱',icon:'💣',rarity:'rare',maxLevel:6,heroOnly:'hunter',
    desc:'在地面放置陷阱(存在15秒，最多3个)，敌人踩踏时爆炸(半径3)。升级+0.3范围',
    baseDmg:35,atkRatio:0.7,cd:4.0,cdMin:2.0,cdReduction:0.3,dmgGrowth:0.20,
    trapRadius:3.0,trapRadPerLv:0.3,trapDur:15,trapMax:3,prereq:null},
  {id:'aimed_shot',name:'瞄准射击',icon:'🎯',rarity:'epic',maxLevel:5,heroOnly:'hunter',
    desc:'精准射击单个目标，必定暴击且忽视护甲',
    baseDmg:45,atkRatio:1.2,cd:5.0,cdMin:2.5,cdReduction:0.4,dmgGrowth:0.22,
    guaranteedCrit:true,armorIgnore:true,prereq:null},
  {id:'bestial_wrath',name:'狂野怒火',icon:'🦁',rarity:'rare',maxLevel:6,heroOnly:'hunter',
    desc:'宠物进入狂怒状态8秒，攻击力+100%且每击回复1%HP。升级+20%宠物攻击',
    baseDmg:0,atkRatio:0,cd:20,cdMin:10,cdReduction:1.5,dmgGrowth:0,
    petRageMult:1.0,petRagePerLv:0.2,rageDur:8,healPctOnPetHit:0.01,prereq:null},

  // 牧师专属
  {id:'mind_blast',name:'心灵震爆',icon:'🧠',rarity:'rare',maxLevel:6,heroOnly:'priest',
    desc:'对目标造成暗影伤害并恐惧周围敌人1.5秒(半径4)。升级+0.2秒恐惧',
    baseDmg:40,atkRatio:0.9,cd:3.0,cdMin:1.5,cdReduction:0.25,dmgGrowth:0.20,
    fearRadius:4.0,fearDur:1.5,fearDurPerLv:0.2,prereq:null},
  {id:'shadow_form',name:'暗影形态',icon:'👤',rarity:'epic',maxLevel:5,heroOnly:'priest',
    desc:'被动：DOT伤害+35%，受到伤害-15%。升级+8%DOT伤害+3%减伤',
    baseDmg:0,atkRatio:0,cd:0,cdMin:0,cdReduction:0,dmgGrowth:0,
    dotDmgBonus:0.35,dotDmgPerLv:0.08,dmgReduction:0.15,dmgRedPerLv:0.03,prereq:null},
  {id:'prayer_of_mending',name:'愈合祷言',icon:'🙏',rarity:'rare',maxLevel:6,heroOnly:'priest',
    desc:'每10秒自动回复10%HP，低血量时回复量翻倍',
    baseDmg:0,atkRatio:0,cd:10,cdMin:5,cdReduction:0.8,dmgGrowth:0,
    healPct:0.10,healPctPerLv:0.02,lowHpThreshold:0.30,prereq:null},

  // 盗贼专属
  {id:'eviscerate',name:'剔骨',icon:'💀',rarity:'rare',maxLevel:6,heroOnly:'rogue',
    desc:'消耗连击点(攻击叠加)释放高伤害终结技',
    baseDmg:20,atkRatio:0.5,cd:2.0,cdMin:0.8,cdReduction:0.15,dmgGrowth:0.20,
    comboPointMult:0.6,maxComboPoints:5,prereq:null},
  {id:'cloak_of_shadows',name:'暗影斗篷',icon:'🧥',rarity:'epic',maxLevel:5,heroOnly:'rogue',
    desc:'每30秒激活斗篷，免疫所有伤害2秒并移速+50%。升级+0.3秒免疫时间',
    baseDmg:0,atkRatio:0,cd:30,cdMin:15,cdReduction:2.5,dmgGrowth:0,
    immuneDur:2.0,immuneDurPerLv:0.3,spdBoost:0.50,prereq:null},
  {id:'blade_dance',name:'刃舞',icon:'🌀',rarity:'rare',maxLevel:6,heroOnly:'rogue',
    desc:'快速旋转攻击周围所有敌人，每击有概率触发连击',
    baseDmg:22,atkRatio:0.7,cd:2.5,cdMin:1.0,cdReduction:0.2,dmgGrowth:0.18,
    spinRadius:3.5,spinRadPerLv:0.3,comboBuildChance:0.5,prereq:null},

  // 萨满专属
  {id:'lava_burst',name:'熔岩爆裂',icon:'🌋',rarity:'rare',maxLevel:6,heroOnly:'shaman',
    desc:'发射熔岩弹，对烈焰图腾范围内敌人必定暴击',
    baseDmg:35,atkRatio:0.85,cd:2.5,cdMin:1.2,cdReduction:0.2,dmgGrowth:0.20,
    projSpeed:20,guaranteedCritNearTotem:true,prereq:null},
  {id:'healing_rain',name:'治疗之雨',icon:'🌧️',rarity:'epic',maxLevel:5,heroOnly:'shaman',
    desc:'在脚下召唤治疗之雨持续5秒，每0.5秒回复3%HP并+3护甲。升级+1%回复+1护甲',
    baseDmg:0,atkRatio:0,cd:15,cdMin:8,cdReduction:1.5,dmgGrowth:0,
    healPct:0.03,healPctPerLv:0.01,armorBonus:3,armorPerLv:1,duration:5.0,prereq:null},
  {id:'earthquake',name:'地震术',icon:'🌍',rarity:'rare',maxLevel:6,heroOnly:'shaman',
    desc:'在区域(半径5)持续3秒造成伤害，每0.5秒一跳，15%几率眩晕。升级+0.4范围',
    baseDmg:15,atkRatio:0.4,cd:6.0,cdMin:3.0,cdReduction:0.5,dmgGrowth:0.18,
    radius:5.0,radiusPerLv:0.4,duration:3.0,tickRate:0.5,stunChance:0.15,prereq:null},

  // 死骑专属
  {id:'death_strike',name:'灭杀打击',icon:'💀',rarity:'rare',maxLevel:6,heroOnly:'deathknight',
    desc:'近战重击，回复造成伤害的25%为HP。升级+5%吸血比例',
    baseDmg:35,atkRatio:1.0,cd:3.0,cdMin:1.5,cdReduction:0.25,dmgGrowth:0.22,
    leechPct:0.25,leechPctPerLv:0.05,prereq:null},
  {id:'army_of_dead',name:'亡者大军',icon:'☠️',rarity:'epic',maxLevel:5,heroOnly:'deathknight',
    desc:'召唤4个亡灵士兵持续10秒战斗(最多6个)。升级+1个士兵',
    baseDmg:8,atkRatio:0.3,cd:25,cdMin:15,cdReduction:2.0,dmgGrowth:0.20,
    ghoulCount:4,ghoulCountPerLv:1,ghoulDur:10,ghoulAtkRate:1.0,prereq:null},
  {id:'anti_magic_shell',name:'反魔法护罩',icon:'🔵',rarity:'rare',maxLevel:6,heroOnly:'deathknight',
    desc:'每20秒获得反魔法护罩持续4秒，吸收25%HP伤害并在结束时转化50%为攻击力。升级+5%吸收',
    baseDmg:0,atkRatio:0,cd:20,cdMin:10,cdReduction:1.5,dmgGrowth:0,
    absorbPct:0.25,absorbPerLv:0.05,absorbToAtk:0.5,shellDur:4.0,prereq:null},

  // 德鲁伊专属
  {id:'moonfire',name:'月火术',icon:'🌙',rarity:'rare',maxLevel:6,heroOnly:'druid',
    desc:'月光轰炸敌人并附加持续灼烧',
    baseDmg:18,atkRatio:0.55,cd:1.8,cdMin:0.8,cdReduction:0.15,dmgGrowth:0.18,
    dotDmgPct:0.30,dotDur:4.0,dotTickRate:0.5,prereq:null},
  {id:'wild_growth',name:'野性成长',icon:'🌱',rarity:'epic',maxLevel:5,heroOnly:'druid',
    desc:'持续恢复HP，低血量时回复效果翻倍',
    baseDmg:0,atkRatio:0,cd:12,cdMin:6,cdReduction:1.0,dmgGrowth:0,
    hotPct:0.04,hotPctPerLv:0.01,hotDur:6.0,lowHpMult:2.0,prereq:null},
  {id:'ferocious_bite',name:'凶猛撕咬',icon:'🐱',rarity:'rare',maxLevel:6,heroOnly:'druid',
    desc:'猫形态下的终结技，消耗能量造成巨额伤害',
    baseDmg:45,atkRatio:1.3,cd:4.0,cdMin:2.0,cdReduction:0.3,dmgGrowth:0.22,
    catFormBonusPct:0.50,prereq:null},

  // 术士专属
  {id:'corruption',name:'腐蚀术',icon:'🦠',rarity:'rare',maxLevel:6,heroOnly:'warlock',
    desc:'对敌人施加腐蚀诅咒，持续造成暗影伤害',
    baseDmg:8,atkRatio:0.3,cd:2.0,cdMin:0.8,cdReduction:0.15,dmgGrowth:0.18,
    dotDmgPct:0.40,dotDur:6.0,dotTickRate:0.5,spreadOnKill:true,prereq:null},
  {id:'rain_of_fire',name:'火焰之雨',icon:'🔥',rarity:'epic',maxLevel:5,heroOnly:'warlock',
    desc:'在大范围降下火焰，持续伤害区域内所有敌人',
    baseDmg:20,atkRatio:0.5,cd:6.0,cdMin:3.0,cdReduction:0.5,dmgGrowth:0.20,
    radius:5.0,radiusPerLv:0.4,duration:3.0,tickRate:0.3,prereq:null},
  {id:'dark_pact',name:'黑暗契约',icon:'🩸',rarity:'rare',maxLevel:6,heroOnly:'warlock',
    desc:'牺牲10%当前HP获得20秒的攻击力+30%和技能伤害+20%',
    baseDmg:0,atkRatio:0,cd:25,cdMin:15,cdReduction:1.5,dmgGrowth:0,
    hpCostPct:0.10,atkBoostPct:0.30,atkBoostPerLv:0.05,skillDmgBoost:0.20,boostDur:20,prereq:null},

  // 圣骑士专属
  {id:'consecration',name:'奉献',icon:'✨',rarity:'rare',maxLevel:6,heroOnly:'paladin',
    desc:'在脚下点燃圣光，持续伤害区域内敌人并回复自身HP',
    baseDmg:12,atkRatio:0.35,cd:5.0,cdMin:2.5,cdReduction:0.4,dmgGrowth:0.18,
    radius:4.0,radiusPerLv:0.3,duration:4.0,tickRate:0.5,healPct:0.005,prereq:null},
  {id:'lay_on_hands',name:'圣疗术',icon:'🙌',rarity:'epic',maxLevel:5,heroOnly:'paladin',
    desc:'紧急治疗，瞬间回复50%最大HP(CD50秒)。升级+8%回复量-4秒CD',
    baseDmg:0,atkRatio:0,cd:50,cdMin:25,cdReduction:4.0,dmgGrowth:0,
    healPct:0.50,healPctPerLv:0.08,prereq:null},
  {id:'hammer_of_wrath',name:'愤怒之锤',icon:'🔨',rarity:'rare',maxLevel:6,heroOnly:'paladin',
    desc:'投掷圣光之锤，对低血量目标造成额外伤害',
    baseDmg:30,atkRatio:0.8,cd:3.0,cdMin:1.5,cdReduction:0.25,dmgGrowth:0.20,
    projSpeed:22,executePct:0.35,executeBonus:2.0,prereq:null},

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
    desc:'召唤末日守卫战斗6秒(攻速0.8秒)，诅咒目标伤害×2。升级+0.5秒持续-0.7秒CD',
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
  // 通用合成
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
  // 职业专属合成
  {id:'bladestorm',name:'剑刃风暴',icon:'🌪️',desc:'战士终极：全屏旋转斩杀一切，持续5秒免疫控制',
    req:['sig_whirlwind','execute_strike'],reqLv:3,heroOnly:'warrior',
    baseDmg:120,atkRatio:2.0,cd:15.0,radius:12,duration:5.0,
    bonusDesc:'旋风斩+斩杀的终极融合'},
  {id:'living_meteor',name:'活体流星',icon:'☄️',desc:'法师终极：天降巨型陨石群，全屏毁灭',
    req:['sig_firestorm','pyroblast'],reqLv:3,heroOnly:'mage',
    baseDmg:150,atkRatio:2.5,cd:18.0,radius:15,
    bonusDesc:'烈焰风暴+炎爆术的终极融合'},
  {id:'wild_fury',name:'荒野狂怒',icon:'🐻',desc:'猎人终极：召唤整群野兽冲锋碾压敌人',
    req:['sig_multishot','bestial_wrath'],reqLv:3,heroOnly:'hunter',
    baseDmg:80,atkRatio:1.5,cd:20.0,beastCount:6,beastDur:10,
    bonusDesc:'多重射击+狂野怒火的终极融合'},
  {id:'void_eruption',name:'虚空爆发',icon:'💜',desc:'牧师终极：引爆所有DOT，全屏暗影爆炸',
    req:['sig_shadowword','shadow_form'],reqLv:3,heroOnly:'priest',
    baseDmg:100,atkRatio:1.8,cd:16.0,detonateAllDots:true,
    bonusDesc:'暗言术+暗影形态的终极融合'},
  {id:'death_mark',name:'死亡印记',icon:'☠️',desc:'盗贼终极：标记目标后疯狂攻击，最后引爆全部伤害',
    req:['sig_shadowdance','eviscerate'],reqLv:3,heroOnly:'rogue',
    baseDmg:60,atkRatio:2.0,cd:14.0,markDur:4.0,detonateMult:1.5,
    bonusDesc:'影舞+剔骨的终极融合'},
  {id:'ascendance',name:'升腾',icon:'🌊',desc:'化身元素之灵8秒，全技能无冷却，CD30秒',
    req:['sig_totemstorm','lava_burst'],reqLv:3,heroOnly:'shaman',
    baseDmg:0,atkRatio:0,cd:30.0,noCdDur:8.0,
    bonusDesc:'图腾风暴+熔岩爆裂的终极融合'},
  {id:'apocalypse',name:'天启',icon:'💀',desc:'死骑终极：召唤天启四骑士横扫战场',
    req:['sig_wintercoming','army_of_dead'],reqLv:3,heroOnly:'deathknight',
    baseDmg:100,atkRatio:2.0,cd:25.0,riderCount:4,riderDur:12,
    bonusDesc:'凛冬将至+亡者大军的终极融合'},
  {id:'incarnation',name:'化身',icon:'🐉',desc:'德鲁伊终极：化身为上古巨龙，获得全形态加成',
    req:['sig_starfall','wild_growth'],reqLv:3,heroOnly:'druid',
    baseDmg:80,atkRatio:1.5,cd:20.0,allFormDur:15.0,
    bonusDesc:'星辰坠落+野性成长的终极融合'},
  {id:'summon_infernal',name:'召唤地狱火',icon:'🔥',desc:'术士终极：召唤地狱火巨人砸落战场',
    req:['sig_doomguard','rain_of_fire'],reqLv:3,heroOnly:'warlock',
    baseDmg:120,atkRatio:2.0,cd:22.0,infernalDur:15.0,infernalAoe:true,
    bonusDesc:'末日守卫+火焰之雨的终极融合'},
  {id:'divine_storm',name:'神圣风暴',icon:'⚜️',desc:'圣骑士终极：圣光风暴横扫全场并治疗自身',
    req:['sig_avengershield','consecration'],reqLv:3,heroOnly:'paladin',
    baseDmg:90,atkRatio:1.8,cd:16.0,healPct:0.30,radius:10,
    bonusDesc:'复仇之盾+奉献的终极融合'},
];

const RARITY_NAME={common:'普通',rare:'精良',epic:'史诗',legendary:'传说',mythic:'神话',signature:'标志'};
const RARITY_COLOR={common:'#aaaaaa',rare:'#44ff44',epic:'#aa44ff',legendary:'#ff8800',mythic:'#ff2222',signature:'#ff4466'};

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

// ==================== 装备系统（魔兽世界特色 · 50+件 · 含套装效果） ====================
// 6个槽位: weapon武器 / armor护甲 / trinket饰品 / ring戒指 / helmet头盔 / boots靴子
// 5个品质: common普通 / rare精良 / epic史诗 / legendary传说 / mythic神话
// classReq: 职业限定（空=全职业可用）
// setId: 套装ID（同setId装备穿够N件触发套装效果）
const EQUIPMENT_DB=[
  // ==================== 通用武器 ====================
  {id:'sword1',name:'铜剑',icon:'🗡️',rarity:'common',slot:'weapon',atk:3,hp:0,spd:0,critRate:0,armor:0,forgeTime:7200},
  {id:'sword2',name:'精铁长剑',icon:'⚔️',rarity:'rare',slot:'weapon',atk:7,hp:0,spd:0,critRate:0.02,armor:0,forgeTime:14400},
  {id:'sword3',name:'暗影之牙',icon:'🔪',rarity:'epic',slot:'weapon',atk:14,hp:0,spd:0.1,critRate:0.05,armor:0,forgeTime:28800,
    effect:'shadow',effectDesc:'攻击有15%概率造成暗影爆发(额外50%伤害)'},
  {id:'sword4',name:'灰烬使者',icon:'⚔️',rarity:'legendary',slot:'weapon',atk:22,hp:20,spd:0.15,critRate:0.08,armor:0,forgeTime:43200,
    effect:'ashbringer',effectDesc:'每第5次攻击释放圣光波(范围伤害)'},

  // ==================== 职业专属武器（传说级） ====================
  {id:'wp_gorehowl',name:'血吼',icon:'🪓',rarity:'legendary',slot:'weapon',classReq:'warrior',
    atk:28,hp:30,spd:0,critRate:0.06,armor:0,forgeTime:43200,setId:'wrath',
    effect:'gorehowl',effectDesc:'每次攻击叠加怒气(最多20层)，满层释放顺劈，对前方全体造成ATK×200%伤害'},
  {id:'wp_atiesh',name:'埃提耶什',icon:'🪄',rarity:'legendary',slot:'weapon',classReq:'mage',
    atk:32,hp:0,spd:0,critRate:0.10,armor:0,forgeTime:43200,setId:'arcane',
    effect:'atiesh',effectDesc:'技能暴击时释放奥术飞弹(3发追踪，每发ATK×40%)'},
  {id:'wp_rhokdelar',name:'洛克德拉尔',icon:'🏹',rarity:'legendary',slot:'weapon',classReq:'hunter',
    atk:20,hp:0,spd:0.2,critRate:0.08,armor:0,forgeTime:43200,setId:'wildspirit',
    effect:'rhokdelar',effectDesc:'普攻有30%概率额外射出一支毒箭(5秒内每秒ATK×15%伤害)'},
  {id:'wp_anathema',name:'安纳塞玛',icon:'☠️',rarity:'legendary',slot:'weapon',classReq:'priest',
    atk:26,hp:0,spd:0,critRate:0.04,armor:0,forgeTime:43200,setId:'shadow_embrace',
    effect:'anathema',effectDesc:'DOT每跳有20%概率传播给周围1个敌人'},
  {id:'wp_perdition',name:'毁灭之刃',icon:'🗡️',rarity:'legendary',slot:'weapon',classReq:'rogue',
    atk:38,hp:0,spd:0,critRate:0.15,armor:0,forgeTime:43200,setId:'nightslayer',
    effect:'perdition',effectDesc:'暴击伤害额外+60%，击杀重置技能CD(8秒内限1次)'},
  {id:'wp_doomhammer',name:'毁灭之锤',icon:'🔨',rarity:'legendary',slot:'weapon',classReq:'shaman',
    atk:24,hp:20,spd:0,critRate:0.06,armor:2,forgeTime:43200,setId:'earthfury',
    effect:'doomhammer',effectDesc:'攻击有25%概率触发风暴打击(对目标及周围造成ATK×120%自然伤害)'},
  {id:'wp_frostmourne_blade',name:'霜之哀伤',icon:'🥶',rarity:'legendary',slot:'weapon',classReq:'deathknight',
    atk:30,hp:40,spd:0,critRate:0.05,armor:0,forgeTime:43200,setId:'icecrown',
    effect:'frostmourne_equip',effectDesc:'击杀的敌人有30%概率复生为亡灵仆从(8秒,ATK=60%)'},
  {id:'wp_dreambinder',name:'梦境编织者',icon:'🌙',rarity:'legendary',slot:'weapon',classReq:'druid',
    atk:22,hp:25,spd:0.1,critRate:0.06,armor:0,forgeTime:43200,setId:'cenarion',
    effect:'dreambinder',effectDesc:'变形切换时释放梦境波动(治疗15%HP并对周围造成ATK×80%伤害)'},
  {id:'wp_soulharvester',name:'灵魂收割镰',icon:'⚰️',rarity:'legendary',slot:'weapon',classReq:'warlock',
    atk:30,hp:0,spd:0,critRate:0.08,armor:0,forgeTime:43200,setId:'nemesis',
    effect:'soulharvester',effectDesc:'被诅咒敌人死亡爆炸伤害+100%，爆炸有50%概率恐惧周围敌人2秒'},
  {id:'wp_ashkandi',name:'阿什坎迪',icon:'⚔️',rarity:'legendary',slot:'weapon',classReq:'paladin',
    atk:25,hp:35,spd:0,critRate:0.04,armor:2,forgeTime:43200,setId:'judgment',
    effect:'ashkandi',effectDesc:'每次攻击回复1%最大HP，护盾期间攻击力+30%'},

  // ==================== 通用护甲 ====================
  {id:'armor1',name:'皮甲',icon:'🛡️',rarity:'common',slot:'armor',atk:0,hp:15,spd:0,critRate:0,armor:1,forgeTime:7200},
  {id:'armor2',name:'锁甲',icon:'🦺',rarity:'rare',slot:'armor',atk:0,hp:35,spd:0,critRate:0,armor:2,forgeTime:14400},
  {id:'armor3',name:'板甲',icon:'🛡️',rarity:'epic',slot:'armor',atk:0,hp:60,spd:0,critRate:0,armor:4,forgeTime:28800,
    effect:'fortify',effectDesc:'受到致命伤害时，30秒CD内免死一次并回复15%HP'},
  {id:'armor4',name:'龙鳞铠甲',icon:'🐉',rarity:'legendary',slot:'armor',atk:5,hp:100,spd:0,critRate:0,armor:6,forgeTime:43200,
    effect:'dragonscale',effectDesc:'受到伤害时10%概率释放龙息反击(对周围造成ATK×150%火焰伤害)'},

  // ==================== 职业专属护甲（史诗级） ====================
  {id:'ar_valorplate',name:'英勇板甲',icon:'🛡️',rarity:'epic',slot:'armor',classReq:'warrior',
    atk:3,hp:80,spd:0,critRate:0,armor:5,forgeTime:28800,setId:'wrath',
    effect:'valorplate',effectDesc:'血量<50%时护甲翻倍'},
  {id:'ar_netherweave',name:'灵纹法袍',icon:'👘',rarity:'epic',slot:'armor',classReq:'mage',
    atk:8,hp:30,spd:0,critRate:0.04,armor:0,forgeTime:28800,setId:'arcane',
    effect:'netherweave',effectDesc:'技能命中回复1%法力(即HP)'},
  {id:'ar_dragonstalker',name:'龙追猎者甲',icon:'🦎',rarity:'epic',slot:'armor',classReq:'hunter',
    atk:4,hp:50,spd:0.1,critRate:0.03,armor:2,forgeTime:28800,setId:'wildspirit',
    effect:'dragonstalker',effectDesc:'宠物在场时英雄受到的伤害-20%'},
  {id:'ar_mooncloth',name:'月布长袍',icon:'🌙',rarity:'epic',slot:'armor',classReq:'priest',
    atk:5,hp:40,spd:0,critRate:0,armor:1,forgeTime:28800,setId:'shadow_embrace',
    effect:'mooncloth',effectDesc:'每5秒自动恢复3%最大HP'},
  {id:'ar_shadowleather',name:'暗影皮甲',icon:'🖤',rarity:'epic',slot:'armor',classReq:'rogue',
    atk:6,hp:35,spd:0.1,critRate:0.06,armor:1,forgeTime:28800,setId:'nightslayer',
    effect:'shadowleather',effectDesc:'闪避成功后下次攻击必暴击且伤害+100%'},
  {id:'ar_stormscale',name:'风暴鳞甲',icon:'🌊',rarity:'epic',slot:'armor',classReq:'shaman',
    atk:3,hp:55,spd:0,critRate:0.03,armor:3,forgeTime:28800,setId:'earthfury',
    effect:'stormscale',effectDesc:'图腾持续时间+50%'},
  {id:'ar_iceboundplate',name:'冰缚板甲',icon:'🧊',rarity:'epic',slot:'armor',classReq:'deathknight',
    atk:4,hp:70,spd:0,critRate:0,armor:6,forgeTime:28800,setId:'icecrown',
    effect:'iceboundplate',effectDesc:'冰霜光环伤害+50%，减速效果+20%'},
  {id:'ar_cenarion_vest',name:'塞纳里奥胸甲',icon:'🌿',rarity:'epic',slot:'armor',classReq:'druid',
    atk:3,hp:60,spd:0,critRate:0.03,armor:3,forgeTime:28800,setId:'cenarion',
    effect:'cenarion_vest',effectDesc:'熊形态额外+50%HP回复，猫形态暴击+10%'},
  {id:'ar_nemesis_robe',name:'复仇长袍',icon:'👿',rarity:'epic',slot:'armor',classReq:'warlock',
    atk:7,hp:35,spd:0,critRate:0.05,armor:0,forgeTime:28800,setId:'nemesis',
    effect:'nemesis_robe',effectDesc:'诅咒持续伤害+30%'},
  {id:'ar_lawbringer',name:'审判铠甲',icon:'⚜️',rarity:'epic',slot:'armor',classReq:'paladin',
    atk:2,hp:75,spd:0,critRate:0,armor:5,forgeTime:28800,setId:'judgment',
    effect:'lawbringer',effectDesc:'神圣护盾量+50%，护盾破裂时对周围造成伤害'},

  // ==================== 头盔（新槽位） ====================
  {id:'helm1',name:'铁盔',icon:'⛑️',rarity:'common',slot:'helmet',atk:0,hp:10,spd:0,critRate:0,armor:1,forgeTime:7200},
  {id:'helm2',name:'狮鹫头盔',icon:'🪖',rarity:'rare',slot:'helmet',atk:2,hp:25,spd:0,critRate:0.02,armor:2,forgeTime:14400},
  {id:'helm3',name:'巫师之冠',icon:'🎓',rarity:'epic',slot:'helmet',atk:10,hp:20,spd:0,critRate:0.06,armor:0,forgeTime:28800,
    effect:'wizard_crown',effectDesc:'技能伤害+15%，技能CD-10%'},
  {id:'helm4',name:'巫妖王之盔',icon:'👑',rarity:'legendary',slot:'helmet',atk:15,hp:50,spd:0,critRate:0.05,armor:3,forgeTime:43200,
    effect:'lichking_helm',effectDesc:'每15秒释放死亡凋零(对全屏造成ATK×60%暗影伤害+回复等量HP)'},

  // ==================== 靴子（新槽位） ====================
  {id:'boot1',name:'布靴',icon:'👟',rarity:'common',slot:'boots',atk:0,hp:5,spd:0.3,critRate:0,armor:0,forgeTime:7200},
  {id:'boot2',name:'疾风之靴',icon:'👢',rarity:'rare',slot:'boots',atk:0,hp:10,spd:0.5,critRate:0,armor:1,forgeTime:14400},
  {id:'boot3',name:'风行者之靴',icon:'💨',rarity:'epic',slot:'boots',atk:3,hp:20,spd:0.8,critRate:0.03,armor:1,forgeTime:28800,
    effect:'windwalker',effectDesc:'移动速度+15%，闪避+10%'},
  {id:'boot4',name:'七联赛之靴',icon:'🌟',rarity:'legendary',slot:'boots',atk:5,hp:30,spd:1.0,critRate:0.04,armor:2,forgeTime:43200,
    effect:'sevenstride',effectDesc:'每10秒获得3秒疾跑(移速+100%)，疾跑期间免疫减速'},

  // ==================== 通用饰品 ====================
  {id:'trinket1',name:'生命宝石',icon:'💎',rarity:'rare',slot:'trinket',atk:0,hp:25,spd:0,critRate:0,armor:0,forgeTime:14400,
    effect:'regen',effectDesc:'每秒恢复0.3%最大生命值'},
  {id:'trinket2',name:'战神徽记',icon:'🏅',rarity:'epic',slot:'trinket',atk:5,hp:10,spd:0,critRate:0.06,armor:0,forgeTime:28800,
    effect:'warcry',effectDesc:'击杀敌人叠加战意(最多10层)，每层+3%攻击力'},
  {id:'trinket3',name:'达拉然之心',icon:'💜',rarity:'legendary',slot:'trinket',atk:12,hp:30,spd:0,critRate:0.08,armor:0,forgeTime:43200,
    effect:'dalaran_heart',effectDesc:'每20秒召唤一道奥术能量柱(对区域内敌人持续造成ATK×50%/秒，持续4秒)'},
  {id:'trinket4',name:'暴风城奖章',icon:'🎖️',rarity:'epic',slot:'trinket',atk:3,hp:40,spd:0,critRate:0,armor:2,forgeTime:28800,
    effect:'medallion',effectDesc:'受到致命伤害时消耗奖章获得3秒无敌(CD60秒)'},
  {id:'trinket5',name:'不稳定的力量',icon:'⚡',rarity:'epic',slot:'trinket',atk:15,hp:-20,spd:0,critRate:0.10,armor:-1,forgeTime:28800,
    effect:'unstable_power',effectDesc:'攻击力+25%但受到伤害+15%，高风险高收益'},

  // ==================== 通用戒指 ====================
  {id:'ring1',name:'铜戒指',icon:'💍',rarity:'common',slot:'ring',atk:2,hp:5,spd:0,critRate:0.01,armor:0,forgeTime:7200},
  {id:'ring2',name:'黄金指环',icon:'💍',rarity:'rare',slot:'ring',atk:5,hp:10,spd:0.05,critRate:0.03,armor:0,forgeTime:14400},
  {id:'ring3',name:'风暴之戒',icon:'💍',rarity:'epic',slot:'ring',atk:8,hp:15,spd:0.1,critRate:0.05,armor:0,forgeTime:28800,
    effect:'storm',effectDesc:'技能伤害+12%'},
  {id:'ring4',name:'提瑞斯法守护者之戒',icon:'💍',rarity:'legendary',slot:'ring',atk:12,hp:25,spd:0.1,critRate:0.08,armor:0,forgeTime:43200,
    effect:'tirisfal',effectDesc:'每次技能释放有15%概率不触发CD(即连续释放)'},
  {id:'ring5',name:'嗜血指环',icon:'💍',rarity:'epic',slot:'ring',atk:10,hp:0,spd:0,critRate:0.12,armor:0,forgeTime:28800,
    effect:'bloodring',effectDesc:'暴击回复2%最大HP'},

  // ==================== 神话级装备（极稀有·超强特效） ====================
  {id:'myth_thunderfury',name:'雷霆之怒·逐风者的祝福之剑',icon:'⚡',rarity:'mythic',slot:'weapon',
    atk:35,hp:30,spd:0.2,critRate:0.10,armor:0,forgeTime:86400,
    effect:'thunderfury',effectDesc:'攻击释放链式闪电(跳5个目标，每个ATK×40%)，命中目标减速50%持续3秒'},
  {id:'myth_sulfuras',name:'萨弗拉斯·炎魔拉格纳罗斯之手',icon:'🔥',rarity:'mythic',slot:'weapon',
    atk:40,hp:50,spd:0,critRate:0.06,armor:3,forgeTime:86400,
    effect:'sulfuras',effectDesc:'攻击有20%概率触发熔岩爆发(对周围造成ATK×250%火焰伤害)，击杀时治疗5%HP'},
  {id:'myth_warglaive',name:'埃辛诺斯战刃',icon:'🔪',rarity:'mythic',slot:'weapon',
    atk:42,hp:0,spd:0.3,critRate:0.15,armor:0,forgeTime:86400,
    effect:'warglaive',effectDesc:'攻速+30%，每第3次攻击造成三倍伤害并回复3%HP'},
];

// ==================== 套装效果定义 ====================
// 当穿戴同一setId的装备达到N件时触发额外效果
const SET_BONUSES={
  wrath:{ // 战士: 怒火套装
    name:'⚔️ 怒火套装',pieces:['wp_gorehowl','ar_valorplate'],
    bonus2:{desc:'攻击力+15%，血量低于30%时攻速翻倍',atkPct:0.15,berserkerAtkSpd:true}
  },
  arcane:{ // 法师: 奥术套装
    name:'🔮 奥术套装',pieces:['wp_atiesh','ar_netherweave'],
    bonus2:{desc:'技能伤害+25%，技能暴击释放奥术冲击波',skillDmgPct:0.25,critArcaneWave:true}
  },
  wildspirit:{ // 猎人: 野性灵魂套装
    name:'🐾 野性灵魂套装',pieces:['wp_rhokdelar','ar_dragonstalker'],
    bonus2:{desc:'宠物攻击力+100%，宠物存在时英雄暴击+15%',petAtkMult:1.0,petCritBonus:0.15}
  },
  shadow_embrace:{ // 牧师: 暗影拥抱套装
    name:'💀 暗影拥抱套装',pieces:['wp_anathema','ar_mooncloth'],
    bonus2:{desc:'DOT伤害+40%，DOT回血效果+100%',dotDmgPct:0.40,dotHealMult:1.0}
  },
  nightslayer:{ // 盗贼: 暗夜杀手套装
    name:'🌑 暗夜杀手套装',pieces:['wp_perdition','ar_shadowleather'],
    bonus2:{desc:'暴击伤害+50%，连续暴击3次后释放暗影风暴(全屏)',critDmgBonus:0.50,shadowStormOnCritStreak:3}
  },
  earthfury:{ // 萨满: 大地之怒套装
    name:'🌊 大地之怒套装',pieces:['wp_doomhammer','ar_stormscale'],
    bonus2:{desc:'图腾伤害+60%，每个图腾额外回复2%HP/秒',totemDmgPct:0.60,totemHealPct:0.02}
  },
  icecrown:{ // 死骑: 冰冠套装
    name:'❄️ 冰冠套装',pieces:['wp_frostmourne_blade','ar_iceboundplate'],
    bonus2:{desc:'冰霜光环范围+50%，被冻结敌人受到的伤害+40%',frostAuraRangePct:0.50,frozenDmgBonus:0.40}
  },
  cenarion:{ // 德鲁伊: 塞纳里奥套装
    name:'🌿 塞纳里奥套装',pieces:['wp_dreambinder','ar_cenarion_vest'],
    bonus2:{desc:'变形不再有HP阈值限制(手动切换)，两种形态均获得全部加成',freeShapeshift:true,dualFormBonus:true}
  },
  nemesis:{ // 术士: 复仇套装
    name:'👿 复仇套装',pieces:['wp_soulharvester','ar_nemesis_robe'],
    bonus2:{desc:'诅咒爆炸范围+80%，击杀回复8%HP+召唤小恶魔(5秒)',curseExplosionRange:0.80,killSummonImp:true}
  },
  judgment:{ // 圣骑士: 审判套装
    name:'⚜️ 审判套装',pieces:['wp_ashkandi','ar_lawbringer'],
    bonus2:{desc:'神圣护盾CD-40%，护盾存在时攻击附带制裁之锤(眩晕0.5秒)',shieldCdReduction:0.40,hammerOfJustice:true}
  }
};

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

// ==================== 局内升级BUFF数据库 ====================
// 设计原则：升级时有概率出现BUFF选项（而非技能），增加策略维度
// 每个BUFF可叠加多次（maxStack），效果线性叠加
// 类别：经济型 / 防御型 / 攻击型 / 辅助型，形成不同build方向
const BUFF_DB = [
  // ===== 经济型 — 滚雪球流 =====
  {id:'buff_xp_boost',name:'求知欲',icon:'📖',
    desc:'经验获取+20%',category:'经济',color:'#44ddff',
    stat:'xpMult',val:0.20,maxStack:5,
    flavorText:'知识就是力量'},
  {id:'buff_gold_boost',name:'点金术',icon:'💰',
    desc:'金币掉落+25%',category:'经济',color:'#c9a44a',
    stat:'goldMult',val:0.25,maxStack:4,
    flavorText:'贪婪是一种美德'},
  {id:'buff_pickup_range',name:'磁力场',icon:'🧲',
    desc:'拾取范围+30%',category:'辅助',color:'#88aaff',
    stat:'pickupRange',val:0.30,maxStack:3,
    flavorText:'万物皆为我所用'},
  {id:'buff_orb_value',name:'悟性',icon:'✨',
    desc:'经验球价值+35%',category:'经济',color:'#aaffee',
    stat:'orbValue',val:0.35,maxStack:4,
    flavorText:'一颗顶三颗'},

  // ===== 攻击型 — 暴力输出流 =====
  {id:'buff_atk_pct',name:'狂战之力',icon:'⚔️',
    desc:'攻击力+12%',category:'攻击',color:'#ff6644',
    stat:'atkPct',val:0.12,maxStack:5,
    flavorText:'以力破巧'},
  {id:'buff_crit_rate',name:'鹰眼',icon:'🎯',
    desc:'暴击率+5%',category:'攻击',color:'#ff8844',
    stat:'critRate',val:0.05,maxStack:4,
    flavorText:'洞察一切弱点'},
  {id:'buff_crit_dmg',name:'致命打击',icon:'💥',
    desc:'暴击伤害+20%',category:'攻击',color:'#ff4444',
    stat:'critDmg',val:0.20,maxStack:3,
    flavorText:'一击毙命'},
  {id:'buff_atk_speed',name:'疾风',icon:'🌪️',
    desc:'攻击速度+10%',category:'攻击',color:'#ffaa44',
    stat:'atkSpeed',val:0.10,maxStack:4,
    flavorText:'天下武功唯快不破'},
  {id:'buff_skill_dmg',name:'奥术增幅',icon:'🔮',
    desc:'技能伤害+15%',category:'攻击',color:'#aa44ff',
    stat:'skillDmg',val:0.15,maxStack:4,
    flavorText:'魔力汹涌如潮'},

  // ===== 防御型 — 坦克流 =====
  {id:'buff_max_hp',name:'生命图腾',icon:'❤️',
    desc:'最大生命+15%',category:'防御',color:'#44ff88',
    stat:'hpPct',val:0.15,maxStack:5,
    flavorText:'血厚才是硬道理'},
  {id:'buff_armor',name:'铁壁',icon:'🛡️',
    desc:'护甲+3',category:'防御',color:'#8888cc',
    stat:'armor',val:3,maxStack:5,
    flavorText:'固若金汤'},
  {id:'buff_regen',name:'生命之泉',icon:'💚',
    desc:'每秒回复0.3%最大生命',category:'防御',color:'#44ff44',
    stat:'hpRegen',val:0.003,maxStack:5,
    flavorText:'源源不断'},
  {id:'buff_dodge',name:'灵动',icon:'💨',
    desc:'8%概率闪避攻击',category:'防御',color:'#aaddff',
    stat:'dodge',val:0.08,maxStack:3,
    flavorText:'打不中就是最好的防御'},

  // ===== 辅助型 — 特殊机制 =====
  {id:'buff_move_speed',name:'风行者',icon:'👟',
    desc:'移动速度+8%',category:'辅助',color:'#88ff88',
    stat:'moveSpd',val:0.08,maxStack:4,
    flavorText:'跑得快才活得久'},
  {id:'buff_skill_cd',name:'时空扭曲',icon:'⏱️',
    desc:'技能CD-8%',category:'辅助',color:'#44aaff',
    stat:'skillCd',val:0.08,maxStack:4,
    flavorText:'时间在我掌控之中'},
  {id:'buff_elite_dmg',name:'屠杀者',icon:'💀',
    desc:'对精英/BOSS伤害+20%',category:'攻击',color:'#ff2222',
    stat:'eliteDmg',val:0.20,maxStack:3,
    flavorText:'猎杀强者'},
  {id:'buff_leech',name:'吸血鬼',icon:'🩸',
    desc:'伤害的2%转化为生命',category:'防御',color:'#cc2244',
    stat:'leech',val:0.02,maxStack:3,
    flavorText:'以彼之血养我之身'},
  {id:'buff_thorns',name:'反伤甲',icon:'🦔',
    desc:'受到攻击时反弹15%伤害',category:'防御',color:'#cc8844',
    stat:'thorns',val:0.15,maxStack:3,
    flavorText:'碰我者皆伤'},
  {id:'buff_kill_heal',name:'收割之喜',icon:'🍀',
    desc:'击杀回复1%最大生命',category:'防御',color:'#44cc44',
    stat:'killHeal',val:0.01,maxStack:3,
    flavorText:'每一次击杀都是馈赠'},
  {id:'buff_aoe_size',name:'余震',icon:'🌊',
    desc:'AOE范围+15%',category:'辅助',color:'#6688ff',
    stat:'aoeSize',val:0.15,maxStack:3,
    flavorText:'波及四方'},
];

// BUFF出现概率：每次升级选择面板中至少1个选项为BUFF
const BUFF_APPEAR_CHANCE = 0.45;  // 每个技能槽位被替换为BUFF的概率
const BUFF_MIN_PER_PANEL = 1;     // 面板中最少BUFF数
const BUFF_MAX_PER_PANEL = 3;     // ↑ 2→3 面板中最多BUFF数，更多选择

// ==================== 数值工具函数（暴露给战斗系统） ====================
// 计算升级所需经验
function calcXpNeed(level){
  return Math.floor(NUM.XP_BASE * Math.pow(level, NUM.XP_POWER) + level * NUM.XP_LINEAR);
}
// 计算技能实际伤害 = (baseDmg * (1 + (lv-1)*dmgGrowth)) + heroAtk * atkRatio
function calcSkillDmg(skillData, skillLv, heroAtk){
  const base = skillData.baseDmg * (1 + (skillLv - 1) * skillData.dmgGrowth);
  return base + (heroAtk||0) * skillData.atkRatio;
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
// 设计：前4波线性增长（温水煮青蛙），第5波起叠加指数因子（压力骤增）
function calcEnemyStats(baseEnemy, wave, chapter){
  // 线性部分
  const linearHP = 1 + (wave - 1) * NUM.WAVE_HP_SCALE;
  const linearATK = 1 + (wave - 1) * NUM.WAVE_ATK_SCALE;
  const sm = 1 + (wave - 1) * NUM.WAVE_SPD_SCALE;
  const xm = 1 + (wave - 1) * NUM.WAVE_XP_SCALE;
  // 第5波起叠加指数因子: 1.08^(wave-4)，越往后越猛
  const expHP = wave > 4 ? Math.pow(1.08, wave - 4) : 1;
  const expATK = wave > 4 ? Math.pow(1.06, wave - 4) : 1;
  const wm = linearHP * expHP;
  const am = linearATK * expATK;
  // 无尽模式额外指数缩放（叠加在上面之上）
  let endlessMult = 1;
  if(chapter && chapter.endlessScale && wave > 5){
    endlessMult = Math.pow(1.15, wave - 5); // ↑ 1.12→1.15 无尽更陡
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

// ==================== 职业差异化天赋树系统 ====================
// 每个英雄有3条专属路线 × 5层，每层3选1
// 天赋按英雄ID存储: PD.talents[heroId][treeKey][tierIdx] = talentId
// 设计理念：参考暗黑/魔兽，每条路线代表不同玩法方向（build方向）
// 共用天赋工厂函数 — 减少重复
function _t(id,name,desc,stat,val){return{id,name,desc,stat,val}}

const HERO_TALENT_TREES = {
  // ==================== 战士天赋 ====================
  warrior:{
    fury:{name:'⚔️ 狂暴',desc:'疯狂输出·暴击爆发',color:'#ff3333',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('wf1a','嗜血打击','攻击力+10',  'atk',10),
          _t('wf1b','暴怒','暴击率+4%',       'critRate',0.04),
          _t('wf1c','狂怒','攻速+10%',        'atkSpeed',0.10)]},
        {lv:5,cost:1200,choices:[
          _t('wf2a','嗜血','击杀回血2%',      'killHeal',0.02),
          _t('wf2b','鲁莽','暴击伤害+35%',    'critDmg',0.35),
          _t('wf2c','怒击','血量<50%攻击+20%', 'berserker',0.20)]},
        {lv:10,cost:2500,choices:[
          _t('wf3a','斩杀本能','<30%HP敌人伤害+35%','execute',0.35),
          _t('wf3b','无尽怒火','暴击后2秒内攻速+30%','critHaste',0.30),
          _t('wf3c','战斗疯狂','击杀后3秒攻击+25%','killFrenzy',0.25)]},
        {lv:18,cost:5000,choices:[
          _t('wf4a','泰坦之力','攻击力+30, 暴击率+6%','atk+crit',{atk:30,critRate:0.06}),
          _t('wf4b','不死战神','血量<20%时免死一次/局','deathSave',0.20),
          _t('wf4c','破甲打击','无视25%护甲',  'armorPen',0.25)]},
        {lv:28,cost:10000,choices:[
          _t('wf5a','全属性+12%','',           'allPct',0.12),
          _t('wf5b','旋风大师','旋风斩范围+60%，命中回血','whirlwindMaster',{rangePct:0.60,healPct:0.02}),
          _t('wf5c','狂暴化身','血量<30%时全属性+25%','berserkerFull',0.25)]}
      ]},
    arms:{name:'🗡️ 武器',desc:'精通武器·持续伤害',color:'#cc6633',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('wa1a','利刃','攻击力+8',        'atk',8),
          _t('wa1b','致残','攻击减速敌人10%', 'atkSlow',0.10),
          _t('wa1c','穿透','技能伤害+8%',     'skillDmg',0.08)]},
        {lv:5,cost:1200,choices:[
          _t('wa2a','撕裂','攻击附带流血DOT(3秒ATK×20%)','bleedOnHit',0.20),
          _t('wa2b','深度伤口','流血/DOT伤害+25%','dotDmg',0.25),
          _t('wa2c','横扫','普攻溅射30%伤害给周围','cleave',0.30)]},
        {lv:10,cost:2500,choices:[
          _t('wa3a','精通武器','攻击力+20',    'atk',20),
          _t('wa3b','致死打击','每5次攻击必暴击','guaranteedCritInterval',5),
          _t('wa3c','战术大师','技能CD-12%',   'skillCdPct',0.12)]},
        {lv:18,cost:5000,choices:[
          _t('wa4a','剑刃风暴','技能暴击释放剑气', 'critWave',1),
          _t('wa4b','致命切割','暴击伤害+40%',  'critDmg',0.40),
          _t('wa4c','持久战','生命值+80, 护甲+4','hp+armor',{hp:80,armor:4})]},
        {lv:28,cost:10000,choices:[
          _t('wa5a','全属性+12%','',           'allPct',0.12),
          _t('wa5b','兵器专精','普攻伤害+50%', 'basicAtkDmg',0.50),
          _t('wa5c','不灭意志','致死10%免死+回20%HP','deathSaveHeal',{chance:0.10,heal:0.20})]}
      ]},
    protection:{name:'🛡️ 防护',desc:'钢铁堡垒·永不倒下',color:'#4488ff',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('wp1a','坚韧','生命值+40',       'hp',40),
          _t('wp1b','铁壁','护甲+3',          'armor',3),
          _t('wp1c','再生','每秒回血0.3%',    'regen',0.003)]},
        {lv:5,cost:1200,choices:[
          _t('wp2a','格挡','15%概率减伤50%',  'block',{chance:0.15,reduce:0.50}),
          _t('wp2b','报复','受伤反弹20%',     'thorns',0.20),
          _t('wp2c','坚毅','生命+80',         'hp',80)]},
        {lv:10,cost:2500,choices:[
          _t('wp3a','盾墙','受伤>15%HP触发护盾','shield',0.15),
          _t('wp3b','吸血','伤害3%转HP',      'leech',0.03),
          _t('wp3c','钢铁之躯','护甲+6, HP+50','armor+hp',{armor:6,hp:50})]},
        {lv:18,cost:5000,choices:[
          _t('wp4a','不朽','HP+120, 护甲+4',  'hp+armor',{hp:120,armor:4}),
          _t('wp4b','荆棘甲','反弹30%伤害',   'thorns',0.30),
          _t('wp4c','援护','受伤时10%触发免伤3秒','dmgImmune',{chance:0.10,dur:3.0})]},
        {lv:28,cost:10000,choices:[
          _t('wp5a','全属性+12%','',           'allPct',0.12),
          _t('wp5b','圣盾','开局获得25%HP护盾','startShield',0.25),
          _t('wp5c','涅槃','死亡50%复活(35%HP)','revive',{chance:0.50,hp:0.35})]}
      ]}
  },

  // ==================== 法师天赋 ====================
  mage:{
    fire:{name:'🔥 火焰',desc:'燃烧一切·最大输出',color:'#ff4400',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('mf1a','烈焰之心','攻击力+10',   'atk',10),
          _t('mf1b','点燃','燃烧DOT伤害+20%', 'igniteDmg',0.20),
          _t('mf1c','热情','技能伤害+8%',      'skillDmg',0.08)]},
        {lv:5,cost:1200,choices:[
          _t('mf2a','炙热连击','连续命中同目标伤害递增','hotStreak',0.10),
          _t('mf2b','散射','火焰技能溅射+30%', 'fireSplash',0.30),
          _t('mf2c','暴击率+5%','',            'critRate',0.05)]},
        {lv:10,cost:2500,choices:[
          _t('mf3a','燃烧','DOT暴击率+15%',   'dotCritRate',0.15),
          _t('mf3b','淬火','暴击伤害+40%',     'critDmg',0.40),
          _t('mf3c','焰涌','击杀时30%概率免费释放火球','killFireball',0.30)]},
        {lv:18,cost:5000,choices:[
          _t('mf4a','燃尽','技能伤害+20%',     'skillDmg',0.20),
          _t('mf4b','活体炸弹大师','爆炸范围+60%,伤害+30%','livingbombMaster',{rangePct:0.60,dmgPct:0.30}),
          _t('mf4c','烈焰之魂','攻击力+25, 暴击+6%','atk+crit',{atk:25,critRate:0.06})]},
        {lv:28,cost:10000,choices:[
          _t('mf5a','全属性+12%','',           'allPct',0.12),
          _t('mf5b','陨石风暴','技能暴击召唤火流星','critMeteor',1),
          _t('mf5c','不灭火焰','死亡时火焰爆发(全屏)+复活20%HP','fireRebirth',{reviveHp:0.20})]}
      ]},
    frost:{name:'❄️ 冰霜',desc:'冻结控制·安全输出',color:'#44ccff',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('mc1a','冰霜之力','攻击力+8',    'atk',8),
          _t('mc1b','冰封','冻结时间+20%',     'freezeDur',0.20),
          _t('mc1c','寒冰护甲','护甲+3',      'armor',3)]},
        {lv:5,cost:1200,choices:[
          _t('mc2a','冰枪术','被冻结敌人受伤+30%','frozenDmgBonus',0.30),
          _t('mc2b','寒冰屏障','每20秒获得15%HP冰盾','iceShield',0.15),
          _t('mc2c','极寒','减速效果+25%',     'slowEnhance',0.25)]},
        {lv:10,cost:2500,choices:[
          _t('mc3a','冰锥术','冰系AOE范围+40%','frostAoePct',0.40),
          _t('mc3b','冰冷凝视','暴击率+6%, 暴击冻结','critRate',0.06),
          _t('mc3c','冰甲','生命+60, 护甲+3', 'hp+armor',{hp:60,armor:3})]},
        {lv:18,cost:5000,choices:[
          _t('mc4a','寒冰之心','技能伤害+15%, CD-10%','skillDmg+cd',{skillDmg:0.15,skillCd:0.10}),
          _t('mc4b','暴风雪大师','暴风雪持续时间+100%','blizzardMaster',1.0),
          _t('mc4c','冰霜新星大师','霜冻新星范围+50%,伤害+30%','frostnovaMaster',{rangePct:0.50,dmgPct:0.30})]},
        {lv:28,cost:10000,choices:[
          _t('mc5a','全属性+12%','',           'allPct',0.12),
          _t('mc5b','绝对零度','所有冰系技能有10%概率瞬杀非BOSS','frostInstakill',0.10),
          _t('mc5c','冰晶护体','致死免死+冻结全屏3秒','frostDeathSave',1)]}
      ]},
    arcane:{name:'🔮 奥术',desc:'万能增幅·资源优势',color:'#aa44ff',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('ma1a','奥术智慧','经验+15%',    'xpBonus',0.15),
          _t('ma1b','奥术增幅','技能伤害+10%', 'skillDmg',0.10),
          _t('ma1c','时空扭曲','技能CD-8%',   'skillCdPct',0.08)]},
        {lv:5,cost:1200,choices:[
          _t('ma2a','奥术飞弹','额外技能选项+1','extraSkillChoice',1),
          _t('ma2b','魔力涌动','暴击后技能无CD2秒','critNoCd',2.0),
          _t('ma2c','传送门','移速+0.8',       'spd',0.8)]},
        {lv:10,cost:2500,choices:[
          _t('ma3a','精通奥术','攻击力+18, 技能伤害+10%','atk+skillDmg',{atk:18,skillDmg:0.10}),
          _t('ma3b','幸运星','传说技能出现率+25%','legendRate',0.25),
          _t('ma3c','博学','经验+30%',         'xpBonus',0.30)]},
        {lv:18,cost:5000,choices:[
          _t('ma4a','天命','开局获得1个免费技能','freeSkill',1),
          _t('ma4b','时光倒流','每局可重选1次技能','rerollSkill',1),
          _t('ma4c','奥术爆炸','技能暴击释放奥术波','critWave',1)]},
        {lv:28,cost:10000,choices:[
          _t('ma5a','全属性+12%','',           'allPct',0.12),
          _t('ma5b','欧皇','选技能5%概率免费多选1个','doubleSkill',0.05),
          _t('ma5c','奥术之主','全技能伤害+30%','skillDmg',0.30)]}
      ]}
  },

  // ==================== 猎人天赋 ====================
  hunter:{
    beastmastery:{name:'🐾 野兽',desc:'宠物为王·召唤大军',color:'#33aa33',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('hb1a','野性呼唤','宠物攻击力+20%','petAtkPct',0.20),
          _t('hb1b','兽心','宠物持续时间+30%', 'petDurPct',0.30),
          _t('hb1c','动物本能','攻击力+8',     'atk',8)]},
        {lv:5,cost:1200,choices:[
          _t('hb2a','凶猛','宠物暴击率+15%',   'petCritRate',0.15),
          _t('hb2b','多重野兽','宠物同时存在数+1','petCount',1),
          _t('hb2c','兽群','宠物在场时英雄攻速+15%','petHaste',0.15)]},
        {lv:10,cost:2500,choices:[
          _t('hb3a','狂怒','宠物攻击力+40%',   'petAtkPct',0.40),
          _t('hb3b','治愈之噬','宠物攻击回血1%','petHeal',0.01),
          _t('hb3c','野性护甲','宠物在场时护甲+5','petArmor',5)]},
        {lv:18,cost:5000,choices:[
          _t('hb4a','异域宠物','宠物变为精英级(ATK+100%,HP+200%)','elitePet',{atkMult:1.0,hpMult:2.0}),
          _t('hb4b','兽群领袖','每个宠物增加5%全属性','petAllPctEach',0.05),
          _t('hb4c','攻击力+25, 暴击+5%','',   'atk+crit',{atk:25,critRate:0.05})]},
        {lv:28,cost:10000,choices:[
          _t('hb5a','全属性+12%','',           'allPct',0.12),
          _t('hb5b','末日兽王','宠物死亡时爆炸造成巨额AOE','petDeathBomb',1),
          _t('hb5c','永恒之兽','宠物永不消失',  'petPermanent',1)]}
      ]},
    marksmanship:{name:'🎯 射击',desc:'精准致命·远程狙杀',color:'#ff8833',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('hm1a','精准','攻击力+10',        'atk',10),
          _t('hm1b','稳固射击','暴击率+4%',    'critRate',0.04),
          _t('hm1c','射程+15%','',             'rangePct',0.15)]},
        {lv:5,cost:1200,choices:[
          _t('hm2a','连射','攻速+12%',         'atkSpeed',0.12),
          _t('hm2b','穿甲弹','无视15%护甲',   'armorPen',0.15),
          _t('hm2c','爆头','暴击伤害+35%',     'critDmg',0.35)]},
        {lv:10,cost:2500,choices:[
          _t('hm3a','瞄准射击大师','瞄准射击伤害+50%','aimedShotBonus',0.50),
          _t('hm3b','多重射击大师','多重射击数量+4','multiShotBonus',4),
          _t('hm3c','急速射击','攻速+15%, 暴击率+3%','atkSpeed+crit',{atkSpeed:0.15,critRate:0.03})]},
        {lv:18,cost:5000,choices:[
          _t('hm4a','弹无虚发','攻击力+30',    'atk',30),
          _t('hm4b','致命射手','暴击伤害+50%', 'critDmg',0.50),
          _t('hm4c','狙杀','对BOSS伤害+30%',   'bossDmg',0.30)]},
        {lv:28,cost:10000,choices:[
          _t('hm5a','全属性+12%','',           'allPct',0.12),
          _t('hm5b','终极射手','暴击伤害翻倍(+100%)','critDmg',1.0),
          _t('hm5c','箭雨','普攻变为范围攻击', 'basicAoeAtk',1)]}
      ]},
    survival:{name:'🏕️ 生存',desc:'陷阱控制·灵活多变',color:'#88cc44',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('hs1a','耐力','生命+35',          'hp',35),
          _t('hs1b','蒙戈切割','击杀回1.5%HP', 'killHeal',0.015),
          _t('hs1c','移速+0.4','',             'spd',0.4)]},
        {lv:5,cost:1200,choices:[
          _t('hs2a','陷阱大师','陷阱伤害+40%', 'trapDmg',0.40),
          _t('hs2b','逃脱专家','闪避+10%',     'dodge',0.10),
          _t('hs2c','自然治愈','每秒回血0.4%', 'regen',0.004)]},
        {lv:10,cost:2500,choices:[
          _t('hs3a','毒蛇钉刺','攻击附带毒素DOT','poisonOnHit',0.15),
          _t('hs3b','跃进','闪避后获得3秒移速+50%','dodgeSpeedBoost',0.50),
          _t('hs3c','野性本能','HP+60, 护甲+3','hp+armor',{hp:60,armor:3})]},
        {lv:18,cost:5000,choices:[
          _t('hs4a','拼死一搏','HP<30%时闪避+25%','lowHpDodge',0.25),
          _t('hs4b','精钢陷阱','陷阱眩晕2秒',  'trapStun',2.0),
          _t('hs4c','适者生存','全属性+8%, HP+50','allPct+hp',{allPct:0.08,hp:50})]},
        {lv:28,cost:10000,choices:[
          _t('hs5a','全属性+12%','',           'allPct',0.12),
          _t('hs5b','不死鸟','死亡时25%复活(40%HP)','revive',{chance:0.25,hp:0.40}),
          _t('hs5c','荒野之力','击杀回3%HP+攻击力+10%持续5秒','killSurge',{healPct:0.03,atkPct:0.10,dur:5})]}
      ]}
  },

  // ==================== 牧师天赋 ====================
  priest:{
    shadow:{name:'💀 暗影',desc:'DOT毁灭·暗影之力',color:'#7733aa',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('ps1a','暗影之力','攻击力+10',    'atk',10),
          _t('ps1b','暗影凝聚','DOT伤害+15%', 'dotDmg',0.15),
          _t('ps1c','虚空触碰','暴击率+4%',   'critRate',0.04)]},
        {lv:5,cost:1200,choices:[
          _t('ps2a','暗影传播','DOT有15%概率传播','dotSpread',0.15),
          _t('ps2b','虚空箭','技能伤害+12%',   'skillDmg',0.12),
          _t('ps2c','暗影吸取','DOT回血+100%', 'dotHealMult',1.0)]},
        {lv:10,cost:2500,choices:[
          _t('ps3a','暗影形态增强','暗影形态额外+15%减伤','shadowFormDmgRed',0.15),
          _t('ps3b','心灵恐慌','恐惧持续+1秒', 'fearDurBonus',1.0),
          _t('ps3c','虚空之拥','攻击力+20, DOT+10%','atk+dotDmg',{atk:20,dotDmg:0.10})]},
        {lv:18,cost:5000,choices:[
          _t('ps4a','暗影疫病','所有攻击附带暗影DOT','allDot',1),
          _t('ps4b','暗言术精通','暗言术标记数+3','shadowWordMarks',3),
          _t('ps4c','暗影大师','技能伤害+20%, 暴击+6%','skillDmg+crit',{skillDmg:0.20,critRate:0.06})]},
        {lv:28,cost:10000,choices:[
          _t('ps5a','全属性+12%','',           'allPct',0.12),
          _t('ps5b','虚空爆发','引爆所有DOT造成瞬间伤害','voidEruption',1),
          _t('ps5c','暗影之主','DOT伤害+50%, DOT回血+50%','dotMaster',{dotDmg:0.50,dotHeal:0.50})]}
      ]},
    discipline:{name:'✝️ 戒律',desc:'攻守兼备·伤害即治疗',color:'#ffcc44',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('pd1a','智慧','攻击力+8',         'atk',8),
          _t('pd1b','赎罪','伤害的2%转为HP',   'leech',0.02),
          _t('pd1c','力量之言','生命+30',      'hp',30)]},
        {lv:5,cost:1200,choices:[
          _t('pd2a','苦修','造成伤害的4%回HP', 'leech',0.04),
          _t('pd2b','真言术盾','每15秒获得10%HP护盾','autoShield',{cd:15,pct:0.10}),
          _t('pd2c','圣光打击','攻击附带圣光伤害+15%','holyDmg',0.15)]},
        {lv:10,cost:2500,choices:[
          _t('pd3a','赎罪大师','吸血效果+100%','leechMult',1.0),
          _t('pd3b','痛苦压制','暴击率+5%, 技能伤害+10%','critRate+skillDmg',{critRate:0.05,skillDmg:0.10}),
          _t('pd3c','坚定信仰','HP+60, 护甲+3','hp+armor',{hp:60,armor:3})]},
        {lv:18,cost:5000,choices:[
          _t('pd4a','灵光','吸血上限从6%→12%', 'leechCap',0.12),
          _t('pd4b','神圣之火','攻击力+25, 技能伤害+15%','atk+skillDmg',{atk:25,skillDmg:0.15}),
          _t('pd4c','庇护所','受伤>20%HP时3秒内减伤40%','dmgRedOnBigHit',{threshold:0.20,reduce:0.40})]},
        {lv:28,cost:10000,choices:[
          _t('pd5a','全属性+12%','',           'allPct',0.12),
          _t('pd5b','暗涌光明','攻击同时治疗(伤害的10%转HP)','megaLeech',0.10),
          _t('pd5c','守护灵魂','死亡时100%复活(50%HP,1次/局)','revive',{chance:1.0,hp:0.50})]}
      ]},
    holy:{name:'💚 神圣',desc:'极致治疗·永不倒下',color:'#44ff88',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('ph1a','恢复','每秒回血0.3%',    'regen',0.003),
          _t('ph1b','生命','HP+40',            'hp',40),
          _t('ph1c','韧性','护甲+2',           'armor',2)]},
        {lv:5,cost:1200,choices:[
          _t('ph2a','快速治愈','治疗技能CD-20%','healCdPct',0.20),
          _t('ph2b','生命之泉','最大HP+15%',   'hpPct',0.15),
          _t('ph2c','守护者','击杀回2%HP',     'killHeal',0.02)]},
        {lv:10,cost:2500,choices:[
          _t('ph3a','神圣新星','回血时同时对周围造成伤害','healDmg',1),
          _t('ph3b','坚韧','HP+80, 回血+0.3%/秒','hp+regen',{hp:80,regen:0.003}),
          _t('ph3c','灵魂链接','受伤时自动回复10%伤害量','dmgHealback',0.10)]},
        {lv:18,cost:5000,choices:[
          _t('ph4a','天使形态','HP<20%时每秒回4%HP','angelRegen',0.04),
          _t('ph4b','圣疗强化','大招治疗+50%', 'healBoost',0.50),
          _t('ph4c','不朽','HP+100, 护甲+4',  'hp+armor',{hp:100,armor:4})]},
        {lv:28,cost:10000,choices:[
          _t('ph5a','全属性+12%','',           'allPct',0.12),
          _t('ph5b','守护天使','死亡时100%复活(80%HP)','revive',{chance:1.0,hp:0.80}),
          _t('ph5c','光之涌动','全回血效果+60%','allHealBoost',0.60)]}
      ]}
  },

  // ==================== 盗贼天赋 ====================
  rogue:{
    assassination:{name:'🗡️ 刺杀',desc:'毒药暴击·致命一击',color:'#33aa33',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('ra1a','毒刃','攻击附带毒素DOT', 'poisonOnHit',0.12),
          _t('ra1b','致命之刃','暴击率+5%',    'critRate',0.05),
          _t('ra1c','敏捷','攻击力+10',        'atk',10)]},
        {lv:5,cost:1200,choices:[
          _t('ra2a','深入骨髓','毒素伤害+30%', 'poisonDmg',0.30),
          _t('ra2b','刺客信条','暴击伤害+40%', 'critDmg',0.40),
          _t('ra2c','迅猛毒药','攻速+12%',     'atkSpeed',0.12)]},
        {lv:10,cost:2500,choices:[
          _t('ra3a','毒伤大师','毒素有20%概率瞬发双倍伤害','poisonCrit',0.20),
          _t('ra3b','暗杀者','<30%HP敌人伤害+40%','execute',0.40),
          _t('ra3c','剧毒','中毒敌人受到的所有伤害+15%','poisonVulnerable',0.15)]},
        {lv:18,cost:5000,choices:[
          _t('ra4a','刺骨','暴击伤害+60%',     'critDmg',0.60),
          _t('ra4b','毒爆','中毒敌人死亡爆炸', 'poisonExplode',1),
          _t('ra4c','影子打击精通','暗影突袭伤害+100%','shadowStrikeMaster',1.0)]},
        {lv:28,cost:10000,choices:[
          _t('ra5a','全属性+12%','',           'allPct',0.12),
          _t('ra5b','死亡标记','标记敌人，8秒后引爆全部伤害×150%','deathMark',1.50),
          _t('ra5c','暗影之刃','每次暴击100%概率连暴','guaranteedDoubleСrit',1)]}
      ]},
    outlaw:{name:'⚔️ 狂徒',desc:'乱斗狂暴·概率为王',color:'#ff6644',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('ro1a','好斗','攻击力+8',         'atk',8),
          _t('ro1b','运气','暴击率+3%',         'critRate',0.03),
          _t('ro1c','急速','攻速+8%',           'atkSpeed',0.08)]},
        {lv:5,cost:1200,choices:[
          _t('ro2a','卷刃','击杀回1.5%HP',     'killHeal',0.015),
          _t('ro2b','骰子','每次攻击随机+0-30%伤害','rollDmg',0.30),
          _t('ro2c','闪击','移速+0.6',          'spd',0.6)]},
        {lv:10,cost:2500,choices:[
          _t('ro3a','刃舞精通','刃舞范围+40%', 'bladeDancePct',0.40),
          _t('ro3b','冒险者','金币掉落+30%, 经验+20%','gold+xp',{goldBonus:0.30,xpBonus:0.20}),
          _t('ro3c','老千','暴击率+6%, 闪避+8%','critRate+dodge',{critRate:0.06,dodge:0.08})]},
        {lv:18,cost:5000,choices:[
          _t('ro4a','连续好运','暴击后3秒内再次暴击概率+20%','critStreak',0.20),
          _t('ro4b','海盗之力','攻击力+25, 攻速+10%','atk+atkSpeed',{atk:25,atkSpeed:0.10}),
          _t('ro4c','金蝉脱壳','受伤>20%HP时闪避+30%持续3秒','emergencyDodge',{threshold:0.20,dodge:0.30})]},
        {lv:28,cost:10000,choices:[
          _t('ro5a','全属性+12%','',           'allPct',0.12),
          _t('ro5b','大富翁','金币×2, 每100金币+1%攻击力','goldPower',{goldMult:2,goldToAtk:0.01}),
          _t('ro5c','王牌','每次攻击5%概率造成10倍伤害','jackpot',{chance:0.05,mult:10})]}
      ]},
    subtlety:{name:'🌑 敏锐',desc:'暗影伏击·瞬间秒杀',color:'#333366',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('rs1a','暗影步','移速+0.4',       'spd',0.4),
          _t('rs1b','暗影之力','攻击力+8',      'atk',8),
          _t('rs1c','消失','闪避+8%',           'dodge',0.08)]},
        {lv:5,cost:1200,choices:[
          _t('rs2a','伏击','首次攻击伤害+80%', 'firstStrikeDmg',0.80),
          _t('rs2b','暗影舞步增强','影舞额外攻击+2次','shadowDanceStrikes',2),
          _t('rs2c','夜行者','闪避+10%',        'dodge',0.10)]},
        {lv:10,cost:2500,choices:[
          _t('rs3a','致盲毒药','攻击有15%概率致盲敌人(停止2秒)','blindOnHit',{chance:0.15,dur:2.0}),
          _t('rs3b','暗影之拥','暴击后2秒内免疫控制','critImmune',2.0),
          _t('rs3c','影遁','受伤>15%HP时60%概率闪避后续1秒','shadowEvade',{threshold:0.15,chance:0.60})]},
        {lv:18,cost:5000,choices:[
          _t('rs4a','暗影强化','所有暗影技能伤害+30%','shadowSkillDmg',0.30),
          _t('rs4b','暗影碎片','击杀产生暗影碎片攻击周围','killShadowShard',1),
          _t('rs4c','无形','闪避率+15%, 闪避后回2%HP','dodge+healOnDodge',{dodge:0.15,healOnDodge:0.02})]},
        {lv:28,cost:10000,choices:[
          _t('rs5a','全属性+12%','',           'allPct',0.12),
          _t('rs5b','暗影之王','影舞CD-50%, 伤害+100%','shadowDanceMaster',{cdReduction:0.50,dmgMult:1.0}),
          _t('rs5c','致命暗影','暴击伤害+100%','critDmg',1.0)]}
      ]}
  },

  // ==================== 萨满天赋 ====================
  shaman:{
    elemental:{name:'⚡ 元素',desc:'雷火齐发·元素毁灭',color:'#ff8800',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('se1a','雷暴','攻击力+10',        'atk',10),
          _t('se1b','元素之怒','技能伤害+8%',  'skillDmg',0.08),
          _t('se1c','闪电专注','暴击率+4%',    'critRate',0.04)]},
        {lv:5,cost:1200,choices:[
          _t('se2a','熔岩增幅','熔岩技能伤害+30%','lavaDmg',0.30),
          _t('se2b','余震','技能命中后2秒内再次命中伤害+20%','aftershock',0.20),
          _t('se2c','暴击伤害+35%','',         'critDmg',0.35)]},
        {lv:10,cost:2500,choices:[
          _t('se3a','元素超载','技能有25%概率触发两次','overload',0.25),
          _t('se3b','风暴之眼','技能CD-12%',   'skillCdPct',0.12),
          _t('se3c','元素精通','攻击力+20, 技能伤害+10%','atk+skillDmg',{atk:20,skillDmg:0.10})]},
        {lv:18,cost:5000,choices:[
          _t('se4a','升腾','元素技能暴击后无CD2秒','elemCritNoCd',2.0),
          _t('se4b','雷霆风暴','闪电链跳跃次数+3','chainLightBonus',3),
          _t('se4c','地震大师','地震术范围+50%,伤害+30%','earthquakeMaster',{rangePct:0.50,dmgPct:0.30})]},
        {lv:28,cost:10000,choices:[
          _t('se5a','全属性+12%','',           'allPct',0.12),
          _t('se5b','元素之王','所有元素技能伤害+40%','allElemDmg',0.40),
          _t('se5c','风暴化身','全技能无CD持续5秒(CD30秒)','stormBurst',{dur:5,cd:30})]}
      ]},
    enhancement:{name:'🔨 增强',desc:'近战风暴·元素武器',color:'#44aaff',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('sh1a','风暴打击','攻击力+8',     'atk',8),
          _t('sh1b','风怒','攻速+10%',          'atkSpeed',0.10),
          _t('sh1c','大地之力','护甲+3',        'armor',3)]},
        {lv:5,cost:1200,choices:[
          _t('sh2a','风怒武器','攻击有20%概率额外攻击','windFury',0.20),
          _t('sh2b','火舌武器','攻击附带火焰伤害+15%','flametongue',0.15),
          _t('sh2c','冰封武器','攻击减速+20%', 'frostbrandSlow',0.20)]},
        {lv:10,cost:2500,choices:[
          _t('sh3a','嗜血','攻速+20%, 持续6秒CD15秒','bloodlust',{atkSpeed:0.20,dur:6,cd:15}),
          _t('sh3b','石肤','HP+60, 护甲+4',    'hp+armor',{hp:60,armor:4}),
          _t('sh3c','大地打击','攻击有10%概率眩晕2秒','stunOnHit',{chance:0.10,dur:2.0})]},
        {lv:18,cost:5000,choices:[
          _t('sh4a','风暴大师','风暴打击伤害+50%','stormStrikeDmg',0.50),
          _t('sh4b','元素武器','所有武器附魔效果+100%','elemWeaponMult',1.0),
          _t('sh4c','攻击力+30, 攻速+12%','',  'atk+atkSpeed',{atk:30,atkSpeed:0.12})]},
        {lv:28,cost:10000,choices:[
          _t('sh5a','全属性+12%','',           'allPct',0.12),
          _t('sh5b','毁灭之锤精通','触发风暴打击时额外闪电AOE','doomhammerMaster',1),
          _t('sh5c','先祖之力','全属性+15%',   'allPct',0.15)]}
      ]},
    restoration:{name:'💧 恢复',desc:'图腾治疗·团队支援',color:'#44ff88',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('sr1a','治愈之水','每秒回血0.3%', 'regen',0.003),
          _t('sr1b','生命+35','',               'hp',35),
          _t('sr1c','图腾增幅','图腾持续+20%', 'totemDurPct',0.20)]},
        {lv:5,cost:1200,choices:[
          _t('sr2a','治愈图腾','图腾额外回血1%/秒','totemHeal',0.01),
          _t('sr2b','大地之盾','每20秒获得12%HP护盾','earthShield',{cd:20,pct:0.12}),
          _t('sr2c','潮汐之力','回血效果+25%', 'healBoost',0.25)]},
        {lv:10,cost:2500,choices:[
          _t('sr3a','激流','击杀回3%HP',        'killHeal',0.03),
          _t('sr3b','大地之母','HP+80, 护甲+3','hp+armor',{hp:80,armor:3}),
          _t('sr3c','净化','图腾范围+40%',      'totemRangePct',0.40)]},
        {lv:18,cost:5000,choices:[
          _t('sr4a','先祖图腾','图腾CD-30%',   'totemCdPct',0.30),
          _t('sr4b','治疗之雨增强','治疗之雨治疗量+100%','healingRainMaster',1.0),
          _t('sr4c','不朽','HP+100, 护甲+4',   'hp+armor',{hp:100,armor:4})]},
        {lv:28,cost:10000,choices:[
          _t('sr5a','全属性+12%','',           'allPct',0.12),
          _t('sr5b','涅槃','死亡60%复活(40%HP)','revive',{chance:0.60,hp:0.40}),
          _t('sr5c','永恒图腾','图腾不消失',    'totemPermanent',1)]}
      ]}
  },

  // ==================== 死骑天赋 ====================
  deathknight:{
    frost_dk:{name:'❄️ 冰霜',desc:'冰冻控制·持续压制',color:'#44ccff',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('df1a','冰霜之力','攻击力+10',    'atk',10),
          _t('df1b','寒冰之握','减速效果+20%', 'slowEnhance',0.20),
          _t('df1c','冰甲','护甲+3',           'armor',3)]},
        {lv:5,cost:1200,choices:[
          _t('df2a','冰锋','攻击附带冰霜伤害+15%','frostDmg',0.15),
          _t('df2b','寒冰打击','被冻结敌人受伤+25%','frozenDmgBonus',0.25),
          _t('df2c','冻骨','冰霜光环范围+30%', 'frostAuraRange',0.30)]},
        {lv:10,cost:2500,choices:[
          _t('df3a','冰霜打击','暴击率+5%, 暴击冻结','critRate+freeze',{critRate:0.05,critFreeze:true}),
          _t('df3b','冰封之躯','HP+60, 每秒回血0.3%','hp+regen',{hp:60,regen:0.003}),
          _t('df3c','寒冰穿刺','冰系技能无视20%护甲','frostArmorPen',0.20)]},
        {lv:18,cost:5000,choices:[
          _t('df4a','绝对零度','冰系技能伤害+25%','frostSkillDmg',0.25),
          _t('df4b','冰霜之怒','攻击力+25, 冰霜光环伤害+30%','atk+aura',{atk:25,auraDmg:0.30}),
          _t('df4c','寒冬之力','被冻结敌人受伤+50%','frozenDmgBonus',0.50)]},
        {lv:28,cost:10000,choices:[
          _t('df5a','全属性+12%','',           'allPct',0.12),
          _t('df5b','凛冬之王','冰霜光环伤害+100%, 范围+50%','frostMaster',{auraDmg:1.0,auraRange:0.50}),
          _t('df5c','冰封万物','所有攻击100%减速50%','permaSlow',{slowPct:0.50})]}
      ]},
    unholy:{name:'☠️ 邪恶',desc:'亡灵大军·瘟疫蔓延',color:'#66cc33',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('du1a','亡灵之力','攻击力+8',     'atk',8),
          _t('du1b','腐蚀','攻击附加腐蚀DOT', 'unholyDot',0.10),
          _t('du1c','召唤增强','亡灵仆从伤害+20%','summonDmg',0.20)]},
        {lv:5,cost:1200,choices:[
          _t('du2a','疫病','DOT传播给周围敌人','dotSpread',0.20),
          _t('du2b','亡者增强','亡灵仆从数量+2','ghoulCountBonus',2),
          _t('du2c','暗影打击','技能伤害+12%', 'skillDmg',0.12)]},
        {lv:10,cost:2500,choices:[
          _t('du3a','瘟疫打击','DOT伤害+30%', 'dotDmg',0.30),
          _t('du3b','死亡契约','牺牲亡灵回30%HP','deathPact',0.30),
          _t('du3c','暗影灌注','攻击力+18, 暗影伤害+15%','atk+shadowDmg',{atk:18,shadowDmg:0.15})]},
        {lv:18,cost:5000,choices:[
          _t('du4a','亡者大军增强','亡者大军持续+50%','armyDurPct',0.50),
          _t('du4b','瘟疫大师','所有DOT伤害+40%','dotDmg',0.40),
          _t('du4c','死亡缠绕','击杀回3%HP并召唤1个亡灵','killGhoul',{heal:0.03,ghoul:1})]},
        {lv:28,cost:10000,choices:[
          _t('du5a','全属性+12%','',           'allPct',0.12),
          _t('du5b','天启','召唤4个强化亡灵骑士','apocalypse',4),
          _t('du5c','死亡领主','亡灵仆从永不消失,伤害+60%','ghoulPermanent',{permanent:true,dmgPct:0.60})]}
      ]},
    blood:{name:'🩸 鲜血',desc:'吸血坦克·不死战神',color:'#cc2244',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('db1a','鲜血打击','击杀回1.5%HP', 'killHeal',0.015),
          _t('db1b','坚韧','HP+40',            'hp',40),
          _t('db1c','骨盾','护甲+3',           'armor',3)]},
        {lv:5,cost:1200,choices:[
          _t('db2a','吸血打击','伤害的3%转HP', 'leech',0.03),
          _t('db2b','骨盾强化','15%概率减伤50%','block',{chance:0.15,reduce:0.50}),
          _t('db2c','鲜血之力','攻击力+12',    'atk',12)]},
        {lv:10,cost:2500,choices:[
          _t('db3a','灭杀增强','灭杀打击吸血+50%','deathStrikeLeech',0.50),
          _t('db3b','血液沸腾','被击时20%概率AOE反击','bloodBoil',0.20),
          _t('db3c','不朽之躯','HP+80, 护甲+5','hp+armor',{hp:80,armor:5})]},
        {lv:18,cost:5000,choices:[
          _t('db4a','鲜血之盾','伤害的5%转为护盾','dmgToShield',0.05),
          _t('db4b','墓穴守卫','HP<30%时护甲翻倍','lowHpArmorMult',2.0),
          _t('db4c','血之力量','攻击力+25, 吸血+3%','atk+leech',{atk:25,leech:0.03})]},
        {lv:28,cost:10000,choices:[
          _t('db5a','全属性+12%','',           'allPct',0.12),
          _t('db5b','不死之身','死亡时80%复活(50%HP)','revive',{chance:0.80,hp:0.50}),
          _t('db5c','血族','吸血上限不限，伤害的8%转HP','megaLeech',0.08)]}
      ]}
  },

  // ==================== 德鲁伊天赋 ====================
  druid:{
    balance:{name:'🌙 平衡',desc:'日月交替·远程轰炸',color:'#aa88ff',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('dba1a','月光','攻击力+10',       'atk',10),
          _t('dba1b','星辰','暴击率+4%',       'critRate',0.04),
          _t('dba1c','日光','技能伤害+8%',     'skillDmg',0.08)]},
        {lv:5,cost:1200,choices:[
          _t('dba2a','月火增强','月火术DOT伤害+30%','moonfireDmg',0.30),
          _t('dba2b','星辰坠落增强','陨石数量+2','starfallBonus',2),
          _t('dba2c','自然之力','暴击伤害+35%','critDmg',0.35)]},
        {lv:10,cost:2500,choices:[
          _t('dba3a','日蚀','技能伤害+15%, CD-8%','skillDmg+cd',{skillDmg:0.15,skillCd:0.08}),
          _t('dba3b','月蚀','DOT暴击率+15%',   'dotCritRate',0.15),
          _t('dba3c','星界能量','攻击力+20',    'atk',20)]},
        {lv:18,cost:5000,choices:[
          _t('dba4a','化身精通','化身持续+100%','incarnDurPct',1.0),
          _t('dba4b','星辰之力','技能伤害+20%,暴击+5%','skillDmg+crit',{skillDmg:0.20,critRate:0.05}),
          _t('dba4c','大自然的平衡','攻击力+25,HP+60','atk+hp',{atk:25,hp:60})]},
        {lv:28,cost:10000,choices:[
          _t('dba5a','全属性+12%','',          'allPct',0.12),
          _t('dba5b','星界形态','远程攻击穿透一切，AOE+50%','astralForm',{aoe:0.50,pierce:true}),
          _t('dba5c','自然之怒','全技能伤害+35%','skillDmg',0.35)]}
      ]},
    feral:{name:'🐱 野性',desc:'猫形态·疾速暴击',color:'#ff8844',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('dfe1a','锐爪','攻击力+8',        'atk',8),
          _t('dfe1b','猫之敏捷','攻速+10%',    'atkSpeed',0.10),
          _t('dfe1c','闪避+8%','',              'dodge',0.08)]},
        {lv:5,cost:1200,choices:[
          _t('dfe2a','撕咬','凶猛撕咬伤害+40%','ferociousBiteDmg',0.40),
          _t('dfe2b','流血','攻击附加流血DOT', 'bleedOnHit',0.15),
          _t('dfe2c','猛虎之怒','暴击率+5%',   'critRate',0.05)]},
        {lv:10,cost:2500,choices:[
          _t('dfe3a','兽性','暴击伤害+40%',    'critDmg',0.40),
          _t('dfe3b','掠食','击杀后3秒攻速+30%','killHaste',0.30),
          _t('dfe3c','猫形态增强','猫形态伤害+25%','catFormDmg',0.25)]},
        {lv:18,cost:5000,choices:[
          _t('dfe4a','野蛮冲锋','攻击力+25,暴击+6%','atk+crit',{atk:25,critRate:0.06}),
          _t('dfe4b','撕裂大师','流血伤害+50%','bleedDmg',0.50),
          _t('dfe4c','敏捷大师','闪避+15%,攻速+15%','dodge+atkSpeed',{dodge:0.15,atkSpeed:0.15})]},
        {lv:28,cost:10000,choices:[
          _t('dfe5a','全属性+12%','',          'allPct',0.12),
          _t('dfe5b','猫王','猫形态全属性+25%','catFormAll',0.25),
          _t('dfe5c','暴击之王','暴击伤害+80%','critDmg',0.80)]}
      ]},
    guardian:{name:'🐻 守护',desc:'熊形态·不可撼动',color:'#886633',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('dg1a','厚皮','HP+40',            'hp',40),
          _t('dg1b','铁毛','护甲+3',           'armor',3),
          _t('dg1c','再生','每秒回血0.3%',     'regen',0.003)]},
        {lv:5,cost:1200,choices:[
          _t('dg2a','粗暴冲撞','击退并眩晕+伤害','chargeStun',1),
          _t('dg2b','铁鬃','受伤反弹20%',      'thorns',0.20),
          _t('dg2c','自然回复','HP+60, 回血+0.3%','hp+regen',{hp:60,regen:0.003})]},
        {lv:10,cost:2500,choices:[
          _t('dg3a','生存本能','HP<30%时减伤40%','lowHpDmgRed',0.40),
          _t('dg3b','树皮术','每20秒获得15%HP护盾','barkShield',{cd:20,pct:0.15}),
          _t('dg3c','熊掌','攻击力+15,护甲+4','atk+armor',{atk:15,armor:4})]},
        {lv:18,cost:5000,choices:[
          _t('dg4a','大熊','HP+120, 护甲+6',  'hp+armor',{hp:120,armor:6}),
          _t('dg4b','蛮力','反弹35%伤害',      'thorns',0.35),
          _t('dg4c','自然守护','吸血4%',        'leech',0.04)]},
        {lv:28,cost:10000,choices:[
          _t('dg5a','全属性+12%','',           'allPct',0.12),
          _t('dg5b','涅槃','死亡60%复活(40%HP)','revive',{chance:0.60,hp:0.40}),
          _t('dg5c','永恒之熊','熊形态全属性+30%','bearFormAll',0.30)]}
      ]}
  },

  // ==================== 术士天赋 ====================
  warlock:{
    affliction:{name:'🦠 痛苦',desc:'诅咒腐蚀·DOT毁灭',color:'#7733aa',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('la1a','腐蚀之力','攻击力+8',     'atk',8),
          _t('la1b','诅咒增幅','DOT伤害+15%', 'dotDmg',0.15),
          _t('la1c','灵魂虹吸','DOT回血+50%', 'dotHealMult',0.50)]},
        {lv:5,cost:1200,choices:[
          _t('la2a','疾病传播','DOT有20%概率传播','dotSpread',0.20),
          _t('la2b','不稳定痛苦','中毒敌人死亡爆炸','curseExplode',1),
          _t('la2c','折磨','DOT暴击率+10%',    'dotCritRate',0.10)]},
        {lv:10,cost:2500,choices:[
          _t('la3a','灵魂燃烧','DOT伤害+25%',  'dotDmg',0.25),
          _t('la3b','恐惧大师','恐惧+1.5秒',   'fearDurBonus',1.5),
          _t('la3c','生命分流','HP<40%时DOT回血翻倍','lowHpDotHeal',0.40)]},
        {lv:18,cost:5000,choices:[
          _t('la4a','万咒缠身','所有攻击附加诅咒DOT','allCurse',1),
          _t('la4b','灵魂收割','击杀回4%HP',    'killHeal',0.04),
          _t('la4c','痛苦大师','DOT伤害+35%, 技能伤害+15%','dotDmg+skillDmg',{dotDmg:0.35,skillDmg:0.15})]},
        {lv:28,cost:10000,choices:[
          _t('la5a','全属性+12%','',           'allPct',0.12),
          _t('la5b','灵魂瘟疫','DOT伤害+60%，传播率100%','plaguemaster',{dotDmg:0.60,spreadRate:1.0}),
          _t('la5c','暗影之王','所有暗影伤害+40%','shadowDmgAll',0.40)]}
      ]},
    demonology:{name:'😈 恶魔',desc:'召唤大军·恶魔之王',color:'#44aa44',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('ld1a','恶魔之力','攻击力+10',    'atk',10),
          _t('ld1b','召唤增强','末日守卫伤害+20%','doomguardDmg',0.20),
          _t('ld1c','恶魔皮肤','HP+30, 护甲+1','hp+armor',{hp:30,armor:1})]},
        {lv:5,cost:1200,choices:[
          _t('ld2a','恶魔风暴','末日守卫攻击AOE化','doomguardAoe',1),
          _t('ld2b','暗影箭','技能伤害+12%',    'skillDmg',0.12),
          _t('ld2c','小鬼大军','击杀有20%概率召唤小鬼','impOnKill',0.20)]},
        {lv:10,cost:2500,choices:[
          _t('ld3a','恶魔大师','末日守卫持续+50%','doomguardDurPct',0.50),
          _t('ld3b','恶魔之血','召唤物存在时吸血3%','summonLeech',0.03),
          _t('ld3c','恶魔契约','攻击力+20,HP+50','atk+hp',{atk:20,hp:50})]},
        {lv:18,cost:5000,choices:[
          _t('ld4a','恶魔暴君','末日守卫变为暴君(伤害+100%,范围+50%)','doomguardTyrant',{dmgMult:1.0,rangePct:0.50}),
          _t('ld4b','恶魔大军','同时最多存在3个召唤物','summonMax',3),
          _t('ld4c','灵魂收割','击杀回3%HP+召唤小鬼','killImpHeal',{heal:0.03,imp:true})]},
        {lv:28,cost:10000,choices:[
          _t('ld5a','全属性+12%','',           'allPct',0.12),
          _t('ld5b','恶魔之王','召唤超级恶魔(伤害+200%,持续30秒)','ultraDemon',{dmgMult:2.0,dur:30}),
          _t('ld5c','恶魔融合','吸收召唤物获得其全部属性','demonAbsorb',1)]}
      ]},
    destruction:{name:'🔥 毁灭',desc:'混乱之火·爆炸输出',color:'#ff4400',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('lde1a','混沌箭','攻击力+10',     'atk',10),
          _t('lde1b','余烬','暴击率+4%',       'critRate',0.04),
          _t('lde1c','烈火','技能伤害+8%',     'skillDmg',0.08)]},
        {lv:5,cost:1200,choices:[
          _t('lde2a','焚烧','火焰技能伤害+25%','fireDmg',0.25),
          _t('lde2b','混沌烈焰','暴击伤害+35%','critDmg',0.35),
          _t('lde2c','浩劫','AOE范围+25%',      'aoeSizePct',0.25)]},
        {lv:10,cost:2500,choices:[
          _t('lde3a','地狱火增强','火焰之雨持续+50%','rainOfFireDur',0.50),
          _t('lde3b','暗影灼烧','暴击附带暗影DOT','critShadowDot',0.15),
          _t('lde3c','混沌之力','攻击力+20, 暴击+5%','atk+crit',{atk:20,critRate:0.05})]},
        {lv:18,cost:5000,choices:[
          _t('lde4a','毁灭','技能伤害+25%',    'skillDmg',0.25),
          _t('lde4b','火焰风暴','所有攻击有15%概率触发火焰AOE','fireAoeOnHit',0.15),
          _t('lde4c','混沌大师','暴击伤害+50%,暴击率+5%','critDmg+crit',{critDmg:0.50,critRate:0.05})]},
        {lv:28,cost:10000,choices:[
          _t('lde5a','全属性+12%','',          'allPct',0.12),
          _t('lde5b','末日火焰','全屏火焰AOE每10秒自动触发','autoFireAoe',{cd:10}),
          _t('lde5c','混沌之王','全技能伤害+40%','skillDmg',0.40)]}
      ]}
  },

  // ==================== 圣骑士天赋 ====================
  paladin:{
    retribution:{name:'⚔️ 惩戒',desc:'神圣之怒·审判打击',color:'#ff8833',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('pr1a','正义之力','攻击力+10',     'atk',10),
          _t('pr1b','圣光打击','技能伤害+8%',   'skillDmg',0.08),
          _t('pr1c','审判','暴击率+4%',          'critRate',0.04)]},
        {lv:5,cost:1200,choices:[
          _t('pr2a','十字军打击','攻击力+15, 暴击+3%','atk+crit',{atk:15,critRate:0.03}),
          _t('pr2b','圣盾术增强','护盾量+30%', 'shieldPctBonus',0.30),
          _t('pr2c','神圣之锤','愤怒之锤伤害+30%','hammerDmg',0.30)]},
        {lv:10,cost:2500,choices:[
          _t('pr3a','复仇','护盾存在时攻击力+25%','shieldAtkBonus',0.25),
          _t('pr3b','公正','暴击伤害+40%',      'critDmg',0.40),
          _t('pr3c','圣光审判','技能伤害+15%',  'skillDmg',0.15)]},
        {lv:18,cost:5000,choices:[
          _t('pr4a','觉醒','每次攻击回1%HP',    'atkHeal',0.01),
          _t('pr4b','灰烬使者精通','圣光波伤害+60%范围+40%','ashbringerMaster',{dmgPct:0.60,rangePct:0.40}),
          _t('pr4c','天罚之锤','攻击力+30, 技能伤害+15%','atk+skillDmg',{atk:30,skillDmg:0.15})]},
        {lv:28,cost:10000,choices:[
          _t('pr5a','全属性+12%','',           'allPct',0.12),
          _t('pr5b','神圣风暴','技能暴击释放圣光冲击波','critHolyWave',1),
          _t('pr5c','正义执行','<30%HP敌人伤害+50%','execute',0.50)]}
      ]},
    protection_pal:{name:'🛡️ 防护',desc:'神圣壁垒·永恒守护',color:'#4488ff',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('pp1a','坚韧','HP+40',            'hp',40),
          _t('pp1b','圣盾','护甲+3',           'armor',3),
          _t('pp1c','奉献','受伤反弹15%',      'thorns',0.15)]},
        {lv:5,cost:1200,choices:[
          _t('pp2a','神圣护盾','护盾CD-25%',   'shieldCdPct',0.25),
          _t('pp2b','格挡','15%减伤50%',       'block',{chance:0.15,reduce:0.50}),
          _t('pp2c','圣光庇护','HP+60',        'hp',60)]},
        {lv:10,cost:2500,choices:[
          _t('pp3a','壁垒','护甲+6, HP+50',    'armor+hp',{armor:6,hp:50}),
          _t('pp3b','圣光回复','每秒回血0.5%', 'regen',0.005),
          _t('pp3c','盾牌猛击','反弹+25%',     'thorns',0.25)]},
        {lv:18,cost:5000,choices:[
          _t('pp4a','不朽','HP+120, 护甲+5',   'hp+armor',{hp:120,armor:5}),
          _t('pp4b','神圣壁垒','护盾存在时减伤30%','shieldDmgRed',0.30),
          _t('pp4c','破碎护盾','护盾破裂造成AOE(护盾量×200%)','shieldExplode',2.0)]},
        {lv:28,cost:10000,choices:[
          _t('pp5a','全属性+12%','',           'allPct',0.12),
          _t('pp5b','圣盾术','开局获得30%HP护盾','startShield',0.30),
          _t('pp5c','涅槃','死亡60%复活(40%HP)','revive',{chance:0.60,hp:0.40})]}
      ]},
    holy_pal:{name:'💛 神圣',desc:'圣光治愈·光明之力',color:'#ffcc44',
      tiers:[
        {lv:1,cost:500,choices:[
          _t('pho1a','圣光','每秒回血0.3%',    'regen',0.003),
          _t('pho1b','信仰','HP+35',            'hp',35),
          _t('pho1c','圣光之力','攻击力+8',     'atk',8)]},
        {lv:5,cost:1200,choices:[
          _t('pho2a','圣疗增强','治疗技能效果+30%','healBoost',0.30),
          _t('pho2b','神圣之光','攻击回复1%HP','atkHeal',0.01),
          _t('pho2c','圣光守护','HP+50, 护甲+2','hp+armor',{hp:50,armor:2})]},
        {lv:10,cost:2500,choices:[
          _t('pho3a','圣光闪现','治疗CD-20%',  'healCdPct',0.20),
          _t('pho3b','治愈','击杀回3%HP',       'killHeal',0.03),
          _t('pho3c','光之壁垒','HP<30%时每秒回3%HP','lowHpRegen',0.03)]},
        {lv:18,cost:5000,choices:[
          _t('pho4a','圣光涌动','全回血效果+40%','allHealBoost',0.40),
          _t('pho4b','圣疗术大师','圣疗术治疗+80%','layOnHandsMaster',0.80),
          _t('pho4c','圣光之怒','攻击力+25, 攻击回血2%','atk+atkHeal',{atk:25,atkHeal:0.02})]},
        {lv:28,cost:10000,choices:[
          _t('pho5a','全属性+12%','',          'allPct',0.12),
          _t('pho5b','守护天使','死亡100%复活(60%HP)','revive',{chance:1.0,hp:0.60}),
          _t('pho5c','圣光化身','全回血效果+80%','allHealBoost',0.80)]}
      ]}
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
  RARITY_MULT: {common:1.0, rare:1.2, epic:1.5, legendary:2.0, mythic:3.0}
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
    {id:'talent', label:'天赋未解锁', desc:'解锁职业天赋获得强大的专精被动效果',action:'talent',icon:'🌟'},
    {id:'equip', label:'装备可强化', desc:'强化装备提升战斗属性',action:'forge',icon:'🔨'},
    {id:'star', label:'英雄可升星', desc:'升星大幅提升英雄全属性',action:'heroes',icon:'⭐'},
    {id:'tryOther', label:'尝试其他英雄', desc:'不同英雄有不同优势，试试其他职业',action:'heroes',icon:'🦸'},
  ]
};

// ==================== Build推荐系统 ====================
// 每个职业精选2-3套Build，展示"技能+天赋+装备"的乘数效应
const BUILD_RECOMMENDS=[
  // ====== 战士 ======
  {id:'warrior_fury',heroId:'warrior',name:'🔥 狂暴斩杀流',tier:'S',
    desc:'极限暴击+斩杀，低血量敌人瞬间蒸发，全程高攻速割草',
    skills:['sig_whirlwind','execute_strike','heroic_leap','ashbringer','bloodthirst'],
    talents:{fury:['wf1b','wf2c','wf3a','wf4a','wf5b'],arms:['wa1c','wa2a']},
    equips:['wp_gorehowl','ar_valorplate','helm4','boot3','trinket2','ring5'],
    synergy:[
      {icon:'⚔️',title:'旋风斩+狂暴天赋',detail:'旋风斩范围+60%+回血(wf5b)，配合血量<50%攻击+20%(wf2c)，低血量时DPS暴增',mult:'×2.4'},
      {icon:'🪓',title:'斩杀+斩杀本能',detail:'<30%血量敌人伤害+35%(wf3a)，斩杀技能本身×2.5倍，叠加后对残血怪一击必杀',mult:'×3.4'},
      {icon:'🔥',title:'怒火套装效果',detail:'血吼+英勇板甲套装：攻击力+15%，血量<30%攻速翻倍，配合狂暴被动+40%攻击=恐怖输出',mult:'×3.1'},
    ],
    totalMult:'×8.2',ratingAtk:10,ratingDef:5,ratingSurvival:6},
  {id:'warrior_tank',heroId:'warrior',name:'🛡️ 不死铁壁流',tier:'A',
    desc:'极限生存+反击，板甲+盾墙打造不倒堡垒',
    skills:['sig_whirlwind','shield_wall','heroic_leap','heal','thorns'],
    talents:{protection:['wp1a','wp2a','wp3c','wp4a','wp5a'],arms:['wa1a','wa2c']},
    equips:['wp_gorehowl','ar_valorplate','helm4','boot4','trinket4','ring2'],
    synergy:[
      {icon:'🛡️',title:'盾墙+钢铁堡垒',detail:'盾墙减伤50%+天赋血量+120/护甲+8(wp4a)，极限坦度',mult:'×2.0'},
      {icon:'💀',title:'巫妖王之盔特效',detail:'每15秒全屏暗影伤害+回血，持续输出不断线',mult:'×1.5'},
      {icon:'🌿',title:'荆棘+反甲流',detail:'荆棘反弹30%伤害+横扫溅射30%，被打也是在打怪',mult:'×1.8'},
    ],
    totalMult:'×5.4',ratingAtk:5,ratingDef:10,ratingSurvival:10},

  // ====== 法师 ======
  {id:'mage_fire',heroId:'mage',name:'🔥 炎爆毁灭流',tier:'S',
    desc:'火焰连环爆炸，全屏焚烧，暴击后奥术冲击波额外清场',
    skills:['sig_firestorm','pyroblast','arcane_blast','livingbomb','fireball'],
    talents:{fire:['mf1a','mf2a','mf3a','mf4b','mf5b'],arcane:['ma1b','ma2a']},
    equips:['wp_atiesh','ar_netherweave','helm3','boot3','trinket3','ring4'],
    synergy:[
      {icon:'🔥',title:'炎爆+燃烧被动',detail:'法师被动：火焰攻击附带30%燃烧DOT，炎爆基础伤害×1.5倍叠加=持续焚烧',mult:'×2.5'},
      {icon:'🔮',title:'奥术套装+暴击',detail:'技能伤害+25%，暴击释放奥术冲击波，配合12%暴击率的埃提耶什',mult:'×2.8'},
      {icon:'🎓',title:'巫师之冠增幅',detail:'技能伤害+15%+技能CD-10%，全技能输出频率和伤害双提升',mult:'×1.6'},
    ],
    totalMult:'×9.1',ratingAtk:10,ratingDef:2,ratingSurvival:4},

  // ====== 猎人 ======
  {id:'hunter_beast',heroId:'hunter',name:'🐾 百兽齐攻流',tier:'S',
    desc:'召唤野兽大军+多重射击，宠物满场飞舞的壮观流派',
    skills:['sig_multishot','bestial_wrath','explosive_trap','aimed_shot','naturewrath'],
    talents:{beast:['hb1a','hb2b','hb3a','hb4a','hb5b'],marksman:['hm1a','hm2a']},
    equips:['wp_rhokdelar','ar_dragonstalker','helm3','boot3','trinket2','ring5'],
    synergy:[
      {icon:'🐾',title:'宠物+野性灵魂套装',detail:'宠物攻击力+100%，宠物存在时英雄暴击+15%，宠物本身也受天赋加成',mult:'×3.0'},
      {icon:'🏹',title:'多重射击+狂野怒火合成',detail:'多重+狂野怒火触发终极合成：召唤整群野兽冲锋碾压，CD20秒核弹级清场',mult:'×2.5'},
      {icon:'💀',title:'毒箭+持续伤害',detail:'洛克德拉尔30%概率毒箭+天赋DOT加成，持续伤害保底输出',mult:'×1.8'},
    ],
    totalMult:'×7.5',ratingAtk:9,ratingDef:4,ratingSurvival:6},

  // ====== 牧师 ======
  {id:'priest_shadow',heroId:'priest',name:'💀 暗影蔓延流',tier:'S',
    desc:'DOT遍布全场，治疗自己的同时伤害敌人，越战越强',
    skills:['sig_shadowword','mind_blast','shadow_form','corruption','heal'],
    talents:{shadow:['ps1a','ps2a','ps3a','ps4b','ps5b'],discipline:['pd1a','pd2a']},
    equips:['wp_anathema','ar_mooncloth','helm3','boot3','trinket1','ring3'],
    synergy:[
      {icon:'💀',title:'暗影拥抱套装',detail:'DOT伤害+40%+DOT回血+100%，配合牧师被动(DOT伤害15%转HP)=超强续航',mult:'×2.8'},
      {icon:'☠️',title:'安纳塞玛传播',detail:'DOT每跳20%概率传播给周围敌人，配合腐蚀术扩散=全场中毒',mult:'×2.5'},
      {icon:'🌙',title:'月布长袍+回复',detail:'每5秒回3%HP+DOT回血，几乎无限续航',mult:'×1.6'},
    ],
    totalMult:'×7.8',ratingAtk:8,ratingDef:3,ratingSurvival:9},

  // ====== 盗贼 ======
  {id:'rogue_crit',heroId:'rogue',name:'🗡️ 暴击风暴流',tier:'S',
    desc:'连续暴击触发暗影风暴，影舞+剔骨打出恐怖爆发',
    skills:['sig_shadowdance','eviscerate','blade_dance','cloak_of_shadows','ashbringer'],
    talents:{assassination:['ra1b','ra2a','ra3a','ra4b','ra5b'],subtlety:['rs1b','rs2a']},
    equips:['wp_perdition','ar_shadowleather','helm3','boot3','trinket2','ring5'],
    synergy:[
      {icon:'🗡️',title:'暗夜杀手套装',detail:'暴击伤害+50%，连续暴击3次触发暗影风暴(全屏)，盗贼25%基础暴击率轻松触发',mult:'×3.2'},
      {icon:'💀',title:'毁灭之刃+被动',detail:'暴击伤害额外+60%+击杀重置CD，配合被动(暴击后下一次必暴击+50%)=无限暴击链',mult:'×2.8'},
      {icon:'⚔️',title:'影舞+剔骨合成',detail:'触发死亡印记终极合成：标记后疯狂攻击×1.5倍引爆',mult:'×2.0'},
    ],
    totalMult:'×8.6',ratingAtk:10,ratingDef:1,ratingSurvival:5},

  // ====== 萨满 ======
  {id:'shaman_totem',heroId:'shaman',name:'🌊 图腾风暴流',tier:'A',
    desc:'图腾铺满全场+元素爆发，攻防兼备的元素使者',
    skills:['sig_totemstorm','lava_burst','earthquake','healing_rain','chainlight'],
    talents:{elemental:['se1a','se2a','se3a','se4a','se5b'],restoration:['sr1a','sr2a']},
    equips:['wp_doomhammer','ar_stormscale','helm3','boot3','trinket1','ring3'],
    synergy:[
      {icon:'🌊',title:'大地之怒套装',detail:'图腾伤害+60%+每个图腾额外回2%HP/秒，3图腾=6%/秒回血',mult:'×2.6'},
      {icon:'🔨',title:'毁灭之锤风暴打击',detail:'攻击25%触发风暴打击(ATK×120%AOE)，配合元素天赋伤害加成',mult:'×2.2'},
      {icon:'⛓️',title:'图腾+升腾合成',detail:'图腾风暴+熔岩爆裂触发升腾：8秒全技能无CD，疯狂输出窗口',mult:'×2.5'},
    ],
    totalMult:'×7.3',ratingAtk:8,ratingDef:7,ratingSurvival:8},

  // ====== 死骑 ======
  {id:'dk_frost',heroId:'deathknight',name:'❄️ 冰霜统御流',tier:'S',
    desc:'全场冰封+亡灵大军，冻住再打，伤害倍增',
    skills:['sig_wintercoming','army_of_dead','death_strike','frostmourne','blizzard'],
    talents:{frost:['df1a','df2a','df3a','df4a','df5b'],unholy:['du1a','du2a']},
    equips:['wp_frostmourne_blade','ar_iceboundplate','helm4','boot4','trinket4','ring3'],
    synergy:[
      {icon:'❄️',title:'冰冠套装增幅',detail:'冰霜光环范围+50%+被冻结敌人受伤+40%，全场减速控制',mult:'×2.8'},
      {icon:'💀',title:'亡者大军+霜之哀伤',detail:'击杀30%复生亡灵仆从+天启合成：召唤四骑士横扫，满屏亡灵大军',mult:'×2.5'},
      {icon:'🥶',title:'凛冬+暴风雪联控',detail:'凛冬将至全屏冻结+暴风雪持续减速，敌人几乎无法移动',mult:'×2.0'},
    ],
    totalMult:'×7.0',ratingAtk:8,ratingDef:8,ratingSurvival:7},

  // ====== 德鲁伊 ======
  {id:'druid_hybrid',heroId:'druid',name:'🌿 万象变形流',tier:'A',
    desc:'双形态自由切换，远程月火+近战熊形态，攻防一体',
    skills:['sig_starfall','moonfire','wild_growth','ferocious_bite','naturewrath'],
    talents:{balance:['db1a','db2a','db3a','db4a','db5b'],guardian:['dg1a','dg2a']},
    equips:['wp_dreambinder','ar_cenarion_vest','helm3','boot3','trinket1','ring3'],
    synergy:[
      {icon:'🌿',title:'塞纳里奥套装',detail:'变形无HP限制+双形态全加成，不再被动切换，战斗策略更灵活',mult:'×2.2'},
      {icon:'🌙',title:'梦境编织者特效',detail:'变形切换释放梦境波动(治疗15%HP+ATK×80%AOE伤害)，切形态=输出+治疗',mult:'×2.0'},
      {icon:'⭐',title:'星辰+野性合成',detail:'星辰坠落+野性成长触发化身：15秒全形态加成+50%攻击+30%HP',mult:'×2.3'},
    ],
    totalMult:'×6.5',ratingAtk:7,ratingDef:7,ratingSurvival:9},

  // ====== 术士 ======
  {id:'warlock_curse',heroId:'warlock',name:'👿 诅咒毁灭流',tier:'S',
    desc:'诅咒全场+爆炸连锁，击杀引发连环爆炸的暗黑流派',
    skills:['sig_doomguard','corruption','rain_of_fire','dark_pact','livingbomb'],
    talents:{affliction:['wl1a','wl2a','wl3a','wl4a','wl5b'],destruction:['wd1a','wd2a']},
    equips:['wp_soulharvester','ar_nemesis_robe','helm3','boot3','trinket3','ring5'],
    synergy:[
      {icon:'👿',title:'复仇套装连锁',detail:'诅咒爆炸范围+80%+击杀回8%HP+召唤小恶魔，配合被动(死亡爆炸15%HP)',mult:'×3.0'},
      {icon:'⚰️',title:'灵魂收割镰增幅',detail:'诅咒敌人死亡爆炸+100%+50%恐惧，连锁反应清屏',mult:'×2.5'},
      {icon:'🔥',title:'末日+火雨合成',detail:'触发召唤地狱火终极合成：巨人砸落+持续AOE，15秒超级输出',mult:'×2.2'},
    ],
    totalMult:'×8.0',ratingAtk:9,ratingDef:3,ratingSurvival:6},

  // ====== 圣骑士 ======
  {id:'paladin_holy',heroId:'paladin',name:'⚜️ 圣光审判流',tier:'A',
    desc:'护盾无敌+圣光AOE，最安全的近战流派',
    skills:['sig_avengershield','consecration','lay_on_hands','hammer_of_wrath','heal'],
    talents:{holy:['ph1a','ph2a','ph3a','ph4a','ph5b'],retribution:['pr1a','pr2a']},
    equips:['wp_ashkandi','ar_lawbringer','helm4','boot4','trinket4','ring2'],
    synergy:[
      {icon:'⚜️',title:'审判套装连击',detail:'护盾CD-40%+攻击附带制裁之锤(眩晕0.5秒)，近乎永久护盾+控制',mult:'×2.5'},
      {icon:'🛡️',title:'阿什坎迪+审判铠甲',detail:'每次攻击回1%HP+护盾期间攻击+30%，护盾破裂AOE伤害',mult:'×2.2'},
      {icon:'⚔️',title:'复仇+奉献合成',detail:'触发神圣风暴：全场圣光+回30%HP，终极保命+输出',mult:'×2.0'},
    ],
    totalMult:'×6.7',ratingAtk:6,ratingDef:9,ratingSurvival:10},
];

// 装备图鉴：按槽位和品质的分类辅助
const EQUIP_SLOT_NAMES={weapon:'⚔️ 武器',armor:'🛡️ 护甲',helmet:'⛑️ 头盔',boots:'👢 靴子',trinket:'💎 饰品',ring:'💍 戒指'};
const EQUIP_SLOT_ORDER=['weapon','armor','helmet','boots','trinket','ring'];
const RARITY_ORDER=['common','rare','epic','legendary','mythic'];

// ==================== 暴露到全局 ====================
window.DATA={ALL_HEROES,CHAPTERS,SKILL_DB,SKILL_COMBOS,RARITY_NAME,RARITY_COLOR,SIGNIN_REWARDS,EQUIPMENT_DB,
  ARENA_RANKS,ARENA_RANK_NAMES,ARENA_RANK_ICONS,ARENA_RANK_REQ,BP_MAX,BP_XP,BP_REWARDS,
  ACHIEVEMENTS,QUEST_TEMPLATES,SHOP_DATA,DRAW_PRIZES,NUM,
  HERO_LEVEL,HERO_TALENT_TREES,SET_BONUSES,ENHANCE_DATA,HERO_STAR,STUCK_GUIDE,
  BUFF_DB,BUFF_MIN_PER_PANEL,BUFF_MAX_PER_PANEL,
  BUILD_RECOMMENDS,EQUIP_SLOT_NAMES,EQUIP_SLOT_ORDER,RARITY_ORDER,
  calcXpNeed,calcSkillDmg,calcSkillCd,calcEnemyStats,calcBossStats,rollCrit,calcFinalDmg,isEliteSpawn,
  calcHeroXpNeed,calcHeroLevelBonus};
// 兼容旧代码: TALENT_TREES 指向当前英雄的天赋树
window.TALENT_TREES=null; // 动态设置
window.HERO_TALENT_TREES=HERO_TALENT_TREES;
window.SET_BONUSES=SET_BONUSES;
