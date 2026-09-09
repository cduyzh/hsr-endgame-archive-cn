import { afterEach, describe, expect, it, vi } from "vitest"
import {
  checkDuplicateVideo,
  deleteSubmission,
  listMySubmissions,
  setSubmissionHidden,
  submitRevision,
  submitRun,
  SubmissionDuplicateError,
  withdrawSubmission,
} from "@/services/archiveService"
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
    await expect(submitRun(fixtureSubmission())).rejects.toThrow("提交失败，请稍后重试；反复失败请在顶部导航的「联系」页找到站主。")
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

describe("checkDuplicateVideo 的 excludeIds", () => {
  it("编辑并重新提交时把同家族 id 拼进 query，空数组不进 query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respondWith(200, JSON.stringify({ matches: [] })))
    vi.stubGlobal("fetch", fetchMock)

    await checkDuplicateVideo({
      videoUrl: "https://bilibili.com/video/BV1xx411c7mD",
      bossId: "4.5-moc-top",
      excludeIds: ["sub_parent", "sub_rev"],
    })
    expect(String(fetchMock.mock.calls[0][0])).toContain("excludeIds=sub_parent%2Csub_rev")

    await checkDuplicateVideo({
      videoUrl: "https://bilibili.com/video/BV1xx411c7mD",
      bossId: "4.5-moc-top",
      excludeIds: [],
    })
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("excludeIds")
  })
})

describe("我的投稿的自助接口", () => {
  it("隐藏开关与硬删都打到各自的端点并回传结果", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respondWith(200, JSON.stringify({ id: "sub_1", hidden: true })))
    vi.stubGlobal("fetch", fetchMock)

    await expect(setSubmissionHidden("sub 1", "own_x", true)).resolves.toEqual({ id: "sub_1", hidden: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: string }]
    expect(url).toBe("/api/submissions/sub%201/visibility")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body)).toEqual({ token: "own_x", hidden: true })

    const deleteMock = vi.fn().mockResolvedValue(respondWith(200, JSON.stringify({ id: "sub_1", deleted: true })))
    vi.stubGlobal("fetch", deleteMock)
    await expect(deleteSubmission("sub_1", "own_x")).resolves.toEqual({ id: "sub_1", deleted: true })
    const [deleteUrl, deleteInit] = deleteMock.mock.calls[0] as unknown as [string, { method: string; body: string }]
    expect(deleteUrl).toBe("/api/submissions/sub_1/delete")
    expect(deleteInit.method).toBe("DELETE")
    expect(JSON.parse(deleteInit.body)).toEqual({ token: "own_x" })
  })

  it("服务端给出的中文 message 原样抛出，交给页面直接展示", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(400, JSON.stringify({ message: "只有已驳回的记录可以删除" }))))
    await expect(deleteSubmission("sub_1", "own_x")).rejects.toThrow("只有已驳回的记录可以删除")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(403, JSON.stringify({ message: "凭证不匹配" }))))
    await expect(setSubmissionHidden("sub_1", "own_x", true)).rejects.toThrow("凭证不匹配")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respondWith(500, "")))
    await expect(withdrawSubmission("sub_1", "own_x")).rejects.toThrow("撤回失败，请稍后重试。")
    await expect(deleteSubmission("sub_1", "own_x")).rejects.toThrow("删除失败，请稍后重试。")
  })

  it("修订提交复用投稿的失败口径：409 还原成查重异常", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respondWith(409, JSON.stringify({ message: DUPLICATE_VIDEO_MESSAGE, duplicate: { matches: [{ id: "sub_rival" }] } })),
      ),
    )
    const error = await submitRevision("sub_parent", "own_x", fixtureSubmission()).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(SubmissionDuplicateError)
    expect((error as SubmissionDuplicateError).matches).toEqual([{ id: "sub_rival" }])

    const fetchMock = vi.fn().mockResolvedValue(respondWith(202, JSON.stringify({ id: "sub_rev", status: "pending" })))
    vi.stubGlobal("fetch", fetchMock)
    await expect(submitRevision("sub_parent", "own_x", fixtureSubmission())).resolves.toMatchObject({ id: "sub_rev" })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: string }]
    expect(url).toBe("/api/submissions/sub_parent/revisions")
    expect(init.method).toBe("POST")
    // 排除哪些 id 由服务端按 revises_id 自己算，不接受客户端传值
    expect(JSON.parse(init.body)).toEqual({ token: "own_x", payload: fixtureSubmission() })
  })

  it("listMySubmissions 带上 includeHidden，并把缺字段的旧响应归一", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respondWith(200, JSON.stringify({ reviews: [{ id: "sub_1" }] })))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listMySubmissions(["own_x"], { includeHidden: true })).resolves.toEqual({
      reviews: [{ id: "sub_1" }],
      runs: [],
      hiddenCount: 0,
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(JSON.parse(init.body)).toEqual({ tokens: ["own_x"], includeHidden: true })

    // 无凭证时不发请求
    const idleMock = vi.fn()
    vi.stubGlobal("fetch", idleMock)
    await expect(listMySubmissions([])).resolves.toEqual({ reviews: [], runs: [], hiddenCount: 0 })
    expect(idleMock).not.toHaveBeenCalled()
  })
})
