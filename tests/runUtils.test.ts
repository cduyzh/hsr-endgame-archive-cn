import { describe, expect, it } from "vitest"
import { seedConfig, seedRuns } from "@/data/seed"
import { buildMetaStats, filterRuns } from "@/services/runUtils"
import { getRunGoldCounts } from "@/services/unitCost"
import type { ArchiveFilters, ArchiveRun, ArchiveUnit } from "@/types/archive"

const baseFilters: ArchiveFilters = {
  seasonId: "4.3",
  mode: "moc",
  bossId: "flame-reaver",
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
    const runs = filterRuns(seedRuns, {
      ...baseFilters,
      category: "fullStars",
      cost: "17-32",
    })

    expect(runs).toHaveLength(1)
    expect(runs[0]?.teamName).toBe("击破流萤")
  })

  it("限定角色时只返回包含该角色的队伍", () => {
    const runs = filterRuns(seedRuns, {
      ...baseFilters,
      selectedUnitIds: ["the-herta"],
    })

    expect(runs.map((run) => run.teamName)).toEqual(["大黑塔双同谐"])
  })

  it("生成角色、光锥、组合和成本统计", () => {
    const runs = filterRuns(seedRuns, baseFilters)
    const stats = buildMetaStats(runs, seedConfig.units)

    expect(stats.characterUsage[0]?.unit.name).toBe("开拓者・记忆")
    expect(stats.lightconeUsage.length).toBeGreaterThan(0)
    expect(stats.teamCombos.length).toBe(2)
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
      ...seedRuns[0],
      units: units.map((unit) => ({ unitId: unit.id, eidolon: 0 })),
    } as ArchiveRun

    expect(getRunGoldCounts(run, units)).toEqual({ limited: 1, standard: 2 })
  })
})
