import configData from "@/data/seed/config.json"
import { IMAGE_BASES } from "@/services/dataSource"
import type { ArchiveUnit } from "@/types/archive"

/**
 * 构建 id→sourceId 映射，用于将本地 slug id 转换为远程图片寻址所需的 sourceId。
 */
const sourceIdByUnitId = new Map<string, string>()
for (const unit of (configData as { units: Array<{ id: string; sourceId?: string }> }).units) {
  if (unit.sourceId) sourceIdByUnitId.set(unit.id, unit.sourceId)
}

export function getUnitImageSrc(unit: Pick<ArchiveUnit, "id" | "kind"> | null | undefined): string | null {
  if (!unit) return null
  const sourceId = sourceIdByUnitId.get(unit.id)
  if (!sourceId) return null
  const base = unit.kind === "character" ? IMAGE_BASES.character : IMAGE_BASES.lightcone
  return `${base}/${sourceId}.webp`
}
