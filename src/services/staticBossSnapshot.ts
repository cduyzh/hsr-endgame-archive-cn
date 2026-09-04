/**
 * 远程静态数据快照的纯计算层。
 *
 * `staticArchiveConfig.ts` 与 `netlify/functions/_staticSnapshot.ts` 都基于本模块
 * 推导敌方阶段（`BossStage[]`）。本文件**不发起任何网络请求**，仅依赖调用方传入
 * `baseUrl` 并使用全局 `fetch`，便于前端/服务端共用且在测试中可被 `vi.mock` 拦截。
 */

import type {BossMonsterInfo, BossStage, ElementType, EndgameMode, StageBuff} from "../types/archive"

type StaticMode = "moc" | "fiction" | "doom" | "peak"
type LocalizedText = Partial<Record<"zh" | "en" | "ja" | "ko", string>>

interface StaticBuff {
	id?: number
	name?: string | null
	desc?: string | null
	/** `desc` 中 `#N[i]` 占位的实际数值；占位后紧跟 `%` 时按百分比渲染。 */
	param?: number[]
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
	param?: number[]
	pre_id?: number
	tag_list?: StaticBuff[]
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
	/** 叙事强化（狂欢 / 狂想 / 谜狂）。 */
	option?: StaticBuff[]
	/** 战意机制（获得笑点 / 战熄潮平 / 战意汹涌）。 */
	sub_option?: StaticBuff[]
	level?: StaticLevel[]
}

interface AsDetail {
	name?: string | null
	/** 赛季机制（如「末法余烬」）。 */
	buff?: StaticBuff | null
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
		tag_list?: StaticBuff[]
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
	/** 各阶段的最大血量比例，长度与 `MaxMonsterPhase` 一致（实测 632 条全部对齐）。 */
	PhaseList?: Array<{phase_num?: number, phase_max_hp_ratio?: number}> | null
	child?: MonsterValueChild[]
}

/**
 * `hsr/<ver>/zh/monster/<baseId>.json` 的 child 条目。
 * 索引版 `monstervalue.json` 省略了 `*_modify_value` 与抗性表，只有这份单怪详情里有。
 */
interface MonsterDetailChild {
	id?: number
	speed_modify_value?: number | null
	stance_modify_value?: number | null
	damage_type_resistance?: Array<{damage_type?: string, value?: number}> | null
}

interface MonsterDetailFile {
	child?: MonsterDetailChild[]
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
	childValues: Map<number, {parent: MonsterValueEntry; child: MonsterValueChild}>
	hardLevel: Map<string, HardLevelRow>
	elite: Map<number, EliteRow>
	infiniteElite: Map<number, EliteRow>
}

interface ResolvedMonsterValue {
	hpBase: number
	hpRatio: number
	speedBase: number
	speedRatio: number
	stanceBase: number
	stanceRatio: number
	phaseCount: number
	phaseHpRatios: number[]
}

interface BuildContext {
	seasonId: string
	version: string
	baseUrl: string
	lookup: MonsterLookup
	tables: ScalingTables
	/** 基础怪物 id -> (实例 id -> 单怪详情 child)，按需拉取并缓存。 */
	monsterDetails: Map<number, Record<number, MonsterDetailChild>>
}

interface StageDraft {
	mode: EndgameMode
	staticMode: StaticMode
	stageKey: string
	stageLabel: string
	seasonName: string
	monsterIds: Array<number | undefined>
	event?: StaticStageEvent
	mechanic?: StageBuff | null
	stageBuffs?: StageBuff[]
	skipHp?: boolean
	eliteGroup?: number
}

interface StageStats {
	hp: string
	speed: string
	toughness: string
}

/** 4.4 / 4.5 各模式对应的赛季详情 id（已对照线上数据核实） */
export const STATIC_SEASON_IDS: Record<string, Record<StaticMode, number>> = {
	"4.4": {moc: 1034, fiction: 2025, doom: 3019, peak: 8},
	"4.5": {moc: 1035, fiction: 2026, doom: 3020, peak: 9},
}

