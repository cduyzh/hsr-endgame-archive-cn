import { dataSourceUrl, monsterImageUrl } from "./dataSource"
import type { ArchiveConfig, BossMonsterInfo, BossStage, ElementType, EndgameMode, Season } from "@/types/archive"

type StaticMode = "moc" | "fiction" | "doom" | "peak"
type LocalizedText = Partial<Record<"zh" | "en" | "ja" | "ko", string>>

interface HsrManifest {
  hsr?: {
    latest?: string
    live?: string
    available?: string[]
  }
}

interface StaticBuff {
  name?: string | null
  desc?: string | null
}

interface StaticStageEvent {
  hard_level_group?: number
  level?: number
  elite_group?: number
  monster_list?: Array<Record<string, number>>
}

interface StaticInfiniteWave {
  elite_group?: number
  monster_group_id_list?: number[]
}

interface StaticLevel {
  id?: number
  name?: string | null
  group_name?: string | null
  desc?: string | null
  pre_id?: number
  damage_type?: string[]
  damage_type1?: string[]
  damage_type2?: string[]
  npc_monster_id_list?: number[]
  npc_monster_id_list1?: number[]
  npc_monster_id_list2?: number[]
  boss_monster_id?: number
  boss_monster_id1?: number
  boss_monster_id2?: number
  event_id_list?: StaticStageEvent[]
  event_id_list1?: StaticStageEvent[]
  event_id_list2?: StaticStageEvent[]
  infinite_list?: Record<string, StaticInfiniteWave>
  infinite_list1?: Record<string, StaticInfiniteWave>
  infinite_list2?: Record<string, StaticInfiniteWave>
}

interface PfDetail {
  name?: string | null
  buff?: StaticBuff | null
  level?: StaticLevel[]
}

interface AsDetail {
  name?: string | null
  buff_list1?: StaticBuff[]
  buff_list2?: StaticBuff[]
  buff_list3?: StaticBuff[]
  level?: StaticLevel[]
}

interface AaDetail {
  name?: string | null
  pre_level?: StaticLevel[]
  boss_level?: StaticLevel
  boss_config?: {
    hard_name?: string | null
    buff_list?: StaticBuff[]
    event_id_list?: StaticStageEvent[]
    infinite_list?: Record<string, StaticInfiniteWave>
  }
}

interface StaticMonster extends LocalizedText {
  child?: number[]
  desc?: string
  icon?: string
  rank?: string
  weak?: string[]
}

interface MonsterValueChild {
  Id?: number
  HPModifyRatio?: number
  SpeedModifyRatio?: number
  StanceModifyRatio?: number
}

interface MonsterValueEntry {
  HPBase?: number
  SpeedBase?: number
  StanceBase?: number
  MaxMonsterPhase?: number
  child?: MonsterValueChild[]
}

interface RatioRow {
  HPRatio?: number
  SpeedRatio?: number
  StanceRatio?: number
}

interface HardLevelRow extends RatioRow {
  HardLevelGroup?: number
  Level?: number
}

interface EliteRow extends RatioRow {
  EliteGroup?: number
}

interface MonsterLookup {
  monsters: Map<number, StaticMonster>
  imageIds: Map<number, number>
}

interface ScalingTables {
  baseValues: Map<number, MonsterValueEntry>
  childValues: Map<number, { parent: MonsterValueEntry; child: MonsterValueChild }>
  hardLevel: Map<string, HardLevelRow>
  elite: Map<number, EliteRow>
  infiniteElite: Map<number, EliteRow>
}

export interface StaticArchiveSnapshot {
  liveVersion?: string
  bosses: BossStage[]
}

