import { COST_MAX, COST_MIN } from "./unitCost"
import { isRunFlag } from "./runFlags"
import type { EndgameMode, SpecificRunCategory, SubmissionPayload } from "../types/archive"

/**
 * 投稿规则的纯判定层：前端表单与服务端入队共用同一套枚举与值域口径。
 *
 * 单独成模块的原因与 `runFlags.ts` 相同——`runUtils.ts` / `submissionValidation.ts` 都带 `@/`
 * 值导入，Netlify Functions 用 esbuild 打包、不解析 Vite 别名，引不了它们。本文件只做
 * `import type` 与相对路径值导入，所以两端都能引用；`runUtils.ts` 与 `submissionValidation.ts`
 * 会原样再导出，对外的「唯一来源」仍是那两个文件。
 */

export const ENDGAME_MODES: readonly EndgameMode[] = ["moc", "pf", "as", "aa"]

export function isEndgameMode(value: unknown): value is EndgameMode {
  return typeof value === "string" && ENDGAME_MODES.includes(value as EndgameMode)
}

/** 末日幻影按剩余行动值计分，满分 4000。 */
export const AS_MAX_SCORE = 4000

/** 投稿固定按 4 人队伍录入，与档案侧 `teamSize` 的最大值一致 */
export const TEAM_SLOT_COUNT = 4

/** 阶段 id 规则为 `${seasonId}-${mode}-${stageKey}`，末段即阶段键。 */
export function stageKeyOf(bossId: string): string {
  return bossId.split("-").pop() ?? ""
}

export function categoryOptionsFor(mode: EndgameMode, bossId: string): SpecificRunCategory[] {
  if (mode === "as") return ["asScore3400", "asScore3650", "asScore3850", "asScore4000"]
  if (mode === "aa" && stageKeyOf(bossId) === "plight") return ["plightZeroCycle", "plightFullStars"]
  return ["zeroCycle", "fullStars"]
}

/** 0 轮类分类（含异相仲裁的绝境变体）要求轮次为 0。 */
export const zeroCycleCategories: ReadonlySet<SpecificRunCategory> = new Set([
  "zeroCycle",
  "plightZeroCycle",
])

export function toInteger(value: unknown): number | null {
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

export interface SubmissionRuleViolation {
  field: string
  message: string
}

/**
 * 服务端侧的值域校验：`_shared.validateSubmission()` 只查字段是否存在，
 * 枚举、值域与「4 角色 + 4 光锥」这些规则此前只有前端一份，绕过前端直 POST 就能把
 * `mode=bogus`、`cost=999` 的脏记录送进审核队列，通过后直接进公开 `runs`。
 * 这里补的就是那层纵深——只校不依赖配置数据就能判定的规则，单位是否存在仍由审核台把关。
 */
export function checkSubmissionRules(payload: Partial<SubmissionPayload>): SubmissionRuleViolation[] {
  const violations: SubmissionRuleViolation[] = []
  const push = (field: string, message: string) => violations.push({ field, message })

  const mode = payload.mode
  if (!isEndgameMode(mode)) {
    push("mode", "竞赛模式不合法。")
  } else {
    const bossId = payload.bossId ?? ""
    if (!categoryOptionsFor(mode, bossId).includes(payload.category as SpecificRunCategory)) {
      push("category", "当前模式与敌方阶段没有该记录分类。")
    }
    // 阶段 id 自带赛季与模式，与表单选的不一致说明 payload 被拼过。
    if (bossId && !bossId.startsWith(`${payload.seasonId}-${mode}-`)) {
      push("bossId", "敌方阶段与所选赛季、模式不一致。")
    }
  }

  if (!isUsableVideoUrl(String(payload.videoUrl ?? ""))) {
    push("videoUrl", "视频链接必须是 B 站或 YouTube 的完整地址。")
  }

  const units = payload.units ?? []
  const lightcones = payload.lightcones ?? []
  if (!Array.isArray(units) || !Array.isArray(lightcones) || units.length !== TEAM_SLOT_COUNT || lightcones.length !== TEAM_SLOT_COUNT) {
    push("units", `角色与光锥都必须恰好 ${TEAM_SLOT_COUNT} 个。`)
  }

  const flags = payload.flags ?? []
  if (!Array.isArray(flags) || flags.some((flag) => !isRunFlag(flag))) {
    push("flags", "包含本站不支持的标记。")
  }

  const cost = toInteger(payload.cost)
  if (cost === null || cost < COST_MIN || cost > COST_MAX) {
    push("cost", `成本需在 ${COST_MIN}–${COST_MAX} 之间。`)
  }

  const cycle = toInteger(payload.cycle)
  if (cycle === null || cycle < 0) {
    push("cycle", "轮次需为不小于 0 的整数。")
  } else if (zeroCycleCategories.has(payload.category as SpecificRunCategory) && cycle !== 0) {
    push("cycle", "「0 轮竞速」类记录要求轮次为 0。")
  }

  const score = toInteger(payload.score)
  if (score === null || score < 0) {
    push("score", "分数需为不小于 0 的整数。")
  } else if (payload.mode === "as" && score > AS_MAX_SCORE) {
    push("score", `末日幻影分数最高 ${AS_MAX_SCORE}。`)
  }

  return violations
}
