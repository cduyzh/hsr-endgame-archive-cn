import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkSubmissionRules } from "@/services/submissionRules"
import type { SubmissionPayload, SubmissionReview } from "@/types/archive"
import { fixtureSubmission } from "./fixtures/config"
import { asResponse } from "./fixtures/netlifyResponse"

/**
 * D5 的服务端纵深：入队与审核发布前都要过同一套值域规则。
 * 此前这些规则只有前端 `submissionValidation.ts` 一份，绕过前端直 POST 就能把
 * `mode=bogus`、`cost=999`、1 角色 + 3 光锥的脏记录送进审核队列，通过后直接进公开 `runs`
 * （`runs.mode` / `category` / `status` 都是无 CHECK 约束的 text，脏值不会报错、只会静默存在）。
 */
const FOUR_UNITS = fixtureSubmission().units
const FOUR_LIGHTCONES = fixtureSubmission().lightcones

function validPayload(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return fixtureSubmission({
    videoUrl: "https://www.bilibili.com/video/BV1server0001",
    units: FOUR_UNITS,
    lightcones: FOUR_LIGHTCONES,
    ...overrides,
  })
}

const fieldsOf = (payload: Partial<SubmissionPayload>) =>
  checkSubmissionRules(payload).map((violation) => violation.field)

let fallbackFile = ""
let postSubmission: (typeof import("../netlify/functions/submissions"))["handler"]

async function post(payload: unknown) {
  const event = {
    httpMethod: "POST",
    path: "/api/submissions",
    body: JSON.stringify(payload),
  } as unknown as Parameters<typeof postSubmission>[0]
  return asResponse(await postSubmission(event, {} as never))
}

async function queuedIds() {
  const reviews = JSON.parse(await readFile(fallbackFile, "utf8")) as SubmissionReview[]
  return reviews.map((review) => review.id)
}

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "hsr-server-validation-"))
  fallbackFile = join(dir, "reviews.json")
  vi.stubEnv("SUBMISSION_REVIEW_FALLBACK_FILE", fallbackFile)
  // 无库分支：三个候选变量都置空，getSql() 才会返回 null
  vi.stubEnv("NETLIFY_DATABASE_URL", "")
  vi.stubEnv("DATABASE_URL", "")
  vi.stubEnv("POSTGRES_URL", "")
  postSubmission = (await import("../netlify/functions/submissions")).handler
})

beforeEach(async () => {
  await writeFile(fallbackFile, JSON.stringify([]))
})

describe("checkSubmissionRules 纯判定", () => {
  it("合法投稿没有违规项", () => {
    expect(checkSubmissionRules(validPayload())).toEqual([])
  })

  it("未知模式被拦下", () => {
    expect(fieldsOf(validPayload({ mode: "bogus" as never }))).toContain("mode")
  })

  it("分类必须属于当前模式与阶段", () => {
    // asScore4000 是末日幻影的分档，挂在混沌回忆上就是脏数据
    expect(fieldsOf(validPayload({ category: "asScore4000" }))).toContain("category")
    expect(fieldsOf(validPayload({ mode: "as", bossId: "4.5-as-top", category: "asScore4000", score: 4000 }))).toEqual([])
  })

  it("阶段 id 与所选赛季、模式不一致时拦下", () => {
    expect(fieldsOf(validPayload({ bossId: "4.4-aa-k3" }))).toContain("bossId")
  })

  it("成本必须落在 0–48", () => {
    expect(fieldsOf(validPayload({ cost: 999 }))).toContain("cost")
    expect(fieldsOf(validPayload({ cost: -1 }))).toContain("cost")
  })

  it("角色与光锥都必须恰好 4 个", () => {
    expect(fieldsOf(validPayload({ units: FOUR_UNITS.slice(0, 1), lightcones: FOUR_LIGHTCONES.slice(0, 3) }))).toContain("units")
  })

  it("视频链接只认 B 站与 YouTube", () => {
    expect(fieldsOf(validPayload({ videoUrl: "https://example.com/video" }))).toContain("videoUrl")
    expect(fieldsOf(validPayload({ videoUrl: "https://bilibili.com.evil.com/video" }))).toContain("videoUrl")
  })

  it("标记必须是站内支持的三个", () => {
    expect(fieldsOf(validPayload({ flags: ["revive", "不存在的标记"] as never }))).toContain("flags")
    expect(checkSubmissionRules(validPayload({ flags: ["revive", "firewall"] }))).toEqual([])
  })

  it("0 轮类分类要求轮次为 0，末日幻影分数不超过 4000", () => {
    expect(fieldsOf(validPayload({ category: "zeroCycle", cycle: 3 }))).toContain("cycle")
    expect(fieldsOf(validPayload({ mode: "as", bossId: "4.5-as-top", category: "asScore4000", score: 999999 }))).toContain("score")
  })
})

describe("POST /api/submissions 的入队拦截", () => {
  it("上一轮实跑那份脏 payload 现在 400，并且不入队", async () => {
    const response = await post({
      ...validPayload(),
      mode: "bogus",
      cost: 999,
      score: 999999,
      category: "asScore4000",
      units: FOUR_UNITS.slice(0, 1),
      lightcones: FOUR_LIGHTCONES.slice(0, 3),
      flags: ["revive", "不存在的标记"],
      __unknownField: "x",
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body) as { message: string; violations: unknown[] }
    expect(body.message).toContain("竞赛模式不合法")
    expect(body.violations.length).toBeGreaterThan(1)
    await expect(queuedIds()).resolves.toEqual([])
  })

  it("合法投稿仍然 202 入队并下发凭证", async () => {
    const response = await post(validPayload({ videoUrl: "https://www.bilibili.com/video/BV1server0002" }))

    expect(response.statusCode).toBe(202)
    const body = JSON.parse(response.body) as { id: string; status: string; ownerToken: string }
    expect(body.status).toBe("pending")
    expect(body.ownerToken).toMatch(/^own_[0-9a-f]{48}$/)
    await expect(queuedIds()).resolves.toEqual([body.id])
  })

  it("缺字段仍按 missing 返回，不与值域违规混淆", async () => {
    const response = await post({ ...validPayload(), author: "  " })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toMatchObject({ message: "缺少必要字段", missing: ["author"] })
  })
})
