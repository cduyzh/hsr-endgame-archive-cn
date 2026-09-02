import type { Handler } from "@netlify/functions"
import { addFallbackSubmissionReview, getSql, jsonResponse, validateSubmission } from "./_shared"
import type { SubmissionPayload } from "../../src/types/archive"

/**
 * 生成 24 字节 base64url 令牌（≈ 32 字符）。
 * 不用加密库：投稿体系不涉及身份认证，只是不让 token 在 URL 里被一眼猜中。
 */
function generateOwnerToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return `own_${out}`
}

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
  const ownerToken = generateOwnerToken()
  const sql = getSql()

  if (sql) {
    await sql`
      insert into submission_reviews (id, payload, status, owner_token)
      values (${id}, ${JSON.stringify(payload)}, 'pending', ${ownerToken})
    `
  } else {
    await addFallbackSubmissionReview(id, payload as SubmissionPayload, ownerToken)
  }

  return jsonResponse({ id, status: "pending", ownerToken }, 202)
}
