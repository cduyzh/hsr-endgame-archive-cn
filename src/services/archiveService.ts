import {seedConfig, seedRuns} from "@/data/seed"
import type {
  ArchiveConfig,
  ArchiveFilters,
  ArchiveRun,
  AdminSession,
  DuplicateVideoMatch,
  MetaStats,
  SubmissionPayload,
  SubmissionReview,
  SubmissionReviewStatus,
} from "@/types/archive"
import {buildMetaStats, filterRuns} from "@/services/runUtils"
import {submissionFieldLabels, type SubmissionField} from "@/services/submissionValidation"
import {DUPLICATE_VIDEO_MESSAGE} from "@/services/videoUrl"
import {fetchStaticArchiveSnapshot, mergeStaticArchiveConfig} from "@/services/staticArchiveConfig"

const API_BASE = import.meta.env.VITE_API_BASE ?? ""

async function requestJson<T>(path: string, fallback: () => T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as T
  } catch {
    return fallback()
  }
}

export async function fetchArchiveConfig(): Promise<ArchiveConfig> {
  const config = await requestJson<ArchiveConfig>("/api/archive/config", () => seedConfig)
  const staticSnapshot = await fetchStaticArchiveSnapshot()
  return mergeStaticArchiveConfig(config, staticSnapshot)
}

/** 区间筛选只在对应端有限制时写入 query，两端都不限时整个键缺席。 */
function appendRange(params: URLSearchParams, key: string, min: number | null, max: number | null) {
  if (min !== null) params.set(`${key}Min`, String(min))
  if (max !== null) params.set(`${key}Max`, String(max))
}

export async function fetchRuns(filters: ArchiveFilters): Promise<ArchiveRun[]> {
  const params = new URLSearchParams({
    season: filters.seasonId,
    mode: filters.mode,
    bossId: filters.bossId,
    category: filters.category,
    teamSize: String(filters.teamSize),
    sort: filters.sort,
    selected: filters.selectedUnitIds.join(","),
    flags: filters.flags.join(","),
  })
  appendRange(params, "cost", filters.costMin, filters.costMax)
  appendRange(params, "score", filters.scoreMin, filters.scoreMax)

  return requestJson<ArchiveRun[]>(`/api/archive/runs?${params.toString()}`, () =>
    filterRuns(seedRuns, filters, seedConfig.units),
  )
}

export async function fetchMetaStats(filters: ArchiveFilters): Promise<MetaStats> {
  const params = new URLSearchParams({
    season: filters.seasonId,
    mode: filters.mode,
    bossId: filters.bossId,
    category: filters.category,
  })
  appendRange(params, "cost", filters.costMin, filters.costMax)
  appendRange(params, "score", filters.scoreMin, filters.scoreMax)

  return requestJson<MetaStats>(`/api/archive/stats?${params.toString()}`, () =>
    buildMetaStats(filterRuns(seedRuns, filters), seedConfig.units),
  )
}

/** 服务端入队查重命中（409）。投稿向导据此跳回第一步并展示已有记录摘要。 */
export class SubmissionDuplicateError extends Error {
  matches: DuplicateVideoMatch[]

  constructor(message: string, matches: DuplicateVideoMatch[]) {
    super(message)
    this.name = "SubmissionDuplicateError"
    this.matches = matches
  }
}

interface SubmissionFailureBody {
  message?: string
  missing?: string[]
  duplicate?: {matches?: unknown}
}

export async function submitRun(payload: SubmissionPayload): Promise<{id: string; status: string; ownerToken: string}> {
  const response = await fetch(`${API_BASE}/api/submissions`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as SubmissionFailureBody | null
    if (response.status === 409 && body?.duplicate) {
      const matches = Array.isArray(body.duplicate.matches) ? (body.duplicate.matches as DuplicateVideoMatch[]) : []
      throw new SubmissionDuplicateError(body.message || DUPLICATE_VIDEO_MESSAGE, matches)
    }
    throw new Error(describeSubmissionFailure(body))
  }

  return (await response.json()) as {id: string; status: string; ownerToken: string}
}