/** 4.4 / 4.5 各模式对应的赛季详情 id（已对照线上数据核实） */
const STATIC_SEASON_IDS: Record<string, Record<StaticMode, number>> = {
  "4.4": { moc: 1034, fiction: 2025, doom: 3019, peak: 8 },
  "4.5": { moc: 1035, fiction: 2026, doom: 3020, peak: 9 },
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

const bannerToneByMode: Record<EndgameMode, BossStage["bannerTone"]> = {
  moc: "red",
  pf: "amber",
  as: "cyan",
  aa: "green",
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

const hpNumberFormat = new Intl.NumberFormat("en-US")

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

  return { monsters: monsterMap, imageIds }
}

function buildScalingTables(
  monsterValues: Record<string, MonsterValueEntry>,
  hardLevelRows: Record<string, HardLevelRow>,
  eliteRows: Record<string, EliteRow>,
  infiniteEliteRows: Record<string, EliteRow>,
): ScalingTables {
  const baseValues = new Map<number, MonsterValueEntry>()
  const childValues = new Map<number, { parent: MonsterValueEntry; child: MonsterValueChild }>()

  for (const [id, entry] of Object.entries(monsterValues)) {
    const numericId = Number(id)
    if (Number.isFinite(numericId)) baseValues.set(numericId, entry)
    for (const child of entry.child ?? []) {
      if (child.Id !== undefined) childValues.set(child.Id, { parent: entry, child })
    }
  }

  const hardLevel = new Map<string, HardLevelRow>()
  for (const row of Object.values(hardLevelRows)) {
    if (row.HardLevelGroup !== undefined && row.Level !== undefined) {
      hardLevel.set(`${row.HardLevelGroup}:${row.Level}`, row)
    }
  }

  const elite = new Map<number, EliteRow>()
  for (const row of Object.values(eliteRows)) {
    if (row.EliteGroup !== undefined) elite.set(row.EliteGroup, row)
  }

  const infiniteElite = new Map<number, EliteRow>()
  for (const row of Object.values(infiniteEliteRows)) {
    if (row.EliteGroup !== undefined) infiniteElite.set(row.EliteGroup, row)
  }

  return { baseValues, childValues, hardLevel, elite, infiniteElite }
}

interface ResolvedMonsterValue {
  hpBase: number
  hpRatio: number
  speedBase: number
  speedRatio: number
  stanceBase: number
  stanceRatio: number
  phaseCount: number
}

function resolveMonsterValue(tables: ScalingTables, monsterId: number): ResolvedMonsterValue | undefined {
  const base = tables.baseValues.get(monsterId)
  if (base) {
    const child = base.child?.find((item) => item.Id === monsterId)
    return normalizeMonsterValue(base, child)
  }

  const viaChild = tables.childValues.get(monsterId)
  if (viaChild) return normalizeMonsterValue(viaChild.parent, viaChild.child)

  return undefined
}

function normalizeMonsterValue(entry: MonsterValueEntry, child?: MonsterValueChild): ResolvedMonsterValue {
  return {
    hpBase: entry.HPBase ?? 0,
    hpRatio: child?.HPModifyRatio ?? 1,
    speedBase: entry.SpeedBase ?? 0,
    speedRatio: child?.SpeedModifyRatio ?? 1,
    stanceBase: entry.StanceBase ?? 0,
    stanceRatio: child?.StanceModifyRatio ?? 1,
    phaseCount: entry.MaxMonsterPhase ?? 1,
  }
}

/** 末波中 rank 低于首领的随从；未知 rank 视为首领，避免新增 rank 时被随从挤掉 */
const supportBossRanks: Record<string, number> = {
  Elite: 2,
  Minion: 1,
  MinionLv2: 1,
}

function monsterBossScore(ctx: BuildContext, monsterId: number): number {
  const monster = ctx.lookup.monsters.get(monsterId)
  const rankScore = monster ? (supportBossRanks[monster.rank ?? ""] ?? 3) : 0
  const value = resolveMonsterValue(ctx.tables, monsterId)

  return rankScore * 1e9 + (value ? value.hpBase * value.hpRatio : 0)
}

function bossMonsterIdOf(ctx: BuildContext, event: StaticStageEvent | undefined): number | undefined {
  const waves = event?.monster_list ?? []
  const lastWave = waves[waves.length - 1]
  if (!lastWave) return undefined

  const ids = Object.values(lastWave).filter((id): id is number => typeof id === "number")

  return [...ids].sort((a, b) => monsterBossScore(ctx, b) - monsterBossScore(ctx, a))[0]
}

interface StageStats {
  hp: string
  speed: string
  toughness: string
}

/**
 * HP = HPBase × HPModifyRatio × HardLevelGroup.HPRatio × EliteGroup.HPRatio。
 * 异相仲裁的精英组系数挂在 infinite wave 上且存于 InfiniteEliteGroup.json，由调用方传入。
 * 虚构叙事（PF）的每季额外缩放系数未在数据源公开，因此跳过 hp。
 */
function computeStageStats(
  tables: ScalingTables,
  monsterId: number | undefined,
  event: StaticStageEvent | undefined,
  options: { skipHp?: boolean; eliteGroupOverride?: number } = {},
): StageStats {
  const empty: StageStats = { hp: "", speed: "", toughness: "" }
  if (!monsterId || !event) return empty

  const value = resolveMonsterValue(tables, monsterId)
  if (!value) return empty

  const hardLevel =
    event.hard_level_group !== undefined && event.level !== undefined
      ? tables.hardLevel.get(`${event.hard_level_group}:${event.level}`)
      : undefined
  if (!hardLevel) return empty

  const eliteGroup = event.elite_group ?? options.eliteGroupOverride
  const elite =
    eliteGroup === undefined
      ? undefined
      : tables.elite.get(eliteGroup) ?? tables.infiniteElite.get(eliteGroup)

  let hp = ""
  if (!options.skipHp) {
    const total = Math.round(
      value.hpBase * value.hpRatio * (hardLevel.HPRatio ?? 1) * (elite?.HPRatio ?? 1),
    )
    hp = total > 0 ? hpNumberFormat.format(total) : ""
    if (hp && value.phaseCount > 1) hp += ` x${value.phaseCount}`
  }

  const speedValue = value.speedBase * value.speedRatio * (hardLevel.SpeedRatio ?? 1)
  const speed = speedValue > 0 ? String(Math.round(speedValue * 10) / 10) : ""

  const toughnessValue = Math.round(
    value.stanceBase * value.stanceRatio * (hardLevel.StanceRatio ?? 1) * (elite?.StanceRatio ?? 1),
  )
  const toughness = toughnessValue > 0 ? String(toughnessValue) : ""

  return { hp, speed, toughness }
}

function getMonsterWeakness(lookup: MonsterLookup, ids: Array<number | undefined>): ElementType[] {
  for (const id of ids) {
    if (!id) continue
    const weakness = mapWeakness(lookup.monsters.get(id)?.weak)
    if (weakness.length > 0) return weakness
  }
  return []
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
      imageUrl: monsterImageUrl(lookup.imageIds.get(id) ?? id),
      imageAlt: `${name} 敌方图片`,
      weakness: mapWeakness(monster.weak),
      description: cleanText(monster.desc) || undefined,
    })
  }

  return monsters.slice(0, 4)
}

