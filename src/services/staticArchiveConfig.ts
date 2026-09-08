/**
 * 浏览器端入口：负责从远程 `static.nanoka.cc` 拉取 manifest，定位最新数据目录，
 * 再交由 `staticBossSnapshot.ts` 计算出全部 `BossStage`。计算/抓取本身不带任何业务逻辑，
 * 服务端 `netlify/functions/_staticSnapshot.ts` 复用同一份纯计算模块。
 */

import {dataSourceUrl} from "./dataSource"
import {API_BASE} from "./apiBase"
import {buildSeasonBosses, pickDataDirectory, STATIC_SEASON_IDS, type HsrManifest} from "./staticBossSnapshot"
import type {ArchiveConfig, BossStage, Season} from "../types/archive"

export interface StaticArchiveSnapshot {
  liveVersion?: string
  bosses: BossStage[]
}

interface StagesEndpointResponse {
  version?: string
  liveVersion?: string | null
  bosses?: BossStage[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

/**
 * 优先走 `/api/archive/stages`：函数侧算一次快照并交给边缘长缓存复用。
 * 浏览器直连数据源要付 38 个请求、约 193KB gzip，且上游 `cache-control` 只有
 * `max-age=120`，等于每次访问都重走一遍。
 */
async function fetchStagesFromApi(): Promise<StaticArchiveSnapshot | null> {
  try {
    const response = await fetch(`${API_BASE}/api/archive/stages`)
    if (!response.ok) return null
    const body = (await response.json()) as StagesEndpointResponse
    const bosses = body?.bosses
    if (!Array.isArray(bosses) || bosses.length === 0) return null
    return { liveVersion: body.liveVersion ?? undefined, bosses }
  } catch {
    return null
  }
}

/** 回落路径：本地无 API、函数或 CDN 故障时，仍由浏览器直连 `static.nanoka.cc` 现算。 */
async function fetchStagesFromDataSource(): Promise<StaticArchiveSnapshot | null> {
  try {
    const manifest = await fetchJson<HsrManifest>(dataSourceUrl("manifest.json"))
    const version = pickDataDirectory(manifest.hsr?.available ?? [])
    if (!version) return null

    const baseUrl = dataSourceUrl("").replace(/\/$/, "")
    const results = await Promise.all(
      Object.keys(STATIC_SEASON_IDS).map(async (seasonId) => {
        try {
          return await buildSeasonBosses(seasonId, version, baseUrl)
        } catch {
          return [] as BossStage[]
        }
      }),
    )

    return {
      liveVersion: manifest.hsr?.live,
      bosses: results.flat(),
    }
  } catch {
    return null
  }
}

export async function fetchStaticArchiveSnapshot(): Promise<StaticArchiveSnapshot | null> {
  return (await fetchStagesFromApi()) ?? (await fetchStagesFromDataSource())
}

function mergeSeasons(seasons: Season[], generated: BossStage[], liveVersion: string | undefined): Season[] {
  const next = [...seasons]
  const generatedSeasonIds = new Set(generated.map((boss) => boss.seasonId))

  for (const seasonId of generatedSeasonIds) {
    if (next.some((season) => season.id === seasonId)) continue
    next.push({id: seasonId, label: `${seasonId} 归档`, isCurrent: seasonId === liveVersion})
  }

  return next
}

export function mergeStaticArchiveConfig(config: ArchiveConfig, snapshot: StaticArchiveSnapshot | null): ArchiveConfig {
  if (!snapshot || snapshot.bosses.length === 0) return config

  const generatedById = new Map(snapshot.bosses.map((boss) => [boss.id, boss]))
  const existingIds = new Set(config.bosses.map((boss) => boss.id))
  const missingInConfig = snapshot.bosses.filter((boss) => !existingIds.has(boss.id))

  // 数据库里已有 stage 但缺 imageUrl/monsters 等展示字段时，从静态快照补全，
  // 避免「生产环境 stages 行有但 imageUrl 为空」导致首图破图。
  const mergedExisting = config.bosses.map((boss) => enrichWithSnapshot(boss, generatedById.get(boss.id)))

  if (missingInConfig.length === 0) {
    if (mergedExisting.every((boss, index) => boss === config.bosses[index])) return config
    return { ...config, bosses: mergedExisting }
  }

  return {
    ...config,
    seasons: mergeSeasons(config.seasons, missingInConfig, snapshot.liveVersion),
    bosses: [...mergedExisting, ...missingInConfig],
  }
}

/**
 * `stages` 表是快照的**纯派生镜像**，可能落后于上游（新赛季上线、数值口径修正），
 * 所以快照覆盖到的 id 一律以快照为准——否则库里那行旧的韧性/弱点会一直盖住修正后的值，
 * 且没有任何报错线索。只有 `clears` 是业务统计值、不来自派生，保留库里的。
 */
function enrichWithSnapshot(stage: BossStage, generated: BossStage | undefined): BossStage {
  if (!generated) return stage
  return stage.clears === generated.clears ? generated : { ...generated, clears: stage.clears }
}
