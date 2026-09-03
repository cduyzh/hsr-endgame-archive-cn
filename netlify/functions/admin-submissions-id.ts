import type {Handler} from "@netlify/functions"
import {getSql, jsonResponse, requireAdmin, seedConfig, updateFallbackSubmissionReview} from "./_shared"
import {getStaticBossMap} from "./_staticSnapshot"
import {submissionReviewToArchiveRun} from "../../src/services/submissionUtils"
import type {SubmissionReview, SubmissionReviewStatus} from "../../src/types/archive"

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "PATCH") return jsonResponse({message: "Method Not Allowed"}, 405)

  const unauthorized = requireAdmin(event)
  if (unauthorized) return unauthorized

  // 优先从 path 段取 id（netlify.toml 走 path-based 重写 ?id=:id 在生产不稳定），
  // 保留 query 兜底兼容旧部署。
  const idFromPath = event.path.split("/").filter(Boolean).pop()
  const id = event.queryStringParameters?.id ?? idFromPath
  if (!id) return jsonResponse({message: "缺少提交 ID"}, 400)

  let body: {status?: SubmissionReviewStatus; note?: string}
  try {
    body = JSON.parse(event.body ?? "{}") as {status?: SubmissionReviewStatus; note?: string}
  } catch {
    return jsonResponse({message: "请求体不是有效的 JSON"}, 400)
  }
  if (body.status !== "pending" && body.status !== "approved" && body.status !== "rejected") {
    return jsonResponse({message: "不支持的审核状态"}, 400)
  }

  const sql = getSql()
  if (sql) {
    const rows = await sql`
      select
        id,
        payload,
        status,
        reviewer_note as "reviewerNote",
        owner_token as "ownerToken",
        created_at as "createdAt",
        reviewed_at as "reviewedAt"
      from submission_reviews
      where id = ${id}
      limit 1
    `
    const review = rows[0] as SubmissionReview | undefined
    if (!review) return jsonResponse({message: "未找到提交记录"}, 404)

    if (body.status === "approved") {
      const run = submissionReviewToArchiveRun(review, seedConfig.units)
      // 敌方阶段由前端 staticArchiveConfig 从远程快照生成,seed/库中的 stages 默认空。
      // 审核通过在 insert runs 之前先确保 stages 中存在该 bossId,避免触发 runs_boss_id_fkey。
      // 优先从远程静态快照拉取完整 stage 字段(HP/速度/韧性/弱点/副标题/横幅色等),
      // 拉取失败或快照不包含该 bossId 时降级为最小占位,name=bossId,其余留空,
      // 仍由前端静态快照合并展示详情。
      const bossMap = await getStaticBossMap()
      const stage = bossMap?.get(run.bossId)
      if (stage) {
        await sql`
          insert into stages (
            id, season_id, mode, name, variant_name, subtitle, hp, speed, toughness,
            weakness, resist, clears, mechanic, stage_buffs, banner_tone
          ) values (
            ${stage.id}, ${stage.seasonId}, ${stage.mode}, ${stage.name}, ${stage.variantName ?? null}, ${stage.subtitle},
            ${stage.hp}, ${stage.speed}, ${stage.toughness},
            ${JSON.stringify(stage.weakness ?? [])},
            ${JSON.stringify(stage.resist ?? {})},
            ${Number(stage.clears ?? 0)},
            ${JSON.stringify(stage.mechanic ?? null)},
            ${JSON.stringify(stage.stageBuffs ?? [])},
            ${stage.bannerTone ?? "cyan"}
          )
          on conflict (id) do update set
            season_id = excluded.season_id,
            mode = excluded.mode,
            name = excluded.name,
            variant_name = excluded.variant_name,
            subtitle = excluded.subtitle,
            hp = excluded.hp,
            speed = excluded.speed,
            toughness = excluded.toughness,
            weakness = excluded.weakness,
            resist = excluded.resist,
            clears = excluded.clears,
            mechanic = excluded.mechanic,
            stage_buffs = excluded.stage_buffs,
            banner_tone = excluded.banner_tone
        `
      } else {
        await sql`
          insert into stages (id, season_id, mode, name, subtitle, hp, speed, toughness, mechanic, stage_buffs)
          values (${run.bossId}, ${run.seasonId}, ${run.mode}, ${run.bossId}, '', '', '', '', null, '[]')
          on conflict (id) do nothing
        `
      }
      await sql`
        insert into runs (
          id, season_id, mode, boss_id, category, team_name, author, cycle, score, cost,
          limited_count, standard_count, submitted_at, tags, video_url, status, owner_token
        ) values (
          ${run.id}, ${run.seasonId}, ${run.mode}, ${run.bossId}, ${run.category}, ${run.teamName}, ${run.author},
          ${run.cycle}, ${run.score}, ${run.cost}, ${run.limitedCount}, ${run.standardCount}, ${run.submittedAt},
          ${JSON.stringify(run.tags)}, ${run.videoUrl ?? null}, 'pending', ${review.ownerToken ?? null}
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
          status = 'pending',
          owner_token = excluded.owner_token
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
    if (!review) return jsonResponse({message: "未找到提交记录"}, 404)
  }

  return jsonResponse({id, status: body.status})
}
