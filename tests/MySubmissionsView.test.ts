import { beforeEach, describe, expect, it, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { createMemoryHistory, createRouter } from "vue-router"
import MySubmissionsView from "@/views/MySubmissionsView.vue"
import { useSubmissionDialog } from "@/composables/useSubmissionDialog"
import { fixtureSubmission } from "./fixtures/config"
import type { SubmissionReview, SubmissionReviewStatus } from "@/types/archive"

const Blank = { template: "<div />" }
const routes = [
  { path: "/", component: Blank },
  { path: "/contact", component: Blank },
]

/**
 * 「我的投稿」页的动作矩阵与收纳交互。
 * 后端行为在 tests/submissionSelfService.test.ts 里守，这里只守「哪个状态给哪些按钮、点了发什么请求」。
 */
const MEMORY_KEY = "hsr-archive.submission-memory.v1"

function reviewOf(
  id: string,
  status: SubmissionReviewStatus,
  overrides: Partial<SubmissionReview> = {},
): SubmissionReview {
  return {
    id,
    status,
    ownerToken: `own_${id}`,
    reviewerNote: null,
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-05T10:00:00.000Z",
    reviewedAt: null,
    payload: fixtureSubmission({ teamName: `队伍 ${id}` }),
    ...overrides,
  }
}

let reviewRows: SubmissionReview[] = []

function fetchMock() {
  return vi.fn(async (input: unknown, init?: { body?: string }) => {
    const url = String(input)
    if (url.includes("/api/submissions/me")) {
      const body = JSON.parse(init?.body ?? "{}") as { includeHidden?: boolean }
      const reviews = body.includeHidden
        ? reviewRows
        : reviewRows.filter((row) => !row.hidden && !reviewRows.some((parent) => parent.hidden && (row.revisesId ?? row.id) === parent.id))
      const hiddenRoots = new Set(
        reviewRows.filter((row) => row.hidden).map((row) => row.revisesId ?? row.id),
      )
      return Response.json({ reviews, runs: [], hiddenCount: hiddenRoots.size })
    }
    return Response.json({ id: "ok", status: "withdrawn", hidden: true, deleted: true })
  })
}

function mountView() {
  return mount(MySubmissionsView, {
    attachTo: document.body,
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes })] },
  })
}

function buttonByText(wrapper: ReturnType<typeof mountView>, text: string) {
  return wrapper.findAll("button").find((node) => node.text().includes(text))
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  reviewRows = []
})

describe("我的投稿的动作矩阵", () => {
  it("已驳回给「编辑并重新提交 / 隐藏展示 / 删除记录」，不再给撤回", async () => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ author: "", presets: [], tokens: ["own_sub_rejected"] }))
    reviewRows = [reviewOf("sub_rejected", "rejected")]
    vi.stubGlobal("fetch", fetchMock())
    const wrapper = mountView()
    await flushPromises()

    const texts = wrapper.findAll("button").map((node) => node.text())
    expect(texts.some((text) => text.includes("编辑并重新提交"))).toBe(true)
    expect(texts.some((text) => text.includes("隐藏展示"))).toBe(true)
    expect(texts.some((text) => text.includes("删除记录"))).toBe(true)
    expect(texts.some((text) => text.includes("撤回该记录"))).toBe(false)
  })

  it("已通过给编辑与撤回但不给删除；待审只给撤回；已撤回只给隐藏", async () => {
    localStorage.setItem(
      MEMORY_KEY,
      JSON.stringify({ author: "", presets: [], tokens: ["own_sub_approved", "own_sub_pending", "own_sub_withdrawn"] }),
    )
    reviewRows = [
      reviewOf("sub_approved", "approved"),
      reviewOf("sub_pending", "pending"),
      reviewOf("sub_withdrawn", "withdrawn"),
    ]
    vi.stubGlobal("fetch", fetchMock())
    const wrapper = mountView()
    await flushPromises()

    const cards = wrapper.findAll(".my-submission-card")
    expect(cards).toHaveLength(3)
    const [approved, pending, withdrawn] = cards.map((card) =>
      card.findAll("button").map((node) => node.text()),
    )
    expect(approved.some((text) => text.includes("编辑并重新提交"))).toBe(true)
    expect(approved.some((text) => text.includes("撤回该记录"))).toBe(true)
    expect(approved.some((text) => text.includes("删除记录"))).toBe(false)
    expect(approved.some((text) => text.includes("隐藏展示"))).toBe(false)

    expect(pending.some((text) => text.includes("撤回该记录"))).toBe(true)
    expect(pending.some((text) => text.includes("编辑并重新提交"))).toBe(false)

    expect(withdrawn.some((text) => text.includes("隐藏展示"))).toBe(true)
    expect(withdrawn.some((text) => text.includes("撤回该记录"))).toBe(false)
    expect(
      wrapper.findAll(".my-submission-card-foot-hint").some((node) => node.text().includes("已撤回")),
    ).toBe(true)
  })
})

