/* global process */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const DATA_VERSION = process.env.HSR_DATA_VERSION ?? "4.5"
const ROOT = new URL("../", import.meta.url)
const MONSTER_SOURCE_PATH = new URL(`../public/local-cache/hsr/${DATA_VERSION}/monster.json`, import.meta.url)
const MONSTERS_PATH = new URL("../src/data/seed/hsr-monsters.json", import.meta.url)

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
  const normalized = Object.entries(monsters).map(([sourceId, source]) => normalizeMonster(sourceId, source))
  const imageIds = [...new Set(normalized.map((monster) => monster.imageId))].sort((a, b) => Number(a) - Number(b))

  await writeJson(MONSTERS_PATH, {
    version: DATA_VERSION,
    fetchedAt: new Date().toISOString(),
    source: SOURCE,
    counts: {
      monsters: normalized.length,
      images: imageIds.length,
    },
    imageIds,
    monsters: normalized,
  })

  console.log(`synced ${normalized.length} monsters (${imageIds.length} image ids) from ${DATA_VERSION}`)
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
      src: `${SOURCE.imageBase}/Monster_${imageId}.webp`,
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

function fileURLPath(url) {
  return fileURLToPath(url)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
