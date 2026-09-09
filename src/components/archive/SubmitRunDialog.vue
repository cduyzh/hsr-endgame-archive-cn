<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from "vue"
import { Send, X } from "lucide-vue-next"
import SubmitRunForm from "@/components/archive/SubmitRunForm.vue"
import { buildSuggestedLightconeByCharacter } from "@/services/submissionUtils"
import { useArchiveStore } from "@/stores/archiveStore"
import { useSubmissionDialog } from "@/composables/useSubmissionDialog"

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const archiveStore = useArchiveStore()
// 编辑目标与弹窗开关同属一个模块级单例，由「我的投稿」页写入；这里只负责透传。
const { editTarget } = useSubmissionDialog()
const closeButton = useTemplateRef<HTMLButtonElement>("closeButton")
const previouslyFocused = shallowRef<HTMLElement | null>(null)

const preferredLightconeByCharacter = computed(() =>
  archiveStore.config
    ? buildSuggestedLightconeByCharacter(archiveStore.pairingRuns, archiveStore.config.units)
    : {},
)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close")
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      previouslyFocused.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
      void archiveStore.loadConfig()
      document.body.classList.add("is-modal-open")
      document.addEventListener("keydown", handleKeydown)
      window.setTimeout(() => closeButton.value?.focus(), 0)
      return
    }

    document.body.classList.remove("is-modal-open")
    document.removeEventListener("keydown", handleKeydown)
    previouslyFocused.value?.focus()
    previouslyFocused.value = null
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.body.classList.remove("is-modal-open")
  document.removeEventListener("keydown", handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-backdrop submit-dialog-backdrop"
      @click.self="emit('close')"
    >
      <section
        class="submit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-dialog-title"
      >
        <header class="submit-dialog-header">
          <div
            class="submit-dialog-mark"
            aria-hidden="true"
          >
            <Send :size="20" />
          </div>
          <div class="submit-dialog-heading">
            <p class="eyebrow">
              {{ editTarget ? "// 编辑并重新提交" : "// 投稿到竞速档案" }}
            </p>
            <h2 id="submit-dialog-title">
              {{ editTarget ? "修改这条竞速记录" : "提交一条竞速记录" }}
            </h2>
          </div>
          <span class="submission-state-chip">{{ editTarget ? "需再次审核" : "投稿开放中" }}</span>
          <button
            ref="closeButton"
            class="submit-dialog-close"
            type="button"
            aria-label="关闭投稿面板"
            @click="emit('close')"
          >
            <X :size="17" />
          </button>
        </header>

        <div class="submit-dialog-body">
          <div
            v-if="archiveStore.loading"
            class="system-message"
          >
            正在装载配置...
          </div>
          <div
            v-else-if="archiveStore.error"
            class="system-message error"
          >
            {{ archiveStore.error }}
          </div>
          <SubmitRunForm
            v-else-if="archiveStore.config"
            :config="archiveStore.config"
            :preferred-lightcone-by-character="preferredLightconeByCharacter"
            :edit-target="editTarget"
            @close="emit('close')"
          />
        </div>
      </section>
    </div>
  </Teleport>
</template>
