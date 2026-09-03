import type {Handler} from "@netlify/functions"
import {getSql, jsonResponse, requireAdmin} from "./_shared"
import {getStaticBossMap} from "./_staticSnapshot"

export const handler: Handler = async (event) => {
	if (event.httpMethod !== "POST") return jsonResponse({message: "Method Not Allowed"}, 405)

	const unauthorized = requireAdmin(event)
	if (unauthorized) return unauthorized

	const sql = getSql()
	if (!sql) return jsonResponse({message: "当前环境未配置数据库连接"}, 503)

	const bossMap = await getStaticBossMap()
	if (!bossMap || bossMap.size === 0) {
		return jsonResponse({message: "远程静态快照拉取失败或为空,稍后重试"}, 502)
	}

	const synced: string[] = []
	const failed: Array<{id: string; reason: string}> = []

	for (const stage of bossMap.values()) {
		try {
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
			synced.push(stage.id)
		} catch (err) {
			failed.push({id: stage.id, reason: err instanceof Error ? err.message : String(err)})
		}
	}

	return jsonResponse({
		total: bossMap.size,
		synced: synced.length,
		failed: failed.length,
		syncedIds: synced,
		failedDetails: failed,
	})
}
