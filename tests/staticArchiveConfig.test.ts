import { afterEach, describe, expect, it, vi } from "vitest"
import { seedConfig } from "@/data/seed"
import { fetchStaticArchiveSnapshot, mergeStaticArchiveConfig, type StaticArchiveSnapshot } from "@/services/staticArchiveConfig"
import type { ArchiveConfig, BossStage } from "@/types/archive"

function cloneSeedConfig(): ArchiveConfig {
  return structuredClone(seedConfig) as ArchiveConfig
}

const DATA_SITE = "https://static.nanoka.cc"

const fixtureMonster = {
  rank: "LittleBoss",
  icon: "SpriteOutput/MonsterFigure/Monster_2034010.png",
  child: [2034010],
  weak: ["Physical", "Fire", "Wind"],
  zh: "步离战首·呼雷",
  en: "Borisin Warhead: Hoolay",
}

const fixtureFiles: Record<string, unknown> = {
  [`${DATA_SITE}/manifest.json`]: {
    hsr: { live: "4.5", latest: "4.5.51", available: ["4.5", "4.5.51"] },
  },
  [`${DATA_SITE}/hsr/4.5.51/monster.json`]: {
    "2034010": fixtureMonster,
    "2034100": {
      rank: "LittleBoss",
      icon: "SpriteOutput/MonsterFigure/Monster_2034100.png",
      child: [2034100],
      weak: ["Quantum"],
      zh: "四期示例首领",
    },
    "1004010": {
      rank: "Elite",
      icon: "SpriteOutput/MonsterFigure/Monster_1004010.png",
      child: [1004010],
      weak: ["Ice", "Thunder"],
      zh: "示例骑士",
    },
    // icon 指向基础模型 2034010：首领标题应取家族名「步离战首·呼雷」，本名留在 variantName。
    "2034011": {
      rank: "LittleBoss",
      icon: "SpriteOutput/MonsterFigure/Monster_2034010.png",
      child: [2034011],
      weak: ["Ice"],
      zh: "当期变体首领",
    },
    "4035010": {
      rank: "LittleBoss",
      icon: "SpriteOutput/MonsterFigure/Monster_4035010.png",
      child: [4035010],
      weak: ["Ice"],
      zh: "示例王棋",
    },
  },
  [`${DATA_SITE}/hsr/4.5.51/monstervalue.json`]: {
    "2034010": {
      HPBase: 1000,
      SpeedBase: 200,
      StanceBase: 720,
      MaxMonsterPhase: 2,
      child: [{ Id: 2034010, HPModifyRatio: 1, SpeedModifyRatio: 1, StanceModifyRatio: 1 }],
    },
    "2034100": {
      HPBase: 1000,
      SpeedBase: 200,
      StanceBase: 720,
      MaxMonsterPhase: 2,
      PhaseList: [{phase_num: 1, phase_max_hp_ratio: 1.0}, {phase_num: 2, phase_max_hp_ratio: 1.0}],
      child: [{ Id: 2034100, HPModifyRatio: 1, SpeedModifyRatio: 1, StanceModifyRatio: 1 }],
    },
    "1004010": {
      HPBase: 1000,
      SpeedBase: 100,
      StanceBase: 360,
      MaxMonsterPhase: 2,
      child: [{ Id: 1004010, HPModifyRatio: 1, SpeedModifyRatio: 1, StanceModifyRatio: 1 }],
    },
    "2034011": {
      HPBase: 1000,
      SpeedBase: 200,
      StanceBase: 720,
      MaxMonsterPhase: 2,
      child: [{ Id: 2034011, HPModifyRatio: 1, SpeedModifyRatio: 1, StanceModifyRatio: 1 }],
    },
    "4035010": {
      HPBase: 1000,
      SpeedBase: 120,
      StanceBase: 720,
      MaxMonsterPhase: 3,
      // 各阶段上限不等（4.5 异相仲裁将杀关就是 1.0 / 1.25 / 1.0），不能压成 x3
      PhaseList: [
        {phase_num: 1, phase_max_hp_ratio: 1.0},
        {phase_num: 2, phase_max_hp_ratio: 1.25},
        {phase_num: 3, phase_max_hp_ratio: 1.0},
      ],
      child: [{ Id: 4035010, HPModifyRatio: 1, SpeedModifyRatio: 1, StanceModifyRatio: 1 }],
    },
  },
  [`${DATA_SITE}/hsr/4.5.51/HardLevelGroup.json`]: {
    "0": { HardLevelGroup: 3, Level: 95, HPRatio: 400, SpeedRatio: 1.32, StanceRatio: 1 },
  },
  [`${DATA_SITE}/hsr/4.5.51/EliteGroup.json`]: {
    "0": { EliteGroup: 164, HPRatio: 2, SpeedRatio: 1, StanceRatio: 1 },
  },
  [`${DATA_SITE}/hsr/4.5.51/InfiniteEliteGroup.json`]: {
    "0": { EliteGroup: 370, HPRatio: 3, SpeedRatio: 1, StanceRatio: 1 },
  },
  // 单怪详情：`*_modify_value` 与抗性表只在这份里有，索引版 monstervalue.json 不带。
  // 有意只给 2034010 / 4035010 两份，其余阶段走「详情缺失」分支（不叠加修正值、抗性为空）。
  [`${DATA_SITE}/hsr/4.5.51/zh/monster/2034010.json`]: {
    id: 2034010,
    child: [
      {
        id: 2034010,
        speed_modify_value: 10,
        stance_modify_value: 90,
        damage_type_resistance: [
          { damage_type: "Ice", value: 0.2 },
          { damage_type: "Thunder", value: 0.4 },
          { damage_type: "Quantum", value: 0.2 },
          { damage_type: "Imaginary", value: -0.2 },
        ],
      },
    ],
  },
  [`${DATA_SITE}/hsr/4.5.51/zh/monster/4035010.json`]: {
    id: 4035010,
    child: [
      {
        id: 4035010,
        stance_modify_value: 60,
        damage_type_resistance: [
          { damage_type: "Fire", value: 0.2 },
          { damage_type: "Wind", value: 0.2 },
        ],
      },
    ],
  },
  [`${DATA_SITE}/hsr/4.5.51/zh/peak/9.json`]: {
    name: "军团再临",
    pre_level: [
      {
        id: 901,
        name: "骑士（一）",
        event_id_list: [{ hard_level_group: 3, level: 95, monster_list: [{ monster0: 1004010 }] }],
        tag_list: [
          { id: 3033088, name: "刚毅", desc: "敌方目标受到的击破伤害降低<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。", param: [0.5] },
        ],
        infinite_list: { "9011": { elite_group: 370, monster_group_id_list: [1004010] } },
      },
    ],
    boss_level: {
      id: 904,
      name: "将杀王棋",
      damage_type: ["Ice"],
      event_id_list: [
        { hard_level_group: 3, level: 95, monster_list: [{ monster0: 1004010 }, { monster0: 1004010, monster1: 4035010 }] },
      ],
      tag_list: [
        { id: 3033058, name: "血嗜", desc: "我方目标回合开始时损失<color=#f29e38ff><unbreak>#1[i]</unbreak></color>点生命值。", param: [500] },
      ],
      infinite_list: { "9041": { elite_group: 1, monster_group_id_list: [4035010] } },
    },
    boss_config: {
      hard_name: "将杀王棋•绝境",
      buff_list: [
        { id: 3033073, name: "美妙奇笑", desc: "我方全体目标欢愉度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。", param: [0.4] },
      ],
      tag_list: [
        { id: 3033059, name: "血嗜+", desc: "我方目标回合开始时损失<color=#f29e38ff><unbreak>#1[i]</unbreak></color>点生命值。", param: [1000] },
      ],
      event_id_list: [
        { hard_level_group: 3, level: 95, monster_list: [{ monster0: 1004010, monster1: 4035010 }] },
      ],
      infinite_list: { "9051": { elite_group: 370, monster_group_id_list: [4035010] } },
    },
  },
  [`${DATA_SITE}/hsr/4.5.51/zh/maze/1034.json`]: [
    {
      id: 5401,
      name: "扫除风暴其一",
      group_name: "扫除风暴",
      npc_monster_id_list1: [2034100],
      npc_monster_id_list2: [2034100],
      damage_type1: ["Quantum"],
      damage_type2: ["Quantum"],
      event_id_list1: [
        {
          hard_level_group: 3,
          level: 95,
          elite_group: 164,
          monster_list: [{ monster0: 2034100 }],
        },
      ],
      event_id_list2: [
        {
          hard_level_group: 3,
          level: 95,
          elite_group: 164,
          monster_list: [{ monster0: 2034100 }],
        },
      ],
    },
    {
      id: 5413,
      pre_id: 5401,
      npc_monster_id_list: [2034100],
      event_id_list: [
        {
          hard_level_group: 3,
          level: 95,
          monster_list: [{ monster0: 2034100 }],
        },
      ],
    },
  ],
  [`${DATA_SITE}/hsr/4.5.51/zh/maze/1035.json`]: [
    {
      id: 5501,
      name: "物竞天择其一",
      group_name: "物竞天择",
      desc: "我方编队中第一位角色获得欢愉技，可对敌方全体造成<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>的欢愉伤害。\\n每个轮开始时获得#2[i]个笑点。",
      param: [0.6, 3],
      npc_monster_id_list1: [2034010],
      npc_monster_id_list2: [2034010],
      damage_type1: ["Physical"],
      damage_type2: ["Fire"],
      event_id_list1: [
        {
          hard_level_group: 3,
          level: 95,
          elite_group: 164,
          monster_list: [{ monster0: 1001010 }, { monster0: 2034010 }],
        },
      ],
      event_id_list2: [
        {
          hard_level_group: 3,
          level: 95,
          elite_group: 164,
          monster_list: [{ monster0: 2034010 }],
        },
      ],
    },
    {
      id: 5513,
      pre_id: 5501,
      npc_monster_id_list: [2034010],
      event_id_list: [
        {
          hard_level_group: 3,
          level: 95,
          monster_list: [{ monster0: 2034010 }],
        },
      ],
    },
  ],
  [`${DATA_SITE}/hsr/4.5.51/zh/boss/3020.json`]: {
    name: "仙客天狼",
    buff: {
      name: "末法余烬",
      desc: "敌方全体受到的战技伤害提高<unbreak>#1[i]%</unbreak>。\\n欢愉伤害提高<unbreak>#2[i]%</unbreak>。",
      param: [0.25, 0.15],
    },
    buff_list1: [
      { name: "膏腴之地", desc: "战技和终结技伤害提高<unbreak>#1[i]%</unbreak>。", param: [0.3, 0.3] },
      { name: "攻无不克", desc: "忆灵造成伤害时无视目标<unbreak>#1[i]%</unbreak>的防御力。", param: [0.2] },
      { name: "喜上眉梢", desc: "敌方全体受到的欢愉伤害提高<unbreak>#1[i]%</unbreak>。", param: [0.3] },
    ],
    buff_list2: [{ name: "才藻富赡", desc: "风属性抗性降低<unbreak>#1[i]%</unbreak>。", param: [0.4] }],
    buff_list3: [{ name: "披坚执锐", desc: "物理属性伤害提高<unbreak>#1[i]%</unbreak>。", param: [0.5] }],
    level: [
      {
        id: 30204,
        name: "仙客天狼·难度04",
        boss_monster_id1: 2034011,
        boss_monster_id2: 2034100,
        damage_type1: ["Ice"],
        damage_type2: ["Quantum"],
        event_id_list1: [{ hard_level_group: 3, level: 95, elite_group: 164, monster_list: [{ monster0: 2034011 }] }],
        event_id_list2: [{ hard_level_group: 3, level: 95, elite_group: 164, monster_list: [{ monster0: 2034100 }] }],
      },
      {
        id: 30205,
        pre_id: 30204,
        boss_monster_id: 4035010,
        damage_type: ["Ice"],
        event_id_list: [{ hard_level_group: 3, level: 95, elite_group: 164, monster_list: [{ monster0: 4035010 }] }],
      },
    ],
  },
  [`${DATA_SITE}/hsr/4.5.51/zh/story/2026.json`]: {
    name: "立界开篇",
    buff: null,
    option: [
      { name: "狂欢", desc: "敌方目标受到的欢愉伤害提高<unbreak>#1[i]%</unbreak>。", param: [0.3, 20, 0] },
      { name: "狂想", desc: "我方目标造成的伤害提高<unbreak>#1[i]%</unbreak>。", param: [0.5, 1, 3] },
      { name: "谜狂", desc: "我方忆灵造成的伤害提高<unbreak>#1[i]%</unbreak>。", param: [0.5, 2, 3] },
    ],
    sub_option: [
      { name: "获得笑点", desc: "使我方额外积累<unbreak>#1[i]</unbreak>点战意值。", param: [2] },
    ],
    level: [
      {
        id: 20264,
        name: "立界开篇其四",
        npc_monster_id_list1: [2034010],
        npc_monster_id_list2: [2034100],
        damage_type1: ["Quantum"],
        damage_type2: ["Imaginary"],
        event_id_list1: [{ hard_level_group: 3, level: 95, monster_list: [{ monster0: 2034010 }] }],
        event_id_list2: [{ hard_level_group: 3, level: 95, monster_list: [{ monster0: 2034100 }] }],
      },
    ],
  },
}

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url in fixtureFiles) {
      return { ok: true, json: async () => fixtureFiles[url] } as unknown as Response
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchStaticArchiveSnapshot", () => {
  it("所有赛季共用 manifest 里的最新数据目录生成敌方阶段", async () => {
    stubFetch()

    const snapshot = await fetchStaticArchiveSnapshot()

    expect(snapshot?.liveVersion).toBe("4.5")
    expect(snapshot?.bosses.map((boss) => boss.id)).toEqual([
      "4.4-moc-top",
      "4.4-moc-bottom",
      "4.4-moc-starward",
      "4.5-moc-top",
      "4.5-moc-bottom",
      "4.5-moc-starward",
      "4.5-pf-top",
      "4.5-pf-bottom",
      "4.5-as-top",
      "4.5-as-bottom",
      "4.5-as-starward",
      "4.5-aa-k1",
      "4.5-aa-checkmate",
      "4.5-aa-plight",
    ])

    const legacyTop = snapshot?.bosses.find((boss) => boss.id === "4.4-moc-top")
    expect(legacyTop).toMatchObject({
      seasonId: "4.4",
      mode: "moc",
      name: "四期示例首领",
      subtitle: "混沌回忆 · 扫除风暴",
      hp: "800,000 x2",
      weakness: ["量子"],
      imageUrl: `${DATA_SITE}/assets/hsr/monstermiddleicon/Monster_2034100.webp`,
    })

    const top = snapshot?.bosses.find((boss) => boss.id === "4.5-moc-top")
    expect(top).toMatchObject({
      seasonId: "4.5",
      mode: "moc",
      name: "步离战首·呼雷",
      subtitle: "混沌回忆 · 物竞天择",
      hp: "800,000 x2",
      speed: "274",
      toughness: "270",
      weakness: ["物理", "火", "风"],
      // 弱点取首领自身 weak 的全集，不是阶段 damage_type 的那一两个；
      // 抗性只留正数，所以详情里的 Imaginary: -0.2 不出现。
      resist: { 冰: "20%", 雷: "40%", 量子: "20%" },
      imageUrl: `${DATA_SITE}/assets/hsr/monstermiddleicon/Monster_2034010.webp`,
    })
    expect(top?.monsters?.[0]).toMatchObject({ id: "2034010", name: "步离战首·呼雷" })
    // 混沌回忆的迷阵文案没有名字，用「记忆迷阵」兜底；#N[i] 代入 param，`\n` 转真实换行。
    expect(top?.mechanic).toEqual({
      id: "记忆迷阵",
      name: "记忆迷阵",
      desc: "我方编队中第一位角色获得欢愉技，可对敌方全体造成60%的欢愉伤害。\n每个轮开始时获得3个笑点。",
    })

    const starward = snapshot?.bosses.find((boss) => boss.id === "4.5-moc-starward")
    expect(starward?.hp).toBe("400,000 x2")
    expect(starward?.weakness).toEqual(["物理", "火", "风"])

    const knight = snapshot?.bosses.find((boss) => boss.id === "4.5-aa-k1")
    expect(knight).toMatchObject({ name: "示例骑士", hp: "1,200,000 x2", weakness: ["冰", "雷"] })
    expect(knight?.stageBuffs).toEqual([{ id: "3033088", name: "刚毅", desc: "敌方目标受到的击破伤害降低50%。" }])

    const checkmate = snapshot?.bosses.find((boss) => boss.id === "4.5-aa-checkmate")
    expect(checkmate).toMatchObject({ name: "示例王棋", hp: "400,000 / 500,000 / 400,000", weakness: ["冰"] })
    // 将杀关：我方增益在前、本层敌方词缀在后，各自独立成条而不是拼成一整段。
    expect(checkmate?.stageBuffs.map((buff) => buff.name)).toEqual(["美妙奇笑", "血嗜"])
    expect(checkmate?.stageBuffs[0]?.desc).toBe("我方全体目标欢愉度提高40%。")

    const plight = snapshot?.bosses.find((boss) => boss.id === "4.5-aa-plight")
    expect(plight).toMatchObject({ name: "示例王棋（绝境）", hp: "1,200,000 / 1,500,000 / 1,200,000" })
    expect(plight?.stageBuffs.map((buff) => buff.name)).toEqual(["美妙奇笑", "血嗜+"])

    // 末日幻影：顶层 buff 是赛季机制，buff_list1 的三条全部保留（旧实现只取第一条）。
    const asTop = snapshot?.bosses.find((boss) => boss.id === "4.5-as-top")
    expect(asTop?.mechanic).toEqual({
      id: "末法余烬",
      name: "末法余烬",
      desc: "敌方全体受到的战技伤害提高25%。\n欢愉伤害提高15%。",
    })
    expect(asTop?.stageBuffs.map((buff) => buff.name)).toEqual(["膏腴之地", "攻无不克", "喜上眉梢"])
    expect(asTop?.stageBuffs[0]?.desc).toBe("战技和终结技伤害提高30%。")

    const asBottom = snapshot?.bosses.find((boss) => boss.id === "4.5-as-bottom")
    expect(asBottom?.stageBuffs.map((buff) => buff.name)).toEqual(["才藻富赡"])

    const asStarward = snapshot?.bosses.find((boss) => boss.id === "4.5-as-starward")
    expect(asStarward?.stageBuffs.map((buff) => buff.name)).toEqual(["披坚执锐"])

    // 首领标题取 icon 基础 id 解析出的家族短名，当期变体名保留在副行。
    expect(asTop).toMatchObject({ name: "步离战首·呼雷", variantName: "当期变体首领" })
    expect(asBottom).toMatchObject({ name: "四期示例首领" })
    expect(asBottom?.variantName).toBeUndefined()

    // 虚构叙事：顶层 buff 为 null 时无机制 pill，option + sub_option 全部进 stageBuffs。
    const pfTop = snapshot?.bosses.find((boss) => boss.id === "4.5-pf-top")
    expect(pfTop?.mechanic).toBeNull()
    expect(pfTop?.stageBuffs.map((buff) => buff.name)).toEqual(["狂欢", "狂想", "谜狂", "获得笑点"])
    expect(pfTop?.stageBuffs[0]?.desc).toBe("敌方目标受到的欢愉伤害提高30%。")
    expect(pfTop?.stageBuffs[3]?.desc).toBe("使我方额外积累2点战意值。")

    // 单怪详情按首领粒度拉：缺详情时韧性退回不叠加修正值、抗性为空，阶段本身不受影响。
    expect(knight).toMatchObject({ toughness: "120", resist: {} })

    // 有详情时修正值在全部比例乘完之后叠加，再除以 3：(720 + 60) / 3 = 260。
    expect(checkmate).toMatchObject({ toughness: "260", resist: { 火: "20%", 风: "20%" } })
    expect(plight?.toughness).toBe("260")
  })

  it("远程数据源不可用时返回 null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response),
    )

    expect(await fetchStaticArchiveSnapshot()).toBeNull()
  })
})

