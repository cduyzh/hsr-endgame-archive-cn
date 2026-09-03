import { defineStore } from "pinia"
import { computed, shallowRef } from "vue"
import { fetchArchiveConfig } from "@/services/archiveService"
import type { ArchiveConfig, ArchiveRun } from "@/types/archive"

/** 投稿弹窗「角色→高频光锥」统计兜底的样本上限，只用于本地聚合、不参与展示。 */
const MAX_PAIRING_RUNS = 500

export const useArchiveStore = defineStore("archive", () => {
  const config = shallowRef<ArchiveConfig | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const pairingRuns = shallowRef<ArchiveRun[]>([])

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

  /** 把每次筛选拿到的记录累积成跨阶段的配对样本，供投稿弹窗统计光锥偏好。 */
  function recordPairingRuns(runs: ArchiveRun[]) {
    if (runs.length === 0) return
    const seen = new Set<string>()
    const merged = [...runs, ...pairingRuns.value].filter((run) => {
      if (seen.has(run.id)) return false
      seen.add(run.id)
      return true
    })
    pairingRuns.value = merged.slice(0, MAX_PAIRING_RUNS)
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
    pairingRuns,
    loadConfig,
    recordPairingRuns,
  }
})
