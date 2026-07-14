import type { Handler } from "@netlify/functions"
import { getSql, jsonResponse, seedConfig } from "./_shared"

export const handler: Handler = async () => {
  const sql = getSql()
  if (!sql) return jsonResponse(seedConfig)

  try {
    const [seasons, bosses, characters, lightcones, articles] = await Promise.all([
      sql`select id, label, is_current as "isCurrent" from seasons order by id desc`,
      sql`select id, season_id as "seasonId", mode, name, subtitle, hp, speed, toughness, weakness, resist, clears, memory_buff as "memoryBuff", banner_tone as "bannerTone" from stages`,
      sql`select id, 'character' as kind, name, path, element, rarity, limited from characters`,
      sql`select id, 'lightcone' as kind, name, path, null as element, rarity, limited from lightcones`,
      sql`select id, title, excerpt, category, published_at as "publishedAt", read_minutes as "readMinutes" from articles order by published_at desc`,
    ])

    return jsonResponse({
      ...seedConfig,
      seasons,
      bosses,
      units: [...characters, ...lightcones],
      articles,
    })
  } catch {
    return jsonResponse(seedConfig)
  }
}