export const detailDirByMode: Record<StaticMode, string> = {
	moc: "maze",
	fiction: "story",
	doom: "boss",
	peak: "peak",
}

export const modeLabelByStaticMode: Record<StaticMode, string> = {
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

/** 上游 stance 单位与游戏内展示韧性的换算比（480 → 160、360 → 120，全量样本 92% 精确命中）。 */
const TOUGHNESS_UNIT = 3

/** 末波中 rank 低于首领的随从；未知 rank 视为首领，避免新增 rank 时被随从挤掉 */
const supportBossRanks: Record<string, number> = {
	Elite: 2,
	Minion: 1,
	MinionLv2: 1,
}

export function cleanText(value: string | null | undefined): string {
	return (value ?? "")
		.replace(/<[^>]+>/g, "")
		.replace(/#\d+(?:\[i\])?/g, "")
		.replace(/\s+/g, " ")
		.trim()
}

/** buff 文案里的 `\n` 是上游存成两字符的字面量，转成真实换行交给 CSS 的 pre-line 渲染。 */
function cleanBuffText(value: string | null | undefined): string {
	return (value ?? "")
		.replace(/<[^>]+>/g, "")
		.replace(/\\n/g, "\n")
		.replace(/[^\S\n]+/g, " ")
		.replace(/\n{2,}/g, "\n")
		.trim()
}

/** 去掉百分比换算带来的浮点误差与尾零（0.3 × 100 = 30.000000000000004）。 */
function formatBuffParam(value: number, asPercent: boolean): string {
	const scaled = asPercent ? value * 100 : value
	return String(Math.round(scaled * 1000) / 1000)
}

function applyBuffParams(desc: string, param: number[] | undefined): string {
	if (!param?.length) return desc
	return desc.replace(/#(\d+)\[i\](%?)/g, (placeholder, index: string, percent: string) => {
		const value = param[Number(index) - 1]
		if (value === undefined) return placeholder
		return formatBuffParam(value, Boolean(percent)) + (percent ? "%" : "")
	})
}

function getLocalizedName(value: LocalizedText | undefined): string {
	return cleanText(value?.zh ?? value?.en ?? value?.ja ?? value?.ko)
}

function mapWeakness(values: string[] | undefined): ElementType[] {
	return (values ?? []).map((value) => damageTypeMap[value]).filter((value): value is ElementType => Boolean(value))
}

function monsterImageUrl(monsterId: number, baseUrl: string): string {
	const raw = Number(monsterId)
	const baseId = raw >= 1e8 ? Math.floor(raw / 100) : raw
	const id = baseId % 10 === 0 ? baseId : Math.floor(baseId / 10) * 10
	return `${baseUrl}/assets/hsr/monstermiddleicon/Monster_${id}.webp`
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

	return {monsters: monsterMap, imageIds}
}

function buildScalingTables(
	monsterValues: Record<string, MonsterValueEntry>,
	hardLevelRows: Record<string, HardLevelRow>,
	eliteRows: Record<string, EliteRow>,
	infiniteEliteRows: Record<string, EliteRow>,
): ScalingTables {
	const baseValues = new Map<number, MonsterValueEntry>()
	const childValues = new Map<number, {parent: MonsterValueEntry; child: MonsterValueChild}>()

	for (const [id, entry] of Object.entries(monsterValues)) {
		const numericId = Number(id)
		if (Number.isFinite(numericId)) baseValues.set(numericId, entry)
		for (const child of entry.child ?? []) {
			if (child.Id !== undefined) childValues.set(child.Id, {parent: entry, child})
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

	return {baseValues, childValues, hardLevel, elite, infiniteElite}
}

function normalizeMonsterValue(entry: MonsterValueEntry, child?: MonsterValueChild): ResolvedMonsterValue {
	const phaseCount = entry.MaxMonsterPhase ?? 1
	const ratios = (entry.PhaseList ?? []).map((phase) => phase.phase_max_hp_ratio ?? 1)

	return {
		hpBase: entry.HPBase ?? 0,
		hpRatio: child?.HPModifyRatio ?? 1,
		speedBase: entry.SpeedBase ?? 0,
		speedRatio: child?.SpeedModifyRatio ?? 1,
		stanceBase: entry.StanceBase ?? 0,
		stanceRatio: child?.StanceModifyRatio ?? 1,
		phaseCount,
		phaseHpRatios: ratios.length === phaseCount ? ratios : [],
	}
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

/**
 * 多阶段首领默认按「每阶段等量」压成 `<血量> x<阶段数>`；一旦各阶段的 `phase_max_hp_ratio` 不相等
 * （如 4.5 异相仲裁将杀关的 `1.0 / 1.25 / 1.0`），就必须按阶段顺序逐个列出——否则读的人拿 `x3`
 * 去理解，会跟游戏里每一管的实际血量对不上。
 */
function formatHp(raw: number, phaseCount: number, ratios: number[]): string {
	if (raw <= 0) return ""
	const multi = phaseCount > 1
	// 上游有相当一部分怪物根本不公开 PhaseList，所以「是否列出」只认比例真的不相等。
	if (multi && ratios.length === phaseCount && ratios.some((ratio) => ratio !== ratios[0])) {
		return ratios.map((ratio) => hpNumberFormat.format(Math.round(raw * ratio))).join(" / ")
	}
	const single = Math.round(raw * (ratios[0] ?? 1))
	if (single <= 0) return ""
	return multi ? `${hpNumberFormat.format(single)} x${phaseCount}` : hpNumberFormat.format(single)
}

/**
 * HP = HPBase × HPModifyRatio × HardLevelGroup.HPRatio × EliteGroup.HPRatio。
 * 异相仲裁的精英组系数挂在 infinite wave 上且存于 InfiniteEliteGroup.json，由调用方传入。
 * 速度与韧性还要在全部比例乘完后叠加 `*_modify_value`（索引版 monstervalue.json 没有这一项，
 * 来自单怪详情）；韧性展示值除以 3，与游戏内面板一致。
 * 虚构叙事（PF）的每季额外缩放系数未在数据源公开，因此跳过 hp。
 */
function computeStageStats(
	tables: ScalingTables,
	monsterId: number | undefined,
	event: StaticStageEvent | undefined,
	options: {skipHp?: boolean; eliteGroupOverride?: number; detail?: MonsterDetailChild} = {},
): StageStats {
	const empty: StageStats = {hp: "", speed: "", toughness: ""}
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
		hp = formatHp(
			value.hpBase * value.hpRatio * (hardLevel.HPRatio ?? 1) * (elite?.HPRatio ?? 1),
			value.phaseCount,
			value.phaseHpRatios,
		)
	}

	const speedValue =
		value.speedBase * value.speedRatio * (hardLevel.SpeedRatio ?? 1) + (options.detail?.speed_modify_value ?? 0)
	const speed = speedValue > 0 ? String(Math.round(speedValue * 10) / 10) : ""

	const stanceValue = Math.round(
		value.stanceBase * value.stanceRatio * (hardLevel.StanceRatio ?? 1) * (elite?.StanceRatio ?? 1) +
			(options.detail?.stance_modify_value ?? 0),
	)
	const toughness = stanceValue > 0 ? String(Math.round(stanceValue / TOUGHNESS_UNIT)) : ""

	return {hp, speed, toughness}
}

/** 阶段首领自身的弱点。随从的弱点不算进阶段，所以只查首领这一个 id。 */
function bossWeaknessOf(lookup: MonsterLookup, bossId: number | undefined): ElementType[] {
	if (bossId === undefined) return []
	return mapWeakness(lookup.monsters.get(bossId)?.weak)
}

/**
 * 实例怪物 id -> 基础 id。9 位实例 id（`>= 1e8`）按 `基础 id × 100 + 序号` 编码，与
 * `monsterImageUrl` 的回退同源；注意**不是** icon 指向的展示模型 id，变体首领两者并不相同。
 */
function monsterBaseId(monsterId: number): number {
	return monsterId >= 1e8 ? Math.floor(monsterId / 100) : monsterId
}

/**
 * 拉单怪详情 `hsr/<ver>/zh/monster/<基础 id>.json`，返回实例 id -> child。
 * 索引版 monstervalue.json 缺 `*_modify_value` 与抗性表，只有这份详情里有；拉不到只是少了
 * 这两项修正（韧性退回未叠加 modify_value 的值、抗性为空），不影响阶段本身。
 */
async function monsterDetailChildren(
	ctx: BuildContext,
	monsterId: number | undefined,
): Promise<Record<number, MonsterDetailChild>> {
	if (monsterId === undefined) return {}
	const baseId = monsterBaseId(monsterId)
	const cached = ctx.monsterDetails.get(baseId)
	if (cached) return cached

	const detail = await fetchJsonSafe<MonsterDetailFile>(ctx.baseUrl, `hsr/${ctx.version}/zh/monster/${baseId}.json`)
	const byId: Record<number, MonsterDetailChild> = {}
	for (const child of detail?.child ?? []) {
		if (child.id !== undefined) byId[child.id] = child
	}
	ctx.monsterDetails.set(baseId, byId)
	return byId
}

/** 非弱点属性的抗性百分比；上游用负值表示「反而更脆」，展示时只保留正数。 */
function buildResist(detail?: MonsterDetailChild): Partial<Record<ElementType, string>> {
	const resist: Partial<Record<ElementType, string>> = {}
	for (const entry of detail?.damage_type_resistance ?? []) {
		const element = entry.damage_type ? damageTypeMap[entry.damage_type] : undefined
		const value = entry.value ?? 0
		if (element && value > 0) resist[element] = `${Math.round(value * 100)}%`
	}
	return resist
}

function buildMonsterInfo(
	lookup: MonsterLookup,
	baseUrl: string,
	ids: Array<number | undefined>,
): BossMonsterInfo[] {
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
			imageUrl: monsterImageUrl(lookup.imageIds.get(id) ?? id, baseUrl),
			imageAlt: `${name} 敌方图片`,
			weakness: mapWeakness(monster.weak),
			description: cleanText(monster.desc) || undefined,
		})
	}

	return monsters.slice(0, 4)
}

