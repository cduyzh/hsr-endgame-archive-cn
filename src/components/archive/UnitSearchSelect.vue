<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from "vue"
import { Check, ChevronDown, Search } from "lucide-vue-next"
import { getUnitImageSrc } from "@/data/unitAssets"
import type { ArchiveUnit } from "@/types/archive"

const props = defineProps<{
  units: ArchiveUnit[]
  label: string
  placeholder: string
  searchPlaceholder: string
  disabledUnitIds?: string[]
}>()

const model = defineModel<string>({ required: true })
const root = useTemplateRef<HTMLElement>("root")
const open = shallowRef(false)
const query = shallowRef("")

const selectedUnit = computed(() => props.units.find((unit) => unit.id === model.value) ?? null)
const disabledIds = computed(() => new Set(props.disabledUnitIds ?? []))
const filteredUnits = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase("zh-CN")
  if (!keyword) return props.units
  return props.units.filter((unit) => `${unit.name} ${unit.path}`.toLocaleLowerCase("zh-CN").includes(keyword))
})

function toggleOpen() {
  open.value = !open.value
  if (!open.value) query.value = ""
}

function selectUnit(unit: ArchiveUnit) {
  if (disabledIds.value.has(unit.id)) return
  model.value = unit.id
  open.value = false
  query.value = ""
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) {
    open.value = false
    query.value = ""
  }
}

onMounted(() => document.addEventListener("pointerdown", handleDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener("pointerdown", handleDocumentPointerDown))
</script>

<template>
  <div ref="root" class="unit-search-select" @keydown.esc="open = false">
    <button
      class="unit-search-trigger"
      type="button"
      :aria-label="`${label}：${selectedUnit?.name ?? placeholder}`"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <img v-if="selectedUnit" :src="getUnitImageSrc(selectedUnit) ?? undefined" :alt="selectedUnit.name" />
      <span v-else class="unit-search-placeholder" aria-hidden="true">+</span>
      <span class="unit-search-value">
        <strong>{{ selectedUnit?.name ?? placeholder }}</strong>
        <small>{{ selectedUnit ? `${selectedUnit.path} · ${selectedUnit.rarity} 星` : label }}</small>
      </span>
      <ChevronDown :size="17" aria-hidden="true" />
    </button>

    <div v-if="open" class="unit-search-popover">
      <label class="unit-search-box">
        <Search :size="15" aria-hidden="true" />
        <input v-model="query" type="search" :placeholder="searchPlaceholder" autofocus />
      </label>
      <div class="unit-search-options" role="listbox" :aria-label="label">
        <button
          v-for="unit in filteredUnits"
          :key="unit.id"
          class="unit-search-option"
          :class="{ selected: model === unit.id }"
          type="button"
          :disabled="disabledIds.has(unit.id)"
          :data-unit-id="unit.id"
          @click="selectUnit(unit)"
        >
          <img :src="getUnitImageSrc(unit) ?? undefined" :alt="unit.name" loading="lazy" />
          <span>
            <strong>{{ unit.name }}</strong>
            <small>{{ unit.path }} · {{ unit.rarity }} 星</small>
          </span>
          <em v-if="disabledIds.has(unit.id)">已在队伍中</em>
          <Check v-else-if="model === unit.id" :size="16" aria-hidden="true" />
        </button>
        <p v-if="filteredUnits.length === 0" class="unit-search-empty">没有匹配结果</p>
      </div>
    </div>
  </div>
</template>
