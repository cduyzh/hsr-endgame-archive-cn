import { defineStore } from "pinia"
import { computed, shallowRef } from "vue"
import { fetchArchiveConfig } from "@/services/archiveService"
import type { ArchiveConfig } from "@/types/archive"

export const useArchiveStore = defineStore("archive", () => {
  const config = shallowRef<ArchiveConfig | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)

  const seasons = computed(() => config.value?.seasons ?? [])
  const modes = computed(() => config.value?.modes ?? [])
  const bosses = computed(() => config.value?.bosses ?? [])
  const units = computed(() => config.value?.units ?? [])
  const articles = computed(() => config.value?.articles ?? [])

  async function loadConfig() {
    if (config.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      config.value = await fetchArchiveConfig()
    } catch (err) {
      error.value = err instanceof Error ? err.message : "配置加载失败"
    } finally {
      loading.value = false
    }
  }

  return {
    config,
    loading,
    error,
    seasons,
    modes,
    bosses,
    units,
    articles,
    loadConfig,
  }
})
