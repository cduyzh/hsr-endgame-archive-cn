import {getRunGoldCounts} from "./unitCost"
// 上面使用相对路径而非 @/ 别名，以保证 netlify/functions 下的 esbuild 打包能解析。
import type {ArchiveRun, ArchiveUnit, SubmissionReview} from "@/types/archive"

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

export function submissionReviewToArchiveRun(review: SubmissionReview, units: ArchiveUnit[]): ArchiveRun {
  const run: ArchiveRun = {
    id: review.id,
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
    tags: [],
    videoUrl: review.payload.videoUrl,
    units: review.payload.units,
    lightcones: review.payload.lightcones,
  }
  const goldCounts = getRunGoldCounts(run, units)
  return {...run, limitedCount: goldCounts.limited, standardCount: goldCounts.standard}
}
