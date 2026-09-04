import articlesData from "./articles.json"
import type {BossStage, SiteArticle} from "@/types/archive"

/**
 * 文章模块的运行时入口。
 *
 * `articles.json` 是 `pnpm sync:articles` 的产物（已按发布时间新→旧排好序），
 * 抓取字段不要手改；文案、分类、封面覆盖与 boss 关联改 `scripts/article-sources.json`。
 */
const articles = articlesData.articles as SiteArticle[]

/** 「强敌侦察笔记」系列在产物里的分类名，判据见 `scripts/lib/parse-weixin-article.mjs`。 */
export const SERIES_CATEGORY = "强敌机制"

export const siteArticles: SiteArticle[] = articles

/** 封面优先用抓取到的 `msg_cdn_url`，没有则退回正文首图；纯文字条目返回空串。 */
export function articleCover(article: SiteArticle): string {
  return article.cover || article.images[0] || ""
}

/**
 * 首页速报取数：人工置顶的在前；没有人工置顶时把最新一篇强敌笔记提到首位，
 * 其余保持新→旧——这样新增文章不需要回头改清单里的 `featured`。
 */
export function dispatchArticles(limit = 3): SiteArticle[] {
  const pinned = articles.filter((article) => article.featured)
  const rest = articles.filter((article) => !article.featured)
  if (pinned.length === 0) {
    const index = rest.findIndex((article) => article.category === SERIES_CATEGORY)
    if (index > 0) pinned.push(...rest.splice(index, 1))
  }
  return [...pinned, ...rest].slice(0, limit)
}

export function articleById(id: string): SiteArticle | undefined {
  return articles.find((article) => article.id === id)
}

/** 按分类分组，组内沿用新→旧；分类顺序按首次出现时间，与列表一致。 */
export function groupedArticles(): {category: string; items: SiteArticle[]}[] {
  const groups: {category: string; items: SiteArticle[]}[] = []
  for (const article of articles) {
    const group = groups.find((entry) => entry.category === article.category)
    if (group) group.items.push(article)
    else groups.push({category: article.category, items: [article]})
  }
  return groups
}

/** 名称里的书名号、间隔号、标点与空白都不参与首领名比对。 */
const DECORATIONS = /[\s「」『』《》“”"'’·•・,，.。:：;；!！?？|｜\-–—()（）[\]]/g

function normalizeName(text: string): string {
  return text.replace(DECORATIONS, "").toLowerCase()
}

/**
 * 用笔记标题里推导出的首领名去撞站内敌方阶段，**只产出候选**：
 * 站内只有已归档赛季的阶段，早期首领撞不上是正常的；首领名与笔记标题之间
 * 还存在家族名 / 当期变体名的差异（同 `BossStage.name` 与 `variantName` 的分工）。
 * 因此这里的结果不能当成事实写库，人工确认过的关联仍然只认清单里的 `bossIds`。
 */
export function matchBossIds(
  subject: string | null,
  bosses: Pick<BossStage, "id" | "name" | "variantName">[],
): string[] {
  const key = normalizeName(subject ?? "")
  if (key.length < 2) return []

  return bosses
    .filter((boss) => {
      const names = [boss.name, boss.variantName ?? ""].map(normalizeName).filter((name) => name.length >= 2)
      // 首领名短于 3 字时不做反向包含，避免「玄鹿」这类短名把整组阶段都带进来。
      return names.some((name) => name.includes(key) || (key.length >= 3 && name.length >= 3 && key.includes(name)))
    })
    .map((boss) => boss.id)
}

/** 分段标题：优先人工标注的版本，缺省时退回发布年份。 */
export function versionLabelOf(article: SiteArticle): string {
  if (article.version) return article.version
  const year = article.publishedAt?.slice(0, 4)
  return year ? `${year} 年` : "更早"
}

/** 分段排序键：点分版本按 major*1000+minor（4.10 新于 4.9），年份标签按数值，其余为 0。 */
function sectionRank(label: string): number {
  const parts = label.split(".").map(Number)
  if (parts.length > 1 && parts.every((part) => Number.isFinite(part))) {
    return parts[0] * 1000 + parts[1]
  }
  const year = Number.parseInt(label, 10)
  return Number.isFinite(year) ? year : 0
}

/** 组内再分段；入参已按发布时间新→旧，段序按版本倒序而不是出现顺序。 */
export function splitByVersion(items: SiteArticle[]): {label: string; items: SiteArticle[]}[] {
  const sections: {label: string; items: SiteArticle[]}[] = []
  for (const article of items) {
    const label = versionLabelOf(article)
    const section = sections.find((entry) => entry.label === label)
    if (section) section.items.push(article)
    else sections.push({label, items: [article]})
  }
  return sections.sort(
    (a, b) => sectionRank(b.label) - sectionRank(a.label) || b.label.localeCompare(a.label),
  )
}
