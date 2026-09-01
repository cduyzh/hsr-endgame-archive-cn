<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import { useSubmissionDialog } from "@/composables/useSubmissionDialog"

const router = useRouter()
const { open: openSubmitDialog } = useSubmissionDialog()

onMounted(() => {
  openSubmitDialog()
  void router.replace("/")
})
</script>

<template>
  <main class="page-narrow">
    <div class="system-message">
      正在打开投稿面板...
    </div>
  </main>
</template>
