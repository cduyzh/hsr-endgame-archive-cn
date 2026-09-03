<script setup lang="ts">
import { computed } from "vue"
import { ArchiveRestore, Check, ExternalLink, ShieldCheck, X } from "lucide-vue-next"
import { getUnitImageSrc } from "@/data/unitAssets"
import { seedConfig } from "@/data/seed"
import { categoryLabels, flagLabels, flagOrder } from "@/services/runUtils"
import type { SubmissionReview, SubmissionReviewStatus } from "@/types/archive"

const props = defineProps<{
  review: SubmissionReview
  note: string
  acting: boolean
}>()

const emit = defineEmits<{
  "update:note": [value: string]
  review: [status: SubmissionReviewStatus]
}>()

const bossNameById = new Map(seedConfig.bosses.map((boss) => [boss.id, boss.name]))
const modeNameById = new Map(seedConfig.modes.map((mode) => [mode.id, mode.label]))
const unitNameById = new Map(seedConfig.units.map((unit) => [unit.id, unit.name]))
const unitById = new Map(seedConfig.units.map((unit) => [unit.id, unit]))

const reviewFlags = computed(() =>
  flagOrder.filter((flag) => (props.review.payload.flags ?? []).includes(flag)),
)

const slots = computed(() =>
  props.review.payload.units.map((character, index) => ({
    character,
    characterUnit: unitById.get(character.unitId),
    lightcone: props.review.payload.lightcones[index],
    lightconeUnit: unitById.get(props.review.payload.lightcones[index]?.unitId),
  })),
)

function statusLabel(status: SubmissionReviewStatus) {
  return status === "pending" ? "待审核" : status === "approved" ? "已通过" : "已驳回"
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}
</script>

<template>
  <article class="review-card">
    <div class="review-main">
      <div>
        <p class="eyebrow">
          {{ review.id }} / {{ formatDate(review.createdAt) }}
        </p>
        <h3>{{ review.payload.teamName }}</h3>
        <p>
          {{ review.payload.author }} · {{ modeNameById.get(review.payload.mode) ?? review.payload.mode }} ·
          {{ bossNameById.get(review.payload.bossId) ?? review.payload.bossId }}
        </p>
        <p
          v-if="reviewFlags.length"
          class="review-flags"
        >
          <span
            v-for="flag in reviewFlags"
            :key="flag"
            class="run-flag"
            :class="`run-flag-${flag}`"
          >
            {{ flagLabels[flag] }}
          </span>
        </p>
      </div>
      <span :class="['review-status', review.status]">{{ statusLabel(review.status) }}</span>
    </div>

    <dl class="review-metrics">
      <div><dt>轮次</dt><dd>{{ review.payload.cycle }}</dd></div>
      <div><dt>分数</dt><dd>{{ review.payload.score }}</dd></div>
      <div><dt>成本</dt><dd>{{ review.payload.cost }}</dd></div>
      <div>
        <dt>分类</dt>
        <dd>{{ categoryLabels[review.payload.category] ?? review.payload.category }}</dd>
      </div>
    </dl>

    <div
      class="review-team-grid"
      aria-label="投稿队伍配置"
    >
      <article
        v-for="(slot, index) in slots"
        :key="`${review.id}-${index}`"
        class="review-team-slot"
      >
        <div class="review-unit-line">
          <img
            v-if="slot.characterUnit"
            :src="getUnitImageSrc(slot.characterUnit) ?? undefined"
            :alt="slot.characterUnit.name"
          >
          <span>
            <strong>{{ slot.characterUnit?.name ?? unitNameById.get(slot.character.unitId) ?? slot.character.unitId }}</strong>
            <small>E{{ slot.character.eidolon ?? 0 }}</small>
          </span>
        </div>
        <div class="review-unit-line lightcone">
          <img
            v-if="slot.lightconeUnit"
            :src="getUnitImageSrc(slot.lightconeUnit) ?? undefined"
            :alt="slot.lightconeUnit.name"
          >
          <span>
            <strong>{{ slot.lightconeUnit?.name ?? slot.lightcone?.unitId ?? "未填写" }}</strong>
            <small>S{{ slot.lightcone?.superimposition ?? 1 }}</small>
          </span>
        </div>
      </article>
    </div>

    <div class="review-loadout">
      <p v-if="review.payload.notes">
        <strong>投稿备注</strong>{{ review.payload.notes }}
      </p>
      <a
        :href="review.payload.videoUrl"
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink
          :size="14"
          aria-hidden="true"
        />
        打开视频链接
      </a>
    </div>

    <label class="field">
      <span>审核备注</span>
      <textarea
        :value="note"
        rows="2"
        placeholder="可填写驳回原因或管理备注"
        @input="emit('update:note', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <div class="form-actions">
      <div class="review-actions">
        <button
          v-if="review.status !== 'approved'"
          class="icon-button primary-action"
          type="button"
          :disabled="acting"
          @click="emit('review', 'approved')"
        >
          <Check
            :size="17"
            aria-hidden="true"
          />
          {{ acting ? "处理中" : review.status === "rejected" ? "重新通过" : "通过并发布" }}
        </button>
        <button
          v-if="review.status !== 'rejected'"
          class="icon-button danger-action"
          type="button"
          :disabled="acting"
          @click="emit('review', 'rejected')"
        >
          <X
            :size="17"
            aria-hidden="true"
          />
          {{ review.status === "approved" ? "撤下并驳回" : "驳回" }}
        </button>
        <button
          v-if="review.status !== 'pending'"
          class="icon-button"
          type="button"
          :disabled="acting"
          @click="emit('review', 'pending')"
        >
          <ArchiveRestore
            :size="17"
            aria-hidden="true"
          />
          退回待审
        </button>
      </div>
      <span class="review-reviewed-at">
        <ShieldCheck
          :size="15"
          aria-hidden="true"
        />
        {{ review.reviewedAt ? `审核于 ${formatDate(review.reviewedAt)}` : "尚未审核" }}
      </span>
    </div>
  </article>
</template>
