<script setup lang="ts">
  import { shallowRef } from "vue";
  import { Check, Copy, Mail, MessageCircle } from "lucide-vue-next";
  import { copyTextToClipboard } from "@/services/clipboard";

  const WECHAT_ID = "cduyzh";
  // 收件地址拆开写，让不执行 JS 的 bundle 正则采集拿不到连续的邮箱串。
  const MAIL_USER = "cduyzh";
  const MAIL_HOST = "gmail.com";
  const mailAddress = `${MAIL_USER}@${MAIL_HOST}`;

  const copyResult = shallowRef<{ key: string; ok: boolean } | null>(null);

  async function copy(value: string, key: string) {
    copyResult.value = { key, ok: await copyTextToClipboard(value) };
    setTimeout(() => {
      copyResult.value = null;
    }, 1800);
  }

  function copyState(key: string) {
    const result = copyResult.value;
    if (!result || result.key !== key) return "idle";
    return result.ok ? "done" : "failed";
  }

  function copyText(key: string): string {
    const state = copyState(key);
    if (state === "done") return "已复制";
    if (state === "failed") return "复制失败";
    return "复制";
  }

  function copyHint(key: string, noun: string): string {
    const state = copyState(key);
    if (state === "done") return `已复制${noun}`;
    if (state === "failed") return `${noun}复制失败，请手动选中`;
    return `复制${noun}`;
  }
</script>

<template>
  <main class="page-narrow">
    <div class="page-heading">
      <p class="eyebrow">
        站务
      </p>
      <h1>联系站主</h1>
      <p>
        只开放微信与邮箱两种联系方式。站内没有留言板、私信和投稿表单，投稿请走首页右上角的「提交记录」；成绩纠错、数据问题与其他反馈都按下面的方式联系。
      </p>
    </div>

    <section class="faq-list contact-list">
      <article>
        <h2>
          <MessageCircle
            :size="16"
            aria-hidden="true"
          />
          微信 · 直接添加好友
        </h2>
        <div class="contact-value-row">
          <span class="contact-value">{{ WECHAT_ID }}</span>
          <button
            class="icon-button mini"
            type="button"
            :aria-label="copyHint('wechat', '微信号')"
            @click="copy(WECHAT_ID, 'wechat')"
          >
            <Check
              v-if="copyState('wechat') === 'done'"
              :size="14"
              aria-hidden="true"
            />
            <Copy
              v-else
              :size="14"
              aria-hidden="true"
            />
            {{ copyText("wechat") }}
          </button>
        </div>
        <p class="contact-hint">
          在微信「添加朋友 → 微信号」里搜索 <strong>{{ WECHAT_ID }}</strong> 即可添加，备注写明来意（投稿、纠错或数据问题）。微信没有按号加好友的跳转链接，所以这里只提供微信号，无法点击直达。
        </p>
      </article>

      <article>
        <h2>
          <Mail
            :size="16"
            aria-hidden="true"
          />
          邮箱 · 邮件联系
        </h2>
        <div class="contact-value-row">
          <a
            class="contact-link contact-mail"
            :href="`mailto:${mailAddress}`"
          >
            {{ mailAddress }}
          </a>
          <button
            class="icon-button mini"
            type="button"
            :aria-label="copyHint('mail', '邮箱地址')"
            @click="copy(mailAddress, 'mail')"
          >
            <Check
              v-if="copyState('mail') === 'done'"
              :size="14"
              aria-hidden="true"
            />
            <Copy
              v-else
              :size="14"
              aria-hidden="true"
            />
            {{ copyText("mail") }}
          </button>
        </div>
        <p class="contact-hint">
          适合带截图、表格或长视频的说明。打不开邮件客户端时，请手动复制到收件人。
        </p>
      </article>
    </section>
  </main>
</template>
