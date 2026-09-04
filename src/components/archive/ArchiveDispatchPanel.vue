<script setup lang="ts">
import { ArrowUpRight, BookOpenText } from "lucide-vue-next"
import ArticleImage from "@/components/ArticleImage.vue"
import { articleCover, dispatchArticles } from "@/data/articles"

/** 速报最多铺 3 张卡，第 1 张为大图位。 */
const articles = dispatchArticles(3)
</script>

<template>
  <section
    v-if="articles.length > 0"
    class="dispatch-panel"
    aria-labelledby="dispatch-title"
  >
    <div class="dispatch-heading">
      <div>
        <p class="eyebrow">
          THE ARCHIVE DISPATCH
        </p>
        <h2 id="dispatch-title">
          档案速报
        </h2>
      </div>
      <RouterLink
        class="dispatch-more"
        to="/articles"
      >
        查看全部
        <ArrowUpRight
          :size="15"
          aria-hidden="true"
        />
      </RouterLink>
    </div>

    <div class="dispatch-grid">
      <RouterLink
        v-for="(article, index) in articles"
        :key="article.id"
        class="dispatch-item"
        :class="{ featured: index === 0, 'no-media': !articleCover(article) }"
        :to="`/articles/${article.id}`"
      >
        <div
          v-if="articleCover(article)"
          class="dispatch-media"
        >
          <ArticleImage
            :src="articleCover(article)"
            :alt="article.title"
            :eager="index === 0"
          />
        </div>
        <div class="dispatch-copy">
          <span class="dispatch-meta">
            <BookOpenText
              :size="13"
              aria-hidden="true"
            />
            0{{ index + 1 }} · {{ article.category }} · {{ article.readMinutes }} 分钟
          </span>
          <h3>{{ article.title }}</h3>
          <p>{{ article.excerpt }}</p>
          <time :datetime="article.publishedAt || undefined">{{ article.publishedAt }}</time>
          <small class="dispatch-source">{{ article.sourceName }}</small>
        </div>
        <ArrowUpRight
          class="dispatch-arrow"
          :size="18"
          aria-hidden="true"
        />
      </RouterLink>

      <div
        v-if="articles.length < 3"
        class="dispatch-placeholder"
        aria-label="等待下一份档案速报"
      >
        <span>LATEST DISPATCHES</span>
        <strong>下一份研究记录整理中</strong>
        <small>ARCHIVE CHANNEL // STANDBY</small>
      </div>
    </div>
  </section>
</template>
