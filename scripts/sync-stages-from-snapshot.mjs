#!/usr/bin/env node
/* global process */
// 从远程 static.nanoka.cc 拉取所有赛季的全部 BossStage，批量 upsert 到生产 stages 表。
//
// 用法（在 hsr-endgame-archive-cn/ 目录下）：
//   NETLIFY_DATABASE_URL=... node --experimental-strip-types scripts/sync-stages-from-snapshot.mjs
//   node --experimental-strip-types scripts/sync-stages-from-snapshot.mjs -- --dry-run
//   node --experimental-strip-types scripts/sync-stages-from-snapshot.mjs -- --season=4.5
//
// 与 netlify/functions/_staticSnapshot.ts 共用纯计算模块 src/services/staticBossSnapshot.ts，
// 保证 upsert 的数据 shape 与审核通过分支完全一致。

import {neon} from "@neondatabase/serverless"
import {buildSeasonBosses, pickDataDirectory, STATIC_SEASON_IDS} from "../src/services/staticBossSnapshot.ts"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const seasonArg = args.find((arg) => arg.startsWith("--season="))
const onlySeason = seasonArg ? seasonArg.slice("--season=".length) : null

const STATIC_BASE_URL = "https://static.nanoka.cc"

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return response.json()
}

async function loadAllBosses() {
  const manifest = await fetchJson(`${STATIC_BASE_URL}/manifest.json`)
  const version = pickDataDirectory(manifest?.hsr?.available ?? [])
  if (!version) throw new Error("远程 manifest 没有可用数据版本")

  const seasonIds = onlySeason ? [onlySeason] : Object.keys(STATIC_SEASON_IDS)
  const results = await Promise.all(
    seasonIds.map(async (seasonId) => {
      try {
        return await buildSeasonBosses(seasonId, version, STATIC_BASE_URL)
      } catch (err) {
        console.warn(`  ⚠ ${seasonId} 拉取失败: ${err instanceof Error ? err.message : err}`)
        return []
      }
    }),
  )
  return {version, bosses: results.flat()}
}

function logStage(stage) {
  const hp = stage.hp || "—"
  const speed = stage.speed || "—"
  const toughness = stage.toughness || "—"
  console.log(`  ✓ ${stage.id}  ${stage.name}  HP=${hp}  速度=${speed}  韧性=${toughness}`)
}

async function main() {
  const {version, bosses} = await loadAllBosses()
  console.log(`\n数据源版本: ${version}`)
  console.log(`共拉取到 ${bosses.length} 个 BossStage`)

  if (dryRun) {
    console.log("\nDRY RUN - 不会写库。即将 upsert 的记录：")
    for (const stage of bosses) logStage(stage)
    process.exit(0)
  }

  const databaseUrl = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!databaseUrl) {
    console.error("未配置数据库 URL。请设置 NETLIFY_DATABASE_URL / DATABASE_URL / POSTGRES_URL 任一环境变量。")
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const stats = {upserted: 0, failed: 0, failures: []}

  for (const stage of bosses) {
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
      stats.upserted += 1
      logStage(stage)
    } catch (err) {
      stats.failed += 1
      stats.failures.push({id: stage.id, reason: err instanceof Error ? err.message : String(err)})
      console.error(`  ✗ ${stage.id}  ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log("\n=== 完成 ===")
  console.log(`  upserted: ${stats.upserted}`)
  console.log(`  failed:   ${stats.failed}`)
  if (stats.failures.length > 0) {
    console.log("  失败详情：")
    for (const failure of stats.failures) console.log(`    - ${failure.id}: ${failure.reason}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
