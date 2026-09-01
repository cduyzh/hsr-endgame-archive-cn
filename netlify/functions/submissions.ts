import type { Handler } from "@netlify/functions"
import { addFallbackSubmissionReview, getSql, jsonResponse, validateSubmission } from "./_shared"
import type { SubmissionPayload } from "../../src/types/archive"

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse({ message: "Method Not Allowed" }, 405)

  let payload: Partial<SubmissionPayload>
  try {
    payload = JSON.parse(event.body ?? "{}") as Partial<SubmissionPayload>
  } catch {
    return jsonResponse({ message: "请求体不是合法 JSON" }, 400)
  }

  const missing = validateSubmission(payload)
  if (missing.length > 0) return jsonResponse({ message: "缺少必要字段", missing }, 400)

  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const sql = getSql()

  if (sql) {
    await sql`
      insert into submission_reviews (id, payload, status)
      values (${id}, ${JSON.stringify(payload)}, 'pending')
    `
  } else {
    await addFallbackSubmissionReview(id, payload as SubmissionPayload)
  }

  return jsonResponse({ id, status: "pending" }, 202)
}
