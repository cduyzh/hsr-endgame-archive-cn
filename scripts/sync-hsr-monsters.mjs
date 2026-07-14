/* global process */
import { execFile } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const DATA_VERSION = process.env.HSR_DATA_VERSION ?? "4.3.56"
const ROOT = new URL("../", import.meta.url)
const MONSTER_SOURCE_PATH = new URL(`../public/local-cache/hsr/${DATA_VERSION}/monster.json`, import.meta.url)
const MONSTERS_PATH = new URL("../src/data/seed/hsr-monsters.json", import.meta.url)
const MONSTER_DIR = new URL("../public/assets/hsr/monsters/", import.meta.url)

const SOURCE = {
  monsterPage: "https://hsr.nanoka.cc/monster",
  monsterData: `https://static.nanoka.cc/hsr/${DATA_VERSION}/monster.json`,
  imageBase: "https://static.nanoka.cc/assets/hsr/monstermiddleicon",
}

const ELEMENT_LABELS = {
  Physical: "物理",
  Fire: "火",
  Ice: "冰",
  Thunder: "雷",
  Wind: "风",
  Quantum: "量子",
  Imaginary: "虚数",
}

async function main() {
  const monsters = await readJson(MONSTER_SOURCE_PATH)
  let normalized = Object.entries(monsters).map(([sourceId, source]) => normalizeMonster(sourceId, source))
  const imageIds = [...new Set(normalized.map((monster) => monster.imageId))].sort((a, b) => Number(a) - Number(b))

  await rm(MONSTER_DIR, { force: true, recursive: true })
  await mkdir(MONSTER_DIR, { recursive: true })
  const imageResults = await runLimited(imageIds, 8, downloadMonsterImage)
  const downloadedImageIds = new Set(imageResults.filter((result) => result.ok).map((result) => result.imageId))
  const missingImageIds = imageResults.filter((result) => !result.ok).map((result) => result.imageId)
  normalized = normalized.map((monster) => {
    if (downloadedImageIds.has(monster.imageId)) return monster
    return {
      ...monster,
      image: {
        ...monster.image,
        src: null,
      },
    }
  })

  await writeJson(MONSTERS_PATH, {
    version: DATA_VERSION,
    fetchedAt: new Date().toISOString(),
    source: SOURCE,
    counts: {
      monsters: normalized.length,
      images: downloadedImageIds.size,
      missingImages: missingImageIds.length,
    },
    imageIds: [...downloadedImageIds].sort((a, b) => Number(a) - Number(b)),
    missingImageIds,
    monsters: normalized,
  })

  console.log(`synced ${normalized.length} monsters and ${downloadedImageIds.size} monster images from ${DATA_VERSION}`)
  if (missingImageIds.length > 0) console.log(`missing monster images: ${missingImageIds.join(", ")}`)
  console.log(`updated ${path.relative(fileURLPath(ROOT), fileURLPath(MONSTERS_PATH))}`)
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"))
}

async function writeJson(url, data) {
  await writeFile(url, `${JSON.stringify(data, null, 2)}\n`)
}

function normalizeMonster(sourceId, source) {
  const imageId = getImageId(sourceId, source)
  return {
    id: sourceId,
    imageId,
    name: cleanText(source.zh ?? source.en ?? source.ja ?? source.ko ?? sourceId),
    rank: source.rank ?? "",
    camp: source.camp ?? null,
    weakness: (source.weak ?? []).map((item) => ELEMENT_LABELS[item]).filter(Boolean),
    description: cleanText(source.desc),
    child: source.child ?? [],
    image: {
      src: `/assets/hsr/monsters/Monster_${imageId}.webp`,
      sourceUrl: `${SOURCE.imageBase}/Monster_${imageId}.webp`,
    },
    source,
  }
}

function getImageId(sourceId, source) {
  const iconId = /Monster_(\d+)\.(?:png|webp)$/i.exec(String(source.icon ?? ""))?.[1]
  if (iconId) return iconId
  const numericId = Number(sourceId)
  if (Number.isFinite(numericId) && numericId % 10 !== 0) return String(Math.floor(numericId / 10) * 10)
  return sourceId
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{RUBY_B#[^}]+}|\{RUBY_E#}/g, "")
    .replace(/<unbreak>|<\/unbreak>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

async function downloadMonsterImage(imageId) {
  const target = new URL(`Monster_${imageId}.webp`, MONSTER_DIR)
  try {
    await curl([
      "-fL",
      "--retry",
      "3",
      "--retry-delay",
      "1",
      "-H",
      "accept: image/webp,image/*",
      "-A",
      "hsr-endgame-archive-cn monster sync",
      `${SOURCE.imageBase}/Monster_${imageId}.webp`,
      "-o",
      fileURLPath(target),
    ])
    return { imageId, ok: true }
  } catch {
    return { imageId, ok: false }
  }
}

async function runLimited(items, limit, worker) {
  const queue = [...items]
  const results = []
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item) results.push(await worker(item))
    }
  })
  await Promise.all(workers)
  return results
}

async function curl(args, options) {
  return execFileAsync("curl", args, options)
}

function fileURLPath(url) {
  return fileURLToPath(url)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
