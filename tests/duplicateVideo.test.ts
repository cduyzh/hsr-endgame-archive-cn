import { beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SubmissionPayload, SubmissionReview } from "@/types/archive"
import { fixtureSubmission } from "./fixtures/config"

/**
 * 无库 fallback 路径下的投稿查重（有库分支走 SQL，本地无库无法覆盖）。
 * `SUBMISSION_REVIEW_FALLBACK_FILE` 在模块初始化时被读取，所以必须先 stub 再动态 import。
 */
const TARGET = "https://www.bilibili.com/video/BV1TubY67E2r"

function payloadOf(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return {
    seasonId: "4.5",
    mode: "moc",
    bossId: "4.5-moc-top",
    category: "fullStars",
    author: "夜航",
    teamName: "大黑塔双同谐",
    cycle: 2,
    score: 39000,
    cost: 6,
    videoUrl: TARGET,
    notes: "",
    flags: [],
    units: [],
    lightcones: [],
    ...overrides,
  }
}

function reviewOf(
  id: string,
  status: SubmissionReview["status"],
  createdAt: string,
  payload: SubmissionPayload,
): SubmissionReview {
  return { id, status, createdAt, payload, reviewerNote: null, ownerToken: null, reviewedAt: null }
}

const reviews: SubmissionReview[] = [
  // 同一支录像在同一个阶段被提了三次，外加下半区各一条合法投稿
  reviewOf("sub_top_1", "pending", "2026-09-01T10:00:00.000Z", payloadOf({ videoUrl: `${TARGET}?p=1` })),
  reviewOf("sub_top_2", "pending", "2026-09-02T10:00:00.000Z", payloadOf()),
  reviewOf("sub_top_3", "approved", "2026-09-03T10:00:00.000Z", payloadOf({ videoUrl: "https://m.bilibili.com/video/BV1TubY67E2r" })),
  reviewOf("sub_top_4", "pending", "2026-09-04T10:00:00.000Z", payloadOf()),
  reviewOf("sub_bottom_1", "approved", "2026-09-01T12:00:00.000Z", payloadOf({ bossId: "4.5-moc-bottom" })),
  reviewOf("sub_rejected_1", "rejected", "2026-09-01T09:00:00.000Z", payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1rejected01" })),
  reviewOf("sub_withdrawn_1", "withdrawn", "2026-09-01T09:00:00.000Z", payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1withdrawn01" })),
  reviewOf("sub_other_1", "pending", "2026-09-01T09:00:00.000Z", payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1other00001" })),
]

let shared: typeof import("../netlify/functions/_shared")

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "hsr-dup-"))
  vi.stubEnv("SUBMISSION_REVIEW_FALLBACK_FILE", join(dir, "reviews.json"))
  await writeFile(join(dir, "reviews.json"), JSON.stringify(reviews))
  // 无库分支：三个候选变量都置空，getSql() 才会返回 null
  vi.stubEnv("NETLIFY_DATABASE_URL", "")
  vi.stubEnv("DATABASE_URL", "")
  vi.stubEnv("POSTGRES_URL", "")
  shared = await import("../netlify/functions/_shared")
})

