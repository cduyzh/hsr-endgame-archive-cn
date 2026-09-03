import { afterEach, describe, expect, it, vi } from "vitest"
import { checkDuplicateVideo, submitRun, SubmissionDuplicateError } from "@/services/archiveService"
import { DUPLICATE_VIDEO_MESSAGE } from "@/services/videoUrl"
import { fixtureSubmission } from "./fixtures/config"

function respondWith(status: number, bodyText: string) {
  return new Response(bodyText, {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("submitRun", () => {
  it("成功时返回投稿编号与状态", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(202, JSON.stringify({ id: "sub_1", status: "pending" }))))

    await expect(submitRun(fixtureSubmission())).resolves.toEqual({ id: "sub_1", status: "pending" })
  })

  it("把服务端的 missing 字段翻译成可读中文", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respondWith(400, JSON.stringify({ message: "缺少必要字段", missing: ["author", "videoUrl"] }))),
    )

    await expect(submitRun(fixtureSubmission())).rejects.toThrow("缺少必要字段：作者、视频链接。")
  })

  it("未知字段名与非法响应体都有兜底文案", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(400, JSON.stringify({ missing: ["weirdField"] }))))
    await expect(submitRun(fixtureSubmission())).rejects.toThrow("缺少必要字段：weirdField。")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(502, "<html>bad gateway</html>")))
    await expect(submitRun(fixtureSubmission())).rejects.toThrow("提交失败，请稍后重试或联系管理员。")
  })
})

describe("checkDuplicateVideo", () => {
  const videoUrl = "https://bilibili.com/video/BV1xx411c7mD"
  const matched = {
    id: "sub_1",
    source: "submission",
    status: "pending",
    author: "夜航",
    teamName: "大黑塔双同谐",
    bossId: "4.5-moc-top",
    category: "fullStars",
    videoUrl,
    submittedAt: "2026-09-03T00:00:00.000Z",
  }

  it("命中时带上视频链接与敌方阶段查询并返回摘要", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respondWith(200, JSON.stringify({ duplicate: true, matches: [matched] })))
    vi.stubGlobal("fetch", fetchMock)

    await expect(checkDuplicateVideo({ videoUrl, bossId: "4.5-moc-top" })).resolves.toEqual([matched])

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain("/api/submissions/check?")
    expect(url).toContain("bossId=4.5-moc-top")
    expect(decodeURIComponent(url)).toContain(`videoUrl=${videoUrl}`)
  })

  it("网络异常、非 2xx 与响应体不合形状都放行", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    await expect(checkDuplicateVideo({ videoUrl, bossId: "4.5-moc-top" })).resolves.toEqual([])

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(500, "<html>boom</html>")))
    await expect(checkDuplicateVideo({ videoUrl, bossId: "4.5-moc-top" })).resolves.toEqual([])

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(200, JSON.stringify({ matches: "not-an-array" }))))
    await expect(checkDuplicateVideo({ videoUrl, bossId: "4.5-moc-top" })).resolves.toEqual([])
  })

  it("链接或敌方阶段缺失时不发请求", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(checkDuplicateVideo({ videoUrl: "   ", bossId: "4.5-moc-top" })).resolves.toEqual([])
    await expect(checkDuplicateVideo({ videoUrl, bossId: "" })).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("submitRun 的查重拦截", () => {
  it("409 抛出带命中记录的 SubmissionDuplicateError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respondWith(409, JSON.stringify({ message: DUPLICATE_VIDEO_MESSAGE, duplicate: { matches: [{ id: "sub_9" }] } })),
      ),
    )

    const error = await submitRun(fixtureSubmission()).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(SubmissionDuplicateError)
    expect((error as SubmissionDuplicateError).message).toContain("请勿重复提交")
    expect((error as SubmissionDuplicateError).matches).toEqual([{ id: "sub_9" }])
  })

  it("409 缺少文案时用前后端共用的提示兜底", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(409, JSON.stringify({ duplicate: { matches: [] } }))))

    await expect(submitRun(fixtureSubmission())).rejects.toThrow(DUPLICATE_VIDEO_MESSAGE)
  })
})
