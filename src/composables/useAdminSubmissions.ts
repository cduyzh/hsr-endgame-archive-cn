import { onMounted, readonly, ref, shallowRef } from "vue"
import {
  createAdminSession,
  fetchSubmissionReviews,
  reviewSubmission,
} from "@/services/archiveService"
import type { AdminSession, SubmissionReview, SubmissionReviewStatus } from "@/types/archive"

const SESSION_STORAGE_KEY = "hsr-admin-session"

function readStoredSession(): AdminSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_STORAGE_KEY)
    return value ? (JSON.parse(value) as AdminSession) : null
  } catch {
    return null
  }
}

export function useAdminSubmissions() {
  const session = shallowRef<AdminSession | null>(null)
  const statusFilter = shallowRef<SubmissionReviewStatus | "all">("pending")
  const loading = shallowRef(false)
  const loginBusy = shallowRef(false)
  const actingId = shallowRef("")
  const message = shallowRef("")
  const error = shallowRef("")
  const loginError = shallowRef("")
  const reviews = ref<SubmissionReview[]>([])
  const notes = ref<Record<string, string>>({})

  async function loadReviews(options: { silent?: boolean } = {}) {
    if (!session.value) return
    loading.value = true
    if (!options.silent) {
      message.value = ""
      error.value = ""
    }
    try {
      reviews.value = await fetchSubmissionReviews(session.value, statusFilter.value)
      notes.value = Object.fromEntries(reviews.value.map((review) => [review.id, review.reviewerNote ?? ""]))
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "审核列表读取失败。"
      error.value = nextError
      if (nextError.includes("账号或密码") || nextError.includes("登录已失效")) {
        loginError.value = "登录已失效，请重新登录。"
        logout()
      }
    } finally {
      loading.value = false
    }
  }

  async function login(credentials: { username: string; password: string }) {
    loginBusy.value = true
    loginError.value = ""
    const nextSession = createAdminSession(credentials.username, credentials.password)
    try {
      const nextReviews = await fetchSubmissionReviews(nextSession, statusFilter.value)
      session.value = nextSession
      reviews.value = nextReviews
      notes.value = Object.fromEntries(nextReviews.map((review) => [review.id, review.reviewerNote ?? ""]))
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
    } catch (err) {
      loginError.value = err instanceof Error ? err.message : "登录失败。"
    } finally {
      loginBusy.value = false
    }
  }

  function logout() {
    session.value = null
    reviews.value = []
    notes.value = {}
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  }

  async function setStatusFilter(status: SubmissionReviewStatus | "all") {
    if (statusFilter.value === status) return
    statusFilter.value = status
    await loadReviews()
  }

  async function updateReview(id: string, status: SubmissionReviewStatus) {
    if (!session.value) return
    actingId.value = id
    message.value = ""
    error.value = ""
    try {
      await reviewSubmission(id, status, notes.value[id] ?? "", session.value)
      await loadReviews({ silent: true })
      message.value =
        status === "approved" ? "已通过投稿并发布到档案。" : status === "rejected" ? "已驳回投稿。" : "已退回待审核。"
    } catch (err) {
      error.value = err instanceof Error ? err.message : "审核操作失败。"
    } finally {
      actingId.value = ""
    }
  }

  onMounted(async () => {
    const storedSession = readStoredSession()
    if (!storedSession) return
    session.value = storedSession
    await loadReviews({ silent: true })
  })

  return {
    session: readonly(session),
    statusFilter: readonly(statusFilter),
    loading: readonly(loading),
    loginBusy: readonly(loginBusy),
    actingId: readonly(actingId),
    message: readonly(message),
    error: readonly(error),
    loginError: readonly(loginError),
    reviews: readonly(reviews),
    notes,
    login,
    logout,
    loadReviews,
    setStatusFilter,
    updateReview,
  }
}
