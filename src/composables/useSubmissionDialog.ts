import { shallowRef } from "vue"

/** 投稿弹窗是全局单例：头部按钮与 `/submit` 深链共用同一份开关状态。 */
const isOpen = shallowRef(false)

export function useSubmissionDialog() {
  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, open, close }
}
