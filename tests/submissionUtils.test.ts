import { describe, expect, it } from "vitest"
import { seedConfig, seedRuns } from "@/data/seed"
import { buildPreferredLightconeByCharacter, submissionReviewToArchiveRun } from "@/services/submissionUtils"
import type { SubmissionReview } from "@/types/archive"

describe("submissionUtils", () => {
  it("根据已收录记录的同槽位搭配生成角色常用光锥映射", () => {
    const preferred = buildPreferredLightconeByCharacter(seedRuns, seedConfig.units)

    expect(preferred.acheron).toBe("whereabouts")
    expect(preferred["the-herta"]).toBe("before-dawn")
  })

  it("把已通过投稿转换为可公开展示的档案记录", () => {
    const source = seedRuns[0]
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
