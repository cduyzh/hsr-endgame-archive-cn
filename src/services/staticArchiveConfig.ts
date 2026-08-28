import { dataSourceUrl, monsterImageUrl } from "./dataSource"
import type { ArchiveConfig, BossMonsterInfo, BossStage, ElementType, EndgameMode, Season } from "@/types/archive"

type StaticMode = "moc" | "fiction" | "doom" | "peak"
type LocalizedText = Partial<Record<"zh" | "en" | "ja" | "ko", string>>

interface LocalCacheManifest {
  hsr?: {
    latest?: string
    live?: string
  }
}

interface SeasonIndexEntry {
  id?: number
  Id?: number
  ID?: number
  name?: string
  zh?: string
  en?: string
}

interface StaticBuff {
  name?: string | null
  desc?: string | null
}

interface StaticLevel {
  id?: number
  name?: string | null
  group_name?: string | null
  desc?: string | null
  damage_type?: string[]
  damage_type1?: string[]
  damage_type2?: string[]
  npc_monster_id_list1?: number[]
  npc_monster_id_list2?: number[]
  boss_monster_id1?: number
  boss_monster_id2?: number
  boss_monster_id?: number
  event_id_list?: StaticStageEvent[]
  event_id_list1?: StaticStageEvent[]
  event_id_list2?: StaticStageEvent[]
}

interface StaticStageEvent {
  monster_list?: Array<Record<string, number>>
}

interface StaticDetail {
  id?: number
  name?: string | null
  buff?: StaticBuff | null
  level?: StaticLevel[]
  boss_config?: {
    hard_name?: string | null
    buff_list?: StaticBuff[]
    event_id_list?: StaticStageEvent[]
  }
}

interface StaticMonster extends LocalizedText {
  child?: number[]
  desc?: string
  icon?: string
  rank?: string
  weak?: string[]
}

interface StaticPhase {
  name: string
  subtitle: string
  weakness: ElementType[]
  memoryBuff?: string
  imageUrl?: string
  imageAlt?: string
  monsters?: BossMonsterInfo[]
}

interface MonsterLookup {
  monsters: Map<number, StaticMonster>
  imageIds: Map<number, number>
}

export interface StaticArchiveSnapshot {
  liveVersion?: string
  cacheVersion?: string
  seasons: Partial<Record<StaticMode, string>>
  phases: Partial<Record<EndgameMode, StaticPhase[]>>
}

const modeToStaticMode: Record<EndgameMode, StaticMode> = {
  moc: "moc",
  pf: "fiction",
  as: "doom",
  aa: "peak",
}

const detailDirByMode: Record<StaticMode, string> = {
  moc: "maze",
  fiction: "story",
  doom: "boss",
  peak: "peak",
}

const modeLabelByStaticMode: Record<StaticMode, string> = {
  moc: "混沌回忆",
  fiction: "虚构叙事",
  doom: "末日幻影",
  peak: "异相仲裁",
}

const damageTypeMap: Record<string, ElementType> = {
  Physical: "物理",
  Fire: "火",
  Ice: "冰",
  Thunder: "雷",
  Wind: "风",
  Quantum: "量子",
  Imaginary: "虚数",
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/#\d+(?:\[i\])?/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function getLocalizedName(value: LocalizedText | undefined): string {
  return cleanText(value?.zh ?? value?.en ?? value?.ja ?? value?.ko)
}

function mapWeakness(values: string[] | undefined): ElementType[] {
  return (values ?? []).map((value) => damageTypeMap[value]).filter((value): value is ElementType => Boolean(value))
}

function getMonsterImageId(monster: StaticMonster, fallbackId: number): number {
  const iconId = /Monster_(\d+)/.exec(monster.icon ?? "")?.[1]
  return iconId ? Number(iconId) : fallbackId
}

function buildMonsterLookup(monsters: Record<string, StaticMonster>): MonsterLookup {
  const monsterMap = new Map<number, StaticMonster>()
  const imageIds = new Map<number, number>()

  for (const [id, monster] of Object.entries(monsters)) {
    const numericId = Number(id)
    const imageId = getMonsterImageId(monster, numericId)
    if (Number.isFinite(numericId)) {
      monsterMap.set(numericId, monster)
      imageIds.set(numericId, imageId)
    }

    for (const childId of monster.child ?? []) {
      monsterMap.set(childId, monster)
      imageIds.set(childId, imageId)
    }
  }

  return {
    monsters: monsterMap,
    imageIds,
  }
}

