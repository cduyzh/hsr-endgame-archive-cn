<script setup lang="ts">
import { computed } from "vue"
import { Sparkles } from "lucide-vue-next"
import UnitSearchSelect from "@/components/archive/UnitSearchSelect.vue"
import type { ArchiveUnit, RunUnit } from "@/types/archive"

const props = defineProps<{
  index: number
  character: RunUnit
  lightcone: RunUnit
  characters: ArchiveUnit[]
  lightcones: ArchiveUnit[]
  disabledCharacterIds: string[]
  preferredLightconeId?: string
}>()

const emit = defineEmits<{
  updateCharacter: [unitId: string]
  updateEidolon: [eidolon: number]
  updateLightcone: [unitId: string]
  updateSuperimposition: [superimposition: number]
}>()

const selectedCharacter = computed(() => props.characters.find((unit) => unit.id === props.character.unitId) ?? null)
const orderedLightcones = computed(() => {
  const path = selectedCharacter.value?.path
  return [...props.lightcones].sort((a, b) => {
    const pathPriority = path ? Number(b.path === path) - Number(a.path === path) : 0
    return pathPriority || b.rarity - a.rarity || a.name.localeCompare(b.name, "zh-CN")
  })
})
const isAutoPaired = computed(
  () => Boolean(props.preferredLightconeId && props.preferredLightconeId === props.lightcone.unitId),
)
</script>

<template>
  <article class="submission-team-slot">
    <div class="submission-team-slot-heading">
      <div>
        <span>单位 {{ index + 1 }}</span>
        <strong>{{ index === 0 ? "主位" : "队伍成员" }}</strong>
      </div>
      <span v-if="isAutoPaired" class="auto-pair-badge">
        <Sparkles :size="13" aria-hidden="true" />
        已自动搭配
      </span>
    </div>

    <div class="submission-unit-pair">
      <div class="submission-unit-control">
        <UnitSearchSelect
          :model-value="character.unitId"
          :units="characters"
          :disabled-unit-ids="disabledCharacterIds"
          :label="`选择角色 ${index + 1}`"
          placeholder="选择角色"
          search-placeholder="搜索角色或命途"
          @update:model-value="emit('updateCharacter', $event)"
        />
        <div class="level-segments" :aria-label="`角色 ${index + 1} 命座`">
          <button
            v-for="level in 7"
            :key="level - 1"
            type="button"
            :class="{ active: character.eidolon === level - 1 }"
            @click="emit('updateEidolon', level - 1)"
          >
            E{{ level - 1 }}
          </button>
        </div>
      </div>

      <div class="submission-unit-control">
        <UnitSearchSelect
          :model-value="lightcone.unitId"
          :units="orderedLightcones"
          :label="`选择光锥 ${index + 1}`"
          placeholder="选择光锥"
          search-placeholder="搜索光锥或命途"
          @update:model-value="emit('updateLightcone', $event)"
        />
        <div class="level-segments lightcone-levels" :aria-label="`光锥 ${index + 1} 叠影`">
          <button
            v-for="level in 5"
            :key="level"
            type="button"
            :class="{ active: lightcone.superimposition === level }"
            @click="emit('updateSuperimposition', level)"
          >
            S{{ level }}
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
