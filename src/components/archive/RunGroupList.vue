<script setup lang="ts">
import { computed, shallowRef, watch } from "vue"
import { ChevronDown, Youtube } from "lucide-vue-next"
import { getUnitImageSrc } from "@/data/unitAssets"
import { getRunGoldCounts } from "@/services/unitCost"
import type { ArchiveRun, ArchiveUnit, RunUnit } from "@/types/archive"

const props = defineProps<{
  groups: Array<{ key: string; label: string; runs: ArchiveRun[] }>
  units: ArchiveUnit[]
  loading: boolean
  error: string | null
  continuous: boolean
}>()

const expandedGroups = shallowRef<Set<string>>(new Set())

const unitById = computed(() => new Map(props.units.map((unit) => [unit.id, unit])))
const totalRuns = computed(() => props.groups.reduce((sum, group) => sum + group.runs.length, 0))
const displayGroups = computed(() =>
  props.groups.map((group) => ({
    ...group,
    runs: group.runs.map((run) => ({
      ...run,
      displayUnits: run.units.map(toDisplayUnit),
      displayLightcones: run.lightcones.map(toDisplayUnit),
      goldCounts: getRunGoldCounts(run, props.units),
      submittedAtLabel: formatSubmittedAt(run.submittedAt),
    })),
  })),
)

watch(
  () => [props.continuous, displayGroups.value.map((group) => group.key).join("|")],
  () => {
    const keys = displayGroups.value.map((group) => group.key)
    if (props.continuous) {
      expandedGroups.value = new Set(keys)
      return
    }
    const retained = keys.filter((key) => expandedGroups.value.has(key))
    expandedGroups.value = new Set(retained.length > 0 ? retained : keys.slice(0, 1))
  },
  { immediate: true },
)

function toggleGroup(key: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedGroups.value = next
}

function toDisplayUnit(entry: RunUnit) {
  const unit = unitById.value.get(entry.unitId) ?? null
  return {
    ...entry,
    name: unit?.name ?? entry.unitId,
    imageSrc: getUnitImageSrc(unit),
  }
}

function formatSubmittedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}
</script>

<template>
  <section
    class="run-list"
    :class="{ continuous }"
    aria-label="通关记录"
  >
    <div class="list-header">
      <div>
        <p class="eyebrow">
          收录记录
        </p>
        <h2>队伍分组</h2>
      </div>
      <span>{{ totalRuns }} 条 · {{ displayGroups.length }} 组</span>
    </div>

    <div
      v-if="loading"
      class="system-message"
    >
      正在检索记录...
    </div>
    <div
      v-else-if="error"
      class="system-message error"
    >
      {{ error }}
    </div>
    <div
      v-else-if="groups.length === 0"
      class="empty-state"
    >
      当前筛选没有匹配记录。可以放宽成本、队伍人数或清空角色限定。
    </div>

    <article
      v-for="group in displayGroups"
      v-else
      :key="group.key"
      class="run-group"
    >
      <button
        class="group-header"
        type="button"
        :aria-expanded="expandedGroups.has(group.key)"
        @click="toggleGroup(group.key)"
      >
        <span>{{ group.label }}</span>
        <small>{{ group.runs.length }} 条</small>
        <ChevronDown
          class="chevron"
          :class="{ open: expandedGroups.has(group.key) }"
          :size="18"
          aria-hidden="true"
        />
      </button>

      <div
        v-show="expandedGroups.has(group.key)"
        class="run-items"
      >
        <div
          v-for="run in group.runs"
          :key="run.id"
          class="run-row"
        >
          <div
            class="team-loadout"
            aria-label="队伍角色与光锥"
          >
            <div
              class="team-icons"
              aria-label="队伍角色"
            >
              <span
                v-for="entry in run.displayUnits"
                :key="`${run.id}-${entry.unitId}`"
                class="unit-chip character-slot"
              >
                <img
                  v-if="entry.imageSrc"
                  :src="entry.imageSrc"
                  :alt="entry.name"
                  loading="lazy"
                >
                <span
                  v-else
                  class="unit-placeholder"
                  aria-hidden="true"
                />
                <b>E{{ entry.eidolon ?? 0 }}</b>
              </span>
            </div>
            <div
              class="lightcone-icons"
              aria-label="队伍光锥"
            >
              <span
                v-for="(entry, index) in run.displayLightcones"
                :key="`${run.id}-${entry.unitId}-${index}`"
                class="unit-chip lightcone-slot"
              >
                <img
                  v-if="entry.imageSrc"
                  :src="entry.imageSrc"
                  :alt="entry.name"
                  loading="lazy"
                >
                <span
                  v-else
                  class="unit-placeholder"
                  aria-hidden="true"
                />
                <b>S{{ entry.superimposition ?? 1 }}</b>
              </span>
            </div>
          </div>
          <div class="run-main">
            <div class="run-title-line">
              <button
                class="author-button"
                type="button"
              >
                {{ run.author }}
              </button>
              <a
                v-if="run.videoUrl"
                class="video-link"
                :href="run.videoUrl"
                target="_blank"
                rel="noreferrer"
                aria-label="打开视频"
              >
                <Youtube
                  :size="15"
                  aria-hidden="true"
                />
                YT 视频
              </a>
              <time :datetime="run.submittedAt">{{ run.submittedAtLabel }}</time>
            </div>
            <p>{{ run.displayUnits.map((entry) => entry.name).join(" / ") }}</p>
          </div>
          <div class="run-metrics">
            <span class="cycle-badge">轮次 <b>{{ run.cycle }}</b></span>
            <span><b>{{ run.score.toLocaleString("zh-CN") }}</b> 分</span>
            <span class="gold-badge limited-gold">限定 <b>{{ run.goldCounts.limited }}</b></span>
            <span class="gold-badge standard-gold">常驻 <b>{{ run.goldCounts.standard }}</b></span>
          </div>
        </div>
      </div>
    </article>
  </section>
</template>
