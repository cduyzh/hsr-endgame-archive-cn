#!/usr/bin/env node
/* global process */
// 抓取 scripts/article-sources.json 里登记的微信公众号文章，生成 src/data/articles.json。
//
// 用法（在 hsr-endgame-archive-cn/ 目录下）：
//   pnpm sync:articles                 # 抓取并写回 src/data/articles.json
//   pnpm sync:articles -- --dry-run    # 只打印计划，不写文件
//   pnpm sync:articles -- --add <url>  # 先把链接追加进清单再抓
//   pnpm sync:articles -- --only <id>  # 只重抓某一篇（id 为 /s/<id> 的那段）
//
// 清单里 `type: "original"` 的条目是站内原创文章（无 url），原样透传进产物。
// 抓取失败时保留上一次已生成的抓取字段，只更新 fetchedAt 之外的部分，避免文章被删导致版面变空。

import {readFile, writeFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"
import {
  articleIdFromUrl,
  articleSubject,
  categoryFromTitle,
  fetchWeixinArticle,
} from "./lib/parse-weixin-article.mjs"

const SOURCES_PATH = fileURLToPath(new URL("./article-sources.json", import.meta.url))
const OUTPUT_PATH = fileURLToPath(new URL("../src/data/articles.json", import.meta.url))

/** 串行抓取间隔，别把微信侧打出验证码页。 */
const REQUEST_GAP_MS = 800
const RETRIES = 2

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const onlyArg = args.find((arg) => arg.startsWith("--only="))
const only = onlyArg ? onlyArg.slice("--only=".length) : null
const addIndex = args.indexOf("--add")
const addUrl = addIndex >= 0 ? args[addIndex + 1] : null

if (addIndex >= 0 && (!addUrl || !articleIdFromUrl(addUrl))) {
  console.error("--add 需要一个 mp.weixin.qq.com/s/<id> 地址。")
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 图片数估算阅读时长：强敌侦察笔记基本是一图一段。 */
function estimateReadMinutes(imageCount) {
  return Math.max(1, Math.round(imageCount / 3))
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (err) {
    if (err.code !== "ENOENT") throw err
    return fallback
  }
}

async function loadSources() {
  const sources = await readJson(SOURCES_PATH, null)
  if (!sources || !Array.isArray(sources.articles)) {
    throw new Error(`${SOURCES_PATH} 缺少 articles 数组`)
  }
  return sources
}

async function appendSource(url) {
  const sources = await loadSources()
  if (sources.articles.some((item) => item.url === url)) {
    console.log(`清单里已有 ${url}，跳过追加`)
    return
  }
  sources.articles.push({
    url,
    category: "",
    featured: false,
    bossIds: [],
    excerpt: "",
    readMinutes: null,
  })
  if (dryRun) {
    console.log(`[dry-run] 将追加 ${url}`)
    return
  }
  await writeFile(SOURCES_PATH, `${JSON.stringify(sources, null, 2)}\n`, "utf8")
  console.log(`已追加到清单：${url}`)
}

/**
 * 抓取字段：人工覆盖 > 上一次产物 > 抓取值（抓失败时不被清空）。
 * 派生字段（category / readMinutes / subject）只认人工覆盖，其余一律当场派生——
 * 把它们也回退到上一次产物，会让判据与估算规则的改动永远传播不到已有条目。
 */
function mergeArticle(source, fetched, previous) {
  const base = previous ?? {}
  const title = fetched?.title ?? base.title
  const imageCount = fetched?.imageCount ?? base.imageCount ?? 0
  return {
    id: base.id ?? (fetched ? fetched.id : null),
    url: source.url,
    title,
    subject: articleSubject(title ?? ""),
    version: source.version ?? base.version ?? null,
    cover: fetched?.cover ?? base.cover ?? null,
    images: fetched?.images ?? base.images ?? [],
    imageCount,
    publishedAt: fetched?.publishedAt ?? base.publishedAt ?? null,
    sourceName: fetched?.sourceName ?? base.sourceName ?? "微信公众号",
    category: source.category || categoryFromTitle(title ?? ""),
    excerpt: source.excerpt || fetched?.rawExcerpt || base.excerpt || "",
    readMinutes: source.readMinutes ?? estimateReadMinutes(imageCount),
    featured: Boolean(source.featured),
    bossIds: Array.isArray(source.bossIds) ? source.bossIds : (base.bossIds ?? []),
    fetchedAt: fetched ? new Date().toISOString() : (base.fetchedAt ?? null),
  }
}

function originalArticle(source) {
  return {
    id: source.id,
    url: source.url ?? null,
    title: source.title,
    subject: source.subject ?? null,
    version: source.version ?? null,
    cover: source.cover ?? null,
    images: source.images ?? [],
    imageCount: source.images?.length ?? 0,
    publishedAt: source.publishedAt ?? null,
    sourceName: source.sourceName ?? "本站",
    category: source.category ?? "站点公告",
    excerpt: source.excerpt ?? "",
    readMinutes: source.readMinutes ?? 3,
    featured: Boolean(source.featured),
    bossIds: source.bossIds ?? [],
    fetchedAt: null,
  }
}

if (addUrl) await appendSource(addUrl)
const sources = await loadSources()

const previousById = new Map(
  ((await readJson(OUTPUT_PATH, {articles: []})).articles ?? []).map((item) => [item.id, item]),
)

const stats = {published: 0, original: 0, refreshed: 0, failed: 0, hidden: 0, skipped: 0}
const output = []
const failures = []

for (const source of sources.articles) {
  if (source.hidden) {
    stats.hidden += 1
    continue
  }

  if (source.type === "original") {
    const article = originalArticle(source)
    if (!article.id || !article.title) {
      failures.push(`${source.id ?? "(缺 id)"}：原创条目必须有 id 与 title`)
      continue
    }
    output.push(article)
    stats.original += 1
    continue
  }

  const id = articleIdFromUrl(source.url ?? "")
  if (!id) {
    failures.push(`${source.url ?? "(无 url)"}：不是 mp.weixin.qq.com/s/<id> 地址`)
    stats.failed += 1
    continue
  }
  if (only && only !== id) {
    const kept = previousById.get(id)
    if (kept) {
      output.push(mergeArticle(source, null, kept))
      stats.skipped += 1
    }
    continue
  }

  let fetched = null
  let lastError = null
  for (let attempt = 0; attempt <= RETRIES && !fetched; attempt += 1) {
    if (attempt > 0) await sleep(REQUEST_GAP_MS * attempt * 2)
    try {
      fetched = await fetchWeixinArticle(source.url)
    } catch (err) {
      lastError = err
    }
  }

  if (!fetched) {
    const kept = previousById.get(id)
    if (kept) {
      output.push(mergeArticle(source, null, kept))
      failures.push(`${id}：抓取失败（${lastError?.message ?? "解析不出标题或正文图"}），沿用上一次产物`)
    } else {
      failures.push(`${id}：抓取失败（${lastError?.message ?? "解析不出标题或正文图"}），且无历史产物可回退`)
    }
    stats.failed += 1
    await sleep(REQUEST_GAP_MS)
    continue
  }

  const isNew = !previousById.has(id)
  output.push(mergeArticle(source, fetched, previousById.get(id)))
  stats.published += 1
  if (!isNew) stats.refreshed += 1
  console.log(
    `  ${isNew ? "+" : "="} ${fetched.publishedAt ?? "????-??-??"} ${fetched.title}（${fetched.imageCount} 图）`,
  )
  await sleep(REQUEST_GAP_MS)
}

output.sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")))

const payload = {
  $comment: `由 scripts/sync-articles.mjs 生成于 ${new Date().toISOString()}；抓取字段勿手改，文案与图地址改 scripts/article-sources.json。`,
  articles: output,
}

console.log(
  `\n清单 ${sources.articles.length} 条 -> 产出 ${output.length} 条（微信 ${stats.published}，其中更新 ${stats.refreshed}；原创 ${stats.original}；跳过 ${stats.skipped}；隐藏 ${stats.hidden}；失败 ${stats.failed}）`,
)
for (const line of failures) console.log(`  ! ${line}`)

if (dryRun) {
  console.log("[dry-run] 未写入 src/data/articles.json")
  process.exit(0)
}

await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
console.log(`已写入 ${OUTPUT_PATH.replace(`${process.cwd()}/`, "")}`)
