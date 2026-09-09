/**
 * 剪贴板写入的唯一出口。
 *
 * 失败返回 `false` 而不抛错，调用方据此把按钮文案切成「复制失败」，不要静默停在「复制」。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof navigator === "undefined") return false
  return (await writeToClipboardApi(text)) || copyThroughTextarea(text)
}

async function writeToClipboardApi(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * 非安全上下文（http 域名、`navigator.clipboard` 为 undefined）与剪贴板权限被拒时的兜底。
 *
 * `display: none` 的元素选不中，所以只能定位出去 + 透明，不能用 display 隐藏。
 */
function copyThroughTextarea(text: string): boolean {
  if (typeof document === "undefined") return false
  const scratch = document.createElement("textarea")
  scratch.value = text
  scratch.setAttribute("readonly", "")
  scratch.style.position = "fixed"
  scratch.style.top = "0"
  scratch.style.opacity = "0"
  document.body.appendChild(scratch)
  try {
    scratch.select()
    scratch.setSelectionRange(0, text.length)
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    scratch.remove()
  }
}
