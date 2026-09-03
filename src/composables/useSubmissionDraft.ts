import { onScopeDispose, watch, type Ref } from "vue"
import type { SubmissionPayload } from "@/types/archive"

/** payload 形状变化时换键名即可，不做历史迁移。 */
const DRAFT_KEY = "hsr-archive.submission-draft.v2"
const SAVE_DEBOUNCE_MS = 400

export interface SubmissionDraft {
  payload: SubmissionPayload
  stepIndex: number
  unlockedIndex: number
  savedAt: string
}

function draftStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isDraftLike(value: unknown): value is SubmissionDraft {
  const draft = value as SubmissionDraft | null
  return Boolean(
    draft?.payload &&
      typeof draft.payload === "object" &&
      Array.isArray(draft.payload.units) &&
      Array.isArray(draft.payload.lightcones) &&
      typeof draft.savedAt === "string",
  )
}

export function loadSubmissionDraft(): SubmissionDraft | null {
  const raw = draftStorage()?.getItem(DRAFT_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isDraftLike(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearSubmissionDraft() {
  try {
    draftStorage()?.removeItem(DRAFT_KEY)
  } catch {
    /* 隐私模式下写不进去，清不掉也无需处理 */
  }
}

/** 与初始基线一致就不算草稿：默认值本身带 score/cycle 等预设，逐字段判断会把重置后的空表单误判成有内容。 */
export function isSubmissionDraftWorthy(payload: SubmissionPayload, baseline: SubmissionPayload): boolean {
  return JSON.stringify(payload) !== JSON.stringify(baseline)
}

function writeSubmissionDraft(draft: SubmissionDraft) {
  try {
    draftStorage()?.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* 配额或隐私模式写入失败时静默降级为不缓存 */
  }
}

export function useSubmissionDraft(options: {
  payload: SubmissionPayload
  baseline: SubmissionPayload
  stepIndex: Ref<number>
  unlockedIndex: Ref<number>
}) {
  const { payload, baseline, stepIndex, unlockedIndex } = options
  let timer: number | undefined

  watch([payload, stepIndex, unlockedIndex], () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (!isSubmissionDraftWorthy(payload, baseline)) return
      writeSubmissionDraft({
        payload,
        stepIndex: stepIndex.value,
        unlockedIndex: unlockedIndex.value,
        savedAt: new Date().toISOString(),
      })
    }, SAVE_DEBOUNCE_MS)
  })

  onScopeDispose(() => window.clearTimeout(timer))

  return {
    discard: () => {
      window.clearTimeout(timer)
      clearSubmissionDraft()
    },
  }
}
