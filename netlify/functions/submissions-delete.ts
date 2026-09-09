import type {Handler} from "@netlify/functions"
import {
  deleteFallbackSubmissionReview,
  getSql,
  jsonResponse,
  listFallbackSubmissionReviews,
  readSubmissionId,
  sanitizeOwnerToken,
} from "./_shared"

/**
 * 作者硬删自己被驳回的投稿：不经审核、直接从库里移除，删完 `/api/submissions/me` 与审核台都查不到。
 * 严格限定 `rejected`——pending 该走撤回，approved 记录已在公开档案里，不允许作者自行抹掉。
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "DELETE") return jsonResponse({message: "Method Not Allowed"}, 405)

  const id = readSubmissionId(event)
  if (!id) return jsonResponse({message: "缺少提交 ID"}, 400)

  let body: {token?: unknown}
  try {
    body = JSON.parse(event.body ?? "{}") as {token?: unknown}
  } catch {
    return jsonResponse({message: "请求体不是合法 JSON"}, 400)
  }

  const token = sanitizeOwnerToken(body.token)
  if (!token) return jsonResponse({message: "缺少或非法的凭证"}, 400)

  const sql = getSql()

  if (!sql) {
    const reviews = await listFallbackSubmissionReviews("all")
    const target = reviews.find((review) => review.id === id)
    if (!target) return jsonResponse({message: "未找到提交记录"}, 404)
    if (target.ownerToken !== token) return jsonResponse({message: "凭证不匹配"}, 403)
    if (target.status !== "rejected") {
      return jsonResponse({message: "只有已驳回的记录可以删除"}, 400)
    }
    // 无库模式下公开记录是从审核队列派生的（只取 approved），删掉审核行就等于删掉了这条记录。
    const removed = await deleteFallbackSubmissionReview(id)
    if (!removed) return jsonResponse({message: "未找到提交记录"}, 404)
    return jsonResponse({id, deleted: true, removedRun: false})
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
    if (review.status !== "rejected") {
      return jsonResponse({message: "只有已驳回的记录可以删除"}, 400)
    }

    // 被驳回过的记录可能在 runs 里留有一行（审核员先通过后又驳回），必须一起清掉：
    // /me 的 runs 查询不按 status 过滤，残留行会既在「我的投稿」里出现、又可能继续挂在公开档案里。
    // run_units 靠 schema 里的 `on delete cascade` 自动清理。
    const removedRuns = (await sql`
      delete from runs
      where id = ${id}
      returning id
    `) as {id: string}[]
    await sql`
      delete from submission_reviews
      where revises_id = ${id}
    `
    await sql`
      delete from submission_reviews
      where id = ${id}
    `

    return jsonResponse({id, deleted: true, removedRun: removedRuns.length > 0})
  } catch {
    return jsonResponse({message: "删除失败，请稍后重试。"}, 502)
  }
}
