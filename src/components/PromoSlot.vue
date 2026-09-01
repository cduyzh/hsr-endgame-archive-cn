<script setup lang="ts">
  import { ExternalLink, Sparkles } from "lucide-vue-next";
</script>

<template>
  <aside
    class="promo-slot"
    aria-label="相关项目推广"
  >
    <a
      class="promo-slot-link"
      href="https://hsr-endgame-hp-trend-20260704.netlify.app"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span
        class="promo-slot-mark"
        aria-hidden="true"
      >
        <Sparkles :size="16" />
      </span>
      <span class="promo-slot-copy">
        <span class="promo-slot-kicker">相关项目</span>
        <span class="promo-slot-title">终局血量趋势</span>
        <span class="promo-slot-sub">聚焦赛季总 HP、节点波次与怪物构成，复盘终局膨胀曲线</span>
      </span>
      <span
        class="promo-slot-cta"
        aria-hidden="true"
      >
        前往查看
        <ExternalLink :size="14" />
      </span>
    </a>
  </aside>
</template>

<style scoped>
  .promo-slot {
    position: relative;
    z-index: 20;
    padding: 10px clamp(14px, 3vw, 28px);
    border-bottom: 1px solid var(--line);
    background:
      linear-gradient(
        90deg,
        rgba(223, 189, 122, 0.12),
        rgba(117, 199, 170, 0.08) 60%,
        transparent
      ),
      rgba(18, 17, 15, 0.7);
    backdrop-filter: blur(10px);
  }

  .promo-slot-link {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 44px;
    padding: 8px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: linear-gradient(
      180deg,
      rgba(33, 31, 27, 0.92),
      rgba(23, 22, 20, 0.92)
    );
    text-decoration: none;
    color: inherit;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      transform 180ms ease;
  }

  .promo-slot-link:hover,
  .promo-slot-link:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 12px 30px rgba(223, 189, 122, 0.18);
    transform: translateY(-1px);
    outline: none;
  }

  .promo-slot-mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--accent), var(--primary));
    color: #1a1410;
    flex-shrink: 0;
    box-shadow: 0 6px 18px rgba(223, 189, 122, 0.32);
  }

  .promo-slot-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .promo-slot-kicker {
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .promo-slot-title {
    font-size: 14px;
    font-weight: 680;
    line-height: 1.2;
    color: var(--text);
  }

  .promo-slot-sub {
    font-size: 12px;
    line-height: 1.4;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .promo-slot-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    background: rgba(223, 189, 122, 0.1);
    color: var(--accent);
    font-size: 12px;
    font-weight: 640;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      background 180ms ease,
      color 180ms ease;
  }

  .promo-slot-link:hover .promo-slot-cta,
  .promo-slot-link:focus-visible .promo-slot-cta {
    background: var(--accent);
    color: #1a1410;
  }

  @media (max-width: 640px) {
    .promo-slot {
      padding: 8px 10px;
    }

    .promo-slot-link {
      gap: 10px;
      padding: 8px 10px;
    }

    .promo-slot-mark {
      width: 32px;
      height: 32px;
    }

    .promo-slot-sub {
      display: none;
    }

    .promo-slot-cta {
      padding: 5px 10px;
    }
  }
</style>
