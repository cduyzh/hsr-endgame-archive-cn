<script setup lang="ts">
import { Check, Clipboard, ExternalLink, HardDrive, Link2, Server } from "lucide-vue-next"
import { computed, onMounted, shallowRef } from "vue"
import { DATA_SITE, dataSourceUrl } from "@/services/dataSource"

type ModeKey = "moc" | "fiction" | "doom" | "peak"

interface ManifestGame {
  latest: string
  available: string[]
  live: string
}

type ModeConfig = {
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
const currentSeasonIds = shallowRef<Partial<Record<ModeKey, number>>>({})
const loading = shallowRef(true)
const errorMessage = shallowRef("")
const copiedPath = shallowRef("")

const version = computed(() => manifest.value?.latest ?? "")
const locale = "zh"

const modeRows = computed(() =>
  modes.map((mode) => {
    const currentSeasonId = currentSeasonIds.value[mode.key]
    const detailPath = currentSeasonId
      ? `/hsr/${version.value}/${locale}/${mode.detailDir}/${currentSeasonId}.json`
      : ""

    return {
      ...mode,
      currentSeasonId,
      listPath: `/hsr/${version.value}/${mode.listFile}`,
      detailPath,
    }
  }),
)

const pathExamples = computed(() => {
  const mocSeasonId = currentSeasonIds.value.moc
  const peakSeasonId = currentSeasonIds.value.peak

  return [
    {
      title: "读取可用版本",
      path: "/manifest.json",
      note: "先取 hsr.latest，再进入对应版本目录。",
    },
    {
      title: "读取忘却之庭索引",
      path: `/hsr/${version.value}/maze.json`,
      note: "索引按赛季 id 汇总名称、参数和起止时间。",
    },
    {
      title: "读取当前忘却之庭详情",
      path: mocSeasonId
        ? `/hsr/${version.value}/${locale}/maze/${mocSeasonId}.json`
        : `/hsr/${version.value}/${locale}/maze/<seasonId>.json`,
      note: "详情包含关卡、怪物、弱点和挑战配置。",
    },
    {
      title: "读取当前异相仲裁详情",
      path: peakSeasonId
        ? `/hsr/${version.value}/${locale}/peak/${peakSeasonId}.json`
        : `/hsr/${version.value}/${locale}/peak/<seasonId>.json`,
      note: "peak 使用独立详情目录，不要复用 maze 路径。",
    },
  ]
})

const fetchSnippet = `const base = "${DATA_SITE}"
const manifest = await fetch(\`\${base}/manifest.json\`).then((res) => res.json())
const version = manifest.hsr.latest
const maze = await fetch(\`\${base}/hsr/\${version}/maze.json\`).then((res) => res.json())
const seasonId = Math.max(...Object.values(maze).map((s) => s.id || s.Id || 0))
const moc = await fetch(\`\${base}/hsr/\${version}/zh/maze/\${seasonId}.json\`).then((res) => res.json())`

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function deriveCurrentSeasonIds(ver: string): Promise<Partial<Record<ModeKey, number>>> {
  const entries = await Promise.all(
    modes.map(async (mode) => {
      try {
        const response = await fetch(dataSourceUrl(`hsr/${ver}/${mode.listFile}`))
        if (!response.ok) return [mode.key, null] as const
        const listJson = (await response.json()) as Record<string, { id?: number; Id?: number; ID?: number }>
        const maxId = Object.values(listJson)
          .map((entry) => toNum(entry?.id ?? entry?.Id ?? entry?.ID))
          .filter((id) => id > 0)
          .reduce((max, id) => (id > max ? id : max), 0)
        return [mode.key, maxId || null] as const
      } catch {
        return [mode.key, null] as const
      }
    }),
  )
  return Object.fromEntries(entries.filter(([, id]) => id !== null)) as Partial<Record<ModeKey, number>>
}

async function loadDataSourceMeta() {
  loading.value = true
  errorMessage.value = ""

  try {
    const manifestResponse = await fetch(dataSourceUrl("manifest.json"))
    if (!manifestResponse.ok) throw new Error("manifest.json 读取失败")

    const manifestData = (await manifestResponse.json()) as { hsr?: ManifestGame }
    if (!manifestData.hsr?.latest) throw new Error("manifest.json 缺少 hsr.latest")

    manifest.value = manifestData.hsr
    currentSeasonIds.value = await deriveCurrentSeasonIds(manifestData.hsr.latest)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "数据源读取失败"
  } finally {
    loading.value = false
  }
}

async function copyPath(path: string) {
  const value = path.startsWith("http") ? path : dataSourceUrl(path)

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
  void loadDataSourceMeta()
})
</script>

<template>
  <main class="page-narrow local-cache-page">
    <div class="page-heading">
      <p class="eyebrow">
        远程数据源
      </p>
      <h1>static.nanoka.cc 数据源</h1>
      <p>
        本站所有 JSON 数据与图片均直连 <code>{{ DATA_SITE }}</code> 读取，已开放跨域。
        当前赛季由各模式索引文件实时推导，不依赖本地缓存。
      </p>
    </div>

    <div
      v-if="loading"
      class="system-message"
    >
      正在读取数据源元数据...
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
          <strong>{{ DATA_SITE }}</strong>
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
          <span>语言</span>
          <strong>{{ locale }}</strong>
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
              <p>当前赛季 {{ mode.currentSeasonId }}</p>
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
            :href="`${DATA_SITE}/manifest.json`"
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
