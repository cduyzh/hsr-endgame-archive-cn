import { AS_MAX_SCORE, categoryLabels, categoryOptionsFor } from "@/services/runUtils"
import {
  COST_MAX,
  COST_MIN,
  getCharacterGoldKind,
  type CharacterGoldKind,
} from "@/services/unitCost"
import { DUPLICATE_VIDEO_MESSAGE } from "@/services/videoUrl"
import type {
  ArchiveConfig,
  ArchiveUnit,
  BossStage,
  ElementType,
  SubmissionPayload,
  SpecificRunCategory,
  UnitPath,
} from "@/types/archive"

/** 投稿固定按 4 人队伍录入，与档案侧 `teamSize` 的最大值一致 */
export const TEAM_SLOT_COUNT = 4

export type SubmissionField =
  | "seasonId"
  | "mode"
  | "bossId"
  | "category"
  | "author"
  | "videoUrl"
  | "teamName"
  | "units"
  | "lightcones"
  | "cycle"
  | "score"
  | "cost"

export type SubmissionStepId = "basic" | "team" | "result"

export interface SubmissionError {
  field: SubmissionField
  message: string
}

export const submissionFieldLabels: Record<SubmissionField, string> = {
  seasonId: "赛季",
  mode: "模式",
  bossId: "敌方阶段",
  category: "记录分类",
  author: "作者",
  videoUrl: "视频链接",
  teamName: "队伍名称",
  units: "角色",
  lightcones: "光锥",
  cycle: "轮次",
  score: "分数",
  cost: "成本",
}

export const submissionStepFields: Record<SubmissionStepId, SubmissionField[]> = {
  basic: ["seasonId", "mode", "bossId", "category", "author", "videoUrl"],
  team: ["teamName", "units", "lightcones"],
  result: ["cycle", "score", "cost"],
}

/** 0 轮类分类（含异相仲裁的绝境变体）要求轮次为 0。 */
const zeroCycleCategories = new Set<SpecificRunCategory>(["zeroCycle", "plightZeroCycle"])

export interface SubmissionRosterLine {
  index: number
  characterId: string
  characterName: string
  path: UnitPath | ""
  rarity: number
  gold: CharacterGoldKind
  eidolon: number
  lightconeId: string
  lightconeName: string
  superimposition: number
  pathMismatch: boolean
}

export interface SubmissionTarget {
  seasonLabel: string
  modeLabel: string
  stageName: string
  stageSubtitle: string
  categoryLabel: string
  weakness: ElementType[]
  hp: string
  speed: string
  toughness: string
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null
  const text = String(value ?? "").trim()
  if (!text) return null
  const parsed = Number(text)
  return Number.isInteger(parsed) ? parsed : null
}

/** 审核只认这两个平台的录像地址；子域任意，短链域名单独列出。 */
const VIDEO_DOMAINS = ["bilibili.com", "b23.tv", "youtube.com", "youtube-nocookie.com"]
const VIDEO_SHORT_DOMAINS = ["youtu.be"]

function isAllowedVideoHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "")
  return (
    VIDEO_SHORT_DOMAINS.includes(host) ||
    VIDEO_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
  )
}

export function isUsableVideoUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed)
    return (url.protocol === "https:" || url.protocol === "http:") && isAllowedVideoHost(url.hostname)
  } catch {
    return false
  }
}

/** 根据视频 URL 域名返回平台来源，用于在 UI 上显示对应平台图标与文案。 */
export type VideoSource = "bilibili" | "youtube"

export function getVideoSource(value: string | undefined | null): VideoSource | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")) {
      return "youtube"
    }
    if (host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "b23.tv" || host.endsWith(".b23.tv")) {
      return "bilibili"
    }
  } catch {
    return null
  }
  return null
}

function findSubmissionStage(config: ArchiveConfig, bossId: string): BossStage | null {
  return config.bosses.find((boss) => boss.id === bossId) ?? null
}

function slotLabel(indices: number[]): string {
  return indices.map((index) => index + 1).join("、")
}

function validateSlots(
  entries: SubmissionPayload["units"],
  unitById: Map<string, ArchiveUnit>,
  kind: ArchiveUnit["kind"],
  field: SubmissionField,
  label: string,
  verb: string,
): SubmissionError[] {
  if (entries.length !== TEAM_SLOT_COUNT) {
    return [{ field, message: `请配置 ${TEAM_SLOT_COUNT} 个${label}。` }]
  }

  const missing = entries.flatMap((entry, index) => (entry.unitId ? [] : [index]))
  if (missing.length > 0) {
    return [{ field, message: `请为第 ${slotLabel(missing)} 个槽位${verb}。` }]
  }

  const unknown = entries.filter((entry) => unitById.get(entry.unitId)?.kind !== kind)
  if (unknown.length > 0) {
    const ids = unknown.map((entry) => entry.unitId).join("、")
    return [{ field, message: `${label}「${ids}」不在本站单位库中，请重新选择。` }]
  }

  if (field !== "units") return []

  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.unitId, (counts.get(entry.unitId) ?? 0) + 1)
  const duplicated = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => unitById.get(id)?.name ?? id)

  return duplicated.length > 0 ? [{ field, message: `同一队伍不能重复选择「${duplicated.join("、")}」。` }] : []
}

export interface SubmissionValidationOptions {
  /** 视频链接查重接口命中时为 true，让「下一步」与「提交」一起被挡住。 */
  duplicateVideoUrl?: boolean
}

