import type {Handler} from "@netlify/functions"
import {
  getSql,
  jsonResponse,
  listFallbackSubmissionReviews,
  patchFallbackSubmissionReview,
  readSubmissionId,
  sanitizeOwnerToken,
} from "./_shared"
import type {SubmissionReviewStatus} from "../../src/types/archive"

/**
 * 只有「不再公开展示、也不会再有审核动作」的记录才允许作者自己收纳：
 * pending 要留着查审核进度，approved 还在公开档案里——隐藏它只会让人换设备后找不回自己已发布的作品。
 */
const HIDABLE_STATUSES: SubmissionReviewStatus[] = ["rejected", "withdrawn"]

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "PATCH") return jsonResponse({message: "Method Not Allowed"}, 405)

  const id = readSubmissionId(event)
  if (!id) return jsonResponse({message: "缺少提交 ID"}, 400)

  let body: {token?: unknown; hidden?: unknown}
  try {
    body = JSON.parse(event.body ?? "{}") as {token?: unknown; hidden?: unknown}
  } catch {
    return jsonResponse({message: "请求体不是合法 JSON"}, 400)
  }

  const token = sanitizeOwnerToken(body.token)
  if (!token) return jsonResponse({message: "缺少或非法的凭证"}, 400)
  if (typeof body.hidden !== "boolean") return jsonResponse({message: "hidden 必须是布尔值"}, 400)
  const hidden = body.hidden

  const sql = getSql()

  if (!sql) {
    const reviews = await listFallbackSubmissionReviews("all")
    const target = reviews.find((review) => review.id === id)
    if (!target) return jsonResponse({message: "未找到提交记录"}, 404)
    if (target.ownerToken !== token) return jsonResponse({message: "凭证不匹配"}, 403)
    if (!HIDABLE_STATUSES.includes(target.status)) {
      return jsonResponse({message: "该状态的记录不支持隐藏"}, 400)
    }
    const next = await patchFallbackSubmissionReview(id, {hidden})
    if (!next) return jsonResponse({message: "未找到提交记录"}, 404)
    return jsonResponse({id, hidden})
  }

  try {
    const rows = (await sql`
      select owner_token as "ownerToken", status
      from submission_reviews
      where id = ${id}
      limit 1
    `) as {ownerToken: string | null; status: string}[]
    const review = rows[0]
    if (!review) return jsonResponse({message: "未找到提交记录"}, 404)
    if (!review.ownerToken || review.ownerToken !== token) {
      return jsonResponse({message: "凭证不匹配"}, 403)
    }
    if (!HIDABLE_STATUSES.includes(review.status as SubmissionReviewStatus)) {
      return jsonResponse({message: "该状态的记录不支持隐藏"}, 400)
    }

    await sql`
      update submission_reviews
      set hidden = ${hidden}
      where id = ${id}
    `
    return jsonResponse({id, hidden})
  } catch {
    return jsonResponse({message: "更新可见性失败，请稍后重试。"}, 502)
  }
}
