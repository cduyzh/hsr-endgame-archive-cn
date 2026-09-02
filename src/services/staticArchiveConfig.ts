/**
 * 浏览器端入口：负责从远程 `static.nanoka.cc` 拉取 manifest，定位最新数据目录，
 * 再交由 `staticBossSnapshot.ts` 计算出全部 `BossStage`。计算/抓取本身不带任何业务逻辑，
 * 服务端 `netlify/functions/_staticSnapshot.ts` 复用同一份纯计算模块。
 */

import {dataSourceUrl} from "./dataSource"
import {buildSeasonBosses, pickDataDirectory, STATIC_SEASON_IDS, type HsrManifest} from "./staticBossSnapshot"
import type {ArchiveConfig, BossStage, Season} from "../types/archive"

export interface StaticArchiveSnapshot {
  liveVersion?: string
  bosses: BossStage[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

export async function fetchStaticArchiveSnapshot(): Promise<StaticArchiveSnapshot | null> {
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

  const existingIds = new Set(config.bosses.map((boss) => boss.id))
  const generated = snapshot.bosses.filter((boss) => !existingIds.has(boss.id))
  if (generated.length === 0) return config

  return {
    ...config,
    seasons: mergeSeasons(config.seasons, generated, snapshot.liveVersion),
    bosses: [...config.bosses, ...generated],
  }
}
