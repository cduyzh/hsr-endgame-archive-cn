<script setup lang="ts">
import { Activity, Archive, ChevronDown, Shield, Sparkles, Swords } from "lucide-vue-next"
import { computed, shallowRef, watch } from "vue"
import { isStarwardStage } from "@/services/runUtils"
import type { ElementType, BossStage } from "@/types/archive"

const props = defineProps<{
  boss: BossStage
  seasonLabel: string
  runCount: number
}>()

const resistEntries = computed(() =>
  Object.entries(props.boss.resist).filter((entry): entry is [ElementType, string] => Boolean(entry[1])),
)

const hasResist = computed(() => resistEntries.value.length > 0)
const failedImageUrl = shallowRef<string | null>(null)
const showBossImage = computed(() => Boolean(props.boss.imageUrl) && props.boss.imageUrl !== failedImageUrl.value)
const bossMonsters = computed(() => props.boss.monsters ?? [])
const starward = computed(() => isStarwardStage(props.boss))

const showMechanic = shallowRef(false)
const buffIndex = shallowRef(0)
const activeBuff = computed(() => props.boss.stageBuffs[Math.min(buffIndex.value, props.boss.stageBuffs.length - 1)])

// 换阶段时回到「机制收起 + 第一条增益」，否则会带着上一个阶段的展开态和越界下标。
watch(
  () => props.boss.id,
  () => {
    showMechanic.value = false
    buffIndex.value = 0
  },
)

function elementClass(element: ElementType) {
  return `element-${element}`
}

function handleImageError() {
  failedImageUrl.value = props.boss.imageUrl ?? null
}
</script>

<template>
  <section
    class="boss-panel"
    :class="`tone-${boss.bannerTone}`"
    aria-label="敌方与环境信息"
  >
    <div
      class="boss-sigil"
      aria-hidden="true"
    >
      <span>{{ boss.name.slice(0, 1) }}</span>
    </div>

    <figure
      v-if="showBossImage"
      class="boss-visual"
    >
      <img
        :key="boss.imageUrl"
        :src="boss.imageUrl"
        :alt="boss.imageAlt ?? `${boss.name} 敌方图片`"
        loading="lazy"
        decoding="async"
        @error="handleImageError"
      >
    </figure>

    <div class="boss-copy">
      <p class="boss-kicker">
        <Archive
          :size="14"
          aria-hidden="true"
        />
        <span>Memory Turbulence</span>
      </p>
      <p class="eyebrow">
        {{ seasonLabel }} // {{ boss.subtitle }}
      </p>
      <h2>
        {{ boss.name }}
        <em
          v-if="starward"
          class="starward-badge"
        >星启</em>
      </h2>
      <p
        v-if="boss.variantName"
        class="boss-variant"
      >
        {{ boss.variantName }}
      </p>

      <div
        v-if="boss.mechanic || boss.stageBuffs.length > 0"
        class="boss-buffs"
        aria-label="场地增益与机制"
      >
        <template v-if="boss.mechanic">
          <button
            class="buff-mechanic"
            type="button"
            :aria-expanded="showMechanic"
            @click="showMechanic = !showMechanic"
          >
            <Sparkles
              :size="13"
              aria-hidden="true"
            />
            <span>{{ boss.mechanic.name }}</span>
            <ChevronDown
              :size="13"
              aria-hidden="true"
              :class="{ open: showMechanic }"
            />
          </button>
          <p
            v-if="showMechanic"
            class="buff-desc"
          >
            {{ boss.mechanic.desc }}
          </p>
        </template>

        <div
          v-if="boss.stageBuffs.length > 0"
          class="buff-tabs"
          role="tablist"
          aria-label="场地增益"
        >
          <button
            v-for="(buff, index) in boss.stageBuffs"
            :key="buff.id"
            class="buff-tab"
            :class="{ active: buffIndex === index }"
            type="button"
            role="tab"
            :aria-selected="buffIndex === index"
            @click="buffIndex = index"
          >
            {{ buff.name }}
          </button>
        </div>
        <p
          v-if="activeBuff"
          class="buff-desc"
        >
          {{ activeBuff.desc }}
        </p>
      </div>

      <div
        class="boss-statline"
        aria-label="基础数值"
      >
        <span>
          <Swords
            :size="16"
            aria-hidden="true"
          />
          HP <b>{{ boss.hp }}</b>
        </span>
        <span>
          <Activity
            :size="16"
            aria-hidden="true"
          />
          速度 <b>{{ boss.speed }}</b>
        </span>
        <span>
          <Shield
            :size="16"
            aria-hidden="true"
          />
          韧性 <b>{{ boss.toughness }}</b>
        </span>
      </div>

      <div
        v-if="bossMonsters.length > 0"
        class="boss-monster-strip"
        aria-label="敌方怪物"
      >
        <article
          v-for="monster in bossMonsters"
          :key="monster.id"
          class="boss-monster-card"
          :title="monster.description"
        >
          <img
            v-if="monster.imageUrl"
            :src="monster.imageUrl"
            :alt="monster.imageAlt ?? `${monster.name} 敌方图片`"
            loading="lazy"
            decoding="async"
          >
          <div class="boss-monster-meta">
            <strong>{{ monster.name }}</strong>
            <span>{{ monster.rank || "Enemy" }}</span>
            <div
              v-if="monster.weakness.length > 0"
              class="boss-monster-weakness"
              aria-label="怪物弱点"
            >
              <span
                v-for="weakness in monster.weakness"
                :key="weakness"
                class="element-dot"
                :class="elementClass(weakness)"
              >
                {{ weakness }}
              </span>
            </div>
          </div>
        </article>
      </div>
    </div>

    <aside
      class="boss-side"
      aria-label="弱点与抗性"
    >
      <div
        v-if="hasResist"
        class="boss-affinity-block"
      >
        <span class="affinity-title">RESIST</span>
        <div class="affinity-row">
          <span
            v-for="[element, value] in resistEntries"
            :key="element"
            class="element-badge"
            :class="elementClass(element)"
          >
            <b>{{ element }}</b>
            <small>{{ value }}</small>
          </span>
        </div>
      </div>

      <div class="boss-affinity-block">
        <span class="affinity-title">WEAK</span>
        <div class="affinity-row">
          <span
            v-for="weakness in boss.weakness"
            :key="weakness"
            class="element-badge compact"
            :class="elementClass(weakness)"
          >
            <b>{{ weakness }}</b>
          </span>
        </div>
      </div>

      <div class="boss-clear-count">
        <span>收录</span>
        <strong>{{ runCount }} / {{ boss.clears }}</strong>
      </div>
    </aside>
  </section>
</template>
