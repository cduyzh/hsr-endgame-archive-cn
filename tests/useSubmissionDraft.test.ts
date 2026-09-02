import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, nextTick, reactive, shallowRef } from "vue"
import {
  clearSubmissionDraft,
  isSubmissionDraftWorthy,
  loadSubmissionDraft,
  useSubmissionDraft,
} from "@/composables/useSubmissionDraft"
import { fixtureSubmission } from "./fixtures/config"
import type { SubmissionPayload } from "@/types/archive"

const DRAFT_KEY = "hsr-archive.submission-draft.v1"

function mountDraftWriter(payload: SubmissionPayload, baseline: SubmissionPayload) {
  const state = reactive({ payload })
  const stepIndex = shallowRef(0)
  const unlockedIndex = shallowRef(0)
  const wrapper = mount(
    defineComponent({
      setup() {
        return { ...useSubmissionDraft({ payload: state.payload, baseline, stepIndex, unlockedIndex }), stepIndex }
      },
      render: () => null,
    }),
  )
  return { wrapper, payload: state.payload, stepIndex }
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useSubmissionDraft", () => {
  it("偏离基线的表单会防抖写入草稿", async () => {
    const { payload, stepIndex } = mountDraftWriter(fixtureSubmission({ author: "" }), fixtureSubmission({ author: "" }))

    payload.author = "夜航"
    stepIndex.value = 1
    await nextTick()
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()

    vi.advanceTimersByTime(400)
    const draft = loadSubmissionDraft()
    expect(draft?.payload.author).toBe("夜航")
    expect(draft?.stepIndex).toBe(1)
    expect(draft?.savedAt).toBeTruthy()
  })

  it("与基线一致的表单不写盘，也不会覆盖已有草稿", async () => {
    const untouched = fixtureSubmission()
    const { stepIndex } = mountDraftWriter(untouched, fixtureSubmission())
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        payload: fixtureSubmission({ author: "旧草稿" }),
        stepIndex: 1,
        unlockedIndex: 2,
        savedAt: "2026-09-01T00:00:00.000Z",
      }),
    )

    // 默认表单本身带 score 40000，只有真的偏离基线才算草稿
    stepIndex.value = 2
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(loadSubmissionDraft()?.payload.author).toBe("旧草稿")
  })

  it("discard 会取消排队写入并清掉缓存", async () => {
    const { payload, wrapper } = mountDraftWriter(fixtureSubmission({ author: "" }), fixtureSubmission({ author: "" }))
    const { discard } = wrapper.vm as unknown as { discard: () => void }

    payload.author = "将被丢弃"
    await nextTick()
    discard()
    vi.advanceTimersByTime(400)

    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(loadSubmissionDraft()).toBeNull()
  })

  it("脏数据与非草稿形状一律读成 null", () => {
    window.localStorage.setItem(DRAFT_KEY, "{not json")
    expect(loadSubmissionDraft()).toBeNull()

    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ payload: { units: "x" }, savedAt: "2026-09-01T00:00:00.000Z" }))
    expect(loadSubmissionDraft()).toBeNull()

    window.localStorage.removeItem(DRAFT_KEY)
    expect(loadSubmissionDraft()).toBeNull()
  })

  it("clearSubmissionDraft 幂等，worthy 只认与基线的差异", () => {
    expect(() => clearSubmissionDraft()).not.toThrow()
    const baseline = fixtureSubmission()
    expect(isSubmissionDraftWorthy(baseline, fixtureSubmission())).toBe(false)
    expect(isSubmissionDraftWorthy(fixtureSubmission({ notes: "有备注" }), baseline)).toBe(true)
    expect(isSubmissionDraftWorthy(fixtureSubmission({ units: [] }), baseline)).toBe(true)
  })
})
