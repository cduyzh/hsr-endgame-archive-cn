<script setup lang="ts">
import { computed, shallowRef, watch } from "vue"
import { ELEMENT_ICON_SOURCES } from "@/data/elementIcons"
import type { ElementType } from "@/types/archive"

const props = withDefaults(
  defineProps<{
    element: ElementType
    /** 抗性百分比等附注文案，渲染在图标下方；弱点留空。 */
    value?: string
    size?: number
  }>(),
  { value: undefined, size: 18 },
)

const failed = shallowRef(false)
// 同一组件实例换属性时（切换敌方阶段）要重新给远程图标一次机会。
watch(() => props.element, () => { failed.value = false })
const src = computed(() => ELEMENT_ICON_SOURCES[props.element])
</script>

<template>
  <span
    class="element-chip"
    :class="`element-${props.element}`"
  >
    <img
      v-if="!failed"
      class="element-icon"
      :src="src"
      :alt="props.element"
      :title="props.element"
      :style="{ width: `${props.size}px`, height: `${props.size}px` }"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    >
    <b v-else>{{ props.element }}</b>
    <small v-if="props.value">{{ props.value }}</small>
  </span>
</template>
