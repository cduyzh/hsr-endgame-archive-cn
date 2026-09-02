<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from "vue"
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Info,
  ListChecks,
  Lock,
  RotateCcw,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-vue-next"
import SubmissionTeamSlot from "@/components/archive/SubmissionTeamSlot.vue"
import { loadSubmissionDraft, useSubmissionDraft } from "@/composables/useSubmissionDraft"
import { submitRun } from "@/services/archiveService"
import { AS_MAX_SCORE, categoryLabels, categoryOfAsScore, categoryOptionsFor } from "@/services/runUtils"
import { getUnitGoldCounts, goldKindLabels } from "@/services/unitCost"
import {
  COST_MAX,
  COST_MIN,
  TEAM_SLOT_COUNT,
  buildSubmissionRoster,
  describeSubmissionTarget,
  errorsOfStep,
  stepOfField,
  validateSubmissionForm,
  type SubmissionError,
  type SubmissionField,
  type SubmissionStepId,
} from "@/services/submissionValidation"
import type { ArchiveConfig, EndgameMode, SpecificRunCategory, SubmissionPayload } from "@/types/archive"

const props = defineProps<{
  config: ArchiveConfig
  preferredLightconeByCharacter: Record<string, string>
}>()

const emit = defineEmits<{
  close: []
}>()

const steps: Array<{ id: SubmissionStepId; label: string; icon: typeof ListChecks }> = [
  { id: "basic", label: "基础信息", icon: ListChecks },
  { id: "team", label: "队伍配置", icon: Users },
  { id: "result", label: "成绩与预览", icon: ClipboardList },
]

function createForm(config: ArchiveConfig): SubmissionPayload {
  const seasonId = config.seasons.find((season) => season.isCurrent)?.id ?? config.seasons[0]?.id ?? ""
  const mode = config.modes[0]?.id ?? "moc"

  return {
    seasonId,
    mode,
    bossId: config.bosses.find((boss) => boss.seasonId === seasonId && boss.mode === mode)?.id ?? "",
    category: "fullStars",
    author: "",
    teamName: "",
    cycle: 0,
    score: 40000,
    cost: 0,
    videoUrl: "",
    notes: "",
    units: Array.from({ length: TEAM_SLOT_COUNT }, () => ({ unitId: "", eidolon: 0 })),
    lightcones: Array.from({ length: TEAM_SLOT_COUNT }, () => ({ unitId: "", superimposition: 1 })),
  }
}

/** 草稿可能来自旧版本或已下线的阶段：槽位数不对就退回默认阵容，其余交给校验提示。 */
function restoreForm(config: ArchiveConfig, saved?: SubmissionPayload): SubmissionPayload {
  const base = createForm(config)
  if (!saved) return base

  const restored: SubmissionPayload = { ...base, ...saved }
  if (restored.units.length !== TEAM_SLOT_COUNT) restored.units = base.units
  if (restored.lightcones.length !== TEAM_SLOT_COUNT) restored.lightcones = base.lightcones
  return restored
}

function formatDraftTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

const draft = loadSubmissionDraft()
const lastStep = steps.length - 1
const restoredStep = Math.min(Math.max(draft?.stepIndex ?? 0, 0), lastStep)

const form = reactive<SubmissionPayload>(restoreForm(props.config, draft?.payload))
const stepIndex = shallowRef(restoredStep)
const unlockedIndex = shallowRef(Math.min(Math.max(draft?.unlockedIndex ?? restoredStep, restoredStep), lastStep))
const draftSavedAt = shallowRef(draft ? formatDraftTime(draft.savedAt) : "")
const showErrors = shallowRef(false)
const submitting = shallowRef(false)
const submitFailure = shallowRef("")
const acceptedId = shallowRef("")
const categoryTouched = shallowRef(false)

const { discard: discardDraft } = useSubmissionDraft({
  payload: form,
  baseline: createForm(props.config),
  stepIndex,
  unlockedIndex,
})

