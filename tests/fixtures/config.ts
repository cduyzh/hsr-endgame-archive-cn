import { seedConfig } from "@/data/seed"
import type { ArchiveConfig, BossStage, SubmissionPayload } from "@/types/archive"

function boss(overrides: Partial<BossStage> & Pick<BossStage, "id" | "name">): BossStage {
  return {
    seasonId: "4.5",
    mode: "moc",
    subtitle: "混沌回忆 · 上半",
    hp: "800,000 x2",
    speed: "150",
    toughness: "360",
    weakness: ["量子", "虚数"],
    resist: {},
    clears: 12,
    memoryBuff: "示例记忆加成",
    bannerTone: "red",
    ...overrides,
  }
}

/** 投稿校验需要赛季 × 模式下都有可选阶段，seed 的 bosses 为空数组，因此测试统一用这份夹具。 */
export const fixtureConfig: ArchiveConfig = {
  ...seedConfig,
  bosses: [
    boss({ id: "4.5-moc-top", name: "「黄金」的追猎者" }),
    boss({ id: "4.5-moc-bottom", name: "三头犬", subtitle: "混沌回忆 · 下半" }),
    boss({ id: "4.5-aa-k1", name: "王棋 · 第一局", mode: "aa", subtitle: "异相仲裁 · K1" }),
  ],
}

export function fixtureSubmission(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return {
    seasonId: "4.5",
    mode: "moc",
    bossId: "4.5-moc-top",
    category: "fullStars",
    author: "档案员K",
    teamName: "大黑塔双同谐",
    cycle: 2,
    score: 39000,
    cost: 24,
    videoUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
    notes: "",
    units: [
      { unitId: "the-herta", eidolon: 0 },
      { unitId: "ruan-mei", eidolon: 1 },
      { unitId: "tingyun", eidolon: 6 },
      { unitId: "trailblazer-remembrance", eidolon: 6 },
    ],
    lightcones: [
      { unitId: "before-dawn", superimposition: 1 },
      { unitId: "cruising", superimposition: 5 },
      { unitId: "dance-dance-dance", superimposition: 5 },
      { unitId: "dance-dance-dance", superimposition: 3 },
    ],
    ...overrides,
  }
}
