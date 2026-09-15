import type {Handler} from "@netlify/functions"
import {getSql, jsonResponse, requireAdmin, seedConfig, updateFallbackSubmissionReview} from "./_shared"
import {getStaticBossMap} from "./_staticSnapshot"
import {checkSubmissionRules} from "../../src/services/submissionRules"
import {submissionReviewToArchiveRun} from "../../src/services/submissionUtils"
import type {BossStage, SubmissionReview, SubmissionReviewStatus} from "../../src/types/archive"

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
  if (!sql) {
    const review = await updateFallbackSubmissionReview(id, body.status, body.note?.trim())
    if (!review) return jsonResponse({message: "未找到提交记录"}, 404)
    return jsonResponse({id, status: body.status})
  }

  const rows = await sql`
    select
      id,
      payload,
      status,
      reviewer_note as "reviewerNote",
      owner_token as "ownerToken",
      revises_id as "revisesId",
      created_at as "createdAt",
      reviewed_at as "reviewedAt"
    from submission_reviews
    where id = ${id}
    limit 1
  `
  const review = rows[0] as SubmissionReview | undefined
  if (!review) return jsonResponse({message: "未找到提交记录"}, 404)

  const note = body.note?.trim() || null
  let run: ReturnType<typeof submissionReviewToArchiveRun> | null = null
  let stage: BossStage | null = null

  if (body.status === "approved") {
    // 发布前再校一次值域：入队校验可能晚于这条记录，或它是绕过前端直接写进库的。
    // 脏 payload 一旦通过就会进公开 runs（mode/category/status 都是无约束 text），
    // 之后既不出现在筛选里也不报错，只能人工清库。
    const violations = checkSubmissionRules(review.payload ?? {})
    if (violations.length > 0) {
      return jsonResponse(
        {
          message: `这条投稿的数据不合法，无法通过：${violations.map((item) => item.message).join("")}`,
          violations,
        },
        400,
      )
    }

    run = submissionReviewToArchiveRun(review, seedConfig.units)

    // 敌方阶段由前端 staticArchiveConfig 从远程快照生成，seed/库中的 stages 默认空。
    // runs.boss_id 是 FK，所以通过前必须确认这个阶段在**库里或快照里**至少存在一处；
    // 两处都没有就拒绝通过——旧实现在这里造一行 `name=bossId` 的最小占位 stages 行，
    // 而那一行没有任何端点能删，写入失败时会永久留在库里。
    const stageRows = await sql`select id from stages where id = ${run.bossId} limit 1`
    const snapshotStage = (await getStaticBossMap())?.get(run.bossId) ?? null
    if (stageRows.length === 0 && !snapshotStage) {
      return jsonResponse(
        {message: `敌方阶段 ${run.bossId} 既不在库里也不在当前数据快照中，无法通过；请先跑一次 POST /api/admin/sync-stages，或确认这条投稿的阶段 id。`},
        400,
      )
    }
    stage = snapshotStage
  }

  // 这一串写必须原子：stages → runs → run_units → 置 approved → 改审核行。
  // 逐条 await 且无事务时，任何一步失败（例如外键、连接抖动）都会留下已提交的半成品，
  // 而占位 stages 行与 status='pending' 的 runs 行都没有端点能回收。
  // neon 的 transaction() 是非交互式的：传查询数组，一次提交。
  const queries = []
  if (body.status === "approved" && run && stage) {
    queries.push(sql`
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
    `)
  }

  if (body.status === "approved" && run) {
    queries.push(sql`
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
    `)
    // 修订的公开记录写在**原投稿**那行（run.id = revisesId ?? 投稿 id），
    // 所以下面一律用 run.id，不能再混用路径参数 id。
    queries.push(sql`delete from run_units where run_id = ${run.id}`)
    for (const [index, unit] of run.units.entries()) {
      queries.push(sql`
        insert into run_units (run_id, unit_id, kind, slot_index, eidolon)
        values (${run.id}, ${unit.unitId}, 'character', ${index}, ${unit.eidolon ?? 0})
      `)
    }
    for (const [index, unit] of run.lightcones.entries()) {
      queries.push(sql`
        insert into run_units (run_id, unit_id, kind, slot_index, superimposition)
        values (${run.id}, ${unit.unitId}, 'lightcone', ${index}, ${unit.superimposition ?? 1})
      `)
    }
    queries.push(sql`update runs set status = 'approved' where id = ${run.id}`)
  } else if (body.status !== "approved") {
    // 按投稿 id 原样更新：修订自己没有 runs 行，驳回 / 退回一条修订因此不会碰到父记录那行公开档案。
    queries.push(sql`update runs set status = ${body.status} where id = ${id}`)
  }

  queries.push(
    body.status === "pending"
      ? sql`
          update submission_reviews
          set status = 'pending', reviewer_note = ${note}, reviewed_at = null
          where id = ${id}
        `
      : sql`
          update submission_reviews
          set status = ${body.status}, reviewer_note = ${note}, reviewed_at = now()
          where id = ${id}
        `,
  )

  try {
    await sql.transaction(queries)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return jsonResponse({message: `审核写入失败，这条投稿未做任何改动，请稍后重试。（${detail}）`}, 502)
  }

  return jsonResponse({id, status: body.status})
}