/** 上游偶尔以 "BOSS" 作为未定名怪物的占位名。 */
function isPlaceholderName(name: string): boolean {
	return !name || /^boss$/i.test(name)
}

function namedMonsterIdOf(ctx: BuildContext, ids: Array<number | undefined>): number | undefined {
	return ids.find((id) => id !== undefined && !isPlaceholderName(getLocalizedName(ctx.lookup.monsters.get(id))))
}

/**
 * 首领的展示名与变体名。怪物实例的 `icon` 指向基础模型 id（如「弗有垂暮的不老仙」2024016
 * 的 icon 是 `Monster_2024010`，即「丰饶玄鹿」），解析它可拿到更简短的通用称谓；
 * 解析不到、与自身相同或是占位名时交给变体名兜底。
 */
function stageDisplayNames(
	ctx: BuildContext,
	ids: Array<number | undefined>,
): { name: string; variantName?: string } {
	const namedId = namedMonsterIdOf(ctx, ids)
	const variantName = namedId === undefined ? "" : getLocalizedName(ctx.lookup.monsters.get(namedId))
	if (!variantName) return { name: "" }

	const imageId = namedId === undefined ? undefined : ctx.lookup.imageIds.get(namedId)
	const familyName =
		imageId === undefined || imageId === namedId ? "" : getLocalizedName(ctx.lookup.monsters.get(imageId))
	const name = familyName && !isPlaceholderName(familyName) ? familyName : variantName

	return { name, variantName: name === variantName ? undefined : variantName }
}