describe("删除记录的就地两步确认", () => {
  it("第一次点击只展开确认条，第二次才发 DELETE", async () => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ author: "", presets: [], tokens: ["own_sub_rejected"] }))
    reviewRows = [reviewOf("sub_rejected", "rejected")]
    const fetch = fetchMock()
    vi.stubGlobal("fetch", fetch)
    const wrapper = mountView()
    await flushPromises()
    fetch.mockClear()

    await buttonByText(wrapper, "删除记录")!.trigger("click")
    await flushPromises()
    expect(wrapper.find(".my-submission-confirm").text()).toContain("无法恢复")
    expect(fetch).not.toHaveBeenCalled()

    await buttonByText(wrapper, "确认删除")!.trigger("click")
    await flushPromises()
    const deleteCall = fetch.mock.calls.find(([url]) => String(url).endsWith("/api/submissions/sub_rejected/delete"))
    expect(deleteCall).toBeTruthy()
    expect(deleteCall![1]).toMatchObject({ method: "DELETE" })
    // 确认条执行完就收起
    expect(wrapper.find(".my-submission-confirm").exists()).toBe(false)
  })

  it("取消会收起确认条且不发请求", async () => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ author: "", presets: [], tokens: ["own_sub_rejected"] }))
    reviewRows = [reviewOf("sub_rejected", "rejected")]
    const fetch = fetchMock()
    vi.stubGlobal("fetch", fetch)
    const wrapper = mountView()
    await flushPromises()
    fetch.mockClear()

    await buttonByText(wrapper, "删除记录")!.trigger("click")
    await buttonByText(wrapper, "取消")!.trigger("click")
    await flushPromises()
    expect(wrapper.find(".my-submission-confirm").exists()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("隐藏收纳与修订折叠", () => {
  it("默认不展示已隐藏的记录，工具条给出「已隐藏 N 条」，展开时按 includeHidden 重拉", async () => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ author: "", presets: [], tokens: ["own_sub_hidden"] }))
    reviewRows = [reviewOf("sub_hidden", "rejected", { hidden: true })]
    const fetch = fetchMock()
    vi.stubGlobal("fetch", fetch)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll(".my-submission-card")).toHaveLength(0)
    const toggle = buttonByText(wrapper, "已隐藏 1 条")
    expect(toggle).toBeTruthy()

    fetch.mockClear()
    await toggle!.trigger("click")
    await flushPromises()
    const meCall = fetch.mock.calls.find(([url]) => String(url).includes("/api/submissions/me"))
    expect(JSON.parse((meCall![1] as { body: string }).body).includeHidden).toBe(true)
    expect(wrapper.findAll(".my-submission-card")).toHaveLength(1)
    expect(wrapper.find(".my-submission-status").text()).toContain("已隐藏")
    expect(buttonByText(wrapper, "取消隐藏")).toBeTruthy()
  })

  it("修订折叠进原投稿卡片，不重复出卡，并给出待审修订的撤回入口", async () => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ author: "", presets: [], tokens: ["own_sub_parent"] }))
    reviewRows = [
      reviewOf("sub_rev", "pending", { revisesId: "sub_parent", createdAt: "2026-09-06T10:00:00.000Z" }),
      reviewOf("sub_parent", "approved", { reviewerNote: null }),
    ]
    vi.stubGlobal("fetch", fetchMock())
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll(".my-submission-card")).toHaveLength(1)
    expect(wrapper.find(".my-submission-revision").text()).toContain("修订待审核")
    expect(buttonByText(wrapper, "撤回修订")).toBeTruthy()
  })

  it("点「编辑并重新提交」会把原内容作为编辑目标交给投稿弹窗", async () => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ author: "", presets: [], tokens: ["own_sub_rejected"] }))
    reviewRows = [reviewOf("sub_rejected", "rejected")]
    vi.stubGlobal("fetch", fetchMock())
    const wrapper = mountView()
    await flushPromises()

    const { editTarget } = useSubmissionDialog()
    await buttonByText(wrapper, "编辑并重新提交")!.trigger("click")

    expect(editTarget.value).toMatchObject({
      parentId: "sub_rejected",
      token: "own_sub_rejected",
      origin: "rejected",
      excludeIds: ["sub_rejected"],
    })
    expect(editTarget.value?.payload.teamName).toBe("队伍 sub_rejected")
  })
})
