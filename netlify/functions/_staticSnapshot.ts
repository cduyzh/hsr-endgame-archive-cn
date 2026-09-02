/**
 * 服务端的远程静态快照包装：与前端 `staticArchiveConfig.ts` 共用纯计算模块
 * `../../src/services/staticBossSnapshot`,在 Netlify Function 冷启动内做一次 fetch,
 * 之后按 `bossId` 提供 `BossStage` 查询,用于审核通过时把 `runs.boss_id` 关联的 `stages`
 * 行从最小占位补成完整字段(HP/速度/韧性/弱点/副标题/横幅色/敌方图片等)。
 *
 * 注意:Netlify 冷启动间内存不持久,每次冷启动都需要重新拉取快照。
 */

import { buildSeasonBosses, pickDataDirectory, STATIC_SEASON_IDS, type HsrManifest } from "../../src/services/staticBossSnapshot"
import type { BossStage } from "../../src/types/archive"

const STATIC_BASE_URL = "https://static.nanoka.cc"

interface CachedSnapshot {
  bosses: Map<string, BossStage>
}

let cachePromise: Promise<CachedSnapshot | null> | null = null

interface HsrManifestEnvelope {
  hsr?: HsrManifest["hsr"]
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return (await response.json()) as T
}

async function loadSnapshot(): Promise<CachedSnapshot | null> {
  try {
    const manifest = await fetchJson<HsrManifestEnvelope>(`${STATIC_BASE_URL}/manifest.json`)
    const version = pickDataDirectory(manifest.hsr?.available ?? [])
    if (!version) return null

    const results = await Promise.all(
      Object.keys(STATIC_SEASON_IDS).map(async (seasonId) => {
        try {
          return await buildSeasonBosses(seasonId, version, STATIC_BASE_URL)
        } catch {
          return [] as BossStage[]
        }
      }),
    )

    const bosses = new Map<string, BossStage>()
    for (const stage of results.flat()) bosses.set(stage.id, stage)
    return { bosses }
  } catch {
    return null
  }
}

/**
 * 拉取并缓存一次远程静态快照,返回按 `bossId` 索引的 `BossStage` 字典。
 * 当次冷启动内多次调用复用同一份数据;失败时返回 `null`,调用方需走降级逻辑。
 */
export async function getStaticBossMap(): Promise<Map<string, BossStage> | null> {
  if (!cachePromise) cachePromise = loadSnapshot()
  const snapshot = await cachePromise
  return snapshot?.bosses ?? null
}
