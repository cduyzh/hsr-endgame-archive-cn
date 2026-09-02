import type {Handler} from "@netlify/functions"
import {getSql, jsonResponse, listFallbackSubmissionReviews, updateFallbackSubmissionReview} from "./_shared"
import type {SubmissionReviewStatus} from "../../src/types/archive"

interface WithdrawRequest {
  token: unknown
}

function sanitizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > 200) return null
  return trimmed
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "PATCH") return jsonResponse({message: "Method Not Allowed"}, 405)

  const idFromPath = event.path.split("/").filter(Boolean).pop()
  const id = event.queryStringParameters?.id ?? idFromPath
  if (!id) return jsonResponse({message: "缺少提交 ID"}, 400)

  let body: WithdrawRequest
  try {
    body = JSON.parse(event.body ?? "{}") as WithdrawRequest
  } catch {
    return jsonResponse({message: "请求体不是合法 JSON"}, 400)
  }

  const token = sanitizeToken(body.token)
  if (!token) return jsonResponse({message: "缺少或非法的凭证"}, 400)

  const sql = getSql()

  if (!sql) {
    // fallback 模式：本地文件存储，从列表中查找并校验 token
    const reviews = await listFallbackSubmissionReviews("all")
    const target = reviews.find((review) => review.id === id)
    if (!target) return jsonResponse({message: "未找到提交记录"}, 404)
    if (target.ownerToken !== token) return jsonResponse({message: "凭证不匹配"}, 403)
    if (target.status === "withdrawn") {
      return jsonResponse({id, status: "withdrawn"})
    }
    const next = await updateFallbackSubmissionReview(id, "withdrawn" as SubmissionReviewStatus)
    if (!next) return jsonResponse({message: "未找到提交记录"}, 404)
    return jsonResponse({id, status: "withdrawn"})
  }

  // 1) 校验 token 归属
  const rows = await sql<{ownerToken: string | null; status: string}[]>`
    select owner_token as "ownerToken", status
    from submission_reviews
    where id = ${id}
    limit 1
  `
  const review = rows[0]
  if (!review) return jsonResponse({message: "未找到提交记录"}, 404)
  if (!review.ownerToken || review.ownerToken !== token) {
    return jsonResponse({message: "凭证不匹配"}, 403)
  }
  if (review.status === "withdrawn") {
    return jsonResponse({id, status: "withdrawn"})
  }

  // 2) 改 submission_reviews.status = 'withdrawn'
  const nextStatus: SubmissionReviewStatus = "withdrawn"
  await sql`
    update submission_reviews
    set status = ${nextStatus},
        reviewed_at = now()
    where id = ${id}
  `

  // 3) 同步 runs 表（所有 owner_token 匹配且关联到本 submission_reviews id 的 runs）
  // runs 表没有 submission_review_id 列，所以这里按 owner_token 全量撤回。
  await sql`
    update runs
    set status = ${nextStatus}
    where owner_token = ${token}
  `

  return jsonResponse({id, status: nextStatus})
}
