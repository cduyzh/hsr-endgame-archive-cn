import { beforeEach, describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { useAdminSubmissions } from "@/composables/useAdminSubmissions"
import { createAdminSession, fetchSubmissionReviews, reviewSubmission } from "@/services/archiveService"
import type { SubmissionReview } from "@/types/archive"
import { fixtureSubmission } from "./fixtures/config"

/**
 * D4：审核备注框是拉取时从服务端 `reviewerNote` 水合的，而任何状态变更都会把当前备注一并发送，
 * 于是「先驳回 → 再通过」会把上一次的驳回原因原样带回并通过——公开档案里挂着一条已通过记录配一句驳回理由。
 * 修法是：通过时若备注与服务端原值一致（管理员没动过），就不发送；管理员新写过的照常发送。
 */
vi.mock("@/services/archiveService", () => ({
  createAdminSession: vi.fn(),
  fetchSubmissionReviews: vi.fn(),
  reviewSubmission: vi.fn(async () => undefined),
}))

function reviewOf(overrides: Partial<SubmissionReview> = {}): SubmissionReview {
  return {
    id: "sub_rejected_1",
    status: "rejected",
    ownerToken: "own_rejected_1",
    reviewerNote: "轮次填错了",
    hidden: false,
    revisesId: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    reviewedAt: "2026-09-12T12:00:00.000Z",
    payload: fixtureSubmission(),
    ...overrides,
  }
}

/** composable 里有 onMounted，必须挂在组件实例上跑。 */
function setup() {
  let api!: ReturnType<typeof useAdminSubmissions>
  mount({
    setup() {
      api = useAdminSubmissions()
      return () => null
    },
  })
  return api
}

const mockedSession = vi.mocked(createAdminSession)
const mockedFetch = vi.mocked(fetchSubmissionReviews)
const mockedReview = vi.mocked(reviewSubmission)

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mockedSession.mockReturnValue({ username: "审核员", authorization: "Basic dGVzdDp0ZXN0" })
  mockedFetch.mockResolvedValue([reviewOf()])
})

async function loggedIn() {
  const api = setup()
  await api.login({ username: "审核员", password: "pw" })
  return api
}

describe("审核备注的发送口径", () => {
  it("拉取后用服务端备注水合输入框", async () => {
    const api = await loggedIn()
    expect(api.notes.value["sub_rejected_1"]).toBe("轮次填错了")
  })

  it("改判通过时不带回未改动的旧驳回原因", async () => {
    const api = await loggedIn()
    await api.updateReview("sub_rejected_1", "approved")

    expect(mockedReview).toHaveBeenCalledWith("sub_rejected_1", "approved", "", expect.anything())
  })

  it("管理员新写过的备注在通过时照常发送", async () => {
    const api = await loggedIn()
    api.notes.value["sub_rejected_1"] = "已复核录像，成绩有效"
    await api.updateReview("sub_rejected_1", "approved")

    expect(mockedReview).toHaveBeenCalledWith(
      "sub_rejected_1",
      "approved",
      "已复核录像，成绩有效",
      expect.anything(),
    )
  })

  it("驳回与退回待审仍带上备注，驳回原因不会被吞", async () => {
    const api = await loggedIn()
    await api.updateReview("sub_rejected_1", "rejected")
    expect(mockedReview).toHaveBeenCalledWith("sub_rejected_1", "rejected", "轮次填错了", expect.anything())

    await api.updateReview("sub_rejected_1", "pending")
    expect(mockedReview).toHaveBeenLastCalledWith("sub_rejected_1", "pending", "轮次填错了", expect.anything())
  })

  it("重新拉取后基线跟着刷新，不会把新备注当成旧值丢掉", async () => {
    const api = await loggedIn()
    mockedFetch.mockResolvedValue([reviewOf({ reviewerNote: "已复核录像，成绩有效" })])
    await api.loadReviews()
    await api.updateReview("sub_rejected_1", "approved")

    expect(mockedReview).toHaveBeenCalledWith("sub_rejected_1", "approved", "", expect.anything())
  })
})
