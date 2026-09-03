import type { ArchiveRun, ArchiveUnit, RunUnit } from "@/types/archive"

export type CharacterGoldKind = "limited" | "standard" | "free" | "none"
export type LightconeGoldKind = "limited" | "standard" | "none"

export interface CharacterGoldCounts {
  limited: number
  standard: number
}

export const goldKindLabels: Record<CharacterGoldKind, string> = {
  limited: "限定",
  standard: "常驻",
  free: "免费",
  none: "低星",
}

const STANDARD_FIVE_STAR_IDS = new Set(["welt", "himeko", "bronya", "gepard", "clara", "yanqing", "bailu"])
const STANDARD_FIVE_STAR_NAMES = new Set(["瓦尔特", "姬子", "布洛妮娅", "杰帕德", "克拉拉", "彦卿", "白露"])

/** 星琼商店常驻五星：`sync:units` 按 id 前缀 `23` 推导 limited，会把它们误标成限定，故在此纠正。 */
const STANDARD_FIVE_STAR_LIGHTCONE_IDS = new Set([
  "night-on-the-milky-way",
  "something-irreplaceable",
  "but-the-battle-isnt-over",
  "in-the-name-of-the-world",
  "moment-of-victory",
  "sleep-like-the-dead",
  "time-waits-for-no-one",
])
const STANDARD_FIVE_STAR_LIGHTCONE_NAMES = new Set([
  "银河铁道之夜",
  "无可取代的东西",
  "但战斗还未结束",
  "以世界之名",
  "制胜的瞬间",
  "如泥酣眠",
  "时节不居",
])

export function getCharacterGoldKind(unit: ArchiveUnit | null | undefined): CharacterGoldKind {
  if (!unit || unit.kind !== "character" || unit.rarity !== 5) return "none"
  if (isTrailblazer(unit)) return "free"
  if (STANDARD_FIVE_STAR_IDS.has(unit.id) || STANDARD_FIVE_STAR_NAMES.has(unit.name)) return "standard"
  return "limited"
}

/** 低星光锥与无名勋礼（BP）五星都归 `none`，不计入成本。 */
export function getLightconeGoldKind(unit: ArchiveUnit | null | undefined): LightconeGoldKind {
  if (!unit || unit.kind !== "lightcone" || unit.rarity !== 5) return "none"
  if (STANDARD_FIVE_STAR_LIGHTCONE_IDS.has(unit.id) || STANDARD_FIVE_STAR_LIGHTCONE_NAMES.has(unit.name)) {
    return "standard"
  }
  return unit.limited ? "limited" : "none"
}

/** 低星角色与开拓者默认满命；返回 null 表示保留用户已选值。 */
export function defaultEidolonFor(kind: CharacterGoldKind): number | null {
  return kind === "none" || kind === "free" ? 6 : null
}

export function defaultSuperimpositionFor(kind: LightconeGoldKind): number {
  return kind === "none" ? 5 : 1
}

export function getRunGoldCounts(run: ArchiveRun, units: ArchiveUnit[]): CharacterGoldCounts {
  return getUnitGoldCounts(run.units, run.lightcones, units)
}

/**
 * 成本口径：限定五星角色按 `命座 + 1`、限定五星光锥按 `叠影` 累加进 `limited`，
 * 常驻五星角色与光锥同样规则累加进 `standard`，其余不计。角色与光锥按下标配对。
 */
export function getUnitGoldCounts(
  entries: RunUnit[],
  lightconeEntries: RunUnit[],
  units: ArchiveUnit[],
): CharacterGoldCounts {
  const unitById = new Map(units.map((unit) => [unit.id, unit]))

  return entries.reduce<CharacterGoldCounts>(
    (counts, entry, index) => {
      const characterKind = getCharacterGoldKind(unitById.get(entry.unitId))
      const eidolonCost = 1 + clamp(entry.eidolon, 0, 6)
      if (characterKind === "limited") counts.limited += eidolonCost
      else if (characterKind === "standard") counts.standard += eidolonCost

      const lightconeEntry = lightconeEntries[index]
      const lightconeKind = getLightconeGoldKind(unitById.get(lightconeEntry?.unitId ?? ""))
      const superimpositionCost = clamp(lightconeEntry?.superimposition, 1, 5)
      if (lightconeKind === "limited") counts.limited += superimpositionCost
      else if (lightconeKind === "standard") counts.standard += superimpositionCost

      return counts
    },
    { limited: 0, standard: 0 },
  )
}

function clamp(value: number | undefined, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return min
  return Math.min(Math.max(Math.round(value), min), max)
}

function isTrailblazer(unit: ArchiveUnit) {
  return unit.id.includes("trailblazer") || unit.name.includes("开拓者")
}
