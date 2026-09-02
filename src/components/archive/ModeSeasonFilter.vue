<script setup lang="ts">
  import { computed, shallowRef } from "vue";
  import { Filter, Search, SlidersHorizontal } from "lucide-vue-next";
  import { categoryLabels, categoryOptionsFor } from "@/services/runUtils";
  import type {
    ArchiveFilters,
    ArchiveUnit,
    BossStage,
    ModeOption,
    RunCategory,
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
    toggleFlag: [flag: string];
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

  const costOptions = [
    { id: "all", label: "全部成本" },
    { id: "0-8", label: "0-8" },
    { id: "9-16", label: "9-16" },
    { id: "17-32", label: "17-32" },
    { id: "33-48", label: "33-48" },
  ] as const;

  const sortOptions = [
    { id: "score", label: "成绩" },
    { id: "limited", label: "限定少" },
    { id: "latest", label: "最新" },
  ] as const;

  const flagOptions = ["无复活", "低成本", "手操", "稳定", "击破", "星启"];

  const selectedLabel = computed(() =>
    props.selectedUnits.length === 0
      ? "未限定角色或光锥"
      : props.selectedUnits.map((unit) => unit.name).join("、"),
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

    <label class="field">
      <span>赛季</span>
      <select
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
    </label>

    <div class="filter-section">
      <p class="section-label">模式</p>
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

    <div class="filter-section">
      <p class="section-label">敌方阶段</p>
      <button
        v-for="boss in bosses"
        :key="boss.id"
        class="wide-option stage-option"
        :class="{ active: filters.bossId === boss.id }"
        type="button"
        :title="boss.subtitle"
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
              >{{ stageBadge(boss) }}</em
            >
            {{ boss.name }}
          </span>
          <small v-if="stageHint(boss)">{{ stageHint(boss) }}</small>
        </span>
      </button>
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
        <label class="field">
          <span>成本</span>
          <select
            :value="filters.cost"
            @change="
              emit('patchFilter', {
                cost: ($event.target as HTMLSelectElement)
                  .value as ArchiveFilters['cost'],
              })
            ">
            <option
              v-for="cost in costOptions"
              :key="cost.id"
              :value="cost.id">
              {{ cost.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div class="filter-section">
      <p class="section-label">排序</p>
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
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="filters.grouping"
          @change="
            emit('patchFilter', {
              grouping: ($event.target as HTMLInputElement).checked,
            })
          " />
        按队伍分组
      </label>
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="filters.continuous"
          @change="
            emit('patchFilter', {
              continuous: ($event.target as HTMLInputElement).checked,
            })
          " />
        紧凑连续列表
      </label>
    </div>

    <div class="filter-section">
      <p class="section-label">标记</p>
      <div class="flag-grid">
        <button
          v-for="flag in flagOptions"
          :key="flag"
          :class="{ active: filters.flags.includes(flag) }"
          type="button"
          @click="emit('toggleFlag', flag)">
          {{ flag }}
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