function getMonsterName(lookup: MonsterLookup, ids: Array<number | undefined>): string | undefined {
  for (const id of ids) {
    if (!id) continue
    const name = getLocalizedName(lookup.monsters.get(id))
    if (name) return name
  }

  return undefined
}

function getMonsterWeakness(lookup: MonsterLookup, ids: Array<number | undefined>): ElementType[] {
  for (const id of ids) {
    if (!id) continue
    const weakness = mapWeakness(lookup.monsters.get(id)?.weak)
    if (weakness.length > 0) return weakness
  }

  return []
}

function getMonsterImageUrl(lookup: MonsterLookup, ids: Array<number | undefined>): string | undefined {
  for (const id of ids) {
    if (!id) continue
    const imageId = lookup.imageIds.get(id)
    if (imageId) return monsterImageUrl(imageId)
  }

  return undefined
}

function buildMonsterInfo(lookup: MonsterLookup, ids: Array<number | undefined>): BossMonsterInfo[] {
  const seen = new Set<string>()
  const monsters: BossMonsterInfo[] = []

  for (const id of ids) {
    if (!id) continue
    const monster = lookup.monsters.get(id)
    const name = getLocalizedName(monster)
    if (!monster || !name || seen.has(name)) continue
    seen.add(name)

    monsters.push({
      id: String(id),
      name,
      rank: monster.rank ?? "",
      imageUrl: getMonsterImageUrl(lookup, [id]),
      imageAlt: `${name} 敌方图片`,
      weakness: mapWeakness(monster.weak),
      description: cleanText(monster.desc) || undefined,
    })
  }

  return monsters.slice(0, 4)
}

