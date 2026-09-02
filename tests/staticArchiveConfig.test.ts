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
    "4035010": {
      rank: "LittleBoss",
      icon: "SpriteOutput/MonsterFigure/Monster_4035010.png",
      child: [4035010],
      weak: ["量子"],
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
      child: [{ Id: 2034100, HPModifyRatio: 1, SpeedModifyRatio: 1, StanceModifyRatio: 1 }],
    },
    "1004010": {
      HPBase: 1000,
      SpeedBase: 100,
      StanceBase: 360,
      MaxMonsterPhase: 2,
      child: [{ Id: 1004010, HPModifyRatio: 1, SpeedModifyRatio: 1, StanceModifyRatio: 1 }],
    },
    "4035010": {
      HPBase: 1000,
      SpeedBase: 120,
      StanceBase: 720,
      MaxMonsterPhase: 3,
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
  [`${DATA_SITE}/hsr/4.5.51/zh/peak/9.json`]: {
    name: "军团再临",
    pre_level: [
      {
        id: 901,
        name: "骑士（一）",
        event_id_list: [{ hard_level_group: 3, level: 95, monster_list: [{ monster0: 1004010 }] }],
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
      infinite_list: { "9041": { elite_group: 1, monster_group_id_list: [4035010] } },
    },
    boss_config: {
      hard_name: "将杀王棋•绝境",
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
      "4.5-aa-k1",
      "4.5-aa-checkmate",
      "4.5-aa-plight",
    ])

    const legacyTop = snapshot?.bosses.find((boss) => boss.id === "4.4-moc-top")
    expect(legacyTop).toMatchObject({
      seasonId: "4.4",
      mode: "moc",
      name: "四期示例首领",
      subtitle: "混沌回忆 / 扫除风暴 / 上半",
      hp: "800,000 x2",
      weakness: ["量子"],
      imageUrl: `${DATA_SITE}/assets/hsr/monstermiddleicon/Monster_2034100.webp`,
    })

    const top = snapshot?.bosses.find((boss) => boss.id === "4.5-moc-top")
    expect(top).toMatchObject({
      seasonId: "4.5",
      mode: "moc",
      name: "步离战首·呼雷",
      subtitle: "混沌回忆 / 物竞天择 / 上半",
      hp: "800,000 x2",
      speed: "264",
      toughness: "720",
      weakness: ["物理"],
      imageUrl: `${DATA_SITE}/assets/hsr/monstermiddleicon/Monster_2034010.webp`,
    })
    expect(top?.monsters?.[0]).toMatchObject({ id: "2034010", name: "步离战首·呼雷" })

    const starward = snapshot?.bosses.find((boss) => boss.id === "4.5-moc-starward")
    expect(starward?.hp).toBe("400,000 x2")
    expect(starward?.weakness).toEqual(["物理", "火", "风"])

    const knight = snapshot?.bosses.find((boss) => boss.id === "4.5-aa-k1")
    expect(knight).toMatchObject({ name: "示例骑士", hp: "1,200,000 x2", weakness: ["冰", "雷"] })

    const checkmate = snapshot?.bosses.find((boss) => boss.id === "4.5-aa-checkmate")
    expect(checkmate).toMatchObject({ name: "示例王棋", hp: "400,000 x3", weakness: ["冰"] })

    const plight = snapshot?.bosses.find((boss) => boss.id === "4.5-aa-plight")
    expect(plight).toMatchObject({ name: "示例王棋（绝境）", hp: "1,200,000 x3" })
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
    subtitle: "混沌回忆 / 物竞天择 / 上半",
    hp: "800,000 x2",
    speed: "264",
    toughness: "720",
    weakness: ["物理"],
    resist: {},
    clears: 0,
    memoryBuff: "",
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
