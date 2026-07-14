import { shallowRef, watch } from "vue"
import { fetchMetaStats } from "@/services/archiveService"
import type { ArchiveFilters, MetaStats } from "@/types/archive"

export function useMetaStats(filters: ArchiveFilters) {
  const stats = shallowRef<MetaStats | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)

  async function loadStats() {
    if (!filters.seasonId || !filters.bossId) return
    loading.value = true
    error.value = null
    try {
      stats.value = await fetchMetaStats(filters)
    } catch (err) {
      error.value = err instanceof Error ? err.message : "统计加载失败"
      stats.value = null
    } finally {
      loading.value = false
    }
  }

  watch(
    () => [filters.seasonId, filters.mode, filters.bossId, filters.category, filters.cost],
    () => void loadStats(),
    { immediate: true },
  )

  return {
    stats,
    loading,
    error,
    reload: loadStats,
  }
}
