import { IMAGE_BASES } from "@/services/dataSource"
import type { UnitPath } from "@/types/archive"

export interface UnitPathOption {
  id: string
  label: UnitPath
  iconSrc: string
  sourceUrl: string
}

export const UNIT_PATH_OPTIONS: UnitPathOption[] = [
  pathOption("knight", "存护"),
  pathOption("mage", "智识"),
  pathOption("priest", "丰饶"),
  pathOption("rogue", "巡猎"),
  pathOption("shaman", "同谐"),
  pathOption("warlock", "虚无"),
  pathOption("warrior", "毁灭"),
  pathOption("memory", "记忆"),
  pathOption("elation", "欢愉"),
]

function pathOption(id: string, label: UnitPath): UnitPathOption {
  const remoteUrl = `${IMAGE_BASES.path}/${id}.webp`
  return {
    id,
    label,
    iconSrc: remoteUrl,
    get sourceUrl() {
      return this.iconSrc
    },
  }
}
