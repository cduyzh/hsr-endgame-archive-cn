import type { ArchiveUnit } from "@/types/archive"

export function getUnitImageSrc(unit: Pick<ArchiveUnit, "id" | "kind"> | null | undefined) {
  if (!unit) return null
  const folder = unit.kind === "character" ? "characters" : "lightcones"
  return `/assets/hsr/units/${folder}/${unit.id}.webp`
}
