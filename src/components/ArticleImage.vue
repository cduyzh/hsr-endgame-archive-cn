<script setup lang="ts">
import { ImageOff } from "lucide-vue-next"
import { shallowRef } from "vue"

const props = withDefaults(
  defineProps<{
    src: string
    alt?: string
    eager?: boolean
  }>(),
  { alt: "", eager: false },
)

const broken = shallowRef(false)

/**
 * 微信图床按 Referer 防盗链：带非腾讯域名时返回 200 + 一张 140x140 的占位图，
 * `@error` 不会触发，只能靠尺寸自检识别。占位图阈值取 160，留出余量。
 */
function onLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (img.naturalWidth > 0 && img.naturalWidth <= 160 && img.naturalHeight <= 160) {
    broken.value = true
    console.warn("[articles] 微信图片被防盗链拦截", props.src)
  }
}
</script>

<template>
  <img
    v-if="!broken && props.src"
    class="article-image"
    :src="props.src"
    :alt="props.alt"
    referrerpolicy="no-referrer"
    :loading="props.eager ? 'eager' : 'lazy'"
    decoding="async"
    @error="broken = true"
    @load="onLoad"
  >
  <span
    v-else
    class="article-image article-image-fallback"
    :role="props.alt ? 'img' : undefined"
    :aria-label="props.alt || undefined"
  >
    <ImageOff
      :size="20"
      aria-hidden="true"
    />
  </span>
</template>
