import { computed, shallowRef, watch } from "vue"
import { fetchRuns } from "@/services/archiveService"
import type { ArchiveFilters, ArchiveRun } from "@/types/archive"

export function useRunsQuery(filters: ArchiveFilters) {
  const runs = shallowRef<ArchiveRun[]>([])
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)

  async function loadRuns() {
    if (!filters.seasonId || !filters.bossId) return
    loading.value = true
    error.value = null
    try {
      runs.value = await fetchRuns(filters)
    } catch (err) {
      error.value = err instanceof Error ? err.message : "记录加载失败"
      runs.value = []
    } finally {
      loading.value = false
    }
  }

  watch(
    () => ({ ...filters, flags: [...filters.flags], selected: [...filters.selectedUnitIds] }),
    () => void loadRuns(),
    { immediate: true, deep: true },
  )

  const groupedRuns = computed(() => {
    if (!filters.grouping) return runs.value.map((run) => ({ key: run.id, label: run.teamName, runs: [run] }))

    const groups = new Map<string, ArchiveRun[]>()
    for (const run of runs.value) {
      const list = groups.get(run.teamName) ?? []
      list.push(run)
      groups.set(run.teamName, list)
    }

    return [...groups.entries()].map(([label, list]) => ({
      key: label,
      label,
      runs: list,
    }))
  })

  return {
    runs,
    groupedRuns,
    loading,
    error,
    reload: loadRuns,
  }
}