async function buildStage(ctx: BuildContext, baseUrl: string, draft: StageDraft): Promise<BossStage | null> {
	const bossId = draft.monsterIds.find((id) => id !== undefined)
	const { name: displayName, variantName } = stageDisplayNames(ctx, draft.monsterIds)

	if (!bossId && !displayName) return null

	const detail = bossId === undefined ? undefined : (await monsterDetailChildren(ctx, bossId))[bossId]
	const stats = computeStageStats(ctx.tables, bossId, draft.event, {
		skipHp: draft.skipHp,
		eliteGroupOverride: draft.eliteGroup,
		detail,
	})

	return {
		id: `${ctx.seasonId}-${draft.mode}-${draft.stageKey}`,
		seasonId: ctx.seasonId,
		mode: draft.mode,
		name: displayName || draft.stageLabel,
		variantName,
		subtitle: `${modeLabelByStaticMode[draft.staticMode]} · ${draft.seasonName}`,
		imageUrl: bossId ? monsterImageUrl(ctx.lookup.imageIds.get(bossId) ?? bossId, baseUrl) : undefined,
		imageAlt: displayName ? `${displayName} 敌方图片` : undefined,
		monsters: buildMonsterInfo(ctx.lookup, baseUrl, draft.monsterIds),
		hp: stats.hp,
		speed: stats.speed,
		toughness: stats.toughness,
		weakness: bossWeaknessOf(ctx.lookup, bossId),
		resist: buildResist(detail),
		clears: 0,
		mechanic: draft.mechanic ?? null,
		stageBuffs: draft.stageBuffs ?? [],
		bannerTone: bannerToneByMode[draft.mode],
	}
}

