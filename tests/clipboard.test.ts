import { afterEach, describe, expect, it, vi } from "vitest"
import { copyTextToClipboard } from "@/services/clipboard"

/** jsdom 的 Navigator 上没有 clipboard，只能按用例挂一个可删除的自有属性。 */
function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(window.navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
    writable: true,
  })
}

/** jsdom 也没实现 execCommand，兜底路径要自己给一个返回值可控的桩。 */
function stubExecCommand(result: boolean) {
  const spy = vi.fn(() => result)
  document.execCommand = spy
  return spy
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "clipboard")
  Reflect.deleteProperty(document, "execCommand")
  vi.restoreAllMocks()
})

describe("copyTextToClipboard", () => {
  it("剪贴板 API 可用时直接写入，不碰 DOM", async () => {
    const writeText = vi.fn(async () => undefined)
    stubClipboard(writeText)
    const bodyChildren = document.body.children.length

    await expect(copyTextToClipboard("cduyzh")).resolves.toBe(true)

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith("cduyzh")
    expect(document.body.children.length).toBe(bodyChildren)
  })

  it("writeText 抛错时回落 execCommand，并清掉临时 textarea", async () => {
    stubClipboard(
      vi.fn(async () => {
        throw new Error("NotAllowedError")
      }),
    )
    const execCommand = stubExecCommand(true)

    await expect(copyTextToClipboard("cduyzh@gmail.com")).resolves.toBe(true)

    expect(execCommand).toHaveBeenCalledWith("copy")
    expect(document.querySelector("textarea")).toBeNull()
  })

  it("非安全上下文没有 navigator.clipboard，直接走兜底", async () => {
    const writeText = vi.fn(async () => undefined)
    stubClipboard(undefined)
    const execCommand = stubExecCommand(true)

    await expect(copyTextToClipboard("cduyzh")).resolves.toBe(true)

    expect(writeText).not.toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalled()
  })

  it("兜底也被拒时返回 false，交由调用方提示", async () => {
    stubClipboard(undefined)
    stubExecCommand(false)

    await expect(copyTextToClipboard("cduyzh")).resolves.toBe(false)
  })

  it("空文本不写剪贴板也不建节点", async () => {
    const writeText = vi.fn(async () => undefined)
    stubClipboard(writeText)
    const execCommand = stubExecCommand(true)
    const bodyChildren = document.body.children.length

    await expect(copyTextToClipboard("")).resolves.toBe(false)

    expect(writeText).not.toHaveBeenCalled()
    expect(execCommand).not.toHaveBeenCalled()
    expect(document.body.children.length).toBe(bodyChildren)
  })
})