interface BuildContext {
  seasonId: string
  lookup: MonsterLookup
  tables: ScalingTables
}

interface StageDraft {
  mode: EndgameMode
  staticMode: StaticMode
  stageKey: string
  stageLabel: string
  seasonName: string
  monsterIds: Array<number | undefined>
  event?: StaticStageEvent
  weakness?: string[]
  memoryBuff?: string
  skipHp?: boolean
  eliteGroup?: number
}

function buildStage(ctx: BuildContext, draft: StageDraft): BossStage | null {
  const bossId = draft.monsterIds.find((id) => id !== undefined)
  const rawName = draft.monsterIds
    .map((id) => (id ? getLocalizedName(ctx.lookup.monsters.get(id)) : ""))
    .find((name) => name.length > 0)
  // 上游偶尔以 "BOSS" 作为未定名怪物的占位名，此时退回阶段名
  const monsterName = rawName && !/^boss$/i.test(rawName) ? rawName : ""

  if (!bossId && !monsterName) return null

  const weakness = draft.weakness?.length ? mapWeakness(draft.weakness) : []
  const stats = computeStageStats(ctx.tables, bossId, draft.event, {
    skipHp: draft.skipHp,
    eliteGroupOverride: draft.eliteGroup,
  })

  return {
    id: `${ctx.seasonId}-${draft.mode}-${draft.stageKey}`,
    seasonId: ctx.seasonId,
    mode: draft.mode,
    name: monsterName || draft.stageLabel,
    subtitle: `${modeLabelByStaticMode[draft.staticMode]} / ${draft.seasonName} / ${draft.stageLabel}`,
    imageUrl: bossId ? monsterImageUrl(ctx.lookup.imageIds.get(bossId) ?? bossId) : undefined,
    imageAlt: monsterName ? `${monsterName} 敌方图片` : undefined,
    monsters: buildMonsterInfo(ctx.lookup, draft.monsterIds),
    hp: stats.hp,
    speed: stats.speed,
    toughness: stats.toughness,
    weakness: weakness.length > 0 ? weakness : getMonsterWeakness(ctx.lookup, draft.monsterIds),
    resist: {},
    clears: 0,
    memoryBuff: draft.memoryBuff ?? "",
    bannerTone: bannerToneByMode[draft.mode],
  }
}