function makeGeneratedBoss(id: string, seasonId = "4.5"): BossStage {
  return {
    id,
    seasonId,
    mode: "moc",
    name: "步离战首·呼雷",
    subtitle: "混沌回忆 · 物竞天择",
    hp: "800,000 x2",
    speed: "264",
    toughness: "240",
    weakness: ["物理"],
    resist: {},
    clears: 0,
    mechanic: null,
    stageBuffs: [],
    bannerTone: "red",
  }
}

describe("mergeStaticArchiveConfig", () => {
  it("为缺失的 id 补充生成的敌方阶段", () => {
    const config = cloneSeedConfig()
    const snapshot: StaticArchiveSnapshot = {
      liveVersion: "4.5",
      bosses: [makeGeneratedBoss("4.5-moc-top"), makeGeneratedBoss("4.5-moc-bottom")],
    }

    const merged = mergeStaticArchiveConfig(config, snapshot)

    expect(merged.bosses.map((boss) => boss.id)).toEqual(["4.5-moc-top", "4.5-moc-bottom"])
    expect(merged.seasons).toEqual(config.seasons)
  })

  it("保留业务数据库中已存在的同 id 阶段，不重复生成", () => {
    const config = cloneSeedConfig()
    const existing = makeGeneratedBoss("4.5-moc-top")
    existing.name = "数据库中的名称"
    config.bosses = [existing]

    const snapshot: StaticArchiveSnapshot = {
      liveVersion: "4.5",
      bosses: [makeGeneratedBoss("4.5-moc-top"), makeGeneratedBoss("4.5-moc-bottom")],
    }

    const merged = mergeStaticArchiveConfig(config, snapshot)

    expect(merged.bosses).toHaveLength(2)
    expect(merged.bosses.find((boss) => boss.id === "4.5-moc-top")?.name).toBe("数据库中的名称")
  })

  it("为快照中新出现的赛季补充赛季条目", () => {
    const config = cloneSeedConfig()
    const snapshot: StaticArchiveSnapshot = {
      liveVersion: "4.5",
      bosses: [makeGeneratedBoss("4.3-moc-top", "4.3")],
    }

    const merged = mergeStaticArchiveConfig(config, snapshot)

    expect(merged.seasons).toContainEqual({ id: "4.3", label: "4.3 归档", isCurrent: false })
  })

  it("静态镜像不可用时保留 seed 配置", () => {
    const config = cloneSeedConfig()

    expect(mergeStaticArchiveConfig(config, null)).toEqual(config)
    expect(mergeStaticArchiveConfig(config, { liveVersion: "4.5", bosses: [] })).toEqual(config)
  })
})
