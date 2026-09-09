import { shallowRef } from "vue"
import type { SubmissionEditTarget } from "@/types/archive"

/** 投稿弹窗是全局单例：头部按钮、`/submit` 深链与「我的投稿」的二次编辑共用同一份开关状态。 */
const isOpen = shallowRef(false)
/** 非空表示弹窗处于「编辑并重新提交」态；关闭时必须清掉，否则下次点「提交记录」还带着上次的编辑目标。 */
const editTarget = shallowRef<SubmissionEditTarget | null>(null)

export function useSubmissionDialog() {
  function open() {
    editTarget.value = null
    isOpen.value = true
  }

  /** 带着已有内容打开向导做「编辑并重新提交」。 */
  function openEdit(target: SubmissionEditTarget) {
    editTarget.value = target
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
    editTarget.value = null
  }

  return { isOpen, editTarget, open, openEdit, close }
}
