<script setup lang="ts">
import { ArrowUpRight } from "lucide-vue-next"
import ArticleImage from "@/components/ArticleImage.vue"
import { articleCover, groupedArticles, SERIES_CATEGORY, splitByVersion } from "@/data/articles"

const groups = groupedArticles()
</script>

<template>
  <main class="page-narrow">
    <div class="page-heading">
      <p class="eyebrow">
        研究记录
      </p>
      <h1>攻略与公告</h1>
      <p>
        强敌机制类文章来自《崩坏：星穹铁道》官方公众号「强敌侦察笔记」系列，由
        <code>pnpm sync:articles</code> 建立索引；正文与配图热链来源站，本站不落地存储。
      </p>
    </div>

    <section
      v-for="group in groups"
      :key="group.category"
      class="article-group"
      :aria-label="group.category"
    >
      <h2 class="article-group-title">
        {{ group.category }}
        <small>{{ group.items.length }} 篇</small>
      </h2>

      <!-- 首领笔记量大（全系列数十篇），用版本分段 + 紧凑行，避免整页都是大封面 -->
      <template v-if="group.category === SERIES_CATEGORY">
        <div
          v-for="section in splitByVersion(group.items)"
          :key="section.label"
          class="article-section"
        >
          <h3 class="article-section-title">
            {{ section.label }}
          </h3>
          <RouterLink
            v-for="article in section.items"
            :key="article.id"
            class="article-row"
            :to="`/articles/${article.id}`"
          >
            <div
              v-if="articleCover(article)"
              class="article-row-thumb"
            >
              <ArticleImage
                :src="articleCover(article)"
                :alt="article.title"
              />
            </div>
            <div class="article-row-body">
              <h4 :title="article.title">
                {{ article.subject || article.title }}
              </h4>
              <small>{{ article.publishedAt }} · {{ article.imageCount }} 图 · {{ article.readMinutes }} 分钟</small>
            </div>
            <ArrowUpRight
              class="article-row-arrow"
              :size="14"
              aria-hidden="true"
            />
          </RouterLink>
        </div>
      </template>

      <div
        v-else
        class="article-list"
      >
        <RouterLink
          v-for="article in group.items"
          :key="article.id"
          class="article-card"
          :to="`/articles/${article.id}`"
        >
          <div
            v-if="articleCover(article)"
            class="article-thumb"
          >
            <ArticleImage
              :src="articleCover(article)"
              :alt="article.title"
            />
          </div>
          <div class="article-body">
            <span>{{ article.sourceName }}</span>
            <h3>{{ article.title }}</h3>
            <p>{{ article.excerpt }}</p>
            <small>{{ article.publishedAt }} · {{ article.readMinutes }} 分钟</small>
          </div>
          <ArrowUpRight
            class="article-arrow"
            :size="16"
            aria-hidden="true"
          />
        </RouterLink>
      </div>
    </section>
  </main>
</template>