function describeSubmissionFailure(body: SubmissionFailureBody | null) {
  const missing = Array.isArray(body?.missing)
    ? body.missing.map((field) => submissionFieldLabels[field as SubmissionField] ?? field)
    : []

  if (missing.length > 0) return `缺少必要字段：${missing.join("、")}。`
  return body?.message || "提交失败，请稍后重试或联系管理员。"
}

/**
 * 投稿前的视频链接查重（表单填完链接即调用），按「视频 + 敌方阶段」比对已有待审/已通过投稿。
 * 任何失败都返回空数组放行：入队时服务端还会再查一次并返回 409，不该因一次预检抖动挡住正常投稿。
 */
export async function checkDuplicateVideo(input: {videoUrl: string; bossId: string}): Promise<DuplicateVideoMatch[]> {
  const videoUrl = input.videoUrl.trim()
  if (!videoUrl || !input.bossId) return []

  const params = new URLSearchParams({videoUrl, bossId: input.bossId})
  try {
    const response = await fetch(`${API_BASE}/api/submissions/check?${params.toString()}`)
    if (!response.ok) return []
    const body = (await response.json()) as {matches?: unknown}
    return Array.isArray(body?.matches) ? (body.matches as DuplicateVideoMatch[]) : []
  } catch {
    return []
  }
}

function encodeBasicCredentials(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

export function createAdminSession(username: string, password: string): AdminSession {
  return {
    username: username.trim(),
    authorization: encodeBasicCredentials(username.trim(), password),
  }
}

function buildAdminHeaders(session: AdminSession) {
  return {Authorization: session.authorization}
}

export async function fetchSubmissionReviews(
  session: AdminSession,
  status: SubmissionReviewStatus | "all" = "pending",
) {
  const params = new URLSearchParams({status})
  const response = await fetch(`${API_BASE}/api/admin/submissions?${params.toString()}`, {
    headers: buildAdminHeaders(session),
  })

  if (!response.ok) {
    throw new Error(response.status === 401 ? "管理员账号或密码错误。" : "审核列表读取失败。")
  }

  return (await response.json()) as SubmissionReview[]
}

export async function reviewSubmission(
  id: string,
  status: SubmissionReviewStatus,
  note: string,
  session: AdminSession,
) {
  const response = await fetch(`${API_BASE}/api/admin/submissions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAdminHeaders(session),
    },
    body: JSON.stringify({status, note: note.trim()}),
  })

  if (!response.ok) {
    throw new Error(response.status === 401 ? "管理员登录已失效。" : "审核操作失败。")
  }

  return (await response.json()) as {id: string; status: SubmissionReviewStatus}
}

export interface MySubmissionRun {
  id: string
  ownerToken: string
  status: string
  seasonId: string
  mode: string
  bossId: string
  category: string
  teamName: string
  author: string
  cycle: number
  score: number
  cost: number
  limitedCount: number
  standardCount: number
  submittedAt: string
  tags: unknown
  videoUrl: string | null
}

export interface MySubmissionsPayload {
  reviews: SubmissionReview[]
  runs: MySubmissionRun[]
}

export async function listMySubmissions(tokens: string[]): Promise<MySubmissionsPayload> {
  if (tokens.length === 0) return {reviews: [], runs: []}
  const response = await fetch(`${API_BASE}/api/submissions/me`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({tokens}),
  })
  if (!response.ok) {
    throw new Error("读取我的投稿失败。")
  }
  return (await response.json()) as MySubmissionsPayload
}

export async function withdrawSubmission(id: string, token: string) {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(id)}/withdraw`, {
    method: "PATCH",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({token}),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {message?: string} | null
    throw new Error(body?.message || "撤回失败，请稍后重试。")
  }
  return (await response.json()) as {id: string; status: SubmissionReviewStatus}
}
