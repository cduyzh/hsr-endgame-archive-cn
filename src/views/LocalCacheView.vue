<script setup lang="ts">
import { Check, Clipboard, ExternalLink, HardDrive, Link2, Server } from "lucide-vue-next"
import { computed, onMounted, shallowRef } from "vue"

type ModeKey = "moc" | "fiction" | "doom" | "peak"

interface ManifestGame {
  latest: string
  available: string[]
  live: string
}

interface CachePlan {
  version: string
  locale: string
  generatedAt: string
  currentSeasonIds: Record<ModeKey, number>
  cachedSeasonIds: Record<ModeKey, number[]>
  listFiles: Record<ModeKey, string>
}

interface ModeConfig {
  key: ModeKey
  label: string
  alias: string
  listFile: string
  detailDir: string
}

const modes: ModeConfig[] = [
  { key: "moc", label: "忘却之庭", alias: "moc", listFile: "maze.json", detailDir: "maze" },
  { key: "fiction", label: "虚构叙事", alias: "fiction", listFile: "maze_extra.json", detailDir: "story" },
  { key: "doom", label: "末日幻影", alias: "doom", listFile: "maze_boss.json", detailDir: "boss" },
  { key: "peak", label: "异相仲裁", alias: "peak", listFile: "maze_peak.json", detailDir: "peak" },
]

const manifest = shallowRef<ManifestGame | null>(null)
const cachePlan = shallowRef<CachePlan | null>(null)
const loading = shallowRef(true)
const errorMessage = shallowRef("")
const copiedPath = shallowRef("")

const publicBase = `${import.meta.env.BASE_URL}local-cache`
const originBase = computed(() => {
  if (typeof window === "undefined") return publicBase
  return `${window.location.origin}${publicBase.startsWith("/") ? publicBase : `/${publicBase}`}`
})

const version = computed(() => cachePlan.value?.version ?? manifest.value?.latest ?? "")
const locale = computed(() => cachePlan.value?.locale ?? "zh")
const generatedAt = computed(() => {
  if (!cachePlan.value?.generatedAt) return "未读取"
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(cachePlan.value.generatedAt))
})

const modeRows = computed(() =>
  modes.map((mode) => {
    const currentSeasonId = cachePlan.value?.currentSeasonIds[mode.key]
    const cachedSeasonIds = cachePlan.value?.cachedSeasonIds[mode.key] ?? []
    const listFile = cachePlan.value?.listFiles[mode.key] ?? mode.listFile
    const detailPath = currentSeasonId
      ? `/local-cache/hsr/${version.value}/${locale.value}/${mode.detailDir}/${currentSeasonId}.json`
      : ""

    return {
      ...mode,
      currentSeasonId,
      cachedCount: cachedSeasonIds.length,
      latestCachedId: cachedSeasonIds.at(-1),
      listPath: `/local-cache/hsr/${version.value}/${listFile}`,
      detailPath,
    }
  }),
)

const pathExamples = computed(() => {
  const mocSeasonId = cachePlan.value?.currentSeasonIds.moc
  const peakSeasonId = cachePlan.value?.currentSeasonIds.peak

  return [
    {
      title: "读取可用版本",
      path: "/local-cache/manifest.json",
      note: "先取 hsr.latest，再进入对应版本目录。",
    },
    {
      title: "读取赛季计划",
      path: `/local-cache/hsr/${version.value}/cache-plan.json`,
      note: "包含 currentSeasonIds、cachedSeasonIds 和模式索引文件名。",
    },
    {
      title: "读取忘却之庭索引",
      path: `/local-cache/hsr/${version.value}/maze.json`,
      note: "索引按赛季 id 汇总名称、参数和起止时间。",
    },
    {
      title: "读取当前忘却之庭详情",
      path: mocSeasonId
        ? `/local-cache/hsr/${version.value}/${locale.value}/maze/${mocSeasonId}.json`
        : `/local-cache/hsr/${version.value}/${locale.value}/maze/<seasonId>.json`,
      note: "详情包含关卡、怪物、弱点和挑战配置。",
    },
    {
      title: "读取当前异相仲裁详情",
      path: peakSeasonId
        ? `/local-cache/hsr/${version.value}/${locale.value}/peak/${peakSeasonId}.json`
        : `/local-cache/hsr/${version.value}/${locale.value}/peak/<seasonId>.json`,
      note: "peak 使用独立详情目录，不要复用 maze 路径。",
    },
  ]
})

const fetchSnippet = computed(() => `const base = "${originBase.value}"
const manifest = await fetch(\`\${base}/manifest.json\`).then((res) => res.json())
const version = manifest.hsr.latest
const plan = await fetch(\`\${base}/hsr/\${version}/cache-plan.json\`).then((res) => res.json())
const seasonId = plan.currentSeasonIds.moc
const moc = await fetch(\`\${base}/hsr/\${version}/zh/maze/\${seasonId}.json\`).then((res) => res.json())`)

