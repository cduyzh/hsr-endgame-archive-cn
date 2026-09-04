import type {
  ArchiveFilters,
  ArchiveRun,
  ArchiveUnit,
  BossStage,
  EndgameMode,
  MetaStats,
  ModeOption,
  RunCategory,
  RunFlag,
  SpecificRunCategory,
} from "@/types/archive"
import { getRunGoldCounts } from "@/services/unitCost"

export function matchesCategory(run: ArchiveRun, category: RunCategory): boolean {
  return category === "all" || run.category === category
}

export const categoryLabels: Record<SpecificRunCategory, string> = {
  zeroCycle: "0 轮竞速",
  fullStars: "满星记录",
  plightZeroCycle: "绝境 0 轮竞速",
  plightFullStars: "绝境满星记录",
  asScore3400: "3400-3650",
  asScore3650: "3650-3850",
  asScore3850: "3850-3899",
  asScore4000: "4000 满分",
}

/** 标记的展示顺序：筛选面板、投稿表单与记录徽标都按此排列。 */
export const flagOrder: RunFlag[] = ["revive", "firewall", "bpWeapon"]

/** 标记中文文案的唯一来源，不要在组件里另写一份。 */
export const flagLabels: Record<RunFlag, string> = {
  revive: "复活",
  firewall: "火墙",
  bpWeapon: "大月卡武器",
}

const flagValues = new Set<string>(flagOrder)

export function isRunFlag(value: unknown): value is RunFlag {
  return typeof value === "string" && flagValues.has(value)
}

/** `runs.tags` 是开放 text，这里只保留仍是合法标记的值，并按 `flagOrder` 归一顺序。 */
export function flagsOfRun(run: ArchiveRun): RunFlag[] {
  const tags = new Set(run.tags.filter(isRunFlag))
  return flagOrder.filter((flag) => tags.has(flag))
}

/** 末日幻影按剩余行动值计分，满分 4000。 */
export const AS_MAX_SCORE = 4000

/** 分数区间取「归入更高一档」的口径，3899–4000 之间的分数不属于任何档。 */
const asScoreBands: Array<{ category: SpecificRunCategory; min: number; max: number }> = [
  { category: "asScore4000", min: 4000, max: 4000 },
  { category: "asScore3850", min: 3850, max: 3899 },
  { category: "asScore3650", min: 3650, max: 3849 },
  { category: "asScore3400", min: 3400, max: 3649 },
]

export function categoryOfAsScore(score: number): SpecificRunCategory | null {
  if (!Number.isInteger(score)) return null
  return asScoreBands.find((band) => score >= band.min && score <= band.max)?.category ?? null
}

/** 阶段 id 规则为 `${seasonId}-${mode}-${stageKey}`，末段即阶段键。 */
export function stageKeyOf(bossId: string): string {
  return bossId.split("-").pop() ?? ""
}

/** 敌方阶段的检索分组：异相仲裁的骑士关与将杀关（含绝境）在业务上是两类不同的挑战。 */
export type StageGroup = "boss" | "knight" | "checkmate"

export const stageGroupOrder: StageGroup[] = ["boss", "knight", "checkmate"]

export const stageGroupLabels: Record<StageGroup, string> = {
  boss: "首领关",
  knight: "骑士关",
  checkmate: "将杀关",
}

export function stageGroupOf(boss: Pick<BossStage, "id" | "mode">): StageGroup {
  if (boss.mode !== "aa") return "boss"
  const stageKey = stageKeyOf(boss.id)
  if (stageKey.startsWith("k")) return "knight"
  return stageKey === "checkmate" || stageKey === "plight" ? "checkmate" : "boss"
}

/** 第 3 阶段（星启）血量与难度显著高于上下半，需要单独醒目标识。 */
export function isStarwardStage(boss: Pick<BossStage, "id">): boolean {
  return stageKeyOf(boss.id) === "starward"
}

export function categoryOptionsFor(mode: EndgameMode, bossId: string): SpecificRunCategory[] {
  if (mode === "as") return ["asScore3400", "asScore3650", "asScore3850", "asScore4000"]
  if (mode === "aa" && stageKeyOf(bossId) === "plight") return ["plightZeroCycle", "plightFullStars"]
  return ["zeroCycle", "fullStars"]
}

/**
 * 进入站点与新建投稿的默认模式：带徽标（`NEW`）的那个即当期主推。
 * 徽标在 seed `config.json` 的 `modes` 上随版本迁移，所以这里按徽标取，不要在调用处写死模式 id。
 */
