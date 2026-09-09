import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SubmissionPayload, SubmissionReview } from "@/types/archive"
import { fixtureSubmission } from "./fixtures/config"
import { asResponse } from "./fixtures/netlifyResponse"

/**
 * 「我的投稿」的作者自助接口（隐藏 / 硬删 / 编辑并重新提交）在**无库 fallback** 路径下的端到端行为。
 * 有库分支走 SQL，本地没有库连接，覆盖不到；`/me` 的家族过滤与 `hiddenCount` 也在这里一起守。
 *
 * `SUBMISSION_REVIEW_FALLBACK_FILE` 在 `_shared` 模块初始化时就被读走，所以必须先 stub 再动态 import。
 */
const FALLBACK_REVIEWS: SubmissionReview[] = [
  {
    id: "sub_rejected",
    status: "rejected",
    ownerToken: "own_rejected",
    reviewerNote: "轮次填错了",
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-05T10:00:00.000Z",
    reviewedAt: "2026-09-05T12:00:00.000Z",
    payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1rejected01", cycle: 9 }),
  },
  {
    id: "sub_approved",
    status: "approved",
    ownerToken: "own_approved",
    reviewerNote: null,
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-04T10:00:00.000Z",
    reviewedAt: "2026-09-04T12:00:00.000Z",
    payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1approved01", cycle: 3 }),
  },
  {
    id: "sub_pending",
    status: "pending",
    ownerToken: "own_pending",
    reviewerNote: null,
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-06T10:00:00.000Z",
    reviewedAt: null,
    payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1pending001" }),
  },
  {
    id: "sub_withdrawn",
    status: "withdrawn",
    ownerToken: "own_withdrawn",
    reviewerNote: null,
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-03T10:00:00.000Z",
    reviewedAt: "2026-09-03T12:00:00.000Z",
    payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1withdrawn1" }),
  },
  // 与「已通过」那条同阶段、不同录像，用来验证修订的查重只排除自己这一族
  {
    id: "sub_other",
    status: "pending",
    ownerToken: "own_other",
    reviewerNote: null,
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-06T09:00:00.000Z",
    reviewedAt: null,
    payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1other00001" }),
  },
]

let fallbackFile = ""
let shared: typeof import("../netlify/functions/_shared")

function payloadOf(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return fixtureSubmission({ seasonId: "4.5", mode: "moc", ...overrides })
}

type SelfServiceModule =
  | "submissions-delete"
  | "submissions-visibility"
  | "submissions-revision"
  | "submissions-me"
  | "submissions-withdraw"

type HandlerEvent = Parameters<(typeof import("../netlify/functions/submissions-delete"))["handler"]>[0]

/** 静态 specifier 逐个 import：拼变量的动态路径在 vite-node 下不可靠。 */
async function loadHandler(module: SelfServiceModule) {
  switch (module) {
    case "submissions-delete":
      return (await import("../netlify/functions/submissions-delete")).handler
    case "submissions-visibility":
      return (await import("../netlify/functions/submissions-visibility")).handler
    case "submissions-revision":
      return (await import("../netlify/functions/submissions-revision")).handler
    case "submissions-me":
      return (await import("../netlify/functions/submissions-me")).handler
    case "submissions-withdraw":
      return (await import("../netlify/functions/submissions-withdraw")).handler
  }
}

async function call(
  module: SelfServiceModule,
  options: { method: string; id?: string; body?: unknown },
) {
  const handler = await loadHandler(module)
  const event = {
    httpMethod: options.method,
    path: options.id ? `/.netlify/functions/${module}/${options.id}` : `/.netlify/functions/${module}`,
    body: JSON.stringify(options.body ?? {}),
  } as unknown as HandlerEvent
  return asResponse(await handler(event, {} as never))
}

const jsonOf = (response: { body: string }) => JSON.parse(response.body) as Record<string, unknown>

