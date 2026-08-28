/* global process */
import { readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const DATA_VERSION = process.env.HSR_DATA_VERSION ?? "4.3.56"
const ROOT = new URL("../", import.meta.url)
const CONFIG_PATH = new URL("../src/data/seed/config.json", import.meta.url)
const UNITS_PATH = new URL("../src/data/seed/hsr-units.json", import.meta.url)

const SOURCE = {
  characterPage: "https://hsr.nanoka.cc/character",
  lightconePage: "https://hsr.nanoka.cc/lightcone",
  characterData: `https://static.nanoka.cc/hsr/${DATA_VERSION}/character.json`,
  lightconeData: `https://static.nanoka.cc/hsr/${DATA_VERSION}/lightcone.json`,
  characterImageBase: "https://static.nanoka.cc/assets/hsr/avatarshopicon",
  lightconeImageBase: "https://static.nanoka.cc/assets/hsr/lightconemediumicon",
}

const PATH_LABELS = {
  Knight: "存护",
  Mage: "智识",
  Priest: "丰饶",
  Rogue: "巡猎",
  Shaman: "同谐",
  Warlock: "虚无",
  Warrior: "毁灭",
  Memory: "记忆",
  Elation: "欢愉",
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

const LEGACY_IDS_BY_SOURCE_ID = {
  8007: "trailblazer-remembrance",
  1401: "the-herta",
  1308: "acheron",
  1310: "firefly",
  1303: "ruan-mei",
  1301: "gallagher",
  1202: "tingyun",
  1006: "silver-wolf",
  24001: "cruising",
  21018: "dance-dance-dance",
  23010: "before-dawn",
  23024: "whereabouts",
  24000: "fall-of-aeon",
  21000: "post-op",
}

const TRAILBLAZER_NAMES = {
  8001: "开拓者・毁灭（男）",
  8002: "开拓者・毁灭（女）",
  8003: "开拓者・存护（男）",
  8004: "开拓者・存护（女）",
  8005: "开拓者・同谐（男）",
  8006: "开拓者・同谐（女）",
  8007: "开拓者・记忆",
  8008: "开拓者・记忆（女）",
  8009: "开拓者・欢愉（男）",
  8010: "开拓者・欢愉（女）",
}

const TRAILBLAZER_SLUGS = {
  8001: "trailblazer-destruction-male",
  8002: "trailblazer-destruction-female",
  8003: "trailblazer-preservation-male",
  8004: "trailblazer-preservation-female",
  8005: "trailblazer-harmony-male",
  8006: "trailblazer-harmony-female",
  8007: "trailblazer-remembrance",
  8008: "trailblazer-remembrance-female",
  8009: "trailblazer-elation-male",
  8010: "trailblazer-elation-female",
}

const STANDARD_FIVE_STAR_CHARACTER_SOURCE_IDS = new Set([
  "1003",
  "1004",
  "1101",
  "1104",
  "1107",
  "1209",
  "1211",
])

async function main() {
  const [characterData, lightconeData, config] = await Promise.all([
    fetchJson(SOURCE.characterData),
    fetchJson(SOURCE.lightconeData),
    readJson(CONFIG_PATH),
  ])

  const usedIds = new Set()
  const characters = Object.entries(characterData).map(([sourceId, source]) =>
    normalizeCharacter(sourceId, source, usedIds),
  )
  const lightcones = Object.entries(lightconeData).map(([sourceId, source]) =>
    normalizeLightcone(sourceId, source, usedIds),
  )

  const archiveUnits = [...characters, ...lightcones].map(toArchiveUnit)
  const sourceUnits = {
    version: DATA_VERSION,
    fetchedAt: new Date().toISOString(),
    source: SOURCE,
    counts: {
      characters: characters.length,
      lightcones: lightcones.length,
    },
    characters,
    lightcones,
  }

  config.units = archiveUnits
  await writeJson(CONFIG_PATH, config)
  await writeJson(UNITS_PATH, sourceUnits)

  console.log(`synced ${characters.length} characters and ${lightcones.length} lightcones from ${DATA_VERSION}`)
  console.log(`updated ${path.relative(fileURLPath(ROOT), fileURLPath(CONFIG_PATH))}`)
  console.log(`updated ${path.relative(fileURLPath(ROOT), fileURLPath(UNITS_PATH))}`)
}

async function fetchJson(url) {
  const { stdout } = await curl(["-fsSL", "-H", "accept: application/json", "-A", "hsr-endgame-archive-cn unit sync", url], {
    maxBuffer: 1024 * 1024 * 4,
  })
  return JSON.parse(stdout)
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"))
}

async function writeJson(url, data) {
  await writeFile(url, `${JSON.stringify(data, null, 2)}\n`)
}

function normalizeCharacter(sourceId, source, usedIds) {
  const id = unitId(sourceId, TRAILBLAZER_SLUGS[sourceId] ?? source.en ?? source.zh, usedIds)
  const rarity = parseRarity(source.rank)
  const name = TRAILBLAZER_NAMES[sourceId] ?? source.zh
  const pathLabel = PATH_LABELS[source.baseType]
  const element = ELEMENT_LABELS[source.damageType]
  if (!pathLabel || !element) throw new Error(`Unknown character mapping for ${sourceId}`)

  const image = {
    folder: "characters",
    sourceFolder: "avatarshopicon",
    sourceUrl: `${SOURCE.characterImageBase}/${sourceId}.webp`,
    src: `${SOURCE.characterImageBase}/${sourceId}.webp`,
  }

  return {
    id,
    sourceId,
    kind: "character",
    name,
    path: pathLabel,
    element,
    rarity,
    limited: isLimitedCharacter(sourceId, rarity),
    release: source.release ?? null,
    icon: source.icon,
    image,
    source,
  }
}

function normalizeLightcone(sourceId, source, usedIds) {
  const id = unitId(sourceId, source.en ?? source.zh, usedIds)
  const rarity = parseRarity(source.rank)
  const pathLabel = PATH_LABELS[source.baseType]
  if (!pathLabel) throw new Error(`Unknown lightcone mapping for ${sourceId}`)

  const image = {
    folder: "lightcones",
    sourceFolder: "lightconemediumicon",
    sourceUrl: `${SOURCE.lightconeImageBase}/${sourceId}.webp`,
    src: `${SOURCE.lightconeImageBase}/${sourceId}.webp`,
  }

  return {
    id,
    sourceId,
    kind: "lightcone",
    name: source.zh,
    path: pathLabel,
    rarity,
    limited: sourceId.startsWith("23"),
    atk: source.atk ?? null,
    image,
    source,
  }
}

function toArchiveUnit(unit) {
  const archiveUnit = { ...unit }
  delete archiveUnit.source
  delete archiveUnit.image
  return archiveUnit
}

function unitId(sourceId, name, usedIds) {
  const legacyId = LEGACY_IDS_BY_SOURCE_ID[sourceId]
  const baseId = legacyId ?? slugify(name) ?? `unit-${sourceId}`
  let id = baseId
  let suffix = 2
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }
  usedIds.add(id)
  return id
}

function slugify(value) {
  const cleaned = value
    .replaceAll("{NICKNAME}", "trailblazer")
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return cleaned || null
}

function parseRarity(rank) {
  const match = String(rank).match(/(\d)$/)
  const rarity = match ? Number(match[1]) : 4
  if (rarity !== 3 && rarity !== 4 && rarity !== 5) throw new Error(`Unsupported rarity: ${rank}`)
  return rarity
}

function isLimitedCharacter(sourceId, rarity) {
  if (rarity !== 5) return false
  if (sourceId.startsWith("8")) return false
  return !STANDARD_FIVE_STAR_CHARACTER_SOURCE_IDS.has(sourceId)
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
