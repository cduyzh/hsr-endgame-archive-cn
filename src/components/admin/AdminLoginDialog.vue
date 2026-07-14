<script setup lang="ts">
import { reactive, useTemplateRef, watch } from "vue"
import { KeyRound, LogIn, ShieldCheck } from "lucide-vue-next"

const props = defineProps<{
  open: boolean
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  submit: [credentials: { username: string; password: string }]
}>()

const form = reactive({ username: "admin", password: "" })
const usernameInput = useTemplateRef<HTMLInputElement>("usernameInput")

watch(
  () => props.open,
  (open) => {
    if (open) window.setTimeout(() => usernameInput.value?.focus(), 0)
  },
  { immediate: true },
)

function submit() {
  if (!form.username.trim() || !form.password) return
  emit("submit", { username: form.username.trim(), password: form.password })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-backdrop admin-login-backdrop"
    >
      <form
        class="admin-login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-title"
        @submit.prevent="submit"
      >
        <div
          class="admin-login-mark"
          aria-hidden="true"
        >
          <ShieldCheck :size="28" />
        </div>
        <div class="admin-login-heading">
          <p class="eyebrow">
            管理员入口
          </p>
          <h2 id="admin-login-title">
            登录投稿审核台
          </h2>
          <p>使用部署环境中配置的管理员账号和密码登录。</p>
        </div>

        <label class="field">
          <span>管理员账号</span>
          <input
            ref="usernameInput"
            v-model.trim="form.username"
            type="text"
            autocomplete="username"
            placeholder="admin"
          >
        </label>
        <label class="field">
          <span>管理员密码</span>
          <div class="admin-password-field">
            <KeyRound
              :size="16"
              aria-hidden="true"
            />
            <input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              placeholder="请输入管理员密码"
            >
          </div>
        </label>

        <p
          v-if="error"
          class="form-message error"
          role="alert"
        >
          {{ error }}
        </p>
        <button
          class="icon-button primary-action admin-login-submit"
          type="submit"
          :disabled="busy || !form.username.trim() || !form.password"
        >
          <LogIn
            :size="17"
            aria-hidden="true"
          />
          {{ busy ? "登录验证中" : "登录审核台" }}
        </button>
      </form>
    </div>
  </Teleport>
</template>
