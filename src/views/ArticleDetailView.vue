<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { ArrowLeft, FileText } from "lucide-vue-next"
import ArticleImage from "@/components/ArticleImage.vue"
import { articleById } from "@/data/articles"

const route = useRoute()

const article = computed(() => articleById(String(route.params.id ?? "")))
</script>

<template>
  <main class="page-narrow">
    <div
      v-if="!article"
      class="system-message"
    >
      <FileText
        :size="18"
        aria-hidden="true"
      />
      <p>没有这篇研究记录，可能清单里的地址已经变更。</p>
      <RouterLink to="/articles">
        <ArrowLeft
          :size="15"
          aria-hidden="true"
        />
        返回文章列表
      </RouterLink>
    </div>

    <template v-else>
      <div class="page-heading">
        <p class="eyebrow">
          {{ article.category }}
        </p>
        <h1>{{ article.title }}</h1>
        <p>{{ article.excerpt }}</p>
        <div class="article-detail-meta">
          <span>{{ article.sourceName }}</span>
          <time :datetime="article.publishedAt || undefined">{{ article.publishedAt }}</time>
          <span>{{ article.readMinutes }} 分钟</span>
          <a
            v-if="article.url"
            class="article-source-link"
            :href="article.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            查看微信原文
          </a>
        </div>
      </div>

      <RouterLink
        class="article-back"
        to="/articles"
      >
        <ArrowLeft
          :size="15"
          aria-hidden="true"
        />
        返回文章列表
      </RouterLink>

      <div
        v-if="article.images.length > 0"
        class="article-body-images"
      >
        <ArticleImage
          v-for="(src, index) in article.images"
          :key="src"
          :src="src"
          :alt="`${article.title} 图 ${index + 1}`"
          :eager="index < 2"
        />
      </div>
      <p
        v-else
        class="article-text-only"
      >
        本文为站内原创记录，正文尚未迁移到本模块，仅保留摘要。
      </p>

      <p class="article-disclaimer">
        图文版权归原作者与米哈游所有，本站仅作机制索引与转载阅读，配图热链自微信图床。
        <a
          v-if="article.url"
          :href="article.url"
          target="_blank"
          rel="noopener noreferrer"
        >查看原文</a>
      </p>
    </template>
  </main>
</template>