async function readFallbackReviews() {
  return shared.listFallbackSubmissionReviews("all")
}

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "hsr-self-service-"))
  fallbackFile = join(dir, "reviews.json")
  vi.stubEnv("SUBMISSION_REVIEW_FALLBACK_FILE", fallbackFile)
  // 无库分支：三个候选变量都置空，getSql() 才会返回 null
  vi.stubEnv("NETLIFY_DATABASE_URL", "")
  vi.stubEnv("DATABASE_URL", "")
  vi.stubEnv("POSTGRES_URL", "")
  shared = await import("../netlify/functions/_shared")
})

beforeEach(async () => {
  await writeFile(fallbackFile, JSON.stringify(FALLBACK_REVIEWS))
})

describe("隐藏展示（服务端状态、可逆）", () => {
  it("已驳回的记录隐藏后 /me 默认不再返回，hiddenCount 记一条，可再取消隐藏", async () => {
    const hide = await call("submissions-visibility", {
      method: "PATCH",
      id: "sub_rejected",
      body: { token: "own_rejected", hidden: true },
    })
    expect(hide.statusCode).toBe(200)
    expect(jsonOf(hide)).toEqual({ id: "sub_rejected", hidden: true })

    const hiddenView = await call("submissions-me", {
      method: "POST",
      body: { tokens: ["own_rejected", "own_approved"] },
    })
    expect(jsonOf(hiddenView)).toMatchObject({
      reviews: [{ id: "sub_approved" }],
      hiddenCount: 1,
    })

    const expanded = await call("submissions-me", {
      method: "POST",
      body: { tokens: ["own_rejected", "own_approved"], includeHidden: true },
    })
    const reviews = jsonOf(expanded).reviews as SubmissionReview[]
    expect(reviews.map((review) => review.id)).toContain("sub_rejected")
    expect(reviews.find((review) => review.id === "sub_rejected")?.hidden).toBe(true)

    await call("submissions-visibility", {
      method: "PATCH",
      id: "sub_rejected",
      body: { token: "own_rejected", hidden: false },
    })
    const back = await call("submissions-me", { method: "POST", body: { tokens: ["own_rejected"] } })
    expect(jsonOf(back)).toMatchObject({ reviews: [{ id: "sub_rejected" }], hiddenCount: 0 })
  })

  it("已撤回可以收纳；待审与已通过不给隐藏", async () => {
    await expect(
      call("submissions-visibility", {
        method: "PATCH",
        id: "sub_withdrawn",
        body: { token: "own_withdrawn", hidden: true },
      }),
    ).resolves.toMatchObject({ statusCode: 200 })

    for (const [id, token] of [
      ["sub_pending", "own_pending"],
      ["sub_approved", "own_approved"],
    ]) {
      const response = await call("submissions-visibility", {
        method: "PATCH",
        id,
        body: { token, hidden: true },
      })
      expect(response.statusCode, id).toBe(400)
      expect(jsonOf(response).message).toBe("该状态的记录不支持隐藏")
    }
  })

  it("凭证不匹配 403、记录不存在 404、hidden 非布尔与非法 JSON 都是 400、方法不对 405", async () => {
    await expect(
      call("submissions-visibility", {
        method: "PATCH",
        id: "sub_rejected",
        body: { token: "own_wrong", hidden: true },
      }),
    ).resolves.toMatchObject({ statusCode: 403 })
    await expect(
      call("submissions-visibility", {
        method: "PATCH",
        id: "sub_missing",
        body: { token: "own_rejected", hidden: true },
      }),
    ).resolves.toMatchObject({ statusCode: 404 })
    await expect(
      call("submissions-visibility", {
        method: "PATCH",
        id: "sub_rejected",
        body: { token: "own_rejected", hidden: "yes" },
      }),
    ).resolves.toMatchObject({ statusCode: 400 })

    const { handler } = await import("../netlify/functions/submissions-visibility")
    await expect(
      handler(
        {
          httpMethod: "PATCH",
          path: "/.netlify/functions/submissions-visibility/sub_rejected",
          body: "{not json",
        } as unknown as HandlerEvent,
        {} as never,
      ),
    ).resolves.toMatchObject({ statusCode: 400 })
    await expect(
      handler(
        { httpMethod: "GET", path: "/.netlify/functions/submissions-visibility/sub_rejected" } as unknown as HandlerEvent,
        {} as never,
      ),
    ).resolves.toMatchObject({ statusCode: 405 })
  })
})

