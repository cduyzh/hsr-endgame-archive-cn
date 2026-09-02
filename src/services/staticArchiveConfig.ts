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

function enrichWithSnapshot(stage: BossStage, generated: BossStage | undefined): BossStage {
  if (!generated) return stage
  const patch: Partial<BossStage> = {}
  if (!stage.imageUrl && generated.imageUrl) patch.imageUrl = generated.imageUrl
  if (!stage.imageAlt && generated.imageAlt) patch.imageAlt = generated.imageAlt
  if ((!stage.monsters || stage.monsters.length === 0) && generated.monsters) patch.monsters = generated.monsters
  if (Object.keys(patch).length === 0) return stage
  return { ...stage, ...patch }
}
