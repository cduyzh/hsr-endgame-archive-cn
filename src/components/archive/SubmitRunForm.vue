<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from "vue"
import { CheckCircle2, Send } from "lucide-vue-next"
import SubmissionTeamSlot from "@/components/archive/SubmissionTeamSlot.vue"
import { submitRun } from "@/services/archiveService"
import type { ArchiveConfig, EndgameMode, SubmissionPayload } from "@/types/archive"

const props = defineProps<{
  config: ArchiveConfig
  preferredLightconeByCharacter: Record<string, string>
}>()

const status = shallowRef<"idle" | "submitting" | "success" | "error">("idle")
const message = shallowRef("")

const form = reactive<SubmissionPayload>({
  seasonId: props.config.seasons.find((season) => season.isCurrent)?.id ?? props.config.seasons[0]?.id ?? "",
  mode: "moc",
  bossId: "",
  category: "fullStars",
  author: "",
  teamName: "",
  cycle: 0,
  score: 40000,
  cost: 0,
  videoUrl: "",
  notes: "",
  units: [
    { unitId: "", eidolon: 0 },
    { unitId: "", eidolon: 0 },
    { unitId: "", eidolon: 0 },
    { unitId: "", eidolon: 0 },
  ],
  lightcones: [
    { unitId: "", superimposition: 1 },
    { unitId: "", superimposition: 1 },
    { unitId: "", superimposition: 1 },
    { unitId: "", superimposition: 1 },
  ],
})

const bosses = computed(() =>
  props.config.bosses.filter((boss) => boss.seasonId === form.seasonId && boss.mode === form.mode),
)

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

const canSubmit = computed(
  () =>
    form.author.trim() &&
    form.teamName.trim() &&
    form.videoUrl.trim() &&
    form.bossId &&
    form.units.every((unit) => unit.unitId) &&
    form.lightcones.every((unit) => unit.unitId) &&
    new Set(form.units.map((unit) => unit.unitId)).size === form.units.length,
)

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

function syncBossId() {
  if (bosses.value.some((boss) => boss.id === form.bossId)) return
  form.bossId = bosses.value[0]?.id ?? ""
}

function patchMode(mode: EndgameMode) {
  form.mode = mode
  form.bossId = props.config.bosses.find((boss) => boss.seasonId === form.seasonId && boss.mode === mode)?.id ?? ""
}

async function handleSubmit() {
  if (!canSubmit.value) {
    status.value = "error"
    const selectedCharacterIds = form.units.map((unit) => unit.unitId).filter(Boolean)
    message.value =
      new Set(selectedCharacterIds).size !== selectedCharacterIds.length
        ? "同一队伍不能出现重复角色。"
        : "请补全作者、队伍、视频链接、角色和光锥。"
    return
  }
  status.value = "submitting"
  message.value = ""
  try {
    const result = await submitRun({
      ...form,
      author: form.author.trim(),
      teamName: form.teamName.trim(),
      videoUrl: form.videoUrl.trim(),
      notes: form.notes.trim(),
    })
    status.value = "success"
    message.value = `已进入审核队列：${result.id}`
  } catch (err) {
    status.value = "error"
    message.value = err instanceof Error ? err.message : "提交失败"
  }
}

if (!form.bossId) {
  form.bossId = props.config.bosses.find((boss) => boss.seasonId === form.seasonId && boss.mode === form.mode)?.id ?? ""
}

watch(() => form.seasonId, syncBossId)
</script>

<template>
  <form class="submit-form" @submit.prevent="handleSubmit">
    <div class="submission-progress" aria-label="提交流程">
      <span class="active"><b>1</b>记录信息</span>
      <span class="active"><b>2</b>队伍配置</span>
      <span><b>3</b>进入审核</span>
    </div>

    <div class="form-grid">
      <label class="field">
        <span>赛季</span>
        <select v-model="form.seasonId">
          <option v-for="season in config.seasons" :key="season.id" :value="season.id">
            {{ season.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>模式</span>
        <select :value="form.mode" @change="patchMode(($event.target as HTMLSelectElement).value as EndgameMode)">
          <option v-for="mode in config.modes" :key="mode.id" :value="mode.id">
            {{ mode.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>敌方阶段</span>
        <select v-model="form.bossId">
          <option v-for="boss in bosses" :key="boss.id" :value="boss.id">
            {{ boss.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>分类</span>
        <select v-model="form.category">
          <option value="zeroCycle">0 轮竞速</option>
          <option value="fullStars">满星记录</option>
        </select>
      </label>
      <label class="field">
        <span>作者</span>
        <input v-model.trim="form.author" type="text" placeholder="展示名称" />
      </label>
      <label class="field">
        <span>队伍名称</span>
        <input v-model.trim="form.teamName" type="text" placeholder="例：大黑塔双同谐" />
      </label>
      <label class="field">
        <span>轮次</span>
        <input v-model.number="form.cycle" type="number" min="0" />
      </label>
      <label class="field">
        <span>分数</span>
        <input v-model.number="form.score" type="number" min="0" />
      </label>
      <label class="field">
        <span>成本</span>
        <input v-model.number="form.cost" type="number" min="0" />
      </label>
      <label class="field span-2">
        <span>视频链接</span>
        <input v-model.trim="form.videoUrl" type="url" placeholder="B站、YouTube 或可访问的视频地址" />
      </label>
    </div>

    <section class="form-block submission-team-block">
      <div class="form-block-heading">
        <div>
          <h2>队伍配置</h2>
          <p>角色不可重复，光锥可重复。选择角色后会根据本站已收录搭配自动带入常用光锥。</p>
        </div>
        <span class="team-rule-chip">角色去重</span>
      </div>
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
    </section>

    <label class="field">
      <span>备注</span>
      <textarea v-model.trim="form.notes" rows="4" placeholder="可填写轴、特殊限制、是否自动等审核信息。" />
    </label>

    <div class="form-actions">
      <p v-if="message" :class="['form-message', status]">
        <CheckCircle2 v-if="status === 'success'" :size="16" aria-hidden="true" />
        {{ message }}
      </p>
      <button class="icon-button primary-action" type="submit" :disabled="status === 'submitting'">
        <Send :size="17" aria-hidden="true" />
        {{ status === "submitting" ? "提交中" : "提交审核" }}
      </button>
    </div>
  </form>
</template>
