<script setup lang="ts">
import { computed, shallowRef } from "vue"
import { Search, X } from "lucide-vue-next"
import { getUnitImageSrc } from "@/data/unitAssets"
import { UNIT_PATH_OPTIONS } from "@/data/unitPaths"
import type { ArchiveFilters, ArchiveUnit, UnitKind, UnitPath } from "@/types/archive"

const props = defineProps<{
  open: boolean
  unitKind: UnitKind
  units: ArchiveUnit[]
  selectedUnitIds: string[]
}>()

const emit = defineEmits<{
  close: []
  patchFilter: [patch: Partial<ArchiveFilters>]
  toggleUnit: [unitId: string]
}>()

const query = shallowRef("")
const selectedPath = shallowRef<UnitPath | "all">("all")

const filteredUnits = computed(() => {
  const keyword = query.value.trim()
  return props.units
    .filter((unit) => unit.kind === props.unitKind)
    .filter((unit) => selectedPath.value === "all" || unit.path === selectedPath.value)
    .filter((unit) => !keyword || unit.name.includes(keyword) || unit.path.includes(keyword))
    .map((unit) => ({
      ...unit,
      imageSrc: getUnitImageSrc(unit),
    }))
})

const groupedUnits = computed(() =>
  UNIT_PATH_OPTIONS.map((path) => ({
    ...path,
    units: filteredUnits.value.filter((unit) => unit.path === path.label),
  })).filter((group) => group.units.length > 0),
)

const availablePathOptions = computed(() => {
  const paths = new Set(
    props.units.filter((unit) => unit.kind === props.unitKind).map((unit) => unit.path),
  )
  return UNIT_PATH_OPTIONS.filter((path) => paths.has(path.label))
})
</script>

<template>
  <aside
    class="unit-drawer"
    :class="{ open }"
    aria-label="角色与光锥选择器"
  >
    <div
      class="drawer-rail"
      aria-hidden="true"
    >
      <span>选择器</span>
      <span>{{ unitKind === "character" ? "角色" : "光锥" }}</span>
    </div>
    <div class="drawer-panel">
      <div class="drawer-header">
        <div>
          <p class="eyebrow">
            快速限定
          </p>
          <h2>角色 / 光锥选择</h2>
        </div>
        <button
          class="square-button"
          type="button"
          aria-label="关闭选择器"
          @click="emit('close')"
        >
          <X
            :size="18"
            aria-hidden="true"
          />
        </button>
      </div>

      <div class="segmented">
        <button
          type="button"
          :class="{ active: unitKind === 'character' }"
          @click="emit('patchFilter', { unitKind: 'character' })"
        >
          角色
        </button>
        <button
          type="button"
          :class="{ active: unitKind === 'lightcone' }"
          @click="emit('patchFilter', { unitKind: 'lightcone' })"
        >
          光锥
        </button>
      </div>

      <div
        class="path-grid"
        aria-label="命途筛选"
      >
        <button
          class="path-filter"
          type="button"
          :class="{ active: selectedPath === 'all' }"
          @click="selectedPath = 'all'"
        >
          <span class="path-label">全部</span>
        </button>
        <button
          v-for="path in availablePathOptions"
          :key="path.label"
          class="path-filter"
          type="button"
          :class="{ active: selectedPath === path.label }"
          @click="selectedPath = path.label"
        >
          <img
            :src="path.iconSrc"
            :alt="path.label"
            loading="lazy"
          >
          <span class="path-label">{{ path.label }}</span>
        </button>
      </div>

      <label class="search-box">
        <Search
          :size="15"
          aria-hidden="true"
        />
        <input
          v-model="query"
          type="search"
          placeholder="搜索角色、光锥或命途"
        >
      </label>

      <div class="unit-groups">
        <section
          v-for="group in groupedUnits"
          :key="group.label"
          class="unit-path-group"
        >
          <h3>
            <img
              :src="group.iconSrc"
              :alt="group.label"
              loading="lazy"
            >
            <span>{{ group.label }}</span>
            <small>{{ group.units.length }}</small>
          </h3>
          <div class="unit-grid">
            <button
              v-for="unit in group.units"
              :key="unit.id"
              class="unit-tile"
              :class="{ active: selectedUnitIds.includes(unit.id) }"
              type="button"
              :aria-label="unit.name"
              @click="emit('toggleUnit', unit.id)"
            >
              <span
                class="unit-avatar"
                :class="unit.kind"
              >
                <img
                  v-if="unit.imageSrc"
                  :src="unit.imageSrc"
                  :alt="unit.name"
                  loading="lazy"
                >
                <span
                  v-else
                  class="unit-placeholder"
                  aria-hidden="true"
                />
              </span>
              <span class="unit-name">{{ unit.name }}</span>
              <small>{{ unit.rarity }} 星</small>
            </button>
          </div>
        </section>
      </div>
    </div>
  </aside>
</template>