function buildMocStages(ctx: BuildContext, detail: StaticLevel[]): BossStage[] {
  const finalFloor = [...detail]
    .reverse()
    .find((level) => level.npc_monster_id_list1?.length && level.npc_monster_id_list2?.length)
  const starward = [...detail].reverse().find((level) => level.pre_id && level.event_id_list?.length)
  if (!finalFloor) return []

  const seasonName = cleanText(finalFloor.group_name) || cleanText(finalFloor.name) || `赛季 ${ctx.seasonId}`
  const drafts: StageDraft[] = [
    {
      mode: "moc",
      staticMode: "moc",
      stageKey: "top",
      stageLabel: "上半",
      seasonName,
      monsterIds: [bossMonsterIdOf(ctx, finalFloor.event_id_list1?.[0]), ...(finalFloor.npc_monster_id_list1 ?? [])],
      event: finalFloor.event_id_list1?.[0],
      weakness: finalFloor.damage_type1,
    },
    {
      mode: "moc",
      staticMode: "moc",
      stageKey: "bottom",
      stageLabel: "下半",
      seasonName,
      monsterIds: [bossMonsterIdOf(ctx, finalFloor.event_id_list2?.[0]), ...(finalFloor.npc_monster_id_list2 ?? [])],
      event: finalFloor.event_id_list2?.[0],
      weakness: finalFloor.damage_type2,
    },
  ]

  if (starward) {
    drafts.push({
      mode: "moc",
      staticMode: "moc",
      stageKey: "starward",
      stageLabel: "星临",
      seasonName,
      monsterIds: [bossMonsterIdOf(ctx, starward.event_id_list?.[0]), ...(starward.npc_monster_id_list ?? [])],
      event: starward.event_id_list?.[0],
    })
  }

  return drafts.map((draft) => buildStage(ctx, draft)).filter((stage): stage is BossStage => stage !== null)
}