function dedupeMonsterInfo(monsters: BossMonsterInfo[]): BossMonsterInfo[] {
  const seen = new Set<string>()
  const uniqueMonsters: BossMonsterInfo[] = []

  for (const monster of monsters) {
    const key = `${monster.id}:${monster.name}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueMonsters.push(monster)
  }

  return uniqueMonsters
}

function flattenStageMonsterIds(events: StaticStageEvent[] | undefined): number[] {
  return (events ?? []).flatMap((event) => (event.monster_list ?? []).flatMap((wave) => Object.values(wave)))
}

function getSeasonName(mode: StaticMode, seasonId: number, detail: StaticDetail | StaticDetail[] | undefined): string {
  if (Array.isArray(detail)) {
    const finalLevel = [...detail].reverse().find((level) => cleanText(level.group_name || level.name))
    return cleanText(finalLevel?.group_name || finalLevel?.name) || `${modeLabelByStaticMode[mode]} ${seasonId}`
  }

  return cleanText(detail?.name) || `${modeLabelByStaticMode[mode]} ${seasonId}`
}

function getFinalLevel(detail: StaticDetail | StaticDetail[] | undefined, mode: StaticMode): StaticLevel | undefined {
  if (Array.isArray(detail)) {
    return [...detail].reverse().find((level) => cleanText(level.name))
  }

  if (mode === "peak") {
    return {
      name: detail?.boss_config?.hard_name ?? detail?.name,
      desc: detail?.boss_config?.buff_list?.[0]?.desc ?? undefined,
    }
  }

  return [...(detail?.level ?? [])].reverse().find((level) => cleanText(level.name))
}

function getDetailBuff(detail: StaticDetail | StaticDetail[] | undefined, level: StaticLevel | undefined): string | undefined {
  if (Array.isArray(detail)) {
    return cleanText(level?.desc) || undefined
  }

  return cleanText(detail?.buff?.desc) || cleanText(level?.desc) || cleanText(detail?.boss_config?.buff_list?.[0]?.desc) || undefined
}

function buildSidePhases(
  mode: StaticMode,
  seasonName: string,
  level: StaticLevel,
  lookup: MonsterLookup,
  memoryBuff?: string,
): StaticPhase[] {
  const levelName = cleanText(level.name) || seasonName
  const sides = [
    {
      label: "上半",
      ids: [
        level.boss_monster_id1,
        level.boss_monster_id,
        ...(level.npc_monster_id_list1 ?? []),
        ...flattenStageMonsterIds(level.event_id_list1),
        ...flattenStageMonsterIds(level.event_id_list),
      ],
      weakness: mapWeakness(level.damage_type1 ?? level.damage_type),
    },
    {
      label: "下半",
      ids: [
        level.boss_monster_id2,
        ...(level.npc_monster_id_list2 ?? []),
        ...flattenStageMonsterIds(level.event_id_list2),
      ],
      weakness: mapWeakness(level.damage_type2 ?? level.damage_type),
    },
  ]

  return sides
    .map((side) => {
      const monsterName = getMonsterName(lookup, side.ids)
      const name = monsterName || `${levelName} ${side.label}`
      const weakness = side.weakness.length > 0 ? side.weakness : getMonsterWeakness(lookup, side.ids)

      return {
        name,
        subtitle: `${modeLabelByStaticMode[mode]} / ${levelName} / ${side.label}`,
        weakness,
        memoryBuff,
        imageUrl: getMonsterImageUrl(lookup, side.ids),
        imageAlt: `${name} 敌方图片`,
        monsters: buildMonsterInfo(lookup, side.ids),
      }
    })
    .filter((phase) => phase.name)
}

function buildCombinedPhase(mode: StaticMode, seasonName: string, phases: StaticPhase[], level: StaticLevel): StaticPhase {
  const levelName = cleanText(level.name) || seasonName
  const phaseNames = phases.map((phase) => phase.name).filter(Boolean)
  const weakness = Array.from(new Set(phases.flatMap((phase) => phase.weakness)))
  const primaryPhase = phases.find((phase) => phase.imageUrl)

  return {
    name: phaseNames.length > 1 ? phaseNames.join(" / ") : levelName,
    subtitle: `${modeLabelByStaticMode[mode]} / ${levelName}`,
    weakness,
    memoryBuff: phases.find((phase) => phase.memoryBuff)?.memoryBuff,
    imageUrl: primaryPhase?.imageUrl,
    imageAlt: primaryPhase?.imageAlt,
    monsters: dedupeMonsterInfo(phases.flatMap((phase) => phase.monsters ?? [])).slice(0, 4),
  }
}

function buildPhases(
  mode: StaticMode,
  detail: StaticDetail | StaticDetail[] | undefined,
  lookup: MonsterLookup,
): StaticPhase[] {
  const seasonName = getSeasonName(mode, 0, detail)
  const level = getFinalLevel(detail, mode)
  if (!level) return []

  const memoryBuff = getDetailBuff(detail, level)
  const peakIds = Array.isArray(detail) ? [] : flattenStageMonsterIds(detail?.boss_config?.event_id_list)
  const sidePhases = buildSidePhases(mode, seasonName, level, lookup, memoryBuff)
  if (mode === "moc") return sidePhases
  if (mode === "peak") {
    const name = cleanText(level.name) || seasonName

    return [
      {
        name,
        subtitle: `${modeLabelByStaticMode[mode]} / 当前挑战`,
        weakness: mapWeakness(level.damage_type),
        memoryBuff,
        imageUrl: getMonsterImageUrl(lookup, peakIds),
        imageAlt: `${name} 敌方图片`,
        monsters: buildMonsterInfo(lookup, peakIds),
      },
    ]
  }

  return [buildCombinedPhase(mode, seasonName, sidePhases, level)]
}

function replaceCurrentSeason(seasons: Season[], snapshot: StaticArchiveSnapshot): Season[] {
  const liveVersion = snapshot.liveVersion
  if (!liveVersion) return seasons

  const currentIndex = seasons.findIndex((season) => season.isCurrent)
  if (currentIndex === -1) {
    return [{ id: liveVersion, label: `${liveVersion} 当前期`, isCurrent: true }, ...seasons]
  }

  return seasons.map((season, index) =>
    index === currentIndex
      ? {
          ...season,
          label: `${liveVersion} 当前期`,
        }
      : season,
  )
}

function mergeBosses(bosses: BossStage[], snapshot: StaticArchiveSnapshot, currentSeasonId: string | undefined): BossStage[] {
  if (!currentSeasonId) return bosses

  return bosses.map((boss) => {
    const modeBosses = bosses.filter((item) => item.seasonId === boss.seasonId && item.mode === boss.mode)
    const phaseIndex = modeBosses.findIndex((item) => item.id === boss.id)
    const phases = snapshot.phases[boss.mode] ?? []
    const phase = phases.length === 1 ? phases[0] : phases[phaseIndex]

    if (boss.seasonId !== currentSeasonId || !phase) return boss

    return {
      ...boss,
      name: phase.name || boss.name,
      subtitle: phase.subtitle || boss.subtitle,
      weakness: phase.weakness.length > 0 ? phase.weakness : boss.weakness,
      memoryBuff: phase.memoryBuff || boss.memoryBuff,
      imageUrl: phase.imageUrl || boss.imageUrl,
      imageAlt: phase.imageAlt || boss.imageAlt,
      monsters: phase.monsters ?? boss.monsters,
    }
  })
}

export function mergeStaticArchiveConfig(config: ArchiveConfig, snapshot: StaticArchiveSnapshot | null): ArchiveConfig {
  if (!snapshot) return config

  return {
    ...config,
    seasons: replaceCurrentSeason(config.seasons, snapshot),
    bosses: mergeBosses(config.bosses, snapshot, config.seasons.find((season) => season.isCurrent)?.id),
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

/** 各模式对应的索引文件名 */
const listFileByMode: Record<StaticMode, string> = {
  moc: "maze.json",
  fiction: "maze_extra.json",
  doom: "maze_boss.json",
  peak: "maze_peak.json",
}

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 从模式索引 JSON 中提取去重后的最大赛季 id 作为当前赛季。
 * 远程数据源不提供 cache-plan.json，因此必须实时推导。
 */
async function getCurrentSeasonIds(
  ver: string,
): Promise<Partial<Record<StaticMode, number>>> {
  const entries = await Promise.all(
    (Object.keys(listFileByMode) as StaticMode[]).map(async (mode) => {
      try {
        const listJson = await fetchJson<Record<string, SeasonIndexEntry>>(
          dataSourceUrl(`hsr/${ver}/${listFileByMode[mode]}`),
        )
        const maxId = Object.values(listJson)
          .map((entry) => toNum(entry?.id ?? entry?.Id ?? entry?.ID))
          .filter((id) => id > 0)
          .reduce((max, id) => (id > max ? id : max), 0)
        return [mode, maxId || null] as const
      } catch {
        return [mode, null] as const
      }
    }),
  )
  return Object.fromEntries(entries.filter(([, id]) => id !== null)) as Partial<Record<StaticMode, number>>
}

export async function fetchStaticArchiveSnapshot(): Promise<StaticArchiveSnapshot | null> {
  try {
    const manifest = await fetchJson<LocalCacheManifest>(dataSourceUrl("manifest.json"))
    const latest = manifest.hsr?.latest
    if (!latest) return null

    const version = latest
    const locale = "zh"
    const monsterLookup = buildMonsterLookup(
      await fetchJson<Record<string, StaticMonster>>(dataSourceUrl(`hsr/${version}/monster.json`)),
    )
    const currentSeasonIds = await getCurrentSeasonIds(version)
    const snapshot: StaticArchiveSnapshot = {
      liveVersion: manifest.hsr?.live ?? version.split(".").slice(0, 2).join("."),
      cacheVersion: version,
      seasons: {},
      phases: {},
    }

    for (const [mode, seasonId] of Object.entries(currentSeasonIds) as Array<[StaticMode, number]>) {
      if (!seasonId) continue
      const detail = await fetchJson<StaticDetail | StaticDetail[]>(
        dataSourceUrl(`hsr/${version}/${locale}/${detailDirByMode[mode]}/${seasonId}.json`),
      )
      snapshot.seasons[mode] = getSeasonName(mode, seasonId, detail)

      const archiveMode = (Object.entries(modeToStaticMode).find(([, staticMode]) => staticMode === mode)?.[0] ??
        "moc") as EndgameMode
      snapshot.phases[archiveMode] = buildPhases(mode, detail, monsterLookup)
    }

    return snapshot
  } catch {
    return null
  }
}
