<script setup lang="ts">
import { onMounted } from "vue"
import { useArchiveStore } from "@/stores/archiveStore"

const archiveStore = useArchiveStore()

onMounted(() => {
  void archiveStore.loadConfig()
})
</script>

<template>
  <main class="page-narrow">
    <div class="page-heading">
      <p class="eyebrow">研究记录</p>
      <h1>攻略与公告</h1>
      <p>第一版使用静态文章索引，后续可接入 Markdown 或数据库文章系统。</p>
    </div>

    <div v-if="archiveStore.loading" class="system-message">正在读取文章...</div>
    <section v-else class="article-list">
      <article v-for="article in archiveStore.articles" :key="article.id" class="article-card">
        <span>{{ article.category }}</span>
        <h2>{{ article.title }}</h2>
        <p>{{ article.excerpt }}</p>
        <small>{{ article.publishedAt }} / {{ article.readMinutes }} 分钟</small>
      </article>
    </section>
  </main>
</template>
