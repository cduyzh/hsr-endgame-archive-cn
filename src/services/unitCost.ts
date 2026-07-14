import type { ArchiveRun, ArchiveUnit } from "@/types/archive"

export type CharacterGoldKind = "limited" | "standard" | "free" | "none"

export interface CharacterGoldCounts {
  limited: number
  standard: number
}

const STANDARD_FIVE_STAR_IDS = new Set(["welt", "himeko", "bronya", "gepard", "clara", "yanqing", "bailu"])
const STANDARD_FIVE_STAR_NAMES = new Set(["瓦尔特", "姬子", "布洛妮娅", "杰帕德", "克拉拉", "彦卿", "白露"])

export function getCharacterGoldKind(unit: ArchiveUnit | null | undefined): CharacterGoldKind {
  if (!unit || unit.kind !== "character" || unit.rarity !== 5) return "none"
  if (isTrailblazer(unit)) return "free"
  if (STANDARD_FIVE_STAR_IDS.has(unit.id) || STANDARD_FIVE_STAR_NAMES.has(unit.name)) return "standard"
  return "limited"
}

export function getRunGoldCounts(run: ArchiveRun, units: ArchiveUnit[]): CharacterGoldCounts {
  const unitById = new Map(units.map((unit) => [unit.id, unit]))

  return run.units.reduce<CharacterGoldCounts>(
    (counts, entry) => {
      const kind = getCharacterGoldKind(unitById.get(entry.unitId))
      if (kind === "limited") counts.limited += 1
      if (kind === "standard") counts.standard += 1
      return counts
    },
    { limited: 0, standard: 0 },
  )
}

function isTrailblazer(unit: ArchiveUnit) {
  return unit.id.includes("trailblazer") || unit.name.includes("开拓者")
}
