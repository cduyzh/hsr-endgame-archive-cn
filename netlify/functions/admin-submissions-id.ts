import type { Handler } from "@netlify/functions"
import { getSql, jsonResponse, requireAdmin, seedConfig, updateFallbackSubmissionReview } from "./_shared"
import { submissionReviewToArchiveRun } from "../../src/services/submissionUtils"
import type { SubmissionReview, SubmissionReviewStatus } from "../../src/types/archive"

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "PATCH") return jsonResponse({ message: "Method Not Allowed" }, 405)

  const unauthorized = requireAdmin(event)
  if (unauthorized) return unauthorized

  const id = event.queryStringParameters?.id
  if (!id) return jsonResponse({ message: "缺少提交 ID" }, 400)

  const body = JSON.parse(event.body ?? "{}") as { status?: SubmissionReviewStatus; note?: string }
  if (body.status !== "pending" && body.status !== "approved" && body.status !== "rejected") {
    return jsonResponse({ message: "不支持的审核状态" }, 400)
  }

  const sql = getSql()
  if (sql) {
    const rows = await sql`
      select
        id,
        payload,
        status,
        reviewer_note as "reviewerNote",
        created_at as "createdAt",
        reviewed_at as "reviewedAt"
      from submission_reviews
      where id = ${id}
      limit 1
    `
    const review = rows[0] as SubmissionReview | undefined
    if (!review) return jsonResponse({ message: "未找到提交记录" }, 404)

    if (body.status === "approved") {
      const run = submissionReviewToArchiveRun(review, seedConfig.units)
      await sql`
        insert into runs (
          id, season_id, mode, boss_id, category, team_name, author, cycle, score, cost,
          limited_count, standard_count, submitted_at, tags, video_url, status
        ) values (
          ${run.id}, ${run.seasonId}, ${run.mode}, ${run.bossId}, ${run.category}, ${run.teamName}, ${run.author},
          ${run.cycle}, ${run.score}, ${run.cost}, ${run.limitedCount}, ${run.standardCount}, ${run.submittedAt},
          ${JSON.stringify(run.tags)}, ${run.videoUrl ?? null}, 'pending'
        )
        on conflict (id) do update set
          season_id = excluded.season_id,
          mode = excluded.mode,
          boss_id = excluded.boss_id,
          category = excluded.category,
          team_name = excluded.team_name,
          author = excluded.author,
          cycle = excluded.cycle,
          score = excluded.score,
          cost = excluded.cost,
          limited_count = excluded.limited_count,
          standard_count = excluded.standard_count,
          submitted_at = excluded.submitted_at,
          tags = excluded.tags,
          video_url = excluded.video_url,
          status = 'pending'
      `
      await sql`delete from run_units where run_id = ${id}`
      for (const [index, unit] of run.units.entries()) {
        await sql`
          insert into run_units (run_id, unit_id, kind, slot_index, eidolon)
          values (${id}, ${unit.unitId}, 'character', ${index}, ${unit.eidolon ?? 0})
        `
      }
      for (const [index, unit] of run.lightcones.entries()) {
        await sql`
          insert into run_units (run_id, unit_id, kind, slot_index, superimposition)
          values (${id}, ${unit.unitId}, 'lightcone', ${index}, ${unit.superimposition ?? 1})
        `
      }
      await sql`update runs set status = 'approved' where id = ${id}`
    } else {
      await sql`update runs set status = ${body.status} where id = ${id}`
    }

    if (body.status === "pending") {
      await sql`
        update submission_reviews
        set status = 'pending', reviewer_note = ${body.note?.trim() || null}, reviewed_at = null
        where id = ${id}
      `
    } else {
      await sql`
        update submission_reviews
        set status = ${body.status}, reviewer_note = ${body.note?.trim() || null}, reviewed_at = now()
        where id = ${id}
      `
    }
  } else {
    const review = await updateFallbackSubmissionReview(id, body.status, body.note?.trim())
    if (!review) return jsonResponse({ message: "未找到提交记录" }, 404)
  }

  return jsonResponse({ id, status: body.status })
}
