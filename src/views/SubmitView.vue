<script setup lang="ts">
import { onMounted } from "vue"
import SubmitRunForm from "@/components/archive/SubmitRunForm.vue"
import { seedRuns } from "@/data/seed"
import { buildPreferredLightconeByCharacter } from "@/services/submissionUtils"
import { useArchiveStore } from "@/stores/archiveStore"

const archiveStore = useArchiveStore()

onMounted(() => {
  void archiveStore.loadConfig()
})
</script>

<template>
  <main class="page-narrow">
    <div class="page-heading">
      <p class="eyebrow">提交审核</p>
      <h1>提交一条竞速记录</h1>
      <p>请填写可验证的视频链接、队伍配置和分数信息。第一版提交会进入待审核队列。</p>
    </div>

    <div v-if="archiveStore.loading" class="system-message">正在装载配置...</div>
    <div v-else-if="archiveStore.error" class="system-message error">{{ archiveStore.error }}</div>
    <SubmitRunForm
      v-else-if="archiveStore.config"
      :config="archiveStore.config"
      :preferred-lightcone-by-character="buildPreferredLightconeByCharacter(seedRuns, archiveStore.config.units)"
    />
  </main>
</template>