function buildPfStages(ctx: BuildContext, detail: PfDetail): BossStage[] {
  const levels = detail.level ?? []
  const finalFloor = [...levels]
    .reverse()
    .find((level) => level.npc_monster_id_list1?.length && level.event_id_list1?.length)
  const starward = [...levels].reverse().find((level) => level.pre_id && level.event_id_list?.length)
  if (!finalFloor) return []

  const seasonName = cleanText(detail.name) || `赛季 ${ctx.seasonId}`
  const memoryBuff = cleanText(detail.buff?.desc)
  const drafts: StageDraft[] = [
    {
      mode: "pf",
      staticMode: "fiction",
      stageKey: "top",
      stageLabel: "上半",
      seasonName,
      monsterIds: [bossMonsterIdOf(ctx, finalFloor.event_id_list1?.[0]), ...(finalFloor.npc_monster_id_list1 ?? [])],
      event: finalFloor.event_id_list1?.[0],
      weakness: finalFloor.damage_type1,
      memoryBuff,
      skipHp: true,
    },
    {
      mode: "pf",
      staticMode: "fiction",
      stageKey: "bottom",
      stageLabel: "下半",
      seasonName,
      monsterIds: [bossMonsterIdOf(ctx, finalFloor.event_id_list2?.[0]), ...(finalFloor.npc_monster_id_list2 ?? [])],
      event: finalFloor.event_id_list2?.[0],
      weakness: finalFloor.damage_type2,
      memoryBuff,
      skipHp: true,
    },
  ]

  if (starward) {
    drafts.push({
      mode: "pf",
      staticMode: "fiction",
      stageKey: "starward",
      stageLabel: "星临",
      seasonName,
      monsterIds: [bossMonsterIdOf(ctx, starward.event_id_list?.[0]), ...(starward.npc_monster_id_list ?? [])],
      event: starward.event_id_list?.[0],
      weakness: starward.damage_type,
      memoryBuff,
      skipHp: true,
    })
  }

  return drafts.map((draft) => buildStage(ctx, draft)).filter((stage): stage is BossStage => stage !== null)
}

function buffText(buff: StaticBuff | undefined): string {
  if (!buff) return ""
  const desc = cleanText(buff.desc)
  if (!desc) return ""
  const name = cleanText(buff.name)
  return name ? `${name}：${desc}` : desc
}

function buildAsStages(ctx: BuildContext, detail: AsDetail): BossStage[] {
  const levels = detail.level ?? []
  const difficulty = [...levels].reverse().find((level) => level.boss_monster_id1 && level.boss_monster_id2)
  const starward = [...levels].reverse().find((level) => level.boss_monster_id && !level.boss_monster_id1)
  if (!difficulty) return []

  const seasonName = cleanText(detail.name) || `赛季 ${ctx.seasonId}`
  const drafts: StageDraft[] = [
    {
      mode: "as",
      staticMode: "doom",
      stageKey: "top",
      stageLabel: "上半",
      seasonName,
      monsterIds: [difficulty.boss_monster_id1],
      event: difficulty.event_id_list1?.[0],
      weakness: difficulty.damage_type1,
      memoryBuff: buffText(detail.buff_list1?.[0]),
    },
    {
      mode: "as",
      staticMode: "doom",
      stageKey: "bottom",
      stageLabel: "下半",
      seasonName,
      monsterIds: [difficulty.boss_monster_id2],
      event: difficulty.event_id_list2?.[0],
      weakness: difficulty.damage_type2,
      memoryBuff: buffText(detail.buff_list2?.[0]),
    },
  ]

  if (starward) {
    drafts.push({
      mode: "as",
      staticMode: "doom",
      stageKey: "starward",
      stageLabel: "星临",
      seasonName,
      monsterIds: [starward.boss_monster_id],
      event: starward.event_id_list?.[0],
      weakness: starward.damage_type,
      memoryBuff: buffText(detail.buff_list3?.[0]),
    })
  }

  return drafts.map((draft) => buildStage(ctx, draft)).filter((stage): stage is BossStage => stage !== null)
}

function infiniteEliteGroupOf(
  list: Record<string, StaticInfiniteWave> | undefined,
  bossId: number | undefined,
): number | undefined {
  if (!list || bossId === undefined) return undefined
  const wave = Object.values(list).find((item) => (item.monster_group_id_list ?? []).includes(bossId))
  return wave?.elite_group
}

