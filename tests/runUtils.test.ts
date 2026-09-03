import { describe, expect, it } from "vitest"
import { seedConfig } from "@/data/seed"
import {
  buildMetaStats,
  categoryLabels,
  categoryOfAsScore,
  categoryOptionsFor,
  filterRuns,
  flagLabels,
  flagOrder,
  flagsOfRun,
  isRunFlag,
  isStarwardStage,
  stageGroupLabels,
  stageGroupOf,
  stageKeyOf,
} from "@/services/runUtils"
import { getRunGoldCounts } from "@/services/unitCost"
import type { ArchiveFilters, ArchiveRun, ArchiveUnit, EndgameMode } from "@/types/archive"
import { fixtureRuns } from "./fixtures/runs"

const baseFilters: ArchiveFilters = {
  seasonId: "4.5",
  mode: "moc",
  bossId: "test-boss-moc",
  category: "all",
  teamSize: "all",
  cost: "all",
  sort: "score",
  grouping: true,
  continuous: false,
  unitKind: "character",
  flags: [],
  selectedUnitIds: [],
}

describe("runUtils", () => {
  it("按模式、boss、分类和成本过滤记录", () => {
    const runs = filterRuns(fixtureRuns, {
      ...baseFilters,
      category: "fullStars",
      cost: "17-32",
    })

    expect(runs).toHaveLength(1)
    expect(runs[0]?.teamName).toBe("击破流萤")
  })

  it("限定角色时只返回包含该角色的队伍", () => {
    const runs = filterRuns(fixtureRuns, {
      ...baseFilters,
      selectedUnitIds: ["the-herta"],
    })

    expect(runs.map((run) => run.teamName)).toEqual(["大黑塔双同谐"])
  })

  it("生成角色、光锥、组合和成本统计", () => {
    const runs = filterRuns(fixtureRuns, baseFilters)
    const stats = buildMetaStats(runs, seedConfig.units)

    expect(stats.characterUsage[0]?.unit.name).toBe("阮•梅")
    expect(stats.lightconeUsage.length).toBeGreaterThan(0)
    expect(stats.teamCombos.length).toBe(3)
    expect(stats.costBuckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(runs.length)
  })

  it("按成本口径统计限定金与常驻金", () => {
    const units: ArchiveUnit[] = [
      { id: "acheron", kind: "character", name: "黄泉", path: "虚无", element: "雷", rarity: 5, limited: true },
      { id: "whereabouts", kind: "lightcone", name: "行于流逝的岸", path: "虚无", rarity: 5, limited: true },
      { id: "welt", kind: "character", name: "瓦尔特", path: "虚无", element: "虚数", rarity: 5, limited: false },
      { id: "night-on-the-milky-way", kind: "lightcone", name: "银河铁道之夜", path: "智识", rarity: 5, limited: true },
      { id: "tingyun", kind: "character", name: "停云", path: "同谐", element: "雷", rarity: 4, limited: false },
      { id: "dance-dance-dance", kind: "lightcone", name: "舞！舞！舞！", path: "同谐", rarity: 4, limited: false },
    ]
    const run = {
      ...fixtureRuns[0],
      units: [
        { unitId: "acheron", eidolon: 6 },
        { unitId: "welt", eidolon: 0 },
        { unitId: "tingyun", eidolon: 6 },
      ],
      lightcones: [
        { unitId: "whereabouts", superimposition: 5 },
        { unitId: "night-on-the-milky-way", superimposition: 5 },
        { unitId: "dance-dance-dance", superimposition: 5 },
      ],
    } as ArchiveRun

    // 限定 = 黄泉 E6(7) + 专武 S5(5)；常驻 = 瓦尔特 E0(1) + 银河铁道之夜 S5(5)；低星角色与光锥不计。
    expect(getRunGoldCounts(run, units)).toEqual({ limited: 12, standard: 6 })
  })

  it("分类可用集合随模式与阶段变化", () => {
    expect(categoryOptionsFor("moc", "4.5-moc-top")).toEqual(["zeroCycle", "fullStars"])
    expect(categoryOptionsFor("pf", "4.5-pf-top")).toEqual(["zeroCycle", "fullStars"])
    expect(categoryOptionsFor("aa", "4.5-aa-k1")).toEqual(["zeroCycle", "fullStars"])
    expect(categoryOptionsFor("aa", "4.5-aa-plight")).toEqual(["plightZeroCycle", "plightFullStars"])
    expect(categoryOptionsFor("as", "4.5-as-top")).toEqual(["asScore3400", "asScore3650", "asScore3850", "asScore4000"])
  })

  it("末日幻影分数按区间归类，边界归高一档，空档不归类", () => {
    expect(categoryOfAsScore(3400)).toBe("asScore3400")
    expect(categoryOfAsScore(3649)).toBe("asScore3400")
    expect(categoryOfAsScore(3650)).toBe("asScore3650")
    expect(categoryOfAsScore(3850)).toBe("asScore3850")
    expect(categoryOfAsScore(3899)).toBe("asScore3850")
    expect(categoryOfAsScore(3900)).toBeNull()
    expect(categoryOfAsScore(3999)).toBeNull()
    expect(categoryOfAsScore(4000)).toBe("asScore4000")
    expect(categoryOfAsScore(3399)).toBeNull()
    expect(categoryOfAsScore(4001)).toBeNull()
    expect(categoryOfAsScore(3650.5)).toBeNull()
  })

  it("每个具体分类都有中文文案，阶段键从 id 末段解析", () => {
    expect(Object.keys(categoryLabels)).toEqual([
      "zeroCycle",
      "fullStars",
      "plightZeroCycle",
      "plightFullStars",
      "asScore3400",
      "asScore3650",
      "asScore3850",
      "asScore4000",
    ])
    expect(categoryLabels.asScore3850).toBe("3850-3899")
    expect(stageKeyOf("4.5-aa-plight")).toBe("plight")
    expect(stageKeyOf("")).toBe("")
  })

  it("标记筛选按 AND 语义命中，且每个标记都有中文文案", () => {
    expect(Object.keys(flagLabels)).toEqual(flagOrder)

    const reviveOnly = filterRuns(fixtureRuns, { ...baseFilters, flags: ["revive"] })
    expect(reviveOnly.map((run) => run.id)).toEqual(["run-001", "run-003"])

    const both = filterRuns(fixtureRuns, { ...baseFilters, flags: ["revive", "bpWeapon"] })
    expect(both.map((run) => run.id)).toEqual(["run-003"])
  })

  it("flagsOfRun 忽略库中遗留的自由文本标记并按 flagOrder 归一", () => {
    const run = fixtureRuns.find((item) => item.id === "run-001")
    expect(run).toBeTruthy()
    expect(flagsOfRun({ ...run!, tags: ["bpWeapon", "无复活", "revive", "未知标记"] })).toEqual(["revive", "bpWeapon"])
    expect(flagsOfRun({ ...run!, tags: [] })).toEqual([])
    expect(isRunFlag("revive")).toBe(true)
    expect(isRunFlag("无复活")).toBe(false)
    expect(isRunFlag(undefined)).toBe(false)
  })

  it("异相仲裁按骑士关与将杀关分组，其余模式统一为首领关", () => {
    const group = (mode: EndgameMode, stageKey: string) => stageGroupOf({ id: `4.5-${mode}-${stageKey}`, mode })

    expect(group("aa", "k1")).toBe("knight")
    expect(group("aa", "k3")).toBe("knight")
    expect(group("aa", "checkmate")).toBe("checkmate")
    expect(group("aa", "plight")).toBe("checkmate")
    expect(group("aa", "top")).toBe("boss")
    expect(group("moc", "starward")).toBe("boss")
    expect(group("as", "top")).toBe("boss")
    expect(stageGroupLabels.checkmate).toBe("将杀关")
  })

  it("只有第 3 阶段被判为星启", () => {
    expect(isStarwardStage({ id: "4.5-as-starward" })).toBe(true)
    expect(isStarwardStage({ id: "4.5-as-top" })).toBe(false)
    expect(isStarwardStage({ id: "4.5-aa-plight" })).toBe(false)
  })
})