/** 并发构建同一赛季内的多个阶段；单怪详情按基础 id 去重复用。 */
async function buildStages(ctx: BuildContext, baseUrl: string, drafts: StageDraft[]): Promise<BossStage[]> {
	const stages = await Promise.all(drafts.map((draft) => buildStage(ctx, baseUrl, draft)))
	return stages.filter((stage): stage is BossStage => stage !== null)
}

async function buildMocStages(ctx: BuildContext, baseUrl: string, detail: StaticLevel[]): Promise<BossStage[]> {
	const finalFloor = [...detail]
		.reverse()
		.find((level) => level.npc_monster_id_list1?.length && level.npc_monster_id_list2?.length)
	const starward = [...detail].reverse().find((level) => level.pre_id && level.event_id_list?.length)
	if (!finalFloor) return []

	const seasonName = cleanText(finalFloor.group_name) || cleanText(finalFloor.name) || `赛季 ${ctx.seasonId}`
	// 上游只公开终层一条迷阵文案（maze_group_id 的名字与描述未公开），上下半共用。
	const mazeMechanic = buildBuff({ desc: finalFloor.desc, param: finalFloor.param }, "记忆迷阵")
	const drafts: StageDraft[] = [
		{
			mode: "moc",
			staticMode: "moc",
			stageKey: "top",
			stageLabel: "上半",
			seasonName,
			monsterIds: [bossMonsterIdOf(ctx, finalFloor.event_id_list1?.[0]), ...(finalFloor.npc_monster_id_list1 ?? [])],
			event: finalFloor.event_id_list1?.[0],
			mechanic: mazeMechanic,
		},
		{
			mode: "moc",
			staticMode: "moc",
			stageKey: "bottom",
			stageLabel: "下半",
			seasonName,
			monsterIds: [bossMonsterIdOf(ctx, finalFloor.event_id_list2?.[0]), ...(finalFloor.npc_monster_id_list2 ?? [])],
			event: finalFloor.event_id_list2?.[0],
			mechanic: mazeMechanic,
		},
	]

	if (starward) {
		drafts.push({
			mode: "moc",
			staticMode: "moc",
			stageKey: "starward",
			stageLabel: "星启",
			seasonName,
			monsterIds: [bossMonsterIdOf(ctx, starward.event_id_list?.[0]), ...(starward.npc_monster_id_list ?? [])],
			event: starward.event_id_list?.[0],
			mechanic: mazeMechanic,
		})
	}

	return buildStages(ctx, baseUrl, drafts)
}


