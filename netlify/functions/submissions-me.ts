import type { Handler } from "@netlify/functions"
import { getSql, jsonResponse, listFallbackSubmissionReviews } from "./_shared"

interface MeRequest {
  tokens: unknown
  includeHidden?: unknown
}

interface OwnedReview {
  id: string
  ownerToken: string | null
  status: string
  payload: unknown
  reviewerNote: string | null
  hidden: boolean
  revisesId: string | null
  createdAt: string
  reviewedAt: string | null
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

/**
 * 隐藏是**家族**状态：父行被隐藏时它的修订一并收纳，否则 `/me` 会冒出一张没有父记录的孤儿修订卡。
 * 计数按「条」= 一个家族一张卡，不是一行一条，避免隐藏 1 条带修订的记录却显示隐藏了 3 条。
 */
function partitionByHidden(reviews: OwnedReview[]) {
  const hiddenRootIds = new Set<string>()
  for (const review of reviews) {
    if (review.hidden) hiddenRootIds.add(review.revisesId ?? review.id)
  }
  const visible = reviews.filter((review) => !hiddenRootIds.has(review.revisesId ?? review.id))
  return { visible, hiddenRootIds: [...hiddenRootIds], hiddenCount: hiddenRootIds.size }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse({ message: "Method Not Allowed" }, 405)

  let body: MeRequest
  try {
    body = JSON.parse(event.body ?? "{}") as MeRequest
  } catch {
    return jsonResponse({ message: "请求体不是合法 JSON" }, 400)
  }

  const includeHidden = body.includeHidden === true
  const tokens = sanitizeTokens(body.tokens)
  if (tokens.length === 0) return jsonResponse({ reviews: [], runs: [], hiddenCount: 0 })

  const sql = getSql()
  if (!sql) {
    const all = await listFallbackSubmissionReviews("all")
    const owned = (all as unknown as OwnedReview[]).filter((review) => review.ownerToken && tokens.includes(review.ownerToken))
    const { visible, hiddenCount } = partitionByHidden(owned)
    // 无库模式只有审核队列，拼不出 runs 的形状，历来就返回空数组。
    return jsonResponse({ reviews: includeHidden ? owned : visible, runs: [], hiddenCount })
  }

  const reviewRows = (await sql`
    select
      id,
      owner_token as "ownerToken",
      status,
      payload,
      reviewer_note as "reviewerNote",
      hidden,
      revises_id as "revisesId",
      created_at as "createdAt",
      reviewed_at as "reviewedAt"
    from submission_reviews
    where owner_token = any(${tokens}::text[])
    order by created_at desc
    limit 200
  `) as OwnedReview[]

  const { visible, hiddenRootIds, hiddenCount } = partitionByHidden(reviewRows)

  const runs = (await sql`
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
  `) as { id: string; ownerToken: string | null; status: string }[]

  // 隐藏的家族整条收纳：runs 里对应的那行也不回，否则「已通过的投稿」区会留下幽灵条目。
  const visibleRuns = includeHidden
    ? runs
    : runs.filter((run) => !hiddenRootIds.includes(run.id))

  return jsonResponse({ reviews: includeHidden ? reviewRows : visible, runs: visibleRuns, hiddenCount })
}
