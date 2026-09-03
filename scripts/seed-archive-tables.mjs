#!/usr/bin/env node
/* global process */
// 把 src/data/seed/config.json 一次性灌入 Neon，并对后续改动保持 upsert 同步。
//
// 用法：
//   pnpm seed:archive           # 实际写入
//   pnpm seed:archive -- --dry-run
//   pnpm seed:archive -- --table seasons,stages   # 只同步部分表
//
// 连接顺序与 netlify/functions/_shared.ts 保持一致：
//   NETLIFY_DATABASE_URL ?? DATABASE_URL ?? POSTGRES_URL

import {readFile} from "node:fs/promises"
import {neon} from "@neondatabase/serverless"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const tableArg = args.find((arg) => arg.startsWith("--table="))
const onlyTables = tableArg ? new Set(tableArg.slice("--table=".length).split(",").map((s) => s.trim())) : null
const onlyIds = new Set(
	args.filter((arg) => arg.startsWith("--id=")).map((arg) => arg.slice("--id=".length)),
)

const configPath = new URL("../src/data/seed/config.json", import.meta.url)
const config = JSON.parse(await readFile(configPath, "utf8"))

const seasons = config.seasons ?? []
const bosses = config.bosses ?? []
const characters = (config.units ?? []).filter((unit) => unit.kind === "character")
const lightcones = (config.units ?? []).filter((unit) => unit.kind === "lightcone")
const articles = config.articles ?? []

function filterByIds(items) {
	return onlyIds.size > 0 ? items.filter((item) => onlyIds.has(item.id)) : items
}

const stats = {
	seasons: {upserted: 0, skipped: 0},
	stages: {upserted: 0, skipped: 0},
	characters: {upserted: 0, skipped: 0},
	lightcones: {upserted: 0, skipped: 0},
	articles: {upserted: 0, skipped: 0},
}

function shouldRun(name) {
	return !onlyTables || onlyTables.has(name)
}

function logHeader(name) {
	if (!shouldRun(name)) return
	console.log(`\n[${name}]`)
}

if (dryRun) {
	console.log("DRY RUN - 不会写库，仅打印计划。")
	if (shouldRun("seasons")) console.log(`  seasons:    ${filterByIds(seasons).length} 条`)
	if (shouldRun("stages")) console.log(`  stages:     ${filterByIds(bosses).length} 条（来自 seedConfig.bosses）`)
	if (shouldRun("characters")) console.log(`  characters: ${filterByIds(characters).length} 条`)
	if (shouldRun("lightcones")) console.log(`  lightcones: ${filterByIds(lightcones).length} 条`)
	if (shouldRun("articles")) console.log(`  articles:   ${filterByIds(articles).length} 条`)
	process.exit(0)
}

const databaseUrl = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL
if (!databaseUrl) {
	console.error("未配置数据库 URL。请设置 NETLIFY_DATABASE_URL / DATABASE_URL / POSTGRES_URL 任一环境变量。")
	process.exit(1)
}

const sql = neon(databaseUrl)

async function upsertSeasons(rows) {
	logHeader("seasons")
	for (const season of rows) {
		await sql`
      insert into seasons (id, label, is_current)
      values (${season.id}, ${season.label}, ${Boolean(season.isCurrent)})
      on conflict (id) do update set
        label = excluded.label,
        is_current = excluded.is_current
    `
		stats.seasons.upserted += 1
		console.log(`  ✓ ${season.id}  ${season.label}${season.isCurrent ? "（当前）" : ""}`)
	}
}

async function upsertStages(rows) {
	logHeader("stages")
	for (const boss of rows) {
		await sql`
      insert into stages (
        id, season_id, mode, name, variant_name, subtitle, hp, speed, toughness,
        weakness, resist, clears, mechanic, stage_buffs, banner_tone
      ) values (
        ${boss.id}, ${boss.seasonId}, ${boss.mode}, ${boss.name}, ${boss.variantName ?? null}, ${boss.subtitle ?? ""},
        ${boss.hp ?? ""}, ${boss.speed ?? ""}, ${boss.toughness ?? ""},
        ${JSON.stringify(boss.weakness ?? [])},
        ${JSON.stringify(boss.resist ?? {})},
        ${Number(boss.clears ?? 0)},
        ${JSON.stringify(boss.mechanic ?? null)},
        ${JSON.stringify(boss.stageBuffs ?? [])},
        ${boss.bannerTone ?? "cyan"}
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
		stats.stages.upserted += 1
		console.log(`  ✓ ${boss.id}  ${boss.name}  [${boss.seasonId}/${boss.mode}]`)
	}
}

async function upsertCharacters(rows) {
	logHeader("characters")
	for (const unit of rows) {
		await sql`
      insert into characters (id, name, path, element, rarity, limited)
      values (${unit.id}, ${unit.name}, ${unit.path}, ${unit.element ?? null}, ${unit.rarity}, ${Boolean(unit.limited)})
      on conflict (id) do update set
        name = excluded.name,
        path = excluded.path,
        element = excluded.element,
        rarity = excluded.rarity,
        limited = excluded.limited
    `
		stats.characters.upserted += 1
		console.log(`  ✓ ${unit.id}  ${unit.name}（${unit.rarity}★ ${unit.path}）`)
	}
}

async function upsertLightcones(rows) {
	logHeader("lightcones")
	for (const unit of rows) {
		await sql`
      insert into lightcones (id, name, path, rarity, limited)
      values (${unit.id}, ${unit.name}, ${unit.path}, ${unit.rarity}, ${Boolean(unit.limited)})
      on conflict (id) do update set
        name = excluded.name,
        path = excluded.path,
        rarity = excluded.rarity,
        limited = excluded.limited
    `
		stats.lightcones.upserted += 1
		console.log(`  ✓ ${unit.id}  ${unit.name}（${unit.rarity}★ ${unit.path}）`)
	}
}

async function upsertArticles(rows) {
	logHeader("articles")
	for (const article of rows) {
		await sql`
      insert into articles (id, title, excerpt, category, published_at, read_minutes)
      values (${article.id}, ${article.title}, ${article.excerpt}, ${article.category}, ${article.publishedAt}, ${Number(article.readMinutes ?? 3)})
      on conflict (id) do update set
        title = excluded.title,
        excerpt = excluded.excerpt,
        category = excluded.category,
        published_at = excluded.published_at,
        read_minutes = excluded.read_minutes
    `
		stats.articles.upserted += 1
		console.log(`  ✓ ${article.id}  ${article.title}`)
	}
}

try {
	if (shouldRun("seasons")) await upsertSeasons(filterByIds(seasons))
	if (shouldRun("stages")) await upsertStages(filterByIds(bosses))
	if (shouldRun("characters")) await upsertCharacters(filterByIds(characters))
	if (shouldRun("lightcones")) await upsertLightcones(filterByIds(lightcones))
	if (shouldRun("articles")) await upsertArticles(filterByIds(articles))

	console.log("\n=== 完成 ===")
	for (const [name, stat] of Object.entries(stats)) {
		if (shouldRun(name) && stat.upserted > 0) {
			console.log(`  ${name.padEnd(11)} upserted ${stat.upserted}`)
		}
	}
} catch (err) {
	console.error("\n同步失败：", err)
	process.exit(1)
}
