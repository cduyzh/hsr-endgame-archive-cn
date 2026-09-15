import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import AdminSubmissionCard from "@/components/admin/AdminSubmissionCard.vue"
import { fixtureSubmission } from "./fixtures/config"
import type { SubmissionReview, SubmissionReviewStatus } from "@/types/archive"

/**
 * 审核台卡片的展示口径与动作矩阵。
 * 阶段名必须走 stageLabelOf（seedConfig.bosses 恒为空，查它必然回落到原始 id），
 * withdrawn 是作者主动撤下的状态，不给「通过并发布」与「驳回」。
 */
function reviewOf(
  status: SubmissionReviewStatus,
  overrides: Partial<SubmissionReview> = {},
): SubmissionReview {
  return {
    id: "sub_1789000000000_test01",
    status,
    ownerToken: "own_test",
    reviewerNote: null,
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    reviewedAt: null,
    payload: fixtureSubmission({ mode: "aa", bossId: "4.5-aa-checkmate", category: "fullStars" }),
    ...overrides,
  }
}

function mountCard(status: SubmissionReviewStatus) {
  return mount(AdminSubmissionCard, {
    props: { review: reviewOf(status), note: "", acting: false },
  })
}

function buttonLabels(wrapper: ReturnType<typeof mountCard>) {
  return wrapper.findAll("button").map((button) => button.text().trim())
}

describe("AdminSubmissionCard", () => {
  it("阶段段展示赛季与展示词，不把原始阶段 id 印给用户", () => {
    const wrapper = mountCard("pending")
    const stage = wrapper.get("span[title='4.5-aa-checkmate']")

    expect(stage.text()).toBe("4.5 · 将杀")
    expect(wrapper.text()).not.toContain("4.5-aa-checkmate")
  })

  it("模式名仍取配置里的正式名", () => {
    expect(mountCard("pending").text()).toContain("异相仲裁")
  })

  it("withdrawn 显示「已撤回」，且只保留退回待审", () => {
    const wrapper = mountCard("withdrawn")
    const chip = wrapper.find(".review-status")

    expect(chip.classes()).toContain("withdrawn")
    expect(chip.text()).toBe("已撤回")
    expect(buttonLabels(wrapper)).toEqual(["退回待审"])
  })

  it("pending 给通过并发布与驳回，不给退回待审", () => {
    expect(buttonLabels(mountCard("pending"))).toEqual(["通过并发布", "驳回"])
  })

  it("四档状态各有独立文案", () => {
    const labels = (["pending", "approved", "rejected", "withdrawn"] as const).map(
      (status) => mountCard(status).find(".review-status").text(),
    )

    expect(labels).toEqual(["待审核", "已通过", "已驳回", "已撤回"])
  })
})