describe("删除记录（硬删，仅已驳回）", () => {
  it("删掉的记录从队列里彻底消失，/me 也查不到", async () => {
    const removed = await call("submissions-delete", {
      method: "DELETE",
      id: "sub_rejected",
      body: { token: "own_rejected" },
    })
    expect(removed.statusCode).toBe(200)
    // 无库模式下公开记录由审核队列派生，被驳回的记录本来就没有 runs 行
    expect(jsonOf(removed)).toEqual({ id: "sub_rejected", deleted: true, removedRun: false })

    await expect(readFallbackReviews()).resolves.toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: "sub_rejected" })]),
    )
    const me = await call("submissions-me", { method: "POST", body: { tokens: ["own_rejected"] } })
    expect(jsonOf(me)).toMatchObject({ reviews: [], runs: [], hiddenCount: 0 })
  })

  it("已通过、待审、已撤回都不给删", async () => {
    for (const [id, token] of [
      ["sub_approved", "own_approved"],
      ["sub_pending", "own_pending"],
      ["sub_withdrawn", "own_withdrawn"],
    ]) {
      const response = await call("submissions-delete", { method: "DELETE", id, body: { token } })
      expect(response.statusCode, id).toBe(400)
      expect(jsonOf(response).message).toBe("只有已驳回的记录可以删除")
    }
    await expect(readFallbackReviews()).resolves.toHaveLength(FALLBACK_REVIEWS.length)
  })

  it("凭证不匹配 403、记录不存在 404、方法不对 405", async () => {
    await expect(
      call("submissions-delete", { method: "DELETE", id: "sub_rejected", body: { token: "own_x" } }),
    ).resolves.toMatchObject({ statusCode: 403 })
    await expect(
      call("submissions-delete", { method: "DELETE", id: "sub_missing", body: { token: "own_rejected" } }),
    ).resolves.toMatchObject({ statusCode: 404 })

    const { handler } = await import("../netlify/functions/submissions-delete")
    await expect(
      handler(
        { httpMethod: "POST", path: "/.netlify/functions/submissions-delete/sub_rejected", body: "{}" } as unknown as HandlerEvent,
        {} as never,
      ),
    ).resolves.toMatchObject({ statusCode: 405 })
  })
})