async function buildPfStages(ctx: BuildContext, baseUrl: string, detail: PfDetail): Promise<BossStage[]> {
	const levels = detail.level ?? []
	const finalFloor = [...levels]
		.reverse()
		.find((level) => level.npc_monster_id_list1?.length && level.event_id_list1?.length)
	const starward = [...levels].reverse().find((level) => level.pre_id && level.event_id_list?.length)
	if (!finalFloor) return []

	const seasonName = cleanText(detail.name) || `赛季 ${ctx.seasonId}`
	const mechanic = buildBuff(detail.buff ?? undefined)
	const stageBuffs = [...buildBuffList(detail.option, "叙事强化"), ...buildBuffList(detail.sub_option, "战意机制")]
	const drafts: StageDraft[] = [
		{
			mode: "pf",
			staticMode: "fiction",
			stageKey: "top",
			stageLabel: "上半",
			seasonName,
			monsterIds: [bossMonsterIdOf(ctx, finalFloor.event_id_list1?.[0]), ...(finalFloor.npc_monster_id_list1 ?? [])],
			event: finalFloor.event_id_list1?.[0],
			mechanic,
			stageBuffs,
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
			mechanic,
			stageBuffs,
			skipHp: true,
		},
	]

	if (starward) {
		drafts.push({
			mode: "pf",
			staticMode: "fiction",
			stageKey: "starward",
			stageLabel: "星启",
			seasonName,
			monsterIds: [bossMonsterIdOf(ctx, starward.event_id_list?.[0]), ...(starward.npc_monster_id_list ?? [])],
			event: starward.event_id_list?.[0],
			mechanic,
			stageBuffs,
			skipHp: true,
		})
	}

	return buildStages(ctx, baseUrl, drafts)
}

/** 单条场地文案；上游部分模式（混沌回忆的迷阵）只有描述没有名字，用 fallbackName 兜底。 */
function buildBuff(buff: StaticBuff | undefined, fallbackName = ""): StageBuff | null {
	const desc = cleanBuffText(applyBuffParams(buff?.desc ?? "", buff?.param))
	if (!desc) return null
	const name = cleanText(buff?.name) || fallbackName
	return {
		id: buff?.id !== undefined ? String(buff.id) : name || desc.slice(0, 12),
		name,
		desc,
	}
}

function buildBuffList(list: StaticBuff[] | undefined, fallbackPrefix: string): StageBuff[] {
	return (list ?? [])
		.map((buff, index) => buildBuff(buff, `${fallbackPrefix} ${index + 1}`))
		.filter((buff): buff is StageBuff => buff !== null)
}

async function buildAsStages(ctx: BuildContext, baseUrl: string, detail: AsDetail): Promise<BossStage[]> {
	const levels = detail.level ?? []
	const difficulty = [...levels].reverse().find((level) => level.boss_monster_id1 && level.boss_monster_id2)
	const starward = [...levels].reverse().find((level) => level.boss_monster_id && !level.boss_monster_id1)
	if (!difficulty) return []

	const seasonName = cleanText(detail.name) || `赛季 ${ctx.seasonId}`
	const mechanic = buildBuff(detail.buff ?? undefined)
	const drafts: StageDraft[] = [
		{
			mode: "as",
			staticMode: "doom",
			stageKey: "top",
			stageLabel: "上半",
			seasonName,
			monsterIds: [difficulty.boss_monster_id1],
			event: difficulty.event_id_list1?.[0],
			mechanic,
			stageBuffs: buildBuffList(detail.buff_list1, "上半增益"),
		},
		{
			mode: "as",
			staticMode: "doom",
			stageKey: "bottom",
			stageLabel: "下半",
			seasonName,
			monsterIds: [difficulty.boss_monster_id2],
			event: difficulty.event_id_list2?.[0],
			mechanic,
			stageBuffs: buildBuffList(detail.buff_list2, "下半增益"),
		},
	]

	if (starward) {
		drafts.push({
			mode: "as",
			staticMode: "doom",
			stageKey: "starward",
			stageLabel: "星启",
			seasonName,
			monsterIds: [starward.boss_monster_id],
			event: starward.event_id_list?.[0],
			mechanic,
			stageBuffs: buildBuffList(detail.buff_list3, "星启增益"),
		})
	}

	return buildStages(ctx, baseUrl, drafts)
}

