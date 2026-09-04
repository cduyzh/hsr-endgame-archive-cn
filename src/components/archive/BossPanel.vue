<script setup lang="ts">
import { ChevronDown, Sparkles } from "lucide-vue-next"
import { computed, shallowRef, watch } from "vue"
import { isStarwardStage } from "@/services/runUtils"
import type { BossStage, ElementType } from "@/types/archive"

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
const variantName = computed(() =>
  props.boss.variantName && props.boss.variantName !== props.boss.name ? props.boss.variantName : "",
)

const hasBuffs = computed(() => Boolean(props.boss.mechanic) || props.boss.stageBuffs.length > 0)
const showMechanic = shallowRef(false)
const showLineup = shallowRef(false)
const buffIndex = shallowRef(0)
const activeBuff = computed(() => props.boss.stageBuffs[Math.min(buffIndex.value, props.boss.stageBuffs.length - 1)])

// 换阶段时回到「机制与阵容收起 + 第一条增益」，否则会带着上一个阶段的展开态和越界下标。
watch(
  () => props.boss.id,
  () => {
    showMechanic.value = false
    showLineup.value = false
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

    <div class="boss-bar">
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
        <p class="boss-eyebrow">
          <span>{{ seasonLabel }}</span>
          <i aria-hidden="true">
            //
          </i>
          <span>{{ boss.subtitle }}</span>
          <em
            v-if="starward"
            class="starward-badge"
          >星启</em>
          <span class="boss-eyebrow-actions">
            <slot name="actions" />
          </span>
        </p>

        <h2 :title="variantName || undefined">
          {{ boss.name }}
          <small v-if="variantName">{{ variantName }}</small>
        </h2>

        <p class="boss-statline">
          <span
            v-if="boss.hp"
            class="stat-item"
          >
            <i>HP</i>
            <b>{{ boss.hp }}</b>
          </span>
          <span
            v-if="boss.speed"
            class="stat-item"
          >
            <i>速度</i>
            <b>{{ boss.speed }}</b>
          </span>
          <span
            v-if="boss.toughness"
            class="stat-item"
          >
            <i>韧性</i>
            <b>{{ boss.toughness }}</b>
          </span>
          <span
            v-if="boss.weakness.length > 0"
            class="stat-item stat-affinity"
          >
            <i>WEAK</i>
            <span class="affinity-row">
              <span
                v-for="weakness in boss.weakness"
                :key="weakness"
                class="element-chip"
                :class="elementClass(weakness)"
              >
                <b>{{ weakness }}</b>
              </span>
            </span>
          </span>
        </p>
      </div>

      <aside
        class="boss-side"
        aria-label="抗性与收录"
      >
        <div
          v-if="hasResist"
          class="affinity-group"
        >
          <span class="affinity-title">RESIST</span>
          <div class="affinity-row">
            <span
              v-for="[element, value] in resistEntries"
              :key="element"
              class="element-chip"
              :class="elementClass(element)"
            >
              <b>{{ element }}</b>
              <small>{{ value }}</small>
            </span>
          </div>
        </div>

        <p class="boss-clear-count">
          <i>收录</i>
          <b>{{ runCount }}</b>
          <span>/ {{ boss.clears }}</span>
        </p>
      </aside>
    </div>

    <div
      v-if="hasBuffs"
      class="boss-buffs"
      aria-label="场地增益与机制"
    >
      <div class="buff-row">
        <button
          v-if="boss.mechanic"
          class="buff-mechanic"
          type="button"
          :aria-expanded="showMechanic"
          @click="showMechanic = !showMechanic"
        >
          <Sparkles
            :size="12"
            aria-hidden="true"
          />
          <span>{{ boss.mechanic.name }}</span>
          <ChevronDown
            :size="12"
            aria-hidden="true"
            :class="{ open: showMechanic }"
          />
        </button>

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
      </div>

      <p
        v-if="showMechanic && boss.mechanic"
        class="buff-desc"
      >
        {{ boss.mechanic.desc }}
      </p>
      <p
        v-if="activeBuff"
        class="buff-desc"
      >
        {{ activeBuff.desc }}
      </p>
    </div>

    <div
      v-if="bossMonsters.length > 0"
      class="boss-lineup"
    >
      <button
        class="lineup-toggle"
        type="button"
        :aria-expanded="showLineup"
        @click="showLineup = !showLineup"
      >
        <ChevronDown
          :size="13"
          aria-hidden="true"
          :class="{ open: showLineup }"
        />
        敌方阵容 · {{ bossMonsters.length }}
      </button>

      <div
        v-show="showLineup"
        class="lineup-list"
        aria-label="敌方怪物"
      >
        <article
          v-for="monster in bossMonsters"
          :key="monster.id"
          class="lineup-row"
          :title="monster.description"
        >
          <img
            v-if="monster.imageUrl"
            :src="monster.imageUrl"
            :alt="monster.imageAlt ?? `${monster.name} 敌方图片`"
            loading="lazy"
            decoding="async"
          >
          <strong>{{ monster.name }}</strong>
          <span
            v-if="monster.rank"
            class="lineup-rank"
          >{{ monster.rank }}</span>
          <span
            v-if="monster.weakness.length > 0"
            class="affinity-row lineup-weakness"
          >
            <span
              v-for="weakness in monster.weakness"
              :key="weakness"
              class="element-chip"
              :class="elementClass(weakness)"
            >
              <b>{{ weakness }}</b>
            </span>
          </span>
        </article>
      </div>
    </div>
  </section>
</template>