describe("编辑并重新提交", () => {
  it("已驳回就地重提：同一条记录回到待审、驳回备注清空", async () => {
    const resubmitted = await call("submissions-revision", {
      method: "POST",
      id: "sub_rejected",
      body: {
        token: "own_rejected",
        payload: payloadOf({
          videoUrl: "https://www.bilibili.com/video/BV1rejected01",
          cycle: 4,
          teamName: "改过的队伍",
        }),
      },
    })
    expect(resubmitted.statusCode).toBe(200)
    expect(jsonOf(resubmitted)).toMatchObject({ id: "sub_rejected", status: "pending", updated: true })

    const reviews = await readFallbackReviews()
    const target = reviews.find((review) => review.id === "sub_rejected")
    expect(target).toMatchObject({ status: "pending", reviewerNote: null, reviewedAt: null })
    expect(target?.payload.cycle).toBe(4)
    expect(target?.payload.teamName).toBe("改过的队伍")
  })

  it("已通过产生新修订：复用父凭证、指回父记录，父记录保持已通过", async () => {
    const created = await call("submissions-revision", {
      method: "POST",
      id: "sub_approved",
      body: {
        token: "own_approved",
        payload: payloadOf({
          videoUrl: "https://www.bilibili.com/video/BV1approved01",
          cycle: 1,
          teamName: "修订后的队伍",
        }),
      },
    })
    expect(created.statusCode).toBe(202)
    const body = jsonOf(created) as { id: string; revisesId: string; ownerToken: string }
    expect(body.revisesId).toBe("sub_approved")
    expect(body.ownerToken).toBe("own_approved")
    expect(body.id).not.toBe("sub_approved")

    // 修订还在待审时，公开记录必须是父记录的上一次通过内容
    const publicRuns = await shared.listFallbackArchiveRuns()
    expect(publicRuns).toHaveLength(1)
    expect(publicRuns[0]).toMatchObject({ id: "sub_approved", cycle: 3 })

    // 管理员通过修订后：仍然只有一条公开记录，且内容已更新、id 不变
    await shared.updateFallbackSubmissionReview(body.id, "approved")
    const merged = await shared.listFallbackArchiveRuns()
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: "sub_approved", cycle: 1, teamName: "修订后的队伍" })
  })

  it("同一条记录最多一条待审修订，再次编辑就地覆盖；沿用原视频不会被自己挡住", async () => {
    const first = jsonOf(
      await call("submissions-revision", {
        method: "POST",
        id: "sub_approved",
        body: { token: "own_approved", payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1approved01", cycle: 2 }) },
      }),
    ) as { id: string }

    const second = await call("submissions-revision", {
      method: "POST",
      id: "sub_approved",
      body: { token: "own_approved", payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1approved01", cycle: 5 }) },
    })
    expect(second.statusCode).toBe(200)
    expect(jsonOf(second)).toMatchObject({ id: first.id, revisesId: "sub_approved", updated: true })

    const reviews = await readFallbackReviews()
    expect(reviews.filter((review) => review.revisesId === "sub_approved")).toHaveLength(1)
  })

  it("修订撞上别人同一条录像仍被 409 拦住", async () => {
    await shared.addFallbackSubmissionReview(
      "sub_rival",
      payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1rival0001", bossId: "4.5-moc-top" }),
      "own_rival",
    )

    const blocked = await call("submissions-revision", {
      method: "POST",
      id: "sub_approved",
      body: {
        token: "own_approved",
        payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1rival0001", bossId: "4.5-moc-top" }),
      },
    })
    expect(blocked.statusCode).toBe(409)
    expect(jsonOf(blocked)).toMatchObject({ duplicate: { matches: [{ id: "sub_rival" }] } })
  })

  it("待审与已撤回的记录不支持编辑；缺字段 400；凭证不匹配 403", async () => {
    await expect(
      call("submissions-revision", {
        method: "POST",
        id: "sub_pending",
        body: { token: "own_pending", payload: payloadOf() },
      }),
    ).resolves.toMatchObject({ statusCode: 400 })
    await expect(
      call("submissions-revision", {
        method: "POST",
        id: "sub_withdrawn",
        body: { token: "own_withdrawn", payload: payloadOf() },
      }),
    ).resolves.toMatchObject({ statusCode: 400 })
    await expect(
      call("submissions-revision", {
        method: "POST",
        id: "sub_approved",
        body: { token: "own_approved", payload: payloadOf({ author: "  " }) },
      }),
    ).resolves.toMatchObject({ statusCode: 400, body: expect.stringContaining("author") })
    await expect(
      call("submissions-revision", {
        method: "POST",
        id: "sub_approved",
        body: { token: "own_wrong", payload: payloadOf() },
      }),
    ).resolves.toMatchObject({ statusCode: 403 })
  })
})

describe("撤回只作用单条记录", () => {
  it("撤回一条待审修订不会动父记录那行公开档案", async () => {
    const created = jsonOf(
      await call("submissions-revision", {
        method: "POST",
        id: "sub_approved",
        body: { token: "own_approved", payload: payloadOf({ videoUrl: "https://www.bilibili.com/video/BV1approved01", cycle: 1 }) },
      }),
    ) as { id: string }

    const withdrawn = await call("submissions-withdraw", {
      method: "PATCH",
      id: created.id,
      body: { token: "own_approved" },
    })
    expect(withdrawn.statusCode).toBe(200)

    const reviews = await readFallbackReviews()
    expect(reviews.find((review) => review.id === created.id)?.status).toBe("withdrawn")
    expect(reviews.find((review) => review.id === "sub_approved")?.status).toBe("approved")
    await expect(shared.listFallbackArchiveRuns()).resolves.toMatchObject([
      { id: "sub_approved", cycle: 3 },
    ])
  })
})