const currentStep = computed<SubmissionStepId>(() => steps[stepIndex.value].id)
const allErrors = computed(() => validateSubmissionForm(form, props.config))
const stepErrors = computed(() => (showErrors.value ? errorsOfStep(allErrors.value, currentStep.value) : []))
const errorByField = computed(() => new Map<SubmissionField, string>(stepErrors.value.map((e) => [e.field, e.message])))

const stages = computed(() => props.config.bosses.filter((boss) => boss.seasonId === form.seasonId && boss.mode === form.mode))
const characters = computed(() =>
  props.config.units
    .filter((unit) => unit.kind === "character")
    .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, "zh-CN")),
)
const lightcones = computed(() =>
  props.config.units
    .filter((unit) => unit.kind === "lightcone")
    .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, "zh-CN")),
)
const categoryOptions = computed(() =>
  categoryOptionsFor(form.mode, form.bossId).map((id) => ({ id, label: categoryLabels[id] })),
)
const asAutoCategory = computed<SpecificRunCategory | null>(() =>
  form.mode === "as" ? categoryOfAsScore(Number(form.score)) : null,
)
const categoryHint = computed(() => {
  if (form.mode === "as") {
    return asAutoCategory.value
      ? `已按分数 ${form.score} 归入「${categoryLabels[asAutoCategory.value]}」，可手动改。`
      : "末日幻影满分 4000，3400 以下与 3900-3999 不单独归档；当前分数未命中任何区间，请确认分数或手动选档。"
  }
  if (categoryOptions.value.every((option) => option.id.startsWith("plight"))) {
    return "绝境阶段的记录单独归档，仍按实际轮次与分数填写。"
  }
  return "0 轮竞速要求轮次为 0；满星记录按实际轮次填写。"
})
const roster = computed(() => buildSubmissionRoster(form, props.config))
const goldCounts = computed(() => getUnitGoldCounts(form.units, props.config.units))
const target = computed(() => describeSubmissionTarget(form, props.config))
const configuredSlots = computed(() => roster.value.filter((line) => line.characterId).length)
const scoreHint = computed(() =>
  form.mode === "as"
    ? `末日幻影按剩余行动值计分，满分 ${AS_MAX_SCORE}；当前归档区间「${categoryLabels[form.category]}」。`
    : "",
)

function fieldError(field: SubmissionField): string | undefined {
  return errorByField.value.get(field)
}

function disabledCharacterIds(index: number) {
  return form.units.flatMap((unit, unitIndex) => (unitIndex !== index && unit.unitId ? [unit.unitId] : []))
}

function updateCharacter(index: number, unitId: string) {
  form.units[index].unitId = unitId
  const preferredLightconeId = props.preferredLightconeByCharacter[unitId]
  if (preferredLightconeId && lightcones.value.some((unit) => unit.id === preferredLightconeId)) {
    form.lightcones[index].unitId = preferredLightconeId
    form.lightcones[index].superimposition = 1
  }
}

function patchMode(mode: EndgameMode) {
  form.mode = mode
}

watch(
  () => [form.seasonId, form.mode],
  () => {
    if (!stages.value.some((boss) => boss.id === form.bossId)) {
      form.bossId = stages.value[0]?.id ?? ""
    }
  },
)

watch([() => form.mode, () => form.bossId], () => {
  categoryTouched.value = false
  if (form.mode === "as") {
    form.category = asAutoCategory.value ?? categoryOptions.value[0]?.id ?? form.category
    return
  }
  if (!categoryOptions.value.some((option) => option.id === form.category)) {
    form.category = categoryOptions.value[0]?.id ?? form.category
  }
})

watch(asAutoCategory, (auto) => {
  if (auto && !categoryTouched.value) form.category = auto
})

function selectCategory(category: SpecificRunCategory) {
  form.category = category
  categoryTouched.value = true
}

function handleDiscardDraft() {
  discardDraft()
  Object.assign(form, createForm(props.config))
  stepIndex.value = 0
  unlockedIndex.value = 0
  showErrors.value = false
  submitFailure.value = ""
  categoryTouched.value = false
  draftSavedAt.value = ""
}

function goTo(index: number) {
  if (index > unlockedIndex.value) return
  stepIndex.value = index
  showErrors.value = false
}