export function validateSubmissionForm(
  form: SubmissionPayload,
  config: ArchiveConfig,
  options: SubmissionValidationOptions = {},
): SubmissionError[] {
  const unitById = new Map(config.units.map((unit) => [unit.id, unit]))
  const errors: SubmissionError[] = []
  const push = (field: SubmissionField, message: string) => errors.push({ field, message })

  if (!form.seasonId) push("seasonId", "请选择赛季。")
  if (!config.modes.some((mode) => mode.id === form.mode)) push("mode", "请选择竞赛模式。")

  const stages = config.bosses.filter((boss) => boss.seasonId === form.seasonId && boss.mode === form.mode)
  if (stages.length === 0) push("bossId", "该赛季与模式下暂无可投稿的敌方阶段，请改选赛季或模式。")
  else if (!stages.some((boss) => boss.id === form.bossId)) push("bossId", "请选择敌方阶段。")

  const allowedCategories = categoryOptionsFor(form.mode, form.bossId)
  if (!allowedCategories.includes(form.category)) push("category", "当前模式与敌方阶段没有该分类，请重新选择。")

  const author = form.author.trim()
  if (!author) push("author", "请填写作者展示名称。")
  else if (author.length > 32) push("author", "作者名称请控制在 32 个字符以内。")

  const videoUrl = form.videoUrl.trim()
  if (!videoUrl) push("videoUrl", "请填写视频链接，审核需要可访问的原始录像。")
  else if (!isUsableVideoUrl(videoUrl)) push("videoUrl", "视频链接必须是 B 站或 YouTube 的完整地址。")
  else if (options.duplicateVideoUrl) push("videoUrl", DUPLICATE_VIDEO_MESSAGE)

  const teamName = form.teamName.trim()
  if (!teamName) push("teamName", "请填写队伍名称，档案按队伍组合分组展示。")
  else if (teamName.length > 40) push("teamName", "队伍名称请控制在 40 个字符以内。")

  errors.push(
    ...validateSlots(form.units, unitById, "character", "units", "角色", "选择角色"),
    ...validateSlots(form.lightcones, unitById, "lightcone", "lightcones", "光锥", "搭配光锥"),
  )

  const cycle = toInteger(form.cycle)
  if (cycle === null || cycle < 0) push("cycle", "轮次需为不小于 0 的整数。")
  else if (zeroCycleCategories.has(form.category) && cycle !== 0) {
    push("cycle", `「${categoryLabels[form.category]}」要求轮次为 0。`)
  }

  const score = toInteger(form.score)
  if (score === null || score < 0) push("score", "分数需为不小于 0 的整数。")
  else if (form.mode === "as" && score > AS_MAX_SCORE) push("score", `末日幻影分数最高 ${AS_MAX_SCORE}。`)

  const cost = toInteger(form.cost)
  if (cost === null || cost < COST_MIN || cost > COST_MAX) push("cost", `成本需在 ${COST_MIN}–${COST_MAX} 之间。`)

  return errors
}

export function errorsOfStep(errors: SubmissionError[], step: SubmissionStepId): SubmissionError[] {
  const fields = new Set<SubmissionField>(submissionStepFields[step])
  return errors.filter((error) => fields.has(error.field))
}

export function stepOfField(field: SubmissionField): SubmissionStepId {
  const steps = Object.keys(submissionStepFields) as SubmissionStepId[]
  return steps.find((step) => submissionStepFields[step].includes(field)) ?? "basic"
}

export function describeSubmissionTarget(form: SubmissionPayload, config: ArchiveConfig): SubmissionTarget {
  const stage = findSubmissionStage(config, form.bossId)

  return {
    seasonLabel: config.seasons.find((season) => season.id === form.seasonId)?.label ?? form.seasonId,
    modeLabel: config.modes.find((mode) => mode.id === form.mode)?.label ?? form.mode,
    stageName: stage?.name ?? (form.bossId || "未选择"),
    stageSubtitle: stage?.subtitle ?? "",
    categoryLabel: categoryLabels[form.category],
    weakness: stage?.weakness ?? [],
    hp: stage?.hp ?? "",
    speed: stage?.speed ?? "",
    toughness: stage?.toughness ?? "",
  }
}

export function buildSubmissionRoster(form: SubmissionPayload, config: ArchiveConfig): SubmissionRosterLine[] {
  const unitById = new Map(config.units.map((unit) => [unit.id, unit]))

  return form.units.map((entry, index) => {
    const character = unitById.get(entry.unitId) ?? null
    const lightconeEntry = form.lightcones[index]
    const lightcone = lightconeEntry ? (unitById.get(lightconeEntry.unitId) ?? null) : null

    return {
      index,
      characterId: entry.unitId,
      characterName: character?.name ?? (entry.unitId || "未选择"),
      path: character?.path ?? "",
      rarity: character?.rarity ?? 0,
      gold: getCharacterGoldKind(character),
      eidolon: toInteger(entry.eidolon) ?? 0,
      lightconeId: lightconeEntry?.unitId ?? "",
      lightconeName: lightcone?.name ?? (lightconeEntry?.unitId || "未搭配"),
      superimposition: toInteger(lightconeEntry?.superimposition) ?? 1,
      pathMismatch: Boolean(character && lightcone && character.path !== lightcone.path),
    }
  })
}