function infiniteEliteGroupOf(
	list: Record<string, StaticInfiniteWave> | undefined,
	bossId: number | undefined,
): number | undefined {
	if (!list || bossId === undefined) return undefined
	const wave = Object.values(list).find((item) => (item.monster_group_id_list ?? []).includes(bossId))
	return wave?.elite_group
}

async function buildAaStages(ctx: BuildContext, baseUrl: string, detail: AaDetail): Promise<BossStage[]> {
	const kingEvent = detail.boss_level?.event_id_list?.[0]
	const kingMonsterId = bossMonsterIdOf(ctx, kingEvent)
	if (!detail.boss_level || !kingMonsterId) return []

	const seasonName = cleanText(detail.name) || `赛季 ${ctx.seasonId}`
	const kingBoons = buildBuffList(detail.boss_config?.buff_list, "我方增益")
	const knightDrafts: StageDraft[] = (detail.pre_level ?? []).map((knight, index) => {
		const event = knight.event_id_list?.[0]
		const knightBossId = bossMonsterIdOf(ctx, event)
		return {
			mode: "aa",
			staticMode: "peak",
			stageKey: `k${index + 1}`,
			stageLabel: cleanText(knight.name) || `骑士（${index + 1}）`,
			seasonName,
			monsterIds: [knightBossId],
			event,
			stageBuffs: buildBuffList(knight.tag_list, "敌方词缀"),
			eliteGroup: infiniteEliteGroupOf(knight.infinite_list, knightBossId),
		}
	})
	const stages = await buildStages(ctx, baseUrl, knightDrafts)

	const [checkmate] = await buildStages(ctx, baseUrl, [
		{
			mode: "aa",
			staticMode: "peak",
			stageKey: "checkmate",
			stageLabel: cleanText(detail.boss_level.name) || "将杀王棋",
			seasonName,
			monsterIds: [kingMonsterId],
			event: kingEvent,
			stageBuffs: [...kingBoons, ...buildBuffList(detail.boss_level.tag_list, "敌方词缀")],
			eliteGroup: infiniteEliteGroupOf(detail.boss_level.infinite_list, kingMonsterId),
		},
	])
	if (checkmate) stages.push(checkmate)

	const plightEvent = detail.boss_config?.event_id_list?.[0]
	const plightBossId = bossMonsterIdOf(ctx, plightEvent) ?? kingMonsterId
	const [plight] = await buildStages(ctx, baseUrl, [
		{
			mode: "aa",
			staticMode: "peak",
			stageKey: "plight",
			stageLabel: cleanText(detail.boss_config?.hard_name) || "将杀王棋·绝境",
			seasonName,
			monsterIds: [plightBossId],
			event: plightEvent,
			stageBuffs: [...kingBoons, ...buildBuffList(detail.boss_config?.tag_list, "敌方词缀")],
			eliteGroup: infiniteEliteGroupOf(detail.boss_config?.infinite_list, plightBossId),
		},
	])
	if (plight) {
		// 绝境与将杀是同一首领，名字沿用将杀关的展示名并加绝境后缀，保持家族名口径一致。
		if (checkmate) {
			plight.name = `${checkmate.name}（绝境）`
			if (checkmate.variantName) plight.variantName = `${checkmate.variantName}（绝境）`
		}
		stages.push(plight)
	}

	return stages
}

function fullUrl(baseUrl: string, path: string): string {
	if (path.startsWith("http://") || path.startsWith("https://")) return path
	return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
	const url = fullUrl(baseUrl, path)
	let lastErr: unknown
	for (let i = 0; i < 3; i++) {
		try {
			const controller = new AbortController()
			const timeout = setTimeout(() => controller.abort(), 15000)
			const response = await fetch(url, { signal: controller.signal })
			clearTimeout(timeout)
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			return (await response.json()) as T
		} catch (err) {
			lastErr = err
			console.warn(`  retrying ${url} (${i + 1}/3): ${err instanceof Error ? err.message : err}`)
			await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
		}
	}
	throw lastErr
}

