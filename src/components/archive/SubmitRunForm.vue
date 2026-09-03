<script setup lang="ts">
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    reactive,
    ref,
    shallowRef,
    watch,
  } from "vue";
  import { useRouter } from "vue-router";
  import {
    AlertCircle,
    BookmarkPlus,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Copy,
    Download,
    Info,
    ListChecks,
    Loader2,
    Lock,
    RotateCcw,
    Send,
    Sparkles,
    Trash2,
    Users,
    X,
  } from "lucide-vue-next";
  import FlagIcon from "@/components/FlagIcon.vue";
  import SubmissionTeamSlot from "@/components/archive/SubmissionTeamSlot.vue";
  import {
    loadSubmissionDraft,
    useSubmissionDraft,
  } from "@/composables/useSubmissionDraft";
  import { useSubmissionMemory } from "@/composables/useSubmissionMemory";
  import {
    checkDuplicateVideo,
    submitRun,
    SubmissionDuplicateError,
  } from "@/services/archiveService";
  import {
    AS_MAX_SCORE,
    categoryLabels,
    categoryOfAsScore,
    categoryOptionsFor,
    flagLabels,
    flagOrder,
  } from "@/services/runUtils";
  import {
    COST_MAX,
    COST_MIN,
    defaultEidolonFor,
    defaultSuperimpositionFor,
    getCharacterGoldKind,
    getLightconeGoldKind,
    getUnitGoldCounts,
    goldKindLabels,
  } from "@/services/unitCost";
  import {
    TEAM_SLOT_COUNT,
    buildSubmissionRoster,
    describeSubmissionTarget,
    errorsOfStep,
    isUsableVideoUrl,
    stepOfField,
    validateSubmissionForm,
    type SubmissionError,
    type SubmissionField,
    type SubmissionStepId,
  } from "@/services/submissionValidation";
  import type {
    ArchiveConfig,
    DuplicateVideoMatch,
    EndgameMode,
    RunFlag,
    SpecificRunCategory,
    SubmissionPayload,
  } from "@/types/archive";

  const props = defineProps<{
    config: ArchiveConfig;
    preferredLightconeByCharacter: Record<string, string>;
  }>();

  const emit = defineEmits<{
    close: [];
  }>();

  const steps: Array<{
    id: SubmissionStepId;
    label: string;
    icon: typeof ListChecks;
  }> = [
    { id: "basic", label: "基础信息", icon: ListChecks },
    { id: "team", label: "队伍配置", icon: Users },
    { id: "result", label: "成绩与预览", icon: ClipboardList },
  ];

  function createForm(config: ArchiveConfig): SubmissionPayload {
    const seasonId =
      config.seasons.find((season) => season.isCurrent)?.id ??
      config.seasons[0]?.id ??
      "";
    const mode = config.modes[0]?.id ?? "moc";

    return {
      seasonId,
      mode,
      bossId:
        config.bosses.find(
          (boss) => boss.seasonId === seasonId && boss.mode === mode,
        )?.id ?? "",
      category: "fullStars",
      author: "",
      teamName: "",
      cycle: 0,
      score: 40000,
      cost: 0,
      videoUrl: "",
      notes: "",
      flags: [],
      units: Array.from({ length: TEAM_SLOT_COUNT }, () => ({
        unitId: "",
        eidolon: 0,
      })),
      lightcones: Array.from({ length: TEAM_SLOT_COUNT }, () => ({
        unitId: "",
        superimposition: 1,
      })),
    };
  }

  /** 草稿可能来自旧版本或已下线的阶段：槽位数不对就退回默认阵容，其余交给校验提示。 */
  function restoreForm(
    config: ArchiveConfig,
    saved?: SubmissionPayload,
  ): SubmissionPayload {
    const base = createForm(config);
    if (!saved) return base;

    const restored: SubmissionPayload = { ...base, ...saved };
    if (restored.units.length !== TEAM_SLOT_COUNT) restored.units = base.units;
    if (restored.lightcones.length !== TEAM_SLOT_COUNT)
      restored.lightcones = base.lightcones;
    restored.flags = Array.isArray(saved.flags)
      ? flagOrder.filter((flag) => saved.flags?.includes(flag))
      : base.flags;
    return restored;
  }

  function formatDraftTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const draft = loadSubmissionDraft();
  const lastStep = steps.length - 1;
  const restoredStep = Math.min(Math.max(draft?.stepIndex ?? 0, 0), lastStep);

  const form = reactive<SubmissionPayload>(
    restoreForm(props.config, draft?.payload),
  );
  const stepIndex = shallowRef(restoredStep);
  const unlockedIndex = shallowRef(
    Math.min(
      Math.max(draft?.unlockedIndex ?? restoredStep, restoredStep),
      lastStep,
    ),
  );
  const draftSavedAt = shallowRef(draft ? formatDraftTime(draft.savedAt) : "");
  const showErrors = shallowRef(false);
  const submitting = shallowRef(false);
  const submitFailure = shallowRef("");
  const acceptedId = shallowRef("");
  const acceptedToken = shallowRef("");
  const copiedToken = shallowRef(false);
  const categoryTouched = shallowRef(false);
  const router = useRouter();

  const {
    memory,
    maxPresets,
    saveCurrentAsPreset,
    applyPreset,
    removePreset,
    addToken,
  } = useSubmissionMemory({
    payload: form,
    teamSlotCount: TEAM_SLOT_COUNT,
  });
  /** 仅在草稿未携带作者、且记忆里有值时一次性预填；之后让用户输入完全覆盖记忆。 */
  if (!draft?.payload?.author && memory.value.author && !form.author) {
    form.author = memory.value.author;
  }

  const presetNameDraft = ref("");
  const activePresetId = ref("");

  const { discard: discardDraft } = useSubmissionDraft({
    payload: form,
    baseline: createForm(props.config),
    stepIndex,
    unlockedIndex,
  });

  const currentStep = computed<SubmissionStepId>(
    () => steps[stepIndex.value].id,
  );

  /** 视频链接查重：链接或敌方阶段一变就防抖重查，命中即挡住「下一步」与「提交」。 */
  const DUPLICATE_CHECK_DELAY = 400;

  const duplicateMatches = shallowRef<DuplicateVideoMatch[]>([]);
  const duplicateChecking = shallowRef(false);
  /** 自增序号：用户快速改链接时，过期响应不能覆盖新结果。 */
  let duplicateSeq = 0;
  let duplicateTimer: ReturnType<typeof setTimeout> | null = null;

  const hasDuplicateVideo = computed(() => duplicateMatches.value.length > 0);

  function clearDuplicateTimer() {
    if (duplicateTimer) {
      clearTimeout(duplicateTimer);
      duplicateTimer = null;
    }
  }

  /** 写入命中记录，并作废在途 / 待触发的预检，避免旧结果把这份记录冲掉。 */
  function applyDuplicateMatches(matches: DuplicateVideoMatch[]) {
    duplicateSeq += 1;
    clearDuplicateTimer();
    duplicateChecking.value = false;
    duplicateMatches.value = matches;
  }

  async function runDuplicateCheck() {
    clearDuplicateTimer();
    const seq = ++duplicateSeq;
    const videoUrl = form.videoUrl.trim();
    if (!videoUrl || !form.bossId || !isUsableVideoUrl(videoUrl)) {
      duplicateMatches.value = [];
      duplicateChecking.value = false;
      return;
    }

    duplicateChecking.value = true;
    const matches = await checkDuplicateVideo({ videoUrl, bossId: form.bossId });
    if (seq !== duplicateSeq) return;
    duplicateChecking.value = false;
    duplicateMatches.value = matches;
  }

  watch(
    [() => form.videoUrl, () => form.bossId],
    () => {
      // 上一次的命中对新链接不作数，先清掉再防抖重查
      duplicateMatches.value = [];
      duplicateChecking.value = Boolean(form.bossId) && isUsableVideoUrl(form.videoUrl);
      clearDuplicateTimer();
      duplicateTimer = setTimeout(() => void runDuplicateCheck(), DUPLICATE_CHECK_DELAY);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    duplicateSeq += 1;
    clearDuplicateTimer();
  });

  const allErrors = computed(() =>
    validateSubmissionForm(form, props.config, {
      duplicateVideoUrl: hasDuplicateVideo.value,
    }),
  );
  const stepErrors = computed(() =>
    showErrors.value ? errorsOfStep(allErrors.value, currentStep.value) : [],
  );
  const errorByField = computed(
    () =>
      new Map<SubmissionField, string>(
        stepErrors.value.map((e) => [e.field, e.message]),
      ),
  );

  const stages = computed(() =>
    props.config.bosses.filter(
      (boss) => boss.seasonId === form.seasonId && boss.mode === form.mode,
    ),
  );
  const characters = computed(() =>
    props.config.units
      .filter((unit) => unit.kind === "character")
      .sort(
        (a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, "zh-CN"),
      ),
  );
  const lightcones = computed(() =>
    props.config.units
      .filter((unit) => unit.kind === "lightcone")
      .sort(
        (a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, "zh-CN"),
      ),
  );
  const categoryOptions = computed(() =>
    categoryOptionsFor(form.mode, form.bossId).map((id) => ({
      id,
      label: categoryLabels[id],
    })),
  );
  const asAutoCategory = computed<SpecificRunCategory | null>(() =>
    form.mode === "as" ? categoryOfAsScore(Number(form.score)) : null,
  );
  const categoryHint = computed(() => {
    if (form.mode === "as") {
      return asAutoCategory.value
        ? `已按分数 ${form.score} 归入「${categoryLabels[asAutoCategory.value]}」，可手动改。`
        : "末日幻影满分 4000，3400 以下与 3900-3999 不单独归档；当前分数未命中任何区间，请确认分数或手动选档。";
    }
    if (
      categoryOptions.value.every((option) => option.id.startsWith("plight"))
    ) {
      return "绝境阶段的记录单独归档，仍按实际轮次与分数填写。";
    }
    return "0 轮竞速要求轮次为 0；满星记录按实际轮次填写。";
  });
  const roster = computed(() => buildSubmissionRoster(form, props.config));
  const teamCost = computed(() =>
    getUnitGoldCounts(form.units, form.lightcones, props.config.units),
  );
  /** 单位库索引：自动搭配与默认命座/叠影都要按 id 取回单位元数据。 */
  const unitById = computed(
    () => new Map(props.config.units.map((unit) => [unit.id, unit])),
  );
  const autoCost = computed(
    () => teamCost.value.limited + teamCost.value.standard,
  );
  /** 用户手改过成本后停止自动覆盖，「按队伍重算」可重新接管。 */
  const costTouched = shallowRef(
    draft?.payload?.cost !== undefined &&
      Number(draft.payload.cost) !== autoCost.value,
  );

  watch(
    autoCost,
    (value) => {
      if (!costTouched.value) form.cost = value;
    },
    { immediate: true },
  );
  const target = computed(() => describeSubmissionTarget(form, props.config));
  const configuredSlots = computed(
    () => roster.value.filter((line) => line.characterId).length,
  );
  const scoreHint = computed(() =>
    form.mode === "as"
      ? `末日幻影按剩余行动值计分，满分 ${AS_MAX_SCORE}；当前归档区间「${categoryLabels[form.category]}」。`
      : "",
  );

  function fieldError(field: SubmissionField): string | undefined {
    return errorByField.value.get(field);
  }

  function disabledCharacterIds(index: number) {
    return form.units.flatMap((unit, unitIndex) =>
      unitIndex !== index && unit.unitId ? [unit.unitId] : [],
    );
  }

  function updateCharacter(index: number, unitId: string) {
    form.units[index].unitId = unitId;

    const character = unitById.value.get(unitId);
    const defaultEidolon = character ? defaultEidolonFor(getCharacterGoldKind(character)) : null;
    if (defaultEidolon !== null) form.units[index].eidolon = defaultEidolon;

    const suggested = props.preferredLightconeByCharacter[unitId];
    if (!suggested || !lightcones.value.some((unit) => unit.id === suggested)) return;
    form.lightcones[index].unitId = suggested;
    form.lightcones[index].superimposition = defaultSuperimpositionFor(
      getLightconeGoldKind(unitById.value.get(suggested)),
    );
  }

  function updateLightcone(index: number, unitId: string) {
    form.lightcones[index].unitId = unitId;
    if (!unitId) return;
    form.lightcones[index].superimposition = defaultSuperimpositionFor(
      getLightconeGoldKind(unitById.value.get(unitId)),
    );
  }

  function recalculateCost() {
    costTouched.value = false;
    form.cost = autoCost.value;
  }

  function patchMode(mode: EndgameMode) {
    form.mode = mode;
  }

  watch(
    () => [form.seasonId, form.mode],
    () => {
      if (!stages.value.some((boss) => boss.id === form.bossId)) {
        form.bossId = stages.value[0]?.id ?? "";
      }
    },
  );

  watch([() => form.mode, () => form.bossId], () => {
    categoryTouched.value = false;
    if (form.mode === "as") {
      form.category =
        asAutoCategory.value ?? categoryOptions.value[0]?.id ?? form.category;
      return;
    }
    if (!categoryOptions.value.some((option) => option.id === form.category)) {
      form.category = categoryOptions.value[0]?.id ?? form.category;
    }
  });

  watch(asAutoCategory, (auto) => {
    if (auto && !categoryTouched.value) form.category = auto;
  });

  function selectCategory(category: SpecificRunCategory) {
    form.category = category;
    categoryTouched.value = true;
  }

  function toggleFormFlag(flag: RunFlag) {
    const next = form.flags.includes(flag)
      ? form.flags.filter((item) => item !== flag)
      : [...form.flags, flag];
    // 按 flagOrder 归一，保证草稿与提交的 tags 顺序稳定。
    form.flags = flagOrder.filter((item) => next.includes(item));
  }

  /** 已配置的槽位过少时拒绝保存，避免空表占位；新名字直接插入到队首。 */
  function handleSavePreset() {
    const name = presetNameDraft.value.trim();
    if (!name) return;
    const filled = form.units.filter((slot) => slot.unitId).length;
    if (filled === 0) {
      submitFailure.value = "当前队伍为空，无法保存为预设。";
      return;
    }
    const created = saveCurrentAsPreset(name);
    if (!created) return;
    presetNameDraft.value = "";
    activePresetId.value = created.id;
    nextTick(() => {
      submitFailure.value = "";
    });
  }

  function handleApplyPreset() {
    if (!activePresetId.value) return;
    applyPreset(activePresetId.value);
    costTouched.value = false;
    form.teamName =
      memory.value.presets.find((entry) => entry.id === activePresetId.value)
        ?.name ?? form.teamName;
  }

  function handleRemovePreset(id: string) {
    removePreset(id);
    if (activePresetId.value === id) activePresetId.value = "";
  }

  const canSavePreset = computed(
    () =>
      (presetNameDraft.value.trim().length > 0 &&
        memory.value.presets.length < maxPresets) ||
      memory.value.presets.some(
        (entry) => entry.name === presetNameDraft.value.trim(),
      ),
  );
  const presetLimitHint = computed(() => `最多 ${maxPresets} 套预设`);

  function handleDiscardDraft() {
    discardDraft();
    Object.assign(form, createForm(props.config));
    stepIndex.value = 0;
    unlockedIndex.value = 0;
    showErrors.value = false;
    submitFailure.value = "";
    categoryTouched.value = false;
    costTouched.value = false;
    draftSavedAt.value = "";
    duplicateMatches.value = [];
    duplicateChecking.value = false;
  }

  function goTo(index: number) {
    if (index > unlockedIndex.value) return;
    stepIndex.value = index;
    showErrors.value = false;
  }

  function nextStep() {
    const blocking = errorsOfStep(allErrors.value, currentStep.value);
    showErrors.value = blocking.length > 0;
    if (blocking.length > 0) return;

    stepIndex.value = Math.min(stepIndex.value + 1, steps.length - 1);
    unlockedIndex.value = Math.max(unlockedIndex.value, stepIndex.value);
    showErrors.value = false;
  }

  function previousStep() {
    goTo(Math.max(stepIndex.value - 1, 0));
  }

  function handleSubmitError(errors: SubmissionError[]) {
    const index = steps.findIndex(
      (entry) => entry.id === stepOfField(errors[0].field),
    );
    stepIndex.value = index < 0 ? 0 : index;
    showErrors.value = true;
  }

  async function handleSubmit() {
    if (allErrors.value.length > 0) {
      handleSubmitError(allErrors.value);
      return;
    }

    submitting.value = true;
    submitFailure.value = "";
    try {
      const result = await submitRun({
        ...form,
        author: form.author.trim(),
        teamName: form.teamName.trim(),
        videoUrl: form.videoUrl.trim(),
        notes: form.notes.trim(),
      });
      acceptedId.value = result.id;
      // 拿到后端下发的 ownerToken，写入本地记忆用于"我的投稿"页查询。
      if (result.ownerToken) {
        acceptedToken.value = result.ownerToken;
        addToken(result.ownerToken);
      }
      // 只有入队成功才清草稿；失败时保留原样供重试
      discardDraft();
      categoryTouched.value = false;
      costTouched.value = false;
      draftSavedAt.value = "";
      Object.assign(form, createForm(props.config));
      stepIndex.value = 0;
      unlockedIndex.value = 0;
      showErrors.value = false;
    } catch (err) {
      if (err instanceof SubmissionDuplicateError) {
        // 预检之后被别人抢先入队：回填命中记录并跳回基础信息挡住提交
        applyDuplicateMatches(err.matches);
        handleSubmitError([{ field: "videoUrl", message: err.message }]);
      } else {
        submitFailure.value =
          err instanceof Error ? err.message : "提交失败，请稍后重试。";
      }
    } finally {
      submitting.value = false;
    }
  }

  function submitAnother() {
    acceptedId.value = "";
    acceptedToken.value = "";
    copiedToken.value = false;
    submitFailure.value = "";
  }

  async function copyOwnerToken() {
    if (!acceptedToken.value || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(acceptedToken.value);
      copiedToken.value = true;
      setTimeout(() => {
        copiedToken.value = false;
      }, 1800);
    } catch {
      /* 剪贴板被拒时静默：用户可手动选中复制 */
    }
  }

  function gotoMySubmissions() {
    emit("close");
    void router.push("/me");
  }
