import type { Handler } from "@netlify/functions"
import { getSql, jsonResponse, listFallbackSubmissionReviews } from "./_shared"

interface MeRequest {
  tokens: unknown
}

const MAX_TOKENS = 50

function sanitizeTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const set = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== "string") continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    set.add(trimmed)
    if (set.size >= MAX_TOKENS) break
  }
  return [...set]
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse({ message: "Method Not Allowed" }, 405)

  let body: MeRequest
  try {
    body = JSON.parse(event.body ?? "{}") as MeRequest
  } catch {
    return jsonResponse({ message: "请求体不是合法 JSON" }, 400)
  }

  const tokens = sanitizeTokens(body.tokens)
  if (tokens.length === 0) return jsonResponse({ reviews: [], runs: [] })

  const sql = getSql()
  if (!sql) {
    const all = await listFallbackSubmissionReviews("all")
    const owned = all.filter((review) => review.ownerToken && tokens.includes(review.ownerToken))
    return jsonResponse({ reviews: owned, runs: [] })
  }

  const reviews = await sql<{
    id: string
    ownerToken: string
    status: string
    payload: unknown
    reviewerNote: string | null
    createdAt: string
    reviewedAt: string | null
  }[]>`
    select
      id,
      owner_token as "ownerToken",
      status,
      payload,
      reviewer_note as "reviewerNote",
      created_at as "createdAt",
      reviewed_at as "reviewedAt"
    from submission_reviews
    where owner_token = any(${tokens}::text[])
    order by created_at desc
    limit 200
  `

  const runs = await sql<{
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
  }[]>`
    select
      id,
      owner_token as "ownerToken",
      status,
      season_id as "seasonId",
      mode,
      boss_id as "bossId",
      category,
      team_name as "teamName",
      author,
      cycle,
      score,
      cost,
      limited_count as "limitedCount",
      standard_count as "standardCount",
      submitted_at as "submittedAt",
      tags,
      video_url as "videoUrl"
    from runs
    where owner_token = any(${tokens}::text[])
    order by submitted_at desc
    limit 200
  `

  return jsonResponse({ reviews, runs })
}
