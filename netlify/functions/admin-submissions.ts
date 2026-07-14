import type { Handler } from "@netlify/functions"
import { getSql, jsonResponse, listFallbackSubmissionReviews, requireAdmin } from "./_shared"
import type { SubmissionReviewStatus } from "../../src/types/archive"

const allowedStatuses = new Set(["pending", "approved", "rejected", "all"])

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return jsonResponse({ message: "Method Not Allowed" }, 405)

  const unauthorized = requireAdmin(event)
  if (unauthorized) return unauthorized

  const requestedStatus = event.queryStringParameters?.status ?? "pending"
  if (!allowedStatuses.has(requestedStatus)) return jsonResponse({ message: "不支持的审核状态" }, 400)

  const status = requestedStatus as SubmissionReviewStatus | "all"
  const sql = getSql()
  if (!sql) return jsonResponse(await listFallbackSubmissionReviews(status))

  const rows =
    status === "all"
      ? await sql`
          select
            id,
            payload,
            status,
            reviewer_note as "reviewerNote",
            created_at as "createdAt",
            reviewed_at as "reviewedAt"
          from submission_reviews
          order by created_at desc
          limit 200
        `
      : await sql`
          select
            id,
            payload,
            status,
            reviewer_note as "reviewerNote",
            created_at as "createdAt",
            reviewed_at as "reviewedAt"
          from submission_reviews
          where status = ${status}
          order by created_at desc
          limit 200
        `

  return jsonResponse(rows)
}
