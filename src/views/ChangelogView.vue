<script setup lang="ts">
  import { appVersion, changelogEntries, changelogTagLabels } from "@/data/changelog";
</script>

<template>
  <main class="page-narrow">
    <div class="page-heading">
      <p class="eyebrow">版本记录</p>
      <h1>更新记录</h1>
      <p>站点功能与数据的迭代历史，当前版本 v{{ appVersion }}。</p>
    </div>

    <section class="changelog-list">
      <article
        v-for="(entry, index) in changelogEntries"
        :key="entry.version"
      >
        <header class="changelog-entry-head">
          <h2>
            v{{ entry.version }}
            <span
              v-if="index === 0"
              class="changelog-current"
            >当前</span>
          </h2>
          <time>{{ entry.date }}</time>
        </header>
        <p class="changelog-title">
          {{ entry.title }}
        </p>
        <ul>
          <li
            v-for="item in entry.items"
            :key="item.text"
          >
            <span
              class="changelog-tag"
              :class="`is-${item.tag}`"
            >{{ changelogTagLabels[item.tag] }}</span>
            <span>{{ item.text }}</span>
          </li>
        </ul>
      </article>
    </section>
  </main>
</template>
