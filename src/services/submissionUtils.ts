import {getRunGoldCounts} from "./unitCost"
import {signatureLightconeByCharacter} from "../data/signatureLightcones"
// 上面使用相对路径而非 @/ 别名，以保证 netlify/functions 下的 esbuild 打包能解析。
import type {ArchiveRun, ArchiveUnit, SubmissionReview} from "@/types/archive"

/** 专武表优先覆盖站内统计结果，两者都只保留单位库里存在的光锥。 */
export function buildSuggestedLightconeByCharacter(runs: ArchiveRun[], units: ArchiveUnit[]) {
  const knownLightcones = new Set(units.filter((unit) => unit.kind === "lightcone").map((unit) => unit.id))
  const merged: Record<string, string> = {...buildPreferredLightconeByCharacter(runs, units)}

  for (const [characterId, lightconeId] of Object.entries(signatureLightconeByCharacter)) {
    if (knownLightcones.has(lightconeId)) merged[characterId] = lightconeId
  }

  return Object.fromEntries(
    Object.entries(merged).filter(([, lightconeId]) => knownLightcones.has(lightconeId)),
  ) as Record<string, string>
}

export function buildPreferredLightconeByCharacter(runs: ArchiveRun[], units: ArchiveUnit[]) {
  const unitById = new Map(units.map((unit) => [unit.id, unit]))
  const counts = new Map<string, Map<string, number>>()

  for (const run of runs) {
    run.units.forEach((character, index) => {
      const lightcone = run.lightcones[index]
      const characterUnit = unitById.get(character.unitId)
      const lightconeUnit = lightcone ? unitById.get(lightcone.unitId) : null
      if (!characterUnit || !lightconeUnit || characterUnit.kind !== "character" || lightconeUnit.kind !== "lightcone") {
        return
      }
      if (characterUnit.path !== lightconeUnit.path) return

      const characterCounts = counts.get(character.unitId) ?? new Map<string, number>()
      characterCounts.set(lightcone.unitId, (characterCounts.get(lightcone.unitId) ?? 0) + 1)
      counts.set(character.unitId, characterCounts)
    })
  }

  return Object.fromEntries(
    [...counts.entries()].flatMap(([characterId, lightconeCounts]) => {
      const preferred = [...lightconeCounts.entries()].sort(
        ([lightconeA, countA], [lightconeB, countB]) => countB - countA || lightconeA.localeCompare(lightconeB),
      )[0]?.[0]
      return preferred ? [[characterId, preferred]] : []
    }),
  ) as Record<string, string>
}

/**
 * 投稿对应的公开记录 id：`runs` 与 `submission_reviews` 靠同一个 id 值 1:1 关联，
 * 二次编辑的修订带 `revisesId` 指回原投稿，因此它落进的是**原**那条 runs 行（原地更新，不产生第二条公开记录）。
 */
export function archiveRunIdOf(review: Pick<SubmissionReview, "id" | "revisesId">) {
  return review.revisesId ?? review.id
}

export function submissionReviewToArchiveRun(review: SubmissionReview, units: ArchiveUnit[]): ArchiveRun {
  const run: ArchiveRun = {
    id: archiveRunIdOf(review),
    seasonId: review.payload.seasonId,
    mode: review.payload.mode,
    bossId: review.payload.bossId,
    category: review.payload.category,
    teamName: review.payload.teamName,
    author: review.payload.author,
    cycle: review.payload.cycle,
    score: review.payload.score,
    cost: review.payload.cost,
    limitedCount: 0,
    standardCount: 0,
    submittedAt: review.createdAt,
    tags: [...(review.payload.flags ?? [])],
    videoUrl: review.payload.videoUrl,
    units: [...review.payload.units],
    lightcones: [...review.payload.lightcones],
  }
  const goldCounts = getRunGoldCounts(run, units)
  return {...run, limitedCount: goldCounts.limited, standardCount: goldCounts.standard}
}
