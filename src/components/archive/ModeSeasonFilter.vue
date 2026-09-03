<script setup lang="ts">
  import { computed, shallowRef } from "vue";
  import { Filter, Search, SlidersHorizontal } from "lucide-vue-next";
  import FlagIcon from "@/components/FlagIcon.vue";
  import {
    AS_MAX_SCORE,
    categoryLabels,
    categoryOptionsFor,
    flagLabels,
    flagOrder,
    isStarwardStage,
    stageGroupLabels,
    stageGroupOrder,
    stageGroupOf,
    type StageGroup,
  } from "@/services/runUtils";
  import { COST_MAX, COST_MIN } from "@/services/unitCost";
  import type {
    ArchiveFilters,
    ArchiveUnit,
    BossStage,
    ModeOption,
    RunCategory,
    RunFlag,
    Season,
  } from "@/types/archive";

  const props = defineProps<{
    filters: ArchiveFilters;
    seasons: Season[];
    modes: ModeOption[];
    bosses: BossStage[];
    selectedUnits: ArchiveUnit[];
  }>();

  const emit = defineEmits<{
    patchFilter: [patch: Partial<ArchiveFilters>];
    toggleFlag: [flag: RunFlag];
    openPicker: [];
  }>();

  const categoryOptions = computed<Array<{ id: RunCategory; label: string }>>(
    () => [
      { id: "all", label: "全部记录" },
      ...categoryOptionsFor(props.filters.mode, props.filters.bossId).map(
        (id) => ({ id, label: categoryLabels[id] }),
      ),
    ],
  );

  /** 快捷档位只是写入区间端点的 UI 预设，桶口径与 `buildMetaStats()` 的统计分桶一致。 */
  const costPresets: Array<{ label: string; min: number | null; max: number | null }> = [
    { label: "不限", min: null, max: null },
    { label: "0-8", min: 0, max: 8 },
    { label: "9-16", min: 9, max: 16 },
    { label: "17-32", min: 17, max: 32 },
    { label: "33-48", min: 33, max: COST_MAX },
  ];

  function costPresetActive(preset: { min: number | null; max: number | null }): boolean {
    return props.filters.costMin === preset.min && props.filters.costMax === preset.max;
  }

  type RangeField = "costMin" | "costMax" | "scoreMin" | "scoreMax";

  /** 区间输入清空要显式回落 `null`（`v-model.number` 在清空时留下 `""`，会被当成合法的 0）。 */
  function patchRange(field: RangeField, raw: string) {
    const value = raw.trim();
    const patch: Partial<ArchiveFilters> = {};
    if (!value) {
      patch[field] = null;
      emit("patchFilter", patch);
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return;
    patch[field] = Math.min(Math.floor(num), field.startsWith("cost") ? COST_MAX : AS_MAX_SCORE);
    emit("patchFilter", patch);
  }

  const sortOptions = [
    { id: "score", label: "成绩" },
    { id: "limited", label: "限定少" },
    { id: "latest", label: "最新" },
  ] as const;

  const selectedLabel = computed(() =>
    props.selectedUnits.length === 0
      ? "未限定角色或光锥"
      : props.selectedUnits.map((unit) => unit.name).join("、"),
  );

  /** 敌方阶段按「首领关 / 骑士关 / 将杀关」分组，空组不出标题。 */
  const groupedStages = computed<Array<{ group: StageGroup; label: string; bosses: BossStage[] }>>(
    () =>
      stageGroupOrder
        .map((group) => ({
          group,
          label: stageGroupLabels[group],
          bosses: props.bosses.filter((boss) => stageGroupOf(boss) === group),
        }))
        .filter((section) => section.bosses.length > 0),
  );

  const failedThumbs = shallowRef(new Set<string>());

  function showStageThumb(boss: BossStage): boolean {
    return (
      Boolean(boss.imageUrl) && !failedThumbs.value.has(boss.imageUrl ?? "")
    );
  }

  function markStageThumbFailed(boss: BossStage) {
    if (!boss.imageUrl) return;
    failedThumbs.value = new Set(failedThumbs.value).add(boss.imageUrl);
  }

  const stageBadgeLabels: Record<string, string> = {
    top: "上半",
    bottom: "下半",
    starward: "星启",
    k1: "K1",
    k2: "K2",
    k3: "K3",
    checkmate: "将杀",
    plight: "绝境",
  };

  function stageBadge(boss: BossStage): string | undefined {
    const key = boss.id.split("-").pop() ?? "";
    const label = stageBadgeLabels[key];
    // 上游未定名时阶段名会退回标签本身，避免徽标与标题重复
    return label && label !== boss.name ? label : undefined;
  }

  /**
   * 徽标已经说明的阶段限定不再在名字里重复一遍（「绝境」+「…（绝境）」）。
   * 后缀只在此处剥掉：数据层要留着，投稿的阶段下拉与 BossPanel 都靠它区分将杀 / 绝境（两处 subtitle 相同）。
   */
  function stageName(boss: BossStage): string {
    const badge = stageBadge(boss);
    if (!badge) return boss.name;
    const suffix = `（${badge}）`;
    return boss.name.endsWith(suffix) ? boss.name.slice(0, -suffix.length) : boss.name;
  }

  function stageHint(boss: BossStage): string {
    // 虚构叙事的每季额外缩放系数未公开，没有 hp 时退回速度
    return boss.hp || (boss.speed ? `速度 ${boss.speed}` : "");
  }
</script>

<template>
  <aside
    class="filter-panel"
    aria-label="筛选条件">
    <div class="panel-heading">
      <Filter
        :size="15"
        aria-hidden="true" />
      <span>检索控制台</span>
      <small>FILTER</small>
    </div>

    <div class="filter-section">
      <div class="label-row">
        <p class="section-label">模式</p>
        <select
          class="season-select"
          aria-label="赛季"
          :value="filters.seasonId"
          @change="
            emit('patchFilter', {
              seasonId: ($event.target as HTMLSelectElement).value,
            })
          ">
          <option
            v-for="season in seasons"
            :key="season.id"
            :value="season.id">
            {{ season.label }}
          </option>
        </select>
      </div>
      <div class="mode-grid">
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="mode-tab"
          :class="{ active: filters.mode === mode.id }"
          type="button"
          @click="emit('patchFilter', { mode: mode.id })">
          <span
            v-if="mode.badge"
            class="mini-badge"
            >{{ mode.badge }}</span
          >
          <strong>{{ mode.shortLabel }}</strong>
          <span>{{ mode.label }}</span>
        </button>
      </div>
    </div>

    <div
      v-for="section in groupedStages"
      :key="section.group"
      class="filter-section">
      <p class="section-label">{{ section.label }}</p>
      <div class="stage-grid">
        <button
          v-for="boss in section.bosses"
          :key="boss.id"
          class="wide-option stage-option"
          :class="{ active: filters.bossId === boss.id, starward: isStarwardStage(boss) }"
          type="button"
          :title="boss.variantName ? `${boss.subtitle} / ${boss.variantName}` : boss.subtitle"
          @click="emit('patchFilter', { bossId: boss.id })">
          <img
            v-if="showStageThumb(boss)"
            class="stage-thumb"
            :src="boss.imageUrl"
            :alt="boss.imageAlt ?? `${boss.name} 敌方图片`"
            loading="lazy"
            decoding="async"
            @error="markStageThumbFailed(boss)" />
          <span
            v-else
            class="stage-sigil"
            aria-hidden="true"
            >{{ boss.name.slice(0, 1) }}</span
          >
          <span class="stage-copy">
            <span class="stage-title">
              <em
                v-if="stageBadge(boss)"
                class="stage-badge"
                :class="{ starward: isStarwardStage(boss) }"
                >{{ stageBadge(boss) }}</em
              >
              {{ stageName(boss) }}
            </span>
            <small v-if="stageHint(boss)">{{ stageHint(boss) }}</small>
          </span>
        </button>
      </div>
    </div>

    <div class="split-fields">
      <div class="filter-section">
        <p class="section-label">分类</p>
        <button
          v-for="category in categoryOptions"
          :key="category.id"
          class="wide-option compact"
          :class="{ active: filters.category === category.id }"
          type="button"
          @click="emit('patchFilter', { category: category.id })">
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
            ">
            <option value="all">任意人数</option>
            <option value="4">4 人</option>
            <option value="3">3 人</option>
            <option value="2">2 人</option>
            <option value="1">1 人</option>
          </select>
        </label>
      </div>
    </div>

    <div class="filter-section">
      <p class="section-label">成本</p>
      <div class="segmented cost-presets">
        <button
          v-for="preset in costPresets"
          :key="preset.label"
          type="button"
          :class="{ active: costPresetActive(preset) }"
          :aria-pressed="costPresetActive(preset)"
          @click="emit('patchFilter', { costMin: preset.min, costMax: preset.max })">
          {{ preset.label }}
        </button>
      </div>
      <div class="range-inputs">
        <input
          type="number"
          aria-label="成本下限"
          :value="filters.costMin ?? ''"
          :min="COST_MIN"
          :max="COST_MAX"
          placeholder="不限"
          @input="patchRange('costMin', ($event.target as HTMLInputElement).value)">
        <span class="range-sep">–</span>
        <input
          type="number"
          aria-label="成本上限"
          :value="filters.costMax ?? ''"
          :min="COST_MIN"
          :max="COST_MAX"
          placeholder="不限"
          @input="patchRange('costMax', ($event.target as HTMLInputElement).value)">
      </div>
    </div>

    <div
      v-if="filters.mode === 'as'"
      class="filter-section">
      <p class="section-label">分数</p>
      <div class="range-inputs">
        <input
          type="number"
          aria-label="分数下限"
          :value="filters.scoreMin ?? ''"
          :min="0"
          :max="AS_MAX_SCORE"
          placeholder="不限"
          @input="patchRange('scoreMin', ($event.target as HTMLInputElement).value)">
        <span class="range-sep">–</span>
        <input
          type="number"
          aria-label="分数上限"
          :value="filters.scoreMax ?? ''"
          :min="0"
          :max="AS_MAX_SCORE"
          placeholder="不限"
          @input="patchRange('scoreMax', ($event.target as HTMLInputElement).value)">
      </div>
    </div>

    <div class="filter-section">
      <p class="section-label">标记</p>
      <div class="flag-grid">
        <button
          v-for="flag in flagOrder"
          :key="flag"
          :class="[`flag-card-${flag}`, { active: filters.flags.includes(flag) }]"
          type="button"
          :aria-pressed="filters.flags.includes(flag)"
          @click="emit('toggleFlag', flag)">
          <FlagIcon
            :flag="flag"
            :size="24" />
          <span>{{ flagLabels[flag] }}</span>
        </button>
      </div>
    </div>

    <div class="filter-section">
      <p class="section-label">排序</p>
      <div class="sort-row">
        <div class="segmented">
          <button
            v-for="sort in sortOptions"
            :key="sort.id"
            :class="{ active: filters.sort === sort.id }"
            type="button"
            @click="emit('patchFilter', { sort: sort.id })">
            {{ sort.label }}
          </button>
        </div>
        <button
          class="switch-row"
          type="button"
          role="switch"
          :aria-checked="filters.grouping"
          @click="emit('patchFilter', { grouping: !filters.grouping })">
          <span
            class="switch-track"
            aria-hidden="true"><span class="switch-knob" /></span>
          按队伍分组
        </button>
        <button
          class="switch-row"
          type="button"
          role="switch"
          :aria-checked="filters.continuous"
          @click="emit('patchFilter', { continuous: !filters.continuous })">
          <span
            class="switch-track"
            aria-hidden="true"><span class="switch-knob" /></span>
          紧凑连续列表
        </button>
      </div>
    </div>

    <div class="filter-section">
      <p class="section-label">角色 / 光锥</p>
      <button
        class="search-trigger"
        type="button"
        @click="emit('openPicker')">
        <Search
          :size="15"
          aria-hidden="true" />
        <span>{{ selectedLabel }}</span>
        <SlidersHorizontal
          :size="14"
          aria-hidden="true" />
      </button>
    </div>
  </aside>
</template>