describe("findDuplicateVideoRecords 无库 fallback", () => {
  it("同一支录像在同一阶段的多条待审/已通过投稿都算重复，最多回显 3 条", async () => {
    const matches = await shared.findDuplicateVideoRecords({ videoUrl: TARGET, bossId: "4.5-moc-top" })

    expect(matches.map((match) => match.id)).toEqual(["sub_top_4", "sub_top_3", "sub_top_2"])
    expect(matches[0]).toMatchObject({ source: "submission", status: "pending", author: "夜航" })
    expect(matches[1]).toMatchObject({ status: "approved" })
  })

  it("换到另一条录像前缀相似的链接不误判", async () => {
    const matches = await shared.findDuplicateVideoRecords({
      videoUrl: "https://www.bilibili.com/video/BV1TubY67E2",
      bossId: "4.5-moc-top",
    })
    expect(matches).toEqual([])
  })

  it("同一条录像申报另一阶段不算重复", async () => {
    expect(
      (await shared.findDuplicateVideoRecords({ videoUrl: TARGET, bossId: "4.5-moc-bottom" })).map(
        (match) => match.id,
      ),
    ).toEqual(["sub_bottom_1"])
  })

  it("已通过投稿与由它生成的档案按 id 去重成一条", async () => {
    const matches = await shared.findDuplicateVideoRecords({
      videoUrl: "https://bilibili.com/video/BV1TubY67E2r/?vd_source=abc",
      bossId: "4.5-moc-top",
    })
    const approved = matches.filter((match) => match.id === "sub_top_3")
    expect(approved).toHaveLength(1)
    expect(approved[0].source).toBe("submission")
  })

  it("驳回与撤回的记录不拦新投稿，不同录像也不串案", async () => {
    for (const videoUrl of [
      "https://www.bilibili.com/video/BV1rejected01",
      "https://www.bilibili.com/video/BV1withdrawn01",
      "https://www.bilibili.com/video/BV1missing0001",
    ]) {
      await expect(
        shared.findDuplicateVideoRecords({ videoUrl, bossId: "4.5-moc-top" }),
        videoUrl,
      ).resolves.toEqual([])
    }

    // 另一支录像的待审投稿同样会命中，只是不会串到上面那些链接上
    await expect(
      shared.findDuplicateVideoRecords({
        videoUrl: "https://www.bilibili.com/video/BV1other00001",
        bossId: "4.5-moc-top",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "sub_other_1", status: "pending", bossId: "4.5-moc-top" }),
    ])
  })

  it("缺少阶段或链接解析不出身份时直接放行", async () => {
    await expect(shared.findDuplicateVideoRecords({ videoUrl: TARGET, bossId: "" })).resolves.toEqual([])
    await expect(shared.findDuplicateVideoRecords({ videoUrl: "not a url", bossId: "4.5-moc-top" })).resolves.toEqual(
      [],
    )
  })
})

describe("投稿接口端到端（无库 fallback）", () => {
  // 必须用四槽位齐全的夹具：payloadOf 的空 units/lightcones 会先被 validateSubmission 判成缺字段
  const submissionOf = (overrides: Partial<SubmissionPayload>) =>
    fixtureSubmission({ seasonId: "4.5", mode: "moc", ...overrides })

  type PostEvent = Parameters<(typeof import("../netlify/functions/submissions"))["handler"]>[0]

  async function runPost(body: unknown) {
    const { handler } = await import("../netlify/functions/submissions")
    return handler({ httpMethod: "POST", body: JSON.stringify(body) } as unknown as PostEvent, {} as never)
  }

  async function runCheck(query: Record<string, string>) {
    const { handler } = await import("../netlify/functions/submissions-check")
    const rawQuery = new URLSearchParams(query).toString()
    return handler({ httpMethod: "GET", rawQuery } as unknown as PostEvent, {} as never)
  }

  const json = (response: {body?: string | null}) => JSON.parse(response.body ?? "{}")

  it("入队后同链接同阶段被 409 拦住，换阶段仍可提交", async () => {
    const videoUrl = "https://www.bilibili.com/video/BV1e2eonly01?vd_source=abc"

    const first = await runPost(submissionOf({ videoUrl }))
    expect(first.statusCode).toBe(202)
    const created = json(first) as {id: string; ownerToken: string}
    expect(created.ownerToken).toMatch(/^own_/)

    // 换一种粘贴形式（去 www、带 p 参数、m. 子域）仍能查到同一条
    const check = await runCheck({
      videoUrl: "https://m.bilibili.com/video/BV1e2eonly01?p=2",
      bossId: "4.5-moc-top",
    })
    expect(check.statusCode).toBe(200)
    expect(json(check)).toMatchObject({ duplicate: true, matches: [{ id: created.id, status: "pending" }] })

    const again = await runPost(submissionOf({ videoUrl: "https://bilibili.com/video/BV1e2eonly01/" }))
    expect(again.statusCode).toBe(409)
    expect(json(again)).toMatchObject({ duplicate: { matches: [{ id: created.id }] } })

    const otherStage = await runPost(
      submissionOf({ videoUrl: "https://www.bilibili.com/video/BV1e2eonly01", bossId: "4.5-moc-bottom" }),
    )
    expect(otherStage.statusCode).toBe(202)

    // 字段缺失仍先返回 400，不会被查重抢先
    expect((await runPost(submissionOf({ videoUrl: "   " }))).statusCode).toBe(400)
  })
})
