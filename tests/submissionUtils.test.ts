import { describe, expect, it } from "vitest"
import { seedConfig } from "@/data/seed"
import {
  buildPreferredLightconeByCharacter,
  buildSuggestedLightconeByCharacter,
  submissionReviewToArchiveRun,
} from "@/services/submissionUtils"
import type { ArchiveRun, SubmissionReview } from "@/types/archive"
import { fixtureRuns } from "./fixtures/runs"

describe("submissionUtils", () => {
  it("根据已收录记录的同槽位搭配生成角色常用光锥映射", () => {
    const preferred = buildPreferredLightconeByCharacter(fixtureRuns, seedConfig.units)

    expect(preferred.acheron).toBe("whereabouts")
    expect(preferred["the-herta"]).toBe("before-dawn")
  })

  it("建议表以专武优先、记录统计填空，并过滤单位库外的光锥", () => {
    const suggested = buildSuggestedLightconeByCharacter(fixtureRuns, seedConfig.units)

    // 夹具统计把大黑塔配成拂晓之前，专武表优先覆盖为向着不可追问处。
    expect(suggested["the-herta"]).toBe("into-the-unreachable-veil")
    // 停云是低星角色、不在专武表里，由记录统计补上。
    expect(suggested.tingyun).toBe("dance-dance-dance")

    const orphan = buildSuggestedLightconeByCharacter(
      [
        {
          ...fixtureRuns[0],
          units: [{ unitId: "tingyun", eidolon: 0 }],
          lightcones: [{ unitId: "not-a-cone", superimposition: 5 }],
        },
      ] as ArchiveRun[],
      seedConfig.units,
    )
    expect(orphan.tingyun).toBeUndefined()
  })

  it("把已通过投稿转换为可公开展示的档案记录", () => {
    const source = fixtureRuns[0]
    const review: SubmissionReview = {
      id: "sub_test",
      status: "approved",
      createdAt: "2026-07-14T08:00:00.000Z",
      reviewedAt: "2026-07-14T08:10:00.000Z",
      payload: {
        seasonId: source.seasonId,
        mode: source.mode,
        bossId: source.bossId,
        category: source.category,
        author: source.author,
        teamName: source.teamName,
        cycle: source.cycle,
        score: source.score,
        cost: source.cost,
        videoUrl: source.videoUrl ?? "https://example.com/video",
        notes: "审核测试",
        units: source.units,
        lightcones: source.lightcones,
      },
    }

    const run = submissionReviewToArchiveRun(review, seedConfig.units)

    expect(run.id).toBe("sub_test")
    expect(run.submittedAt).toBe(review.createdAt)
    expect(run.units).toEqual(source.units)
    expect(run.limitedCount + run.standardCount).toBeGreaterThan(0)
  })
})
