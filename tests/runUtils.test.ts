import { describe, expect, it } from "vitest"
import { seedConfig } from "@/data/seed"
import {
  buildMetaStats,
  categoryLabels,
  categoryOfAsScore,
  categoryOptionsFor,
  filterRuns,
  stageKeyOf,
} from "@/services/runUtils"
import { getRunGoldCounts } from "@/services/unitCost"
import type { ArchiveFilters, ArchiveRun, ArchiveUnit } from "@/types/archive"
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

  it("按角色规则统计限定金与常驻金", () => {
    const units: ArchiveUnit[] = [
      { id: "trailblazer-remembrance", kind: "character", name: "开拓者・记忆", path: "记忆", element: "冰", rarity: 5, limited: false },
      { id: "welt", kind: "character", name: "瓦尔特", path: "虚无", element: "虚数", rarity: 5, limited: false },
      { id: "bronya", kind: "character", name: "布洛妮娅", path: "同谐", element: "风", rarity: 5, limited: false },
      { id: "acheron", kind: "character", name: "黄泉", path: "虚无", element: "雷", rarity: 5, limited: false },
      { id: "gallagher", kind: "character", name: "加拉赫", path: "丰饶", element: "火", rarity: 4, limited: false },
    ]
    const run = {
      ...fixtureRuns[0],
      units: units.map((unit) => ({ unitId: unit.id, eidolon: 0 })),
    } as ArchiveRun

    expect(getRunGoldCounts(run, units)).toEqual({ limited: 1, standard: 2 })
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
})
