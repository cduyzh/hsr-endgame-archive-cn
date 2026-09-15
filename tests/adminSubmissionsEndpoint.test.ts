import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SubmissionReview } from "@/types/archive"
import { fixtureSubmission } from "./fixtures/config"
import { asResponse } from "./fixtures/netlifyResponse"

/**
 * `GET /api/admin/submissions` 的状态白名单与筛选语义（无库 fallback 路径）。
 * 守的是 D3 的服务端那一半：`withdrawn` 此前不在白名单里，`?status=withdrawn` 直接 400，
 * 作者撤回的记录在审核台侧完全查不到。
 */
const ADMIN_PASSWORD = "test-admin-password"

const FALLBACK_REVIEWS: SubmissionReview[] = [
  {
    id: "sub_withdrawn",
    status: "withdrawn",
    ownerToken: "own_withdrawn",
    reviewerNote: null,
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    reviewedAt: "2026-09-12T11:00:00.000Z",
    payload: fixtureSubmission({ teamName: "已撤回的队伍" }),
  },
  {
    id: "sub_pending",
    status: "pending",
    ownerToken: "own_pending",
    reviewerNote: null,
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    reviewedAt: null,
    payload: fixtureSubmission({ teamName: "待审核的队伍" }),
  },
]

let fallbackFile = ""
let handler: (typeof import("../netlify/functions/admin-submissions"))["handler"]

async function list(status?: string) {
  const event = {
    httpMethod: "GET",
    path: "/api/admin/submissions",
    queryStringParameters: status ? { status } : undefined,
    headers: { authorization: `Bearer ${ADMIN_PASSWORD}` },
  } as unknown as Parameters<typeof handler>[0]
  return asResponse(await handler(event, {} as never))
}

const idsOf = (response: { body: string }) =>
  (JSON.parse(response.body) as SubmissionReview[]).map((review) => review.id)

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "hsr-admin-list-"))
  fallbackFile = join(dir, "reviews.json")
  vi.stubEnv("SUBMISSION_REVIEW_FALLBACK_FILE", fallbackFile)
  vi.stubEnv("ADMIN_REVIEW_PASSWORD", ADMIN_PASSWORD)
  // 无库分支：三个候选变量都置空，getSql() 才会返回 null
  vi.stubEnv("NETLIFY_DATABASE_URL", "")
  vi.stubEnv("DATABASE_URL", "")
  vi.stubEnv("POSTGRES_URL", "")
  handler = (await import("../netlify/functions/admin-submissions")).handler
})

beforeEach(async () => {
  await writeFile(fallbackFile, JSON.stringify(FALLBACK_REVIEWS))
})

describe("审核列表的状态筛选", () => {
  it("withdrawn 是合法筛选值，只返回作者撤回的记录", async () => {
    const response = await list("withdrawn")

    expect(response.statusCode).toBe(200)
    expect(idsOf(response)).toEqual(["sub_withdrawn"])
  })

  it("all 仍返回全部状态", async () => {
    expect(idsOf(await list("all"))).toEqual(["sub_withdrawn", "sub_pending"])
  })

  it("白名单之外的值仍然 400", async () => {
    const response = await list("bogus")

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ message: "不支持的审核状态" })
  })

  it("不传 status 时缺省是 pending", async () => {
    expect(idsOf(await list())).toEqual(["sub_pending"])
  })
})