function nextStep() {
  const blocking = errorsOfStep(allErrors.value, currentStep.value)
  showErrors.value = blocking.length > 0
  if (blocking.length > 0) return

  stepIndex.value = Math.min(stepIndex.value + 1, steps.length - 1)
  unlockedIndex.value = Math.max(unlockedIndex.value, stepIndex.value)
  showErrors.value = false
}

function previousStep() {
  goTo(Math.max(stepIndex.value - 1, 0))
}

function handleSubmitError(errors: SubmissionError[]) {
  const index = steps.findIndex((entry) => entry.id === stepOfField(errors[0].field))
  stepIndex.value = index < 0 ? 0 : index
  showErrors.value = true
}

async function handleSubmit() {
  if (allErrors.value.length > 0) {
    handleSubmitError(allErrors.value)
    return
  }

  submitting.value = true
  submitFailure.value = ""
  try {
    const result = await submitRun({
      ...form,
      author: form.author.trim(),
      teamName: form.teamName.trim(),
      videoUrl: form.videoUrl.trim(),
      notes: form.notes.trim(),
    })
    acceptedId.value = result.id
    // 只有入队成功才清草稿；失败时保留原样供重试
    discardDraft()
    categoryTouched.value = false
    draftSavedAt.value = ""
    Object.assign(form, createForm(props.config))
    stepIndex.value = 0
    unlockedIndex.value = 0
    showErrors.value = false
  } catch (err) {
    submitFailure.value = err instanceof Error ? err.message : "提交失败，请稍后重试。"
  } finally {
    submitting.value = false
  }
}

function submitAnother() {
  acceptedId.value = ""
  submitFailure.value = ""
}
</script>

