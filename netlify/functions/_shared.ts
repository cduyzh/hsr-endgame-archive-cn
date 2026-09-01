import { neon } from "@neondatabase/serverless"
import { readFile, rename, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import configData from "../../src/data/seed/config.json"
import runsData from "../../src/data/seed/runs.json"
import { getRunGoldCounts } from "../../src/services/unitCost"
import { submissionReviewToArchiveRun } from "../../src/services/submissionUtils"
import type {
  ArchiveConfig,
  ArchiveFilters,
  ArchiveRun,
  ArchiveUnit,
  SubmissionPayload,
  SubmissionReview,
  SubmissionReviewStatus,
} from "../../src/types/archive"

export const seedConfig = configData as ArchiveConfig
export const seedRuns = runsData as ArchiveRun[]

export function jsonResponse(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  }
}

export function readDatabaseUrl() {
  return process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL
}

export function getSql() {
  const databaseUrl = readDatabaseUrl()
  return databaseUrl ? neon(databaseUrl) : null
}

export function requireAdmin(event: { headers: Record<string, string | undefined> }) {
  const adminPassword = process.env.ADMIN_REVIEW_PASSWORD ?? process.env.ADMIN_REVIEW_TOKEN
  if (!adminPassword) return null

  const authorization = event.headers.authorization ?? event.headers.Authorization
  if (!authorization) return jsonResponse({ message: "未授权" }, 401)

  // 1) Bearer token 认证：使用管理员密码作为 token，命中即视为通过。
  if (authorization === `Bearer ${adminPassword}`) return null

  // 2) Basic auth 认证：要求 Authorization 以 "Basic " 开头。
  if (!authorization.startsWith("Basic ")) return jsonResponse({ message: "未授权" }, 401)

  try {
    const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf8")
    const separatorIndex = credentials.indexOf(":")
    const username = credentials.slice(0, separatorIndex)
    const password = credentials.slice(separatorIndex + 1)
    const adminUsername = process.env.ADMIN_REVIEW_USERNAME ?? "admin"
    return username === adminUsername && password === adminPassword ? null : jsonResponse({ message: "未授权" }, 401)
  } catch {
    return jsonResponse({ message: "未授权" }, 401)
  }
}

const fallbackReviewFile = process.env.SUBMISSION_REVIEW_FALLBACK_FILE ?? join(tmpdir(), "hsr-submission-reviews.json")

async function readFallbackReviews(): Promise<SubmissionReview[]> {
  try {
    return JSON.parse(await readFile(fallbackReviewFile, "utf8")) as SubmissionReview[]
  } catch {
    return []
  }
}

async function writeFallbackReviews(reviews: SubmissionReview[]) {
  const draftFile = `${fallbackReviewFile}.${process.pid}.tmp`
  await writeFile(draftFile, JSON.stringify(reviews, null, 2))
  await rename(draftFile, fallbackReviewFile)
}

export async function addFallbackSubmissionReview(id: string, payload: SubmissionPayload) {
  const reviews = await readFallbackReviews()
  reviews.unshift({
    id,
    payload,
    status: "pending",
    reviewerNote: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  })
  await writeFallbackReviews(reviews)
}

export async function listFallbackSubmissionReviews(status: SubmissionReviewStatus | "all" = "pending") {
  const reviews = await readFallbackReviews()
  return status === "all" ? reviews : reviews.filter((review) => review.status === status)
}

export async function listFallbackArchiveRuns() {
  const reviews = await readFallbackReviews()
  return reviews
    .filter((review) => review.status === "approved")
    .map((review) => submissionReviewToArchiveRun(review, seedConfig.units))
}

export async function updateFallbackSubmissionReview(
  id: string,
  status: SubmissionReviewStatus,
  reviewerNote?: string,
) {
  const reviews = await readFallbackReviews()
  const index = reviews.findIndex((review) => review.id === id)
  if (index < 0) return null

  const nextReview: SubmissionReview = {
    ...reviews[index],
    status,
    reviewerNote: reviewerNote ?? null,
    reviewedAt: status === "pending" ? null : new Date().toISOString(),
  }
  reviews[index] = nextReview
  await writeFallbackReviews(reviews)
  return nextReview
}

