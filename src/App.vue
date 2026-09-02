<script setup lang="ts">
  import {
    BookOpen,
    CircleHelp,
    ClipboardCheck,
    Database,
    KeyRound,
    Send,
  } from "lucide-vue-next";
  import PromoSlot from "@/components/PromoSlot.vue";
  import SubmitRunDialog from "@/components/archive/SubmitRunDialog.vue";
  import { useSubmissionDialog } from "@/composables/useSubmissionDialog";

  const navItems = [
    { to: "/", label: "档案", icon: Database },
    { to: "/articles", label: "文章", icon: BookOpen },
    { to: "/faq", label: "规则", icon: CircleHelp },
    { to: "/me", label: "我的投稿", icon: KeyRound },
    { to: "/admin/submissions", label: "审核", icon: ClipboardCheck },
  ] as const;

  const { isOpen: submitOpen, open: openSubmitDialog, close: closeSubmitDialog } = useSubmissionDialog();
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink
        class="brand-lockup"
        to="/"
      >
        <span
          class="brand-mark"
          aria-hidden="true"
        >档</span>
        <span>
          <span class="brand-title-line">
            <strong>竞速档案站</strong>
            <small class="brand-version">CN</small>
          </span>
          <small>终局样本 · 战斗记录研究组</small>
        </span>
      </RouterLink>

      <div class="header-actions">
        <nav
          class="app-nav"
          aria-label="主导航"
        >
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
          >
            <component
              :is="item.icon"
              :size="15"
              aria-hidden="true"
            />
            {{ item.label }}
          </RouterLink>
        </nav>
        <button
          class="header-submit"
          type="button"
          @click="openSubmitDialog"
        >
          <Send
            :size="15"
            aria-hidden="true"
          />
          提交记录
        </button>
      </div>
    </header>

    <PromoSlot />

    <RouterView />

    <SubmitRunDialog
      :open="submitOpen"
      @close="closeSubmitDialog"
    />
  </div>
</template>
