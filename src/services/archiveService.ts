import { seedConfig, seedRuns } from "@/data/seed"
import type {
  ArchiveConfig,
  ArchiveFilters,
  ArchiveRun,
  AdminSession,
  MetaStats,
  SubmissionPayload,
  SubmissionReview,
  SubmissionReviewStatus,
} from "@/types/archive"
import { buildMetaStats, filterRuns } from "@/services/runUtils"
import { fetchStaticArchiveSnapshot, mergeStaticArchiveConfig } from "@/services/staticArchiveConfig"

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

export async function fetchRuns(filters: ArchiveFilters): Promise<ArchiveRun[]> {
  const params = new URLSearchParams({
    season: filters.seasonId,
    mode: filters.mode,
    bossId: filters.bossId,
    category: filters.category,
    teamSize: String(filters.teamSize),
    cost: filters.cost,
    sort: filters.sort,
    selected: filters.selectedUnitIds.join(","),
    flags: filters.flags.join(","),
  })

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
    cost: filters.cost,
  })

  return requestJson<MetaStats>(`/api/archive/stats?${params.toString()}`, () =>
    buildMetaStats(filterRuns(seedRuns, filters), seedConfig.units),
  )
}

export async function submitRun(payload: SubmissionPayload): Promise<{ id: string; status: string }> {
  const response = await fetch(`${API_BASE}/api/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error("提交失败，请稍后重试或联系管理员。")
  }

  return (await response.json()) as { id: string; status: string }
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
  return { Authorization: session.authorization }
}

export async function fetchSubmissionReviews(
  session: AdminSession,
  status: SubmissionReviewStatus | "all" = "pending",
) {
  const params = new URLSearchParams({ status })
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
    body: JSON.stringify({ status, note: note.trim() }),
  })

  if (!response.ok) {
    throw new Error(response.status === 401 ? "管理员登录已失效。" : "审核操作失败。")
  }

  return (await response.json()) as { id: string; status: SubmissionReviewStatus }
}
