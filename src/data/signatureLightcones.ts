import pairsData from "./seed/lightcone-pairs.json"

interface LightconePairsFile {
  pairs: Record<string, string>
}

/**
 * 角色 id -> 专武（上游角色详情首选推荐光锥）id，由 `pnpm sync:units` 生成。
 * 键值都是 `config.json` 的 `units[].id`，因为数据库返回的单位不带 sourceId。
 */
export const signatureLightconeByCharacter = (pairsData as LightconePairsFile).pairs