function buildAaStages(ctx: BuildContext, detail: AaDetail): BossStage[] {
  const kingEvent = detail.boss_level?.event_id_list?.[0]
  const kingMonsterId = bossMonsterIdOf(ctx, kingEvent)
  if (!detail.boss_level || !kingMonsterId) return []

  const seasonName = cleanText(detail.name) || `赛季 ${ctx.seasonId}`
  const kingBuff = (detail.boss_config?.buff_list ?? []).map((buff) => buffText(buff)).filter(Boolean).join("；")
  const kingWeakness = detail.boss_level.damage_type
  const stages: BossStage[] = []

  for (const [index, knight] of (detail.pre_level ?? []).entries()) {
    const event = knight.event_id_list?.[0]
    const knightBossId = bossMonsterIdOf(ctx, event)
    const stage = buildStage(ctx, {
      mode: "aa",
      staticMode: "peak",
      stageKey: `k${index + 1}`,
      stageLabel: cleanText(knight.name) || `骑士（${index + 1}）`,
      seasonName,
      monsterIds: [knightBossId],
      event,
      eliteGroup: infiniteEliteGroupOf(knight.infinite_list, knightBossId),
    })
    if (stage) stages.push(stage)
  }

  const checkmate = buildStage(ctx, {
    mode: "aa",
    staticMode: "peak",
    stageKey: "checkmate",
    stageLabel: cleanText(detail.boss_level.name) || "将杀王棋",
    seasonName,
    monsterIds: [kingMonsterId],
    event: kingEvent,
    weakness: kingWeakness,
    memoryBuff: kingBuff,
    eliteGroup: infiniteEliteGroupOf(detail.boss_level.infinite_list, kingMonsterId),
  })
  if (checkmate) stages.push(checkmate)

  const plightEvent = detail.boss_config?.event_id_list?.[0]
  const plightBossId = bossMonsterIdOf(ctx, plightEvent) ?? kingMonsterId
  const plight = buildStage(ctx, {
    mode: "aa",
    staticMode: "peak",
    stageKey: "plight",
    stageLabel: cleanText(detail.boss_config?.hard_name) || "将杀王棋·绝境",
    seasonName,
    monsterIds: [plightBossId],
    event: plightEvent,
    weakness: kingWeakness,
    memoryBuff: kingBuff,
    eliteGroup: infiniteEliteGroupOf(detail.boss_config?.infinite_list, plightBossId),
  })
  if (plight) {
    const kingName = getLocalizedName(ctx.lookup.monsters.get(kingMonsterId))
    if (kingName) plight.name = `${kingName}（绝境）`
    stages.push(plight)
  }

  return stages
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

async function fetchJsonSafe<T>(url: string): Promise<T | undefined> {
  try {
    return await fetchJson<T>(url)
  } catch {
    return undefined
  }
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((part) => Number(part) || 0)
  const partsB = b.split(".").map((part) => Number(part) || 0)
  for (let index = 0; index < 3; index += 1) {
    const diff = (partsA[index] ?? 0) - (partsB[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 从 manifest.available 中取指定大版本（如 4.4 / 4.5）的最新数据目录 */
function pickVersion(available: string[], major: string): string | undefined {
  const candidates = available.filter((version) => version === major || version.startsWith(`${major}.`))
  if (candidates.length === 0) return undefined
  return [...candidates].sort(compareVersions)[candidates.length - 1]
}

async function buildSeasonBosses(seasonId: string, version: string): Promise<BossStage[]> {
  const locale = "zh"
  const [monstersRaw, monsterValuesRaw, hardLevelRaw, eliteRaw, infiniteEliteRaw] = await Promise.all([
    fetchJson<Record<string, StaticMonster>>(dataSourceUrl(`hsr/${version}/monster.json`)),
    fetchJson<Record<string, MonsterValueEntry>>(dataSourceUrl(`hsr/${version}/monstervalue.json`)),
    fetchJson<Record<string, HardLevelRow>>(dataSourceUrl(`hsr/${version}/HardLevelGroup.json`)),
    fetchJson<Record<string, EliteRow>>(dataSourceUrl(`hsr/${version}/EliteGroup.json`)),
    fetchJsonSafe<Record<string, EliteRow>>(dataSourceUrl(`hsr/${version}/InfiniteEliteGroup.json`)),
  ])

  const ctx: BuildContext = {
    seasonId,
    lookup: buildMonsterLookup(monstersRaw),
    tables: buildScalingTables(monsterValuesRaw, hardLevelRaw, eliteRaw, infiniteEliteRaw ?? {}),
  }

  const seasonIds = STATIC_SEASON_IDS[seasonId]
  const [mocDetail, pfDetail, asDetail, aaDetail] = await Promise.all([
    fetchJsonSafe<StaticLevel[]>(dataSourceUrl(`hsr/${version}/${locale}/${detailDirByMode.moc}/${seasonIds.moc}.json`)),
    fetchJsonSafe<PfDetail>(
      dataSourceUrl(`hsr/${version}/${locale}/${detailDirByMode.fiction}/${seasonIds.fiction}.json`),
    ),
    fetchJsonSafe<AsDetail>(dataSourceUrl(`hsr/${version}/${locale}/${detailDirByMode.doom}/${seasonIds.doom}.json`)),
    fetchJsonSafe<AaDetail>(dataSourceUrl(`hsr/${version}/${locale}/${detailDirByMode.peak}/${seasonIds.peak}.json`)),
  ])

  const bosses: BossStage[] = []
  if (Array.isArray(mocDetail)) bosses.push(...buildMocStages(ctx, mocDetail))
  if (pfDetail) bosses.push(...buildPfStages(ctx, pfDetail))
  if (asDetail) bosses.push(...buildAsStages(ctx, asDetail))
  if (aaDetail) bosses.push(...buildAaStages(ctx, aaDetail))
  return bosses
}

export async function fetchStaticArchiveSnapshot(): Promise<StaticArchiveSnapshot | null> {
  try {
    const manifest = await fetchJson<HsrManifest>(dataSourceUrl("manifest.json"))
    const available = manifest.hsr?.available ?? []

    const seasons = Object.keys(STATIC_SEASON_IDS)
    const resolved = seasons
      .map((seasonId) => ({ seasonId, version: pickVersion(available, seasonId) }))
      .filter((entry): entry is { seasonId: string; version: string } => Boolean(entry.version))

    if (resolved.length === 0) return null

    const results = await Promise.all(
      resolved.map(async (entry) => {
        try {
          return await buildSeasonBosses(entry.seasonId, entry.version)
        } catch {
          return [] as BossStage[]
        }
      }),
    )

    return {
      liveVersion: manifest.hsr?.live,
      bosses: results.flat(),
    }
  } catch {
    return null
  }
}

function mergeSeasons(seasons: Season[], generated: BossStage[], liveVersion: string | undefined): Season[] {
  const next = [...seasons]
  const generatedSeasonIds = new Set(generated.map((boss) => boss.seasonId))

  for (const seasonId of generatedSeasonIds) {
    if (next.some((season) => season.id === seasonId)) continue
    next.push({ id: seasonId, label: `${seasonId} 归档`, isCurrent: seasonId === liveVersion })
  }

  return next
}

export function mergeStaticArchiveConfig(config: ArchiveConfig, snapshot: StaticArchiveSnapshot | null): ArchiveConfig {
  if (!snapshot || snapshot.bosses.length === 0) return config

  const existingIds = new Set(config.bosses.map((boss) => boss.id))
  const generated = snapshot.bosses.filter((boss) => !existingIds.has(boss.id))
  if (generated.length === 0) return config

  return {
    ...config,
    seasons: mergeSeasons(config.seasons, generated, snapshot.liveVersion),
    bosses: [...config.bosses, ...generated],
  }
}