<template>
  <div class="submission-wizard">
    <p
      v-if="acceptedId"
      class="submission-success"
      role="status"
    >
      <span class="submission-success-mark">
        <CheckCircle2
          :size="24"
          aria-hidden="true"
        />
      </span>
      <strong>已进入审核队列</strong>
      <small>
        投稿编号
        <code>{{ acceptedId }}</code>
        ，审核通过后会出现在档案列表；未通过可在审核台查看原因。
      </small>
      <span class="submission-success-actions">
        <button
          class="icon-button"
          type="button"
          @click="submitAnother"
        >
          <RotateCcw
            :size="16"
            aria-hidden="true"
          />
          再提交一条
        </button>
        <button
          class="icon-button primary-action"
          type="button"
          @click="emit('close')"
        >
          <X
            :size="16"
            aria-hidden="true"
          />
          完成
        </button>
      </span>
    </p>

    <form
      v-else
      class="submit-form"
      novalidate
      @submit.prevent="handleSubmit"
    >
      <div
        v-if="draftSavedAt"
        class="submission-draft-note"
      >
        <span>已恢复上次未提交的草稿（{{ draftSavedAt }}），提交成功后会自动清除。</span>
        <button
          type="button"
          @click="handleDiscardDraft"
        >
          <RotateCcw
            :size="14"
            aria-hidden="true"
          />
          丢弃草稿
        </button>
      </div>

      <details class="submission-guidelines">
        <summary>
          <Info
            :size="14"
            aria-hidden="true"
          />
          投稿须知
        </summary>
        <ul>
          <li>请附 B 站或 YouTube 上可访问的原始录像链接，不要剪辑或跳过战斗过程。</li>
          <li>记录分类随模式变化：末日幻影按剩余行动值分数分档，异相仲裁的绝境阶段单独归档。</li>
          <li>命座与叠影按最终结算时填写，开拓者不计入限定/常驻成本。</li>
          <li>成本按 4 名角色合计填写，范围 {{ COST_MIN }}–{{ COST_MAX }}，与档案的成本分桶一致。</li>
          <li>记录先进入待审核队列，通过后才会在档案页公开展示。</li>
        </ul>
      </details>

      <ol
        class="submission-steps"
        aria-label="投稿步骤"
      >
        <li
          v-for="(entry, index) in steps"
          :key="entry.id"
        >
          <button
            class="submission-step-tab"
            :class="{ active: stepIndex === index, passed: index < stepIndex }"
            type="button"
            :disabled="index > unlockedIndex"
            :aria-current="stepIndex === index ? 'step' : undefined"
            @click="goTo(index)"
          >
            <span class="submission-step-index">
              <Check
                v-if="index < stepIndex"
                :size="13"
                aria-hidden="true"
              />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <component
              :is="entry.icon"
              :size="15"
              aria-hidden="true"
            />
            <span>{{ entry.label }}</span>
            <Lock
              v-if="index > unlockedIndex"
              :size="13"
              aria-hidden="true"
            />
          </button>
        </li>
      </ol>

      <p
        v-if="stepErrors.length > 0"
        class="submission-error"
        role="alert"
      >
        <AlertCircle
          :size="15"
          aria-hidden="true"
        />
        {{ stepErrors[0].message }}
        <span v-if="stepErrors.length > 1">（另有 {{ stepErrors.length - 1 }} 处待补全）</span>
      </p>

      <div
        v-if="currentStep === 'basic'"
        class="submission-step-body"
      >
        <div class="filter-section">
          <p class="section-label">
            竞赛模式
          </p>
          <div class="mode-grid">
            <button
              v-for="mode in config.modes"
              :key="mode.id"
              class="mode-tab"
              :class="{ active: form.mode === mode.id }"
              type="button"
              @click="patchMode(mode.id)"
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

        <div class="split-fields">
          <label class="field">
            <span>赛季</span>
            <select v-model="form.seasonId">
              <option
                v-for="season in config.seasons"
                :key="season.id"
                :value="season.id"
              >
                {{ season.label }}
              </option>
            </select>
            <small
              v-if="fieldError('seasonId')"
              class="field-error"
            >{{ fieldError("seasonId") }}</small>
          </label>
          <label class="field">
            <span>敌方阶段</span>
            <select v-model="form.bossId">
              <option
                v-for="boss in stages"
                :key="boss.id"
                :value="boss.id"
              >
                {{ boss.name }} · {{ boss.subtitle }}
              </option>
            </select>
            <small
              v-if="fieldError('bossId')"
              class="field-error"
            >{{ fieldError("bossId") }}</small>
          </label>
        </div>

        <p
          v-if="target.stageName !== '未选择'"
          class="submission-stage-meta"
        >
          <span>血量 {{ target.hp || "未公开" }}</span>
          <span>速度 {{ target.speed || "—" }}</span>
          <span>韧性 {{ target.toughness || "—" }}</span>
          <span v-if="target.weakness.length">弱点 {{ target.weakness.join(" / ") }}</span>
        </p>

        <div class="filter-section">
          <p class="section-label">
            记录分类
          </p>
          <div class="submission-category-grid">
            <button
              v-for="category in categoryOptions"
              :key="category.id"
              class="wide-option compact"
              :class="{ active: form.category === category.id }"
              type="button"
              @click="selectCategory(category.id)"
            >
              {{ category.label }}
            </button>
          </div>
          <p class="submission-field-hint">
            {{ categoryHint }}
          </p>
          <small
            v-if="fieldError('category')"
            class="field-error"
          >{{ fieldError("category") }}</small>
        </div>

        <div class="form-grid">
          <label class="field span-2">
            <span>作者</span>
            <input
              v-model.trim="form.author"
              type="text"
              maxlength="32"
              placeholder="展示名称，例如 夜航"
            >
            <small
              v-if="fieldError('author')"
              class="field-error"
            >{{ fieldError("author") }}</small>
          </label>
          <label class="field">
            <span>视频链接</span>
            <input
              v-model.trim="form.videoUrl"
              type="url"
              placeholder="B 站或 YouTube 原始录像链接"
            >
            <small
              v-if="fieldError('videoUrl')"
              class="field-error"
            >{{ fieldError("videoUrl") }}</small>
          </label>
        </div>
      </div>

      <div
        v-else-if="currentStep === 'team'"
        class="submission-step-body"
      >
        <div class="submission-roster-head">
          <p class="section-label">
            队伍配置
          </p>
          <span class="team-cost-chip">
            <Sparkles
              :size="13"
              aria-hidden="true"
            />
            限定 {{ goldCounts.limited }} · 常驻 {{ goldCounts.standard }}
          </span>
        </div>

        <label class="field">
          <span>队伍名称</span>
          <input
            v-model.trim="form.teamName"
            type="text"
            maxlength="40"
            placeholder="例：大黑塔双同谐"
          >
          <small
            v-if="fieldError('teamName')"
            class="field-error"
          >{{ fieldError("teamName") }}</small>
        </label>

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
            @update-lightcone="form.lightcones[index].unitId = $event"
            @update-superimposition="form.lightcones[index].superimposition = $event"
          />
        </div>

        <p class="submission-field-hint">
          已配置 {{ configuredSlots }}/{{ TEAM_SLOT_COUNT }} 个槽位；角色不可重复，光锥可重复，光锥列表优先展示与角色同命途的选项。
        </p>
      </div>

      <div
        v-else
        class="submission-step-body"
      >
        <div class="form-grid">
          <label class="field">
            <span>轮次</span>
            <input
              v-model.number="form.cycle"
              type="number"
              min="0"
              step="1"
            >
            <small
              v-if="fieldError('cycle')"
              class="field-error"
            >{{ fieldError("cycle") }}</small>
          </label>
          <label class="field">
            <span>分数</span>
            <input
              v-model.number="form.score"
              type="number"
              min="0"
              :max="form.mode === 'as' ? AS_MAX_SCORE : undefined"
              step="1"
            >
            <small
              v-if="fieldError('score')"
              class="field-error"
            >{{ fieldError("score") }}</small>
          </label>
          <label class="field">
            <span>成本</span>
            <input
              v-model.number="form.cost"
              type="number"
              :min="COST_MIN"
              :max="COST_MAX"
              step="1"
            >
            <small
              v-if="fieldError('cost')"
              class="field-error"
            >{{ fieldError("cost") }}</small>
          </label>
        </div>

        <p
          v-if="scoreHint"
          class="submission-field-hint"
        >
          {{ scoreHint }}
        </p>

        <label class="field">
          <span>备注</span>
          <textarea
            v-model.trim="form.notes"
            rows="3"
            placeholder="可填写轴、特殊限制、是否自动等审核信息。"
          />
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
          </dl>
          <ol class="submission-preview-team">
            <li
              v-for="line in roster"
              :key="line.index"
            >
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
              >{{ goldKindLabels[line.gold] }}</span>
            </li>
          </ol>
          <p class="submission-preview-metrics">
            <span>轮次 {{ form.cycle }}</span>
            <span>分数 {{ form.score }}</span>
            <span>成本 {{ form.cost }}</span>
            <span>限定 {{ goldCounts.limited }} · 常驻 {{ goldCounts.standard }}</span>
          </p>
          <a
            class="submission-preview-video"
            :href="form.videoUrl.trim() || undefined"
            target="_blank"
            rel="noopener noreferrer"
          >{{ form.videoUrl.trim() || "未填写视频链接" }}</a>
        </section>
      </div>

      <div class="submission-nav">
        <button
          v-if="stepIndex > 0"
          class="icon-button"
          type="button"
          @click="previousStep"
        >
          <ChevronLeft
            :size="16"
            aria-hidden="true"
          />
          上一步
        </button>
        <span v-else />
        <button
          v-if="stepIndex < steps.length - 1"
          class="icon-button primary-action"
          type="button"
          @click="nextStep"
        >
          下一步
          <ChevronRight
            :size="16"
            aria-hidden="true"
          />
        </button>
        <button
          v-else
          class="icon-button primary-action"
          type="submit"
          :disabled="submitting"
        >
          <Send
            :size="16"
            aria-hidden="true"
          />
          {{ submitting ? "提交中" : "提交到审核队列" }}
        </button>
      </div>

      <p
        v-if="submitFailure"
        class="submission-error"
        role="alert"
      >
        <AlertCircle
          :size="15"
          aria-hidden="true"
        />
        {{ submitFailure }}
      </p>
    </form>
  </div>
</template>