export function parseFilters(params: URLSearchParams): ArchiveFilters {
  return {
    seasonId:
      params.get("season") ?? seedConfig.seasons.find((season) => season.isCurrent)?.id ?? seedConfig.seasons[0]?.id ?? "",
    mode: (params.get("mode") as ArchiveFilters["mode"]) ?? "moc",
    bossId: params.get("bossId") ?? seedConfig.bosses[0]?.id ?? "",
    category: (params.get("category") as ArchiveFilters["category"]) ?? "all",
    teamSize: params.get("teamSize") && params.get("teamSize") !== "all" ? Number(params.get("teamSize")) : "all",
    cost: (params.get("cost") as ArchiveFilters["cost"]) ?? "all",
    sort: (params.get("sort") as ArchiveFilters["sort"]) ?? "score",
    grouping: true,
    continuous: false,
    unitKind: "character",
    flags: (params.get("flags") ?? "").split(",").filter(Boolean),
    selectedUnitIds: (params.get("selected") ?? "").split(",").filter(Boolean),
  }
}

export function matchesCost(run: ArchiveRun, cost: ArchiveFilters["cost"]) {
  if (cost === "all") return true
  const [min, max] = cost.split("-").map(Number)
  return run.cost >= min && run.cost <= max
}

export function filterArchiveRuns(runs: ArchiveRun[], filters: ArchiveFilters, units: ArchiveUnit[] = seedConfig.units) {
  const selected = new Set(filters.selectedUnitIds)
  const flags = new Set(filters.flags)
  return runs
    .filter((run) => run.seasonId === filters.seasonId)
    .filter((run) => run.mode === filters.mode)
    .filter((run) => run.bossId === filters.bossId)
    .filter((run) => filters.category === "all" || run.category === filters.category)
    .filter((run) => filters.teamSize === "all" || run.units.length === filters.teamSize)
    .filter((run) => matchesCost(run, filters.cost))
    .filter((run) => {
      if (selected.size === 0) return true
      const ids = new Set([...run.units, ...run.lightcones].map((unit) => unit.unitId))
      return [...selected].every((id) => ids.has(id))
    })
    .filter((run) => {
      if (flags.size === 0) return true
      return [...flags].every((flag) => run.tags.includes(flag))
    })
    .sort((a, b) => {
      if (filters.sort === "latest") return Date.parse(b.submittedAt) - Date.parse(a.submittedAt)
      if (filters.sort === "limited") {
        return getRunGoldCounts(a, units).limited - getRunGoldCounts(b, units).limited || a.cycle - b.cycle
      }
      return a.cycle - b.cycle || b.score - a.score || a.cost - b.cost
    })
}

export function filterSeedRuns(filters: ArchiveFilters) {
  return filterArchiveRuns(seedRuns, filters)
}

export function buildStats(runs: ArchiveRun[], units: ArchiveUnit[]) {
  const byId = new Map(units.map((unit) => [unit.id, unit]))
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
    for (const unit of run.units) characterCounts.set(unit.unitId, (characterCounts.get(unit.unitId) ?? 0) + 1)
    for (const unit of run.lightcones) lightconeCounts.set(unit.unitId, (lightconeCounts.get(unit.unitId) ?? 0) + 1)

    const name = run.units.map((unit) => byId.get(unit.unitId)?.name ?? unit.unitId).join(" / ")
    const existing = comboCounts.get(name)
    comboCounts.set(name, {
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
      .map(([id, count]) => ({ unit: byId.get(id), count }))
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

export function validateSubmission(payload: Partial<SubmissionPayload>) {
  const missing = []
  if (!payload.author?.trim()) missing.push("author")
  if (!payload.teamName?.trim()) missing.push("teamName")
  if (!payload.videoUrl?.trim()) missing.push("videoUrl")
  if (!payload.seasonId) missing.push("seasonId")
  if (!payload.mode) missing.push("mode")
  if (!payload.bossId) missing.push("bossId")
  if (!payload.units?.length || payload.units.some((unit) => !unit.unitId)) missing.push("units")
  if (!payload.lightcones?.length || payload.lightcones.some((unit) => !unit.unitId)) missing.push("lightcones")
  return missing
}
