import type {Handler} from "@netlify/functions"
import {
  addFallbackSubmissionReview,
  findDuplicateVideoRecords,
  getSql,
  jsonResponse,
  listFallbackSubmissionReviews,
  patchFallbackSubmissionReview,
  readSubmissionId,
  sanitizeOwnerToken,
  validateSubmission,
} from "./_shared"
import { DUPLICATE_VIDEO_MESSAGE } from "../../src/services/videoUrl"
import type { SubmissionPayload } from "../../src/types/archive"

/** 与 `submissions.ts` 同一套 id 形状，审核台与 runs 都按这个前缀识别投稿。 */
function newSubmissionId() {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 作者对自己已提交的记录「编辑并重新提交」。两条路径的差别只在要不要保护公开记录：
 *
 * - 父记录 `rejected`：它没有公开记录要保护，**就地覆盖**同一条审核行（回到 pending、清掉驳回备注）。
 *   复用同一个 id 也让审核员看到「同一条投稿改完重提」，而不是队列里冒出新的一条。
 * - 父记录 `approved`：公开档案必须保持上一次通过的内容，所以**新建一条带 `revises_id` 的修订行**。
 *   `runs` 与 `submission_reviews` 靠同一个 id 关联，复用同 id 会让审核通过时的 upsert 当场覆盖公开记录。
 *   修订**复用父凭证**（不签发新 token），否则同一个父会挂着两条凭证、`/me` 的折叠就散了。
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse({message: "Method Not Allowed"}, 405)

  const id = readSubmissionId(event)
  if (!id) return jsonResponse({message: "缺少提交 ID"}, 400)

  let body: {token?: unknown; payload?: Partial<SubmissionPayload>}
  try {
    body = JSON.parse(event.body ?? "{}") as {token?: unknown; payload?: Partial<SubmissionPayload>}
  } catch {
    return jsonResponse({message: "请求体不是合法 JSON"}, 400)
  }

  const token = sanitizeOwnerToken(body.token)
  if (!token) return jsonResponse({message: "缺少或非法的凭证"}, 400)

  const payload = body.payload
  if (!payload) return jsonResponse({message: "缺少投稿内容", missing: ["payload"]}, 400)
  const missing = validateSubmission(payload)
  if (missing.length > 0) return jsonResponse({message: "缺少必要字段", missing}, 400)

  const sql = getSql()

  if (!sql) {
    const reviews = await listFallbackSubmissionReviews("all")
    const parent = reviews.find((review) => review.id === id)
    if (!parent) return jsonResponse({message: "未找到提交记录"}, 404)
    if (parent.ownerToken !== token) return jsonResponse({message: "凭证不匹配"}, 403)
    if (parent.status !== "approved" && parent.status !== "rejected") {
      return jsonResponse({message: "该记录不支持编辑重新提交"}, 400)
    }

    const children = reviews.filter((review) => review.revisesId === id)
    const familyIds = [id, ...children.map((review) => review.id)]
    const duplicates = await findDuplicateVideoRecords({
      videoUrl: payload.videoUrl ?? "",
      bossId: payload.bossId ?? "",
      excludeIds: familyIds,
    })
    if (duplicates.length > 0) {
      return jsonResponse({message: DUPLICATE_VIDEO_MESSAGE, duplicate: {matches: duplicates}}, 409)
    }

    if (parent.status === "rejected") {
      const next = await patchFallbackSubmissionReview(id, {
        payload: payload as SubmissionPayload,
        status: "pending",
        reviewerNote: null,
        reviewedAt: null,
        hidden: false,
      })
      if (!next) return jsonResponse({message: "未找到提交记录"}, 404)
      return jsonResponse({id, status: "pending", ownerToken: token, updated: true})
    }

    const active = children.find((review) => review.status === "pending")
    if (active) {
      const next = await patchFallbackSubmissionReview(active.id, {
        payload: payload as SubmissionPayload,
        reviewerNote: null,
        reviewedAt: null,
      })
      if (!next) return jsonResponse({message: "未找到提交记录"}, 404)
      return jsonResponse({id: active.id, status: "pending", ownerToken: token, revisesId: id, updated: true})
    }

    const revisionId = newSubmissionId()
    await addFallbackSubmissionReview(revisionId, payload as SubmissionPayload, token, id)
    return jsonResponse({id: revisionId, status: "pending", ownerToken: token, revisesId: id}, 202)
  }

  try {
    const parents = (await sql`
      select owner_token as "ownerToken", status
      from submission_reviews
      where id = ${id}
      limit 1
    `) as {ownerToken: string | null; status: string}[]
    const parent = parents[0]
    if (!parent) return jsonResponse({message: "未找到提交记录"}, 404)
    if (!parent.ownerToken || parent.ownerToken !== token) {
      return jsonResponse({message: "凭证不匹配"}, 403)
    }
    if (parent.status !== "approved" && parent.status !== "rejected") {
      return jsonResponse({message: "该记录不支持编辑重新提交"}, 400)
    }

    const children = (await sql`
      select id, status
      from submission_reviews
      where revises_id = ${id}
      order by created_at desc
    `) as {id: string; status: string}[]

    const duplicates = await findDuplicateVideoRecords({
      videoUrl: payload.videoUrl ?? "",
      bossId: payload.bossId ?? "",
      excludeIds: [id, ...children.map((child) => child.id)],
    })
    if (duplicates.length > 0) {
      return jsonResponse({message: DUPLICATE_VIDEO_MESSAGE, duplicate: {matches: duplicates}}, 409)
    }

    if (parent.status === "rejected") {
      await sql`
        update submission_reviews
        set payload = ${JSON.stringify(payload)}, status = 'pending',
            reviewer_note = null, reviewed_at = null, hidden = false
        where id = ${id}
      `
      return jsonResponse({id, status: "pending", ownerToken: token, updated: true})
    }

    // 同一个父最多一条活跃修订：再次编辑就地覆盖，不让队列里堆出多条待审的同一份记录。
    const active = children.find((child) => child.status === "pending")
    if (active) {
      await sql`
        update submission_reviews
        set payload = ${JSON.stringify(payload)}, reviewer_note = null, reviewed_at = null
        where id = ${active.id}
      `
      return jsonResponse({
        id: active.id,
        status: "pending",
        ownerToken: token,
        revisesId: id,
        updated: true,
      })
    }

    const revisionId = newSubmissionId()
    await sql`
      insert into submission_reviews (id, payload, status, owner_token, revises_id)
      values (${revisionId}, ${JSON.stringify(payload)}, 'pending', ${token}, ${id})
    `
    return jsonResponse({id: revisionId, status: "pending", ownerToken: token, revisesId: id}, 202)
  } catch {
    return jsonResponse({message: "重新提交失败，请稍后重试。"}, 502)
  }
}
