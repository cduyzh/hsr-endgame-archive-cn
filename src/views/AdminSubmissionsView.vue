<script setup lang="ts">
import { ClipboardCheck, LogOut, RefreshCw } from "lucide-vue-next"
import AdminLoginDialog from "@/components/admin/AdminLoginDialog.vue"
import AdminSubmissionCard from "@/components/admin/AdminSubmissionCard.vue"
import { useAdminSubmissions } from "@/composables/useAdminSubmissions"
import type { SubmissionReviewStatus } from "@/types/archive"

const statusOptions: Array<{ value: SubmissionReviewStatus | "all"; label: string }> = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
  { value: "all", label: "全部记录" },
]

const {
  session,
  statusFilter,
  loading,
  loginBusy,
  actingId,
  message,
  error,
  loginError,
  reviews,
  notes,
  login,
  logout,
  loadReviews,
  setStatusFilter,
  updateReview,
} = useAdminSubmissions()
</script>

<template>
  <main class="page-narrow admin-review-page">
    <div class="page-heading admin-page-heading">
      <div>
        <p class="eyebrow">投稿审核</p>
        <h1>管理员审核台</h1>
        <p>审核新投稿，并继续管理已经通过或驳回的记录。通过后记录会进入公开档案。</p>
      </div>
      <div v-if="session" class="admin-session-chip">
        <ClipboardCheck :size="17" aria-hidden="true" />
        <span><small>当前管理员</small>{{ session.username }}</span>
        <button type="button" aria-label="退出管理员登录" @click="logout">
          <LogOut :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>

    <template v-if="session">
      <section class="admin-toolbar" aria-label="审核状态筛选">
        <div class="admin-status-tabs" role="tablist" aria-label="审核状态">
          <button
            v-for="option in statusOptions"
            :key="option.value"
            type="button"
            role="tab"
            :aria-selected="statusFilter === option.value"
            :class="{ active: statusFilter === option.value }"
            @click="setStatusFilter(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <button class="icon-button" type="button" :disabled="loading" @click="loadReviews()">
          <RefreshCw :size="17" aria-hidden="true" />
          {{ loading ? "刷新中" : "刷新列表" }}
        </button>
      </section>

      <p v-if="message" class="form-message success">{{ message }}</p>
      <p v-if="error" class="form-message error">{{ error }}</p>

      <section class="review-list" aria-label="投稿审核列表">
        <div class="list-header">
          <h2>{{ statusOptions.find((option) => option.value === statusFilter)?.label }}</h2>
          <span>{{ reviews.length }} 条记录</span>
        </div>
        <div v-if="loading" class="system-message">正在读取审核列表...</div>
        <div v-else-if="reviews.length === 0" class="empty-state">暂无符合条件的投稿。</div>
        <AdminSubmissionCard
          v-for="review in reviews"
          v-else
          :key="review.id"
          :review="review"
          :note="notes[review.id] ?? ''"
          :acting="actingId === review.id"
          @update:note="notes[review.id] = $event"
          @review="updateReview(review.id, $event)"
        />
      </section>
    </template>

    <section v-else class="admin-locked-state" aria-label="管理员登录提示">
      <ClipboardCheck :size="28" aria-hidden="true" />
      <h2>审核台已锁定</h2>
      <p>请先在登录弹框中验证管理员账号。</p>
    </section>

    <AdminLoginDialog :open="!session" :busy="loginBusy" :error="loginError" @submit="login" />
  </main>
</template>
