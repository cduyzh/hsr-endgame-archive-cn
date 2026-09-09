import type {Handler} from "@netlify/functions"
import {
  getSql,
  jsonResponse,
  listFallbackSubmissionReviews,
  readSubmissionId,
  sanitizeOwnerToken,
  updateFallbackSubmissionReview,
} from "./_shared"
import type {SubmissionReviewStatus} from "../../src/types/archive"

interface WithdrawRequest {
  token: unknown
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "PATCH") return jsonResponse({message: "Method Not Allowed"}, 405)

  const id = readSubmissionId(event)
  if (!id) return jsonResponse({message: "缺少提交 ID"}, 400)

  let body: WithdrawRequest
  try {
    body = JSON.parse(event.body ?? "{}") as WithdrawRequest
  } catch {
    return jsonResponse({message: "请求体不是合法 JSON"}, 400)
  }

  const token = sanitizeOwnerToken(body.token)
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
    for (const child of reviews.filter((review) => review.revisesId === id && review.status === "pending")) {
      await updateFallbackSubmissionReview(child.id, "withdrawn" as SubmissionReviewStatus)
    }
    return jsonResponse({id, status: "withdrawn"})
  }

  // 1) 校验 token 归属
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

  // 3) 同步 runs 表：`runs.id === submission_reviews.id`，按 id 精确定位。
  //    不能按 owner_token 全量改——修订复用父凭证，那样「撤回一条修订」会把父记录那行公开档案一起撤掉。
  //    修订自己没有 runs 行（通过时写的是原投稿那行），所以这条 UPDATE 对修订天然是 no-op，正是想要的语义。
  await sql`
    update runs
    set status = ${nextStatus}
    where id = ${id}
  `

  // 4) 父记录撤回后，它名下还在待审的修订一并收掉。
  await sql`
    update submission_reviews
    set status = ${nextStatus}, reviewed_at = now()
    where revises_id = ${id} and status = 'pending'
  `

  return jsonResponse({id, status: nextStatus})
}
