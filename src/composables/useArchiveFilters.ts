import { computed, reactive, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { categoryOptionsFor, isRunFlag } from "@/services/runUtils"
import type { ArchiveConfig, ArchiveFilters, EndgameMode, RunCategory, RunFlag, SortKey } from "@/types/archive"

const modeValues = new Set<EndgameMode>(["moc", "pf", "as", "aa"])
const sortValues = new Set<SortKey>(["score", "limited", "latest"])

function readString(value: unknown): string | undefined {
  return Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  const raw = readString(value)
  if (raw === "1") return true
  if (raw === "0") return false
  return fallback
}

function readCsv(value: unknown): string[] {
  return (readString(value) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function useArchiveFilters(config: () => ArchiveConfig | null) {
  const route = useRoute()
  const router = useRouter()

  const filters = reactive<ArchiveFilters>({
    seasonId: "",
    mode: "moc",
    bossId: "",
    category: "all",
    teamSize: "all",
    cost: "all",
    sort: "score",
    grouping: true,
    continuous: false,
    unitKind: "character",
    flags: [],
    selectedUnitIds: [],
  })

  const availableBosses = computed(() =>
    (config()?.bosses ?? []).filter(
      (boss) => boss.seasonId === filters.seasonId && boss.mode === filters.mode,
    ),
  )

  function hydrateFromQuery() {
    const archiveConfig = config()
    if (!archiveConfig) return
    const query = route.query
    const currentSeason = archiveConfig.seasons.find((season) => season.isCurrent)

    filters.seasonId = readString(query.season) ?? currentSeason?.id ?? archiveConfig.seasons[0]?.id ?? ""

    const nextMode = readString(query.mode)
    filters.mode = nextMode && modeValues.has(nextMode as EndgameMode) ? (nextMode as EndgameMode) : "moc"

    const nextCategory = readString(query.category)
    filters.category = (nextCategory as RunCategory | undefined) ?? "all"

    const nextSort = readString(query.sort)
    filters.sort = nextSort && sortValues.has(nextSort as SortKey) ? (nextSort as SortKey) : "score"

    const teamSize = readString(query.teamSize)
    filters.teamSize = teamSize && teamSize !== "all" ? Number(teamSize) : "all"
    filters.cost = (readString(query.cost) as ArchiveFilters["cost"]) ?? "all"
    filters.grouping = readBoolean(query.grouping, true)
    filters.continuous = readBoolean(query.continuous, false)
    filters.unitKind = readString(query.unitKind) === "lightcone" ? "lightcone" : "character"
    filters.flags = normalizeFlags(readCsv(query.flags))
    filters.selectedUnitIds = readCsv(query.selected)

    const queryBoss = readString(query.bossId)
    const bosses = availableBosses.value
    filters.bossId = bosses.some((boss) => boss.id === queryBoss) ? queryBoss ?? "" : bosses[0]?.id ?? ""
    normalizeCategory()
  }

  /** 标记不随模式与阶段变化，因此 URL 深链里的非法值（含历史遗留的中文文本）直接丢弃。 */
  function normalizeFlags(raw: string[]): RunFlag[] {
    return raw.filter(isRunFlag)
  }

  /** 分类可用集合随模式与阶段变化：URL 深链或切换上下文后落到不可用的值时回落 all。 */
  function normalizeCategory() {
    const allowed: RunCategory[] = ["all", ...categoryOptionsFor(filters.mode, filters.bossId)]
    if (!allowed.includes(filters.category)) filters.category = "all"
  }

  function patchFilter(patch: Partial<ArchiveFilters>) {
    Object.assign(filters, patch)
    if (patch.seasonId || patch.mode) {
      filters.bossId = availableBosses.value[0]?.id ?? ""
    }
    normalizeCategory()
  }

  function toggleFlag(flag: RunFlag) {
    filters.flags = filters.flags.includes(flag)
      ? filters.flags.filter((item) => item !== flag)
      : [...filters.flags, flag]
  }

  function toggleSelectedUnit(unitId: string) {
    filters.selectedUnitIds = filters.selectedUnitIds.includes(unitId)
      ? filters.selectedUnitIds.filter((id) => id !== unitId)
      : [...filters.selectedUnitIds, unitId]
  }

  watch(
    () => config(),
    () => hydrateFromQuery(),
    { immediate: true },
  )

  watch(
    filters,
    () => {
      void router.replace({
        query: {
          season: filters.seasonId,
          mode: filters.mode,
          bossId: filters.bossId,
          category: filters.category,
          teamSize: String(filters.teamSize),
          cost: filters.cost,
          sort: filters.sort,
          grouping: filters.grouping ? "1" : "0",
          continuous: filters.continuous ? "1" : "0",
          unitKind: filters.unitKind,
          flags: filters.flags.join(",") || undefined,
          selected: filters.selectedUnitIds.join(",") || undefined,
        },
      })
    },
    { deep: true },
  )

  return {
    filters,
    availableBosses,
    hydrateFromQuery,
    patchFilter,
    toggleFlag,
    toggleSelectedUnit,
  }
}
