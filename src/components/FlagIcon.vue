<script setup lang="ts">
import { Flame, HeartPulse, Medal } from "lucide-vue-next"
import { shallowRef } from "vue"
import { FLAG_ICON_SOURCES } from "@/data/flagIcons"
import type { RunFlag } from "@/types/archive"

const props = withDefaults(
  defineProps<{
    flag: RunFlag
    size?: number
  }>(),
  { size: 24 },
)

const fallbackIcons = { revive: HeartPulse, firewall: Flame, bpWeapon: Medal } as const

const remoteFailed = shallowRef(false)
</script>

<template>
  <img
    v-if="!remoteFailed"
    class="flag-icon"
    :src="FLAG_ICON_SOURCES[props.flag]"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    alt=""
    loading="lazy"
    decoding="async"
    @error="remoteFailed = true"
  >
  <component
    :is="fallbackIcons[props.flag]"
    v-else
    class="flag-icon flag-icon-fallback"
    :size="props.size"
    aria-hidden="true"
  />
</template>
