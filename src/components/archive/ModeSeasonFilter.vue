<script setup lang="ts">
import { computed } from "vue"
import { Filter, Search, SlidersHorizontal } from "lucide-vue-next"
import type {
  ArchiveFilters,
  ArchiveUnit,
  BossStage,
  ModeOption,
  Season,
} from "@/types/archive"

const props = defineProps<{
  filters: ArchiveFilters
  seasons: Season[]
  modes: ModeOption[]
  bosses: BossStage[]
  selectedUnits: ArchiveUnit[]
}>()

const emit = defineEmits<{
  patchFilter: [patch: Partial<ArchiveFilters>]
  toggleFlag: [flag: string]
  openPicker: []
}>()

const categoryOptions = [
  { id: "all", label: "全部记录" },
  { id: "zeroCycle", label: "0 轮竞速" },
  { id: "fullStars", label: "满星记录" },
] as const

const costOptions = [
  { id: "all", label: "全部成本" },
  { id: "0-8", label: "0-8" },
  { id: "9-16", label: "9-16" },
  { id: "17-32", label: "17-32" },
  { id: "33-48", label: "33-48" },
] as const

const sortOptions = [
  { id: "score", label: "成绩" },
  { id: "limited", label: "限定少" },
  { id: "latest", label: "最新" },
] as const

const flagOptions = ["无复活", "低成本", "手操", "稳定", "击破", "星临"]

const selectedLabel = computed(() =>
  props.selectedUnits.length === 0 ? "未限定角色或光锥" : props.selectedUnits.map((unit) => unit.name).join("、"),
)
</script>

<template>
  <aside
    class="filter-panel"
    aria-label="筛选条件"
  >
    <div class="panel-heading">
      <Filter
        :size="15"
        aria-hidden="true"
      />
      <span>检索控制台</span>
      <small>FILTER</small>
    </div>

    <label class="field">
      <span>赛季</span>
      <select
        :value="filters.seasonId"
        @change="emit('patchFilter', { seasonId: ($event.target as HTMLSelectElement).value })"
      >
        <option
          v-for="season in seasons"
          :key="season.id"
          :value="season.id"
        >
          {{ season.label }}
        </option>
      </select>
    </label>

    <div class="filter-section">
      <p class="section-label">
        模式
      </p>
      <div class="mode-grid">
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="mode-tab"
          :class="{ active: filters.mode === mode.id }"
          type="button"
          @click="emit('patchFilter', { mode: mode.id })"
        >
          <span
            v-if="mode.badge"
            class="mini-badge"
          >{{ mode.badge }}</span>
          <strong>{{ mode.shortLabel }}</strong>
          <span>{{ mode.label }}</span>
        </button>
      </div>
    </div>

    <div class="filter-section">
      <p class="section-label">
        敌方阶段
      </p>
      <button
        v-for="boss in bosses"
        :key="boss.id"
        class="wide-option"
        :class="{ active: filters.bossId === boss.id }"
        type="button"
        @click="emit('patchFilter', { bossId: boss.id })"
      >
        {{ boss.name }}
      </button>
    </div>

    <div class="split-fields">
      <div class="filter-section">
        <p class="section-label">
          分类
        </p>
        <button
          v-for="category in categoryOptions"
          :key="category.id"
          class="wide-option compact"
          :class="{ active: filters.category === category.id }"
          type="button"
          @click="emit('patchFilter', { category: category.id })"
        >
          {{ category.label }}
        </button>
      </div>

      <div class="filter-section">
        <label class="field">
          <span>队伍</span>
          <select
            :value="filters.teamSize"
            @change="
              emit('patchFilter', {
                teamSize:
                  ($event.target as HTMLSelectElement).value === 'all'
                    ? 'all'
                    : Number(($event.target as HTMLSelectElement).value),
              })
            "
          >
            <option value="all">任意人数</option>
            <option value="4">4 人</option>
            <option value="3">3 人</option>
            <option value="2">2 人</option>
            <option value="1">1 人</option>
          </select>
        </label>
        <label class="field">
          <span>成本</span>
          <select
            :value="filters.cost"
            @change="emit('patchFilter', { cost: ($event.target as HTMLSelectElement).value as ArchiveFilters['cost'] })"
          >
            <option
              v-for="cost in costOptions"
              :key="cost.id"
              :value="cost.id"
            >
              {{ cost.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div class="filter-section">
      <p class="section-label">
        排序
      </p>
      <div class="segmented">
        <button
          v-for="sort in sortOptions"
          :key="sort.id"
          :class="{ active: filters.sort === sort.id }"
          type="button"
          @click="emit('patchFilter', { sort: sort.id })"
        >
          {{ sort.label }}
        </button>
      </div>
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="filters.grouping"
          @change="emit('patchFilter', { grouping: ($event.target as HTMLInputElement).checked })"
        >
        按队伍分组
      </label>
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="filters.continuous"
          @change="emit('patchFilter', { continuous: ($event.target as HTMLInputElement).checked })"
        >
        紧凑连续列表
      </label>
    </div>

    <div class="filter-section">
      <p class="section-label">
        标记
      </p>
      <div class="flag-grid">
        <button
          v-for="flag in flagOptions"
          :key="flag"
          :class="{ active: filters.flags.includes(flag) }"
          type="button"
          @click="emit('toggleFlag', flag)"
        >
          {{ flag }}
        </button>
      </div>
    </div>

    <div class="filter-section">
      <p class="section-label">
        角色 / 光锥
      </p>
      <button
        class="search-trigger"
        type="button"
        @click="emit('openPicker')"
      >
        <Search
          :size="15"
          aria-hidden="true"
        />
        <span>{{ selectedLabel }}</span>
        <SlidersHorizontal
          :size="14"
          aria-hidden="true"
        />
      </button>
    </div>
  </aside>
</template>
