import { afterEach, describe, expect, it, vi } from "vitest"
import { submitRun } from "@/services/archiveService"
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