</script>

<template>
  <div class="submission-wizard">
    <p
      v-if="acceptedId"
      class="submission-success"
      role="status">
      <span class="submission-success-mark">
        <CheckCircle2
          :size="24"
          aria-hidden="true" />
      </span>
      <strong>已进入审核队列</strong>
      <small>
        投稿编号
        <code>{{ acceptedId }}</code>
        ，审核通过后会出现在档案列表；未通过可在审核台查看原因。
      </small>
      <small
        v-if="acceptedToken"
        class="submission-success-token">
        你的投稿凭证
        <code>{{ acceptedToken }}</code>
        <button
          class="icon-button mini"
          type="button"
          :aria-label="copiedToken ? '已复制凭证' : '复制凭证'"
          @click="copyOwnerToken">
          <Check
            v-if="copiedToken"
            :size="14"
            aria-hidden="true" />
          <Copy
            v-else
            :size="14"
            aria-hidden="true" />
          {{ copiedToken ? "已复制" : "复制" }}
        </button>
        <span class="submission-success-hint">
          本凭证只保存在本机浏览器，用于查询与撤回自己的投稿。
        </span>
      </small>
      <span class="submission-success-actions">
        <button
          class="icon-button"
          type="button"
          @click="submitAnother">
          <RotateCcw
            :size="16"
            aria-hidden="true" />
          再提交一条
        </button>
        <button
          class="icon-button"
          type="button"
          @click="gotoMySubmissions">
          <ClipboardList
            :size="16"
            aria-hidden="true" />
          查看我的投稿
        </button>
        <button
          class="icon-button primary-action"
          type="button"
          @click="emit('close')">
          <X
            :size="16"
            aria-hidden="true" />
          完成
        </button>
      </span>
    </p>

    <form
      v-else
      class="submit-form"
      novalidate
      @submit.prevent="handleSubmit">
      <div
        v-if="draftSavedAt"
        class="submission-draft-note">
        <span
          >已恢复上次未提交的草稿（{{
            draftSavedAt
          }}），提交成功后会自动清除。</span
        >
        <button
          type="button"
          @click="handleDiscardDraft">
          <RotateCcw
            :size="14"
            aria-hidden="true" />
          丢弃草稿
        </button>
      </div>

      <details class="submission-guidelines">
        <summary>
          <Info
            :size="14"
            aria-hidden="true" />
          投稿须知
        </summary>
        <ul>
          <li>
            请附 B 站或 YouTube 上可访问的原始录像链接，不要剪辑或跳过战斗过程。
          </li>
          <li>
            记录分类随模式变化：末日幻影按剩余行动值分数分档，异相仲裁的绝境阶段单独归档。
          </li>
          <li>
            命座与叠影按最终结算时填写；低星角色默认满命，专武默认 S1、低星光锥默认
            S5。
          </li>
          <li>
            成本按队伍自动合计：限定五星角色算「命座 + 1」，限定五星光锥算叠影数，常驻五星计入常驻成本，低星与无名勋礼光锥不计成本；合计范围
            {{ COST_MIN }}–{{ COST_MAX }}，可手动改写。
          </li>
          <li>记录先进入待审核队列，通过后才会在档案页公开展示。</li>
        </ul>
      </details>

      <ol
        class="submission-steps"
        aria-label="投稿步骤">
        <li
          v-for="(entry, index) in steps"
          :key="entry.id">
          <button
            class="submission-step-tab"
            :class="{ active: stepIndex === index, passed: index < stepIndex }"
            type="button"
            :disabled="index > unlockedIndex"
            :aria-current="stepIndex === index ? 'step' : undefined"
            @click="goTo(index)">
            <span class="submission-step-index">
              <Check
                v-if="index < stepIndex"
                :size="13"
                aria-hidden="true" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <component
              :is="entry.icon"
              :size="15"
              aria-hidden="true" />
            <span>{{ entry.label }}</span>
            <Lock
              v-if="index > unlockedIndex"
              :size="13"
              aria-hidden="true" />
          </button>
        </li>
      </ol>

      <p
        v-if="stepErrors.length > 0"
        class="submission-error"
        role="alert">
        <AlertCircle
          :size="15"
          aria-hidden="true" />
        {{ stepErrors[0].message }}
        <span v-if="stepErrors.length > 1"
          >（另有 {{ stepErrors.length - 1 }} 处待补全）</span
        >
      </p>

      <div
        v-if="currentStep === 'basic'"
        class="submission-step-body">
        <div class="filter-section">
          <p class="section-label">竞赛模式</p>
          <div class="mode-grid">
            <button
              v-for="mode in config.modes"
              :key="mode.id"
              class="mode-tab"
              :class="{ active: form.mode === mode.id }"
              type="button"
              @click="patchMode(mode.id)">
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

        <div class="split-fields">
          <label class="field">
            <span>赛季</span>
            <select v-model="form.seasonId">
              <option
                v-for="season in config.seasons"
                :key="season.id"
                :value="season.id">
                {{ season.label }}
              </option>
            </select>
            <small
              v-if="fieldError('seasonId')"
              class="field-error"
              >{{ fieldError("seasonId") }}</small
            >
          </label>
          <label class="field">
            <span>敌方阶段</span>
            <select v-model="form.bossId">
              <option
                v-for="boss in stages"
                :key="boss.id"
                :value="boss.id">
                {{ boss.name }} · {{ boss.subtitle }}
              </option>
            </select>
            <small
              v-if="fieldError('bossId')"
              class="field-error"
              >{{ fieldError("bossId") }}</small
            >
          </label>
        </div>

        <p
          v-if="target.stageName !== '未选择'"
          class="submission-stage-meta">
          <span>血量 {{ target.hp || "未公开" }}</span>
          <span>速度 {{ target.speed || "—" }}</span>
          <span>韧性 {{ target.toughness || "—" }}</span>
          <span v-if="target.weakness.length"
            >弱点 {{ target.weakness.join(" / ") }}</span
          >
        </p>

        <div class="filter-section">
          <p class="section-label">记录分类</p>
          <div class="submission-category-grid">
            <button
              v-for="category in categoryOptions"
              :key="category.id"
              class="wide-option compact"
              :class="{ active: form.category === category.id }"
              type="button"
              @click="selectCategory(category.id)">
              {{ category.label }}
            </button>
          </div>
          <p class="submission-field-hint">
            {{ categoryHint }}
          </p>
          <small
            v-if="fieldError('category')"
            class="field-error"
            >{{ fieldError("category") }}</small
          >
        </div>

        <div class="form-grid">
          <label class="field span-2">
            <span>作者</span>
            <input
              v-model.trim="form.author"
              type="text"
              maxlength="32"
              placeholder="展示名称，例如 夜航" />
            <small
              v-if="fieldError('author')"
              class="field-error"
              >{{ fieldError("author") }}</small
            >
          </label>
          <label class="field">
            <span>视频链接</span>
            <input
              v-model.trim="form.videoUrl"
              type="url"
              placeholder="B 站或 YouTube 原始录像链接" />
            <small
              v-if="fieldError('videoUrl')"
              class="field-error"
              >{{ fieldError("videoUrl") }}</small
            >
          </label>
        </div>

        <p
          v-if="duplicateChecking"
          class="submission-duplicate is-checking"
          role="status">
          <Loader2
            :size="15"
            class="spin"
            aria-hidden="true" />
          正在核对这条录像在「{{ target.stageName }}」是否已收录…
        </p>
        <div
          v-else-if="hasDuplicateVideo"
          class="submission-duplicate"
          role="alert">
          <p class="submission-duplicate-title">
            <AlertCircle
              :size="15"
              aria-hidden="true" />
            <span>该视频链接在「{{ target.stageName }}」已有投稿记录</span>
            <button
              class="icon-button mini"
              type="button"
              @click="runDuplicateCheck">
              <RotateCcw
                :size="13"
                aria-hidden="true" />
              重新检测
            </button>
          </p>
          <ul class="submission-duplicate-list">
            <li
              v-for="match in duplicateMatches"
              :key="`${match.source}-${match.id}`">
              <b>{{ match.author || "匿名" }}</b>
              <span>{{ match.teamName || "未命名队伍" }}</span>
              <span>{{ match.status === "approved" ? "已通过" : "待审核" }}</span>
              <span>{{ formatDraftTime(match.submittedAt) || match.submittedAt }}</span>
              <a
                :href="match.videoUrl"
                target="_blank"
                rel="noopener noreferrer"
                >原视频</a
              >
            </li>
          </ul>
          <p class="submission-field-hint">
            同一条录像在同一敌方阶段只收录一次；若这是该录像的另一半区或另一阶段记录，请在上方改选敌方阶段。
          </p>
        </div>

        <div class="filter-section">
          <p class="section-label">标记</p>
          <div class="flag-grid">
            <button
              v-for="flag in flagOrder"
              :key="flag"
              class="compact"
              :class="[`flag-card-${flag}`, { active: form.flags.includes(flag) }]"
              type="button"
              :aria-pressed="form.flags.includes(flag)"
              @click="toggleFormFlag(flag)">
              <FlagIcon
                :flag="flag"
                :size="18" />
              <span>{{ flagLabels[flag] }}</span>
            </button>
          </div>
          <p class="submission-field-hint">
            用于主页按标记检索，可留空；只勾选本次记录确实成立的条件。
          </p>
        </div>
      </div>

      <div
        v-else-if="currentStep === 'team'"
        class="submission-step-body">
        <div class="submission-roster-head">
          <p class="section-label">队伍配置</p>
          <span class="team-cost-chip">
            <Sparkles
              :size="13"
              aria-hidden="true" />
            限定 {{ teamCost.limited }} · 常驻 {{ teamCost.standard }} · 成本
            {{ autoCost }}
          </span>
        </div>

        <label class="field">
          <span>队伍名称</span>
          <input
            v-model.trim="form.teamName"
            type="text"
            maxlength="40"
            placeholder="例：大黑塔双同谐" />
          <small
            v-if="fieldError('teamName')"
            class="field-error"
            >{{ fieldError("teamName") }}</small
          >
        </label>

        <section class="preset-toolbar">
          <header class="preset-toolbar-head">
            <p class="section-label">配队预设</p>
            <small
              >{{ presetLimitHint }}，当前 {{ memory.presets.length }} 套</small
            >
          </header>
          <div class="preset-toolbar-row">
            <select
              v-model="activePresetId"
              :disabled="memory.presets.length === 0"
              aria-label="选择已保存的配队预设">
              <option
                value=""
                disabled>
                请选择预设
              </option>
              <option
                v-for="preset in memory.presets"
                :key="preset.id"
                :value="preset.id">
                {{ preset.name }}
              </option>
            </select>
            <button
              class="icon-button"
              type="button"
              :disabled="!activePresetId"
              @click="handleApplyPreset">
              <Download
                :size="15"
                aria-hidden="true" />
              载入到表单
            </button>
            <button
              class="icon-button"
              type="button"
              :disabled="!canSavePreset"
              @click="handleSavePreset">
              <BookmarkPlus
                :size="15"
                aria-hidden="true" />
              另存为
            </button>
            <input
              v-model="presetNameDraft"
              type="text"
              maxlength="24"
              placeholder="配队名（如：黄泉双魂）"
              class="preset-name-input" />
          </div>
          <ul
            v-if="memory.presets.length"
            class="preset-chip-list">
            <li
              v-for="preset in memory.presets"
              :key="preset.id">
              <button
                type="button"
                class="preset-chip"
                :class="{ active: activePresetId === preset.id }"
                :title="`载入「${preset.name}」`"
                @click="activePresetId = preset.id">
                {{ preset.name }}
              </button>
              <button
                type="button"
                class="preset-chip-remove"
                :aria-label="`删除预设 ${preset.name}`"
                @click="handleRemovePreset(preset.id)">
                <Trash2
                  :size="13"
                  aria-hidden="true" />
              </button>
            </li>
          </ul>
          <p class="submission-field-hint">
            在下方填好角色与光锥后，命名并「另存为」即可一键复用。
          </p>
        </section>

        <div class="submission-team-list">
          <SubmissionTeamSlot
            v-for="(unit, index) in form.units"
            :key="`team-slot-${index}`"
            :index="index"
            :character="unit"
            :lightcone="form.lightcones[index]"
            :characters="characters"
            :lightcones="lightcones"
            :disabled-character-ids="disabledCharacterIds(index)"
            :preferred-lightcone-id="preferredLightconeByCharacter[unit.unitId]"
            @update-character="updateCharacter(index, $event)"
            @update-eidolon="unit.eidolon = $event"
            @update-lightcone="updateLightcone(index, $event)"
            @update-superimposition="
              form.lightcones[index].superimposition = $event
            " />
        </div>

        <p class="submission-field-hint">
          已配置 {{ configuredSlots }}/{{ TEAM_SLOT_COUNT }}
          个槽位；角色不可重复，光锥可重复，光锥列表优先展示与角色同命途的选项。选角色会自动带出专武（默认
          S1），手动选低星光锥时默认 S5。
        </p>
      </div>

      <div
        v-else
        class="submission-step-body">
        <div class="form-grid">
          <label class="field">
            <span>轮次</span>
            <input
              v-model.number="form.cycle"
              type="number"
              min="0"
              step="1" />
            <small
              v-if="fieldError('cycle')"
              class="field-error"
              >{{ fieldError("cycle") }}</small
            >
          </label>
          <label class="field">
            <span>分数</span>
            <input
              v-model.number="form.score"
              type="number"
              min="0"
              :max="form.mode === 'as' ? AS_MAX_SCORE : undefined"
              step="1" />
            <small
              v-if="fieldError('score')"
              class="field-error"
              >{{ fieldError("score") }}</small
            >
          </label>
          <div class="field">
            <span>成本</span>
            <div class="cost-field-row">
              <input
                v-model.number="form.cost"
                type="number"
                :min="COST_MIN"
                :max="COST_MAX"
                step="1"
                @input="costTouched = true" />
              <button
                class="icon-button mini"
                type="button"
                :disabled="!costTouched && form.cost === autoCost"
                :aria-label="`按队伍重算成本（当前合计 ${autoCost}）`"
                @click="recalculateCost">
                <RotateCcw
                  :size="13"
                  aria-hidden="true" />
                重算
              </button>
            </div>
            <small
              v-if="!costTouched"
              class="submission-field-hint">
              按队伍自动合计：限定 {{ teamCost.limited }} + 常驻
              {{ teamCost.standard }}
            </small>
            <small
              v-if="fieldError('cost')"
              class="field-error"
              >{{ fieldError("cost") }}</small
            >
          </div>
        </div>

        <p
          v-if="scoreHint"
          class="submission-field-hint">
          {{ scoreHint }}
        </p>

        <label class="field">
          <span>备注</span>
          <textarea
            v-model.trim="form.notes"
            rows="3"
            placeholder="可填写轴、特殊限制、是否自动等审核信息。" />
        </label>

        <section class="submission-preview">
          <h2>投稿预览</h2>
          <dl class="submission-preview-meta">
            <div>
              <dt>模式</dt>
              <dd>{{ target.modeLabel }}</dd>
            </div>
            <div>
              <dt>赛季</dt>
              <dd>{{ target.seasonLabel }}</dd>
            </div>
            <div>
              <dt>敌方阶段</dt>
              <dd>{{ target.stageName }}</dd>
            </div>
            <div>
              <dt>分类</dt>
              <dd>{{ target.categoryLabel }}</dd>
            </div>
            <div>
              <dt>作者</dt>
              <dd>{{ form.author.trim() || "未填写" }}</dd>
            </div>
            <div>
              <dt>队伍</dt>
              <dd>{{ form.teamName.trim() || "未填写" }}</dd>
            </div>
            <div>
              <dt>标记</dt>
              <dd>
                {{ form.flags.length ? form.flags.map((flag) => flagLabels[flag]).join("、") : "未勾选" }}
              </dd>
            </div>
          </dl>
          <ol class="submission-preview-team">
            <li
              v-for="line in roster"
              :key="line.index">
              <b>{{ line.index + 1 }}</b>
              <span class="submission-preview-unit">
                {{ line.characterName }}
                <em>E{{ line.eidolon }}</em>
              </span>
              <span class="submission-preview-unit">
                {{ line.lightconeName }}
                <em>S{{ line.superimposition }}</em>
              </span>
              <span
                class="submission-gold-tag"
                :data-gold="line.gold"
                >{{ goldKindLabels[line.gold] }}</span
              >
            </li>
          </ol>
          <p class="submission-preview-metrics">
            <span>轮次 {{ form.cycle }}</span>
            <span>分数 {{ form.score }}</span>
            <span>
              成本 {{ form.cost }}
              <template v-if="costTouched">（自动合计 {{ autoCost }}）</template>
            </span>
            <span
              >限定 {{ teamCost.limited }} · 常驻
              {{ teamCost.standard }}</span
            >
          </p>
          <a
            class="submission-preview-video"
            :href="form.videoUrl.trim() || undefined"
            target="_blank"
            rel="noopener noreferrer"
            >{{ form.videoUrl.trim() || "未填写视频链接" }}</a
          >
        </section>
      </div>

      <div class="submission-nav">
        <button
          v-if="stepIndex > 0"
          class="icon-button"
          type="button"
          @click="previousStep">
          <ChevronLeft
            :size="16"
            aria-hidden="true" />
          上一步
        </button>
        <span v-else />
        <button
          v-if="stepIndex < steps.length - 1"
          class="icon-button primary-action"
          type="button"
          @click="nextStep">
          下一步
          <ChevronRight
            :size="16"
            aria-hidden="true" />
        </button>
        <button
          v-else
          class="icon-button primary-action"
          type="submit"
          :disabled="submitting">
          <Send
            :size="16"
            aria-hidden="true" />
          {{ submitting ? "提交中" : "提交到审核队列" }}
        </button>
      </div>

      <p
        v-if="submitFailure"
        class="submission-error"
        role="alert">
        <AlertCircle
          :size="15"
          aria-hidden="true" />
        {{ submitFailure }}
      </p>
    </form>
  </div>
</template>