async function loadLocalCacheMeta() {
  loading.value = true
  errorMessage.value = ""

  try {
    const manifestResponse = await fetch(`${publicBase}/manifest.json`)
    if (!manifestResponse.ok) throw new Error("manifest.json 读取失败")

    const manifestData = (await manifestResponse.json()) as { hsr?: ManifestGame }
    if (!manifestData.hsr?.latest) throw new Error("manifest.json 缺少 hsr.latest")

    manifest.value = manifestData.hsr

    const planResponse = await fetch(`${publicBase}/hsr/${manifestData.hsr.latest}/cache-plan.json`)
    if (!planResponse.ok) throw new Error("cache-plan.json 读取失败")

    cachePlan.value = (await planResponse.json()) as CachePlan
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "静态数据读取失败"
  } finally {
    loading.value = false
  }
}

async function copyPath(path: string) {
  const value = path.startsWith("http") ? path : `${originBase.value}${path.replace("/local-cache", "")}`

  try {
    await navigator.clipboard.writeText(value)
    copiedPath.value = path
    window.setTimeout(() => {
      if (copiedPath.value === path) copiedPath.value = ""
    }, 1800)
  } catch {
    errorMessage.value = "浏览器未允许写入剪贴板，可手动选中路径复制"
  }
}

onMounted(() => {
  void loadLocalCacheMeta()
})
</script>

<template>
  <main class="page-narrow local-cache-page">
    <div class="page-heading">
      <p class="eyebrow">
        静态镜像数据源
      </p>
      <h1>local-cache 数据源</h1>
      <p>
        这里直接读取站点发布产物里的 <code>public/local-cache</code>，整理版本、当前赛季、模式路径和可复制 URL。
        其他项目可以把本站当作只读静态 JSON 源使用。
      </p>
    </div>

    <div
      v-if="loading"
      class="system-message"
    >
      正在读取 local-cache 元数据...
    </div>
    <div
      v-else-if="errorMessage"
      class="system-message error"
    >
      {{ errorMessage }}
    </div>

    <template v-else>
      <section
        class="datasource-summary"
        aria-label="数据源摘要"
      >
        <article class="article-card summary-card">
          <Server
            :size="20"
            aria-hidden="true"
          />
          <span>Base URL</span>
          <strong>{{ originBase }}</strong>
        </article>
        <article class="article-card summary-card">
          <HardDrive
            :size="20"
            aria-hidden="true"
          />
          <span>当前版本</span>
          <strong>{{ version }}</strong>
        </article>
        <article class="article-card summary-card">
          <Link2
            :size="20"
            aria-hidden="true"
          />
          <span>语言 / 更新时间</span>
          <strong>{{ locale }} / {{ generatedAt }}</strong>
        </article>
      </section>

      <section class="article-card datasource-card">
        <div class="datasource-card-heading">
          <div>
            <span>模式映射</span>
            <h2>currentSeasonIds 与详情目录</h2>
          </div>
        </div>

        <div class="mode-mapping-list">
          <article
            v-for="mode in modeRows"
            :key="mode.key"
            class="mode-mapping-row"
          >
            <div>
              <span class="mini-badge">{{ mode.alias }}</span>
              <h3>{{ mode.label }}</h3>
              <p>当前赛季 {{ mode.currentSeasonId }} / 已缓存 {{ mode.cachedCount }} 个赛季</p>
            </div>
            <div class="path-stack">
              <button
                class="copy-path-button"
                type="button"
                @click="copyPath(mode.listPath)"
              >
                <code>{{ mode.listPath }}</code>
                <Check
                  v-if="copiedPath === mode.listPath"
                  :size="16"
                  aria-hidden="true"
                />
                <Clipboard
                  v-else
                  :size="16"
                  aria-hidden="true"
                />
              </button>
              <button
                class="copy-path-button"
                type="button"
                @click="copyPath(mode.detailPath)"
              >
                <code>{{ mode.detailPath }}</code>
                <Check
                  v-if="copiedPath === mode.detailPath"
                  :size="16"
                  aria-hidden="true"
                />
                <Clipboard
                  v-else
                  :size="16"
                  aria-hidden="true"
                />
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="datasource-grid">
        <article class="article-card datasource-card">
          <span>路径示例</span>
          <h2>复制后可直接 fetch</h2>
          <div class="example-list">
            <div
              v-for="example in pathExamples"
              :key="example.title"
              class="example-row"
            >
              <div>
                <h3>{{ example.title }}</h3>
                <p>{{ example.note }}</p>
              </div>
              <button
                class="copy-path-button"
                type="button"
                @click="copyPath(example.path)"
              >
                <code>{{ example.path }}</code>
                <Check
                  v-if="copiedPath === example.path"
                  :size="16"
                  aria-hidden="true"
                />
                <Clipboard
                  v-else
                  :size="16"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </article>

        <article class="article-card datasource-card">
          <span>接入片段</span>
          <h2>最小读取流程</h2>
          <pre class="code-sample"><code>{{ fetchSnippet }}</code></pre>
          <a
            class="icon-button datasource-link"
            :href="`${originBase}/manifest.json`"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink
              :size="16"
              aria-hidden="true"
            />
            打开 manifest
          </a>
        </article>
      </section>
    </template>
  </main>
</template>
