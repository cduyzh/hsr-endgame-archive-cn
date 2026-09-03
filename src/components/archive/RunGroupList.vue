<script setup lang="ts">
import { computed, h, shallowRef, watch } from "vue"
import { ChevronDown } from "lucide-vue-next"
import { getUnitImageSrc } from "@/data/unitAssets"
import { flagLabels, flagsOfRun } from "@/services/runUtils"
import { getRunGoldCounts } from "@/services/unitCost"
import { getVideoSource, type VideoSource } from "@/services/submissionValidation"
import type { ArchiveRun, ArchiveUnit, EndgameMode, RunUnit } from "@/types/archive"

const props = defineProps<{
  groups: Array<{ key: string; label: string; runs: ArchiveRun[] }>
  units: ArchiveUnit[]
  loading: boolean
  error: string | null
  continuous: boolean
  mode: EndgameMode
}>()

const expandedGroups = shallowRef<Set<string>>(new Set())

const unitById = computed(() => new Map(props.units.map((unit) => [unit.id, unit])))
const totalRuns = computed(() => props.groups.reduce((sum, group) => sum + group.runs.length, 0))
const showScore = computed(() => props.mode === "as")

interface VideoLink {
  url: string
  source: VideoSource
  label: string
}

const displayGroups = computed(() =>
  props.groups.map((group) => ({
    ...group,
    runs: group.runs.map((run) => ({
      ...run,
      displayUnits: run.units.map(toDisplayUnit),
      displayLightcones: run.lightcones.map(toDisplayUnit),
      goldCounts: getRunGoldCounts(run, props.units),
      flags: flagsOfRun(run),
      submittedAtLabel: formatSubmittedAt(run.submittedAt),
      video: parseVideo(run.videoUrl),
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

function parseVideo(value: string | undefined): VideoLink | null {
  if (!value) return null
  const source = getVideoSource(value)
  if (!source) return null
  return { url: value, source, label: source === "youtube" ? "YouTube 视频" : "B 站视频" }
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

/** 自绘平台图标：内联 SVG 比 lucide 更精准控制颜色与圆角，避免 YouTube/B 站图标混用。 */
function platformIcon(source: VideoSource) {
  if (source === "youtube") {
    return h(
      "svg",
      { viewBox: "0 0 24 24", width: 14, height: 14, "aria-hidden": "true", focusable: "false" },
      [
        h("path", {
          d: "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8Z",
          fill: "#ff0033",
        }),
        h("path", { d: "M10 9.4v5.2L15 12Z", fill: "#fff" }),
      ],
    )
  }
  return h(
    "svg",
    { viewBox: "0 0 24 24", width: 14, height: 14, "aria-hidden": "true", focusable: "false" },
    [
      h("rect", { x: 1, y: 4, width: 22, height: 16, rx: 4, fill: "#00aeec" }),
      h(
        "text",
        {
          x: 12,
          y: 16.5,
          "text-anchor": "middle",
          "font-family": "'Helvetica Neue', Arial, sans-serif",
          "font-size": 10,
          "font-weight": 800,
          fill: "#fff",
        },
        "B",
      ),
      h("circle", { cx: 19, cy: 8, r: 1.6, fill: "#fff" }),
    ],
  )
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
        <article
          v-for="run in group.runs"
          :key="run.id"
          class="run-row"
        >
          <div
            class="run-row-loadout"
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

          <div class="run-row-main">
            <header class="run-row-headline">
              <button
                class="author-button"
                type="button"
                :title="run.author"
              >
                {{ run.author }}
              </button>
              <a
                v-if="run.video"
                class="video-link"
                :class="`video-link-${run.video.source}`"
                :href="run.video.url"
                target="_blank"
                rel="noreferrer"
                :aria-label="run.video.label"
              >
                <component
                  :is="() => platformIcon(run.video!.source)"
                />
                <span>{{ run.video.label }}</span>
              </a>
              <span
                v-for="flag in run.flags"
                :key="flag"
                class="run-flag"
                :class="`run-flag-${flag}`"
              >
                {{ flagLabels[flag] }}
              </span>
            </header>
            <p class="run-row-team-name">
              {{ run.teamName || run.displayUnits.map((entry) => entry.name).join(" / ") }}
            </p>
            <time
              class="run-row-time"
              :datetime="run.submittedAt"
            >{{ run.submittedAtLabel }}</time>
          </div>

          <div
            class="run-metrics"
            :class="{ 'run-metrics--no-score': !showScore }"
          >
            <span class="cycle-badge">轮次 <b>{{ run.cycle }}</b></span>
            <span
              v-if="showScore"
              class="score-badge"
            >分数 <b>{{ run.score.toLocaleString("zh-CN") }}</b></span>
            <span class="gold-badge limited-gold">限定 <b>{{ run.goldCounts.limited }}</b></span>
            <span class="gold-badge standard-gold">常驻 <b>{{ run.goldCounts.standard }}</b></span>
          </div>
        </article>
      </div>
    </article>
  </section>
</template>