async function fetchJsonSafe<T>(baseUrl: string, path: string): Promise<T | undefined> {
	try {
		return await fetchJson<T>(baseUrl, path)
	} catch {
		return undefined
	}
}

/**
 * 拉取单个赛季的全部敌方阶段（moc/pf/as/aa）。`baseUrl` 形如 `https://static.nanoka.cc`。
 * 单个文件拉取失败会静默跳过对应模式，不会抛错。
 */
export async function buildSeasonBosses(
	seasonId: string,
	version: string,
	baseUrl: string,
): Promise<BossStage[]> {
	const locale = "zh"
	const [monstersRaw, monsterValuesRaw, hardLevelRaw, eliteRaw, infiniteEliteRaw] = await Promise.all([
		fetchJson<Record<string, StaticMonster>>(baseUrl, `hsr/${version}/monster.json`),
		fetchJson<Record<string, MonsterValueEntry>>(baseUrl, `hsr/${version}/monstervalue.json`),
		fetchJson<Record<string, HardLevelRow>>(baseUrl, `hsr/${version}/HardLevelGroup.json`),
		fetchJson<Record<string, EliteRow>>(baseUrl, `hsr/${version}/EliteGroup.json`),
		fetchJsonSafe<Record<string, EliteRow>>(baseUrl, `hsr/${version}/InfiniteEliteGroup.json`),
	])

	const ctx: BuildContext = {
		seasonId,
		version,
		baseUrl,
		lookup: buildMonsterLookup(monstersRaw),
		tables: buildScalingTables(monsterValuesRaw, hardLevelRaw, eliteRaw, infiniteEliteRaw ?? {}),
		monsterDetails: new Map(),
	}

	const seasonIds = STATIC_SEASON_IDS[seasonId]
	if (!seasonIds) return []

	const [mocDetail, pfDetail, asDetail, aaDetail] = await Promise.all([
		fetchJsonSafe<StaticLevel[]>(baseUrl, `hsr/${version}/${locale}/${detailDirByMode.moc}/${seasonIds.moc}.json`),
		fetchJsonSafe<PfDetail>(baseUrl, `hsr/${version}/${locale}/${detailDirByMode.fiction}/${seasonIds.fiction}.json`),
		fetchJsonSafe<AsDetail>(baseUrl, `hsr/${version}/${locale}/${detailDirByMode.doom}/${seasonIds.doom}.json`),
		fetchJsonSafe<AaDetail>(baseUrl, `hsr/${version}/${locale}/${detailDirByMode.peak}/${seasonIds.peak}.json`),
	])

	const bosses: BossStage[] = []
	if (Array.isArray(mocDetail)) bosses.push(...(await buildMocStages(ctx, baseUrl, mocDetail)))
	if (pfDetail) bosses.push(...(await buildPfStages(ctx, baseUrl, pfDetail)))
	if (asDetail) bosses.push(...(await buildAsStages(ctx, baseUrl, asDetail)))
	if (aaDetail) bosses.push(...(await buildAaStages(ctx, baseUrl, aaDetail)))
	return bosses
}

export interface HsrManifest {
	hsr?: {
		latest?: string
		live?: string
		available?: string[]
	}
}

export function compareVersions(a: string, b: string): number {
	const partsA = a.split(".").map((part) => Number(part) || 0)
	const partsB = b.split(".").map((part) => Number(part) || 0)
	for (let index = 0; index < 3; index += 1) {
		const diff = (partsA[index] ?? 0) - (partsB[index] ?? 0)
		if (diff !== 0) return diff
	}
	return 0
}

/**
 * 数据源只保留当前大版本目录，历史赛季的详情文件仍在其中累积，
 * 因此所有赛季共用最新目录，由 STATIC_SEASON_IDS 的显式 id 定位各赛季。
 */
export function pickDataDirectory(available: string[]): string | undefined {
	if (available.length === 0) return undefined
	return [...available].sort(compareVersions)[available.length - 1]
}
