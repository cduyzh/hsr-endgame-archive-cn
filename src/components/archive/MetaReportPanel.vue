<script setup lang="ts">
import { X } from "lucide-vue-next"
import type { MetaStats } from "@/types/archive"

defineProps<{
  open: boolean
  stats: MetaStats | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" role="presentation" @click.self="emit('close')">
      <section class="meta-modal" role="dialog" aria-modal="true" aria-labelledby="meta-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">环境统计</p>
            <h2 id="meta-title">当前筛选的样本分布</h2>
          </div>
          <button class="square-button" type="button" aria-label="关闭统计" @click="emit('close')">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <div v-if="loading" class="system-message">正在计算样本...</div>
        <div v-else-if="error" class="system-message error">{{ error }}</div>
        <div v-else-if="!stats" class="empty-state">暂无可展示统计。</div>
        <div v-else class="meta-grid">
          <article class="stat-panel">
            <h3>角色使用率</h3>
            <ol>
              <li v-for="entry in stats.characterUsage.slice(0, 8)" :key="entry.unit.id">
                <span>{{ entry.unit.name }}</span>
                <b>{{ entry.rate }}%</b>
              </li>
            </ol>
          </article>
          <article class="stat-panel">
            <h3>光锥使用率</h3>
            <ol>
              <li v-for="entry in stats.lightconeUsage.slice(0, 8)" :key="entry.unit.id">
                <span>{{ entry.unit.name }}</span>
                <b>{{ entry.rate }}%</b>
              </li>
            </ol>
          </article>
          <article class="stat-panel wide">
            <h3>常见组合</h3>
            <ol>
              <li v-for="combo in stats.teamCombos.slice(0, 6)" :key="combo.name">
                <span>{{ combo.name }}</span>
                <b>{{ combo.count }} 次 / 最优 {{ combo.bestCycle }} 轮</b>
              </li>
            </ol>
          </article>
          <article class="stat-panel">
            <h3>成本分布</h3>
            <ol>
              <li v-for="bucket in stats.costBuckets" :key="bucket.label">
                <span>{{ bucket.label }}</span>
                <b>{{ bucket.count }} 条</b>
              </li>
            </ol>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>
