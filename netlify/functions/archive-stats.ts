import type { Handler } from "@netlify/functions"
import type { ArchiveRun } from "../../src/types/archive"
import {
  buildStats,
  filterArchiveRuns,
  filterSeedRuns,
  getSql,
  jsonResponse,
  listFallbackArchiveRuns,
  parseFilters,
  seedConfig,
  seedRuns,
} from "./_shared"

export const handler: Handler = async (event) => {
  const filters = parseFilters(new URLSearchParams(event.rawQuery ?? ""))
  const sql = getSql()

  if (sql) {
    try {
      const rows = await sql`
        select
          r.id,
          r.season_id as "seasonId",
          r.mode,
          r.boss_id as "bossId",
          r.category,
          r.team_name as "teamName",
          r.author,
          r.cycle,
          r.score,
          r.cost,
          r.limited_count as "limitedCount",
          r.standard_count as "standardCount",
          r.submitted_at as "submittedAt",
          r.tags,
          r.video_url as "videoUrl",
          coalesce(jsonb_agg(jsonb_build_object('unitId', ru.unit_id, 'eidolon', ru.eidolon) order by ru.slot_index) filter (where ru.kind = 'character'), '[]') as units,
          coalesce(jsonb_agg(jsonb_build_object('unitId', ru.unit_id, 'superimposition', ru.superimposition) order by ru.slot_index) filter (where ru.kind = 'lightcone'), '[]') as lightcones
        from runs r
        left join run_units ru on ru.run_id = r.id
        where r.status = 'approved'
          and r.season_id = ${filters.seasonId}
          and r.mode = ${filters.mode}
          and r.boss_id = ${filters.bossId}
        group by r.id
        limit 500
      `
      return jsonResponse(buildStats(filterArchiveRuns(rows as ArchiveRun[], filters), seedConfig.units))
    } catch {
      const runs = filterSeedRuns(filters)
      return jsonResponse(buildStats(runs, seedConfig.units))
    }
  }

  const submittedRuns = await listFallbackArchiveRuns()
  const runs = filterArchiveRuns([...submittedRuns, ...seedRuns], filters)
  return jsonResponse(buildStats(runs, seedConfig.units))
}
