<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue"
import { BarChart3, FilePlus2, SlidersHorizontal, Sparkles, X } from "lucide-vue-next"
import ArchiveDispatchPanel from "@/components/archive/ArchiveDispatchPanel.vue"
import BossPanel from "@/components/archive/BossPanel.vue"
import MetaReportPanel from "@/components/archive/MetaReportPanel.vue"
import ModeSeasonFilter from "@/components/archive/ModeSeasonFilter.vue"
import RunGroupList from "@/components/archive/RunGroupList.vue"
import UnitPickerDrawer from "@/components/archive/UnitPickerDrawer.vue"
import { useArchiveFilters } from "@/composables/useArchiveFilters"
import { useMetaStats } from "@/composables/useMetaStats"
import { useRunsQuery } from "@/composables/useRunsQuery"
import { useSubmissionDialog } from "@/composables/useSubmissionDialog"
import { useArchiveStore } from "@/stores/archiveStore"
import type { ArchiveConfig } from "@/types/archive"

const archiveStore = useArchiveStore()
const { open: openSubmitDialog } = useSubmissionDialog()
const showStats = shallowRef(false)
const showUnitPicker = shallowRef(false)

onMounted(() => {
  showUnitPicker.value = window.matchMedia("(min-width: 1181px)").matches
  void archiveStore.loadConfig()
})

const config = computed<ArchiveConfig | null>(() => archiveStore.config)
const {
  filters,
  availableBosses,
  patchFilter,
  toggleFlag,
  toggleSelectedUnit,
} = useArchiveFilters(() => config.value)

const { groupedRuns, runs, loading, error } = useRunsQuery(filters)
const { stats, loading: statsLoading, error: statsError } = useMetaStats(filters)

const activeBoss = computed(() =>
  archiveStore.bosses.find((boss) => boss.id === filters.bossId) ?? availableBosses.value[0],
)

const activeSeason = computed(() =>
  archiveStore.seasons.find((season) => season.id === filters.seasonId),
)

const selectedUnits = computed(() =>
  archiveStore.units.filter((unit) => filters.selectedUnitIds.includes(unit.id)),
)

const activeFilterCount = computed(() =>
  filters.flags.length
  + filters.selectedUnitIds.length
  + (filters.category === "all" ? 0 : 1)
  + (filters.teamSize === "all" ? 0 : 1)
  + (filters.costMin === null && filters.costMax === null ? 0 : 1)
  + (filters.scoreMin === null && filters.scoreMax === null ? 0 : 1),
)
</script>

<template>
  <section
    class="archive-workbench"
    aria-label="竞速档案工作台"
  >
    <ArchiveDispatchPanel :articles="archiveStore.articles" />

    <div class="terminal-strip">
      <div>
        <p class="eyebrow">
          ENDGAME RUN DATABASE // LIVE ARCHIVE
        </p>
        <h1 class="page-title">
          终局竞速工作台
        </h1>
        <p class="page-lede">
          按赛季、敌方阶段与队伍成本检索中文竞速样本。
        </p>
      </div>
      <div
        class="toolbar"
        aria-label="工作台操作"
      >
        <span
          v-if="activeFilterCount"
          class="active-filter-count"
        >
          <SlidersHorizontal
            :size="14"
            aria-hidden="true"
          />
          {{ activeFilterCount }} 项限定
        </span>
        <button
          class="icon-button"
          type="button"
          @click="showStats = true"
        >
          <BarChart3
            :size="17"
            aria-hidden="true"
          />
          环境统计
        </button>
        <button
          class="icon-button primary-action"
          type="button"
          @click="openSubmitDialog"
        >
          <FilePlus2
            :size="17"
            aria-hidden="true"
          />
          提交记录
        </button>
      </div>
    </div>

    <div
      v-if="archiveStore.loading"
      class="system-message"
    >
      正在装载档案配置...
    </div>
    <div
      v-else-if="archiveStore.error"
      class="system-message error"
    >
      {{ archiveStore.error }}
    </div>
    <div
      v-else-if="config && activeBoss"
      class="workbench-grid"
      :class="{ 'picker-open': showUnitPicker }"
    >
      <ModeSeasonFilter
        :filters="filters"
        :seasons="archiveStore.seasons"
        :modes="archiveStore.modes"
        :bosses="availableBosses"
        :selected-units="selectedUnits"
        @patch-filter="patchFilter"
        @toggle-flag="toggleFlag"
        @open-picker="showUnitPicker = true"
      />

      <main class="results-column">
        <div
          class="context-ribbon"
          aria-label="当前档案上下文"
        >
          <span><Sparkles
            :size="14"
            aria-hidden="true"
          /> 当前档案</span>
          <strong>{{ activeSeason?.label ?? filters.seasonId }}</strong>
          <span>{{ activeBoss.subtitle }}</span>
          <button
            v-if="showUnitPicker"
            type="button"
            @click="showUnitPicker = false"
          >
            <X
              :size="14"
              aria-hidden="true"
            />
            收起选择器
          </button>
        </div>
        <BossPanel
          :boss="activeBoss"
          :season-label="activeSeason?.label ?? filters.seasonId"
          :run-count="runs.length"
        />
        <RunGroupList
          :groups="groupedRuns"
          :units="archiveStore.units"
          :loading="loading"
          :error="error"
          :continuous="filters.continuous"
          :mode="filters.mode"
        />
      </main>

      <UnitPickerDrawer
        :open="showUnitPicker"
        :unit-kind="filters.unitKind"
        :units="archiveStore.units"
        :selected-unit-ids="filters.selectedUnitIds"
        @close="showUnitPicker = false"
        @patch-filter="patchFilter"
        @toggle-unit="toggleSelectedUnit"
      />
    </div>
  </section>

  <MetaReportPanel
    :open="showStats"
    :stats="stats"
    :loading="statsLoading"
    :error="statsError"
    @close="showStats = false"
  />
</template>