export function defaultModeOf(modes: Array<Pick<ModeOption, "id" | "badge">>): EndgameMode {
  return modes.find((mode) => mode.badge)?.id ?? modes[0]?.id ?? "moc"
}

/** 区间筛选的统一语义：`null` 表示该侧不限，成本与分数共用。 */
export function matchesRange(value: number, min: number | null, max: number | null): boolean {
  return (min === null || value >= min) && (max === null || value <= max)
}

export function filterRuns(runs: ArchiveRun[], filters: ArchiveFilters, units: ArchiveUnit[] = []): ArchiveRun[] {
  const selected = new Set(filters.selectedUnitIds)
  const flags = new Set(filters.flags)

  return runs
    .filter((run) => run.seasonId === filters.seasonId)
    .filter((run) => run.mode === filters.mode)
    .filter((run) => run.bossId === filters.bossId)
    .filter((run) => matchesCategory(run, filters.category))
    .filter((run) => filters.teamSize === "all" || run.units.length === filters.teamSize)
    .filter((run) => matchesRange(run.cost, filters.costMin, filters.costMax))
    .filter((run) => matchesRange(run.score, filters.scoreMin, filters.scoreMax))
    .filter((run) => {
      if (selected.size === 0) return true
      const runUnitIds = new Set([...run.units, ...run.lightcones].map((unit) => unit.unitId))
      return [...selected].every((id) => runUnitIds.has(id))
    })
    .filter((run) => {
      if (flags.size === 0) return true
      return [...flags].every((flag) => run.tags.includes(flag))
    })
    .sort((a, b) => {
      if (filters.sort === "latest") {
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      }
      if (filters.sort === "limited") {
        const aLimited = units.length > 0 ? getRunGoldCounts(a, units).limited : a.limitedCount
        const bLimited = units.length > 0 ? getRunGoldCounts(b, units).limited : b.limitedCount
        return aLimited - bLimited || a.cycle - b.cycle || b.score - a.score
      }
      return a.cycle - b.cycle || b.score - a.score || a.cost - b.cost
    })
}

export function buildMetaStats(runs: ArchiveRun[], units: ArchiveUnit[]): MetaStats {
  const unitById = new Map(units.map((unit) => [unit.id, unit]))
  const characterCounts = new Map<string, number>()
  const lightconeCounts = new Map<string, number>()
  const comboCounts = new Map<string, { count: number; bestCycle: number }>()
  const buckets = new Map([
    ["0-8", 0],
    ["9-16", 0],
    ["17-32", 0],
    ["33-48", 0],
  ])

  for (const run of runs) {
    for (const unit of run.units) {
      characterCounts.set(unit.unitId, (characterCounts.get(unit.unitId) ?? 0) + 1)
    }
    for (const unit of run.lightcones) {
      lightconeCounts.set(unit.unitId, (lightconeCounts.get(unit.unitId) ?? 0) + 1)
    }

    const comboName = run.units
      .map((entry) => unitById.get(entry.unitId)?.name ?? entry.unitId)
      .join(" / ")
    const existing = comboCounts.get(comboName)
    comboCounts.set(comboName, {
      count: (existing?.count ?? 0) + 1,
      bestCycle: Math.min(existing?.bestCycle ?? run.cycle, run.cycle),
    })

    if (run.cost <= 8) buckets.set("0-8", (buckets.get("0-8") ?? 0) + 1)
    else if (run.cost <= 16) buckets.set("9-16", (buckets.get("9-16") ?? 0) + 1)
    else if (run.cost <= 32) buckets.set("17-32", (buckets.get("17-32") ?? 0) + 1)
    else buckets.set("33-48", (buckets.get("33-48") ?? 0) + 1)
  }

  const usage = (counts: Map<string, number>, kind: ArchiveUnit["kind"]) =>
    [...counts.entries()]
      .map(([id, count]) => ({ unit: unitById.get(id), count }))
      .filter((entry): entry is { unit: ArchiveUnit; count: number } => Boolean(entry.unit))
      .filter((entry) => entry.unit.kind === kind)
      .map((entry) => ({
        ...entry,
        rate: runs.length === 0 ? 0 : Math.round((entry.count / runs.length) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count)

  return {
    characterUsage: usage(characterCounts, "character"),
    lightconeUsage: usage(lightconeCounts, "lightcone"),
    teamCombos: [...comboCounts.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.count - a.count || a.bestCycle - b.bestCycle),
    costBuckets: [...buckets.entries()].map(([label, count]) => ({ label, count })),
  }
}
