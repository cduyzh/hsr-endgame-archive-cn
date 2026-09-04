import {describe, expect, it} from "vitest"
import {
  dispatchArticles,
  matchBossIds,
  SERIES_CATEGORY,
  siteArticles,
  splitByVersion,
  versionLabelOf,
} from "@/data/articles"
import type {SiteArticle} from "@/types/archive"

function makeArticle(overrides: Partial<SiteArticle> = {}): SiteArticle {
  return {
    id: "a1",
    url: "https://mp.weixin.qq.com/s/a1",
    title: "强敌侦察笔记 | 丰饶玄鹿",
    subject: "丰饶玄鹿",
    version: null,
    cover: null,
    images: [],
    imageCount: 0,
    publishedAt: "2025-04-12",
    sourceName: "微信公众号 · 崩坏星穹铁道",
    category: SERIES_CATEGORY,
    excerpt: "",
    readMinutes: 3,
    featured: false,
    bossIds: [],
    fetchedAt: null,
    ...overrides,
  }
}

const BOSSES = [
  {id: "4.4-as-top", name: "丰饶玄鹿", variantName: "弗有垂暮的不老仙"},
  {id: "4.4-as-bottom", name: "冥魂渡者", variantName: "玻吕刻斯"},
  {id: "4.5-moc-starward", name: "万色返空主", variantName: "归寂"},
  {id: "4.5-pf-top", name: "帕姆王", variantName: "合金机铠•帕姆王"},
]

describe("matchBossIds", () => {
  it("按包含式撞名，家族名与当期变体名都能命中", () => {
    expect(matchBossIds("丰饶玄鹿", BOSSES)).toEqual(["4.4-as-top"])
    expect(matchBossIds("弗有垂暮的不老仙", BOSSES)).toEqual(["4.4-as-top"])
    expect(matchBossIds("冥魂渡者，死龙残躯，玻吕刻斯", BOSSES)).toEqual(["4.4-as-bottom"])
    expect(matchBossIds("「极乐颠倒•邪愿莲华主」", BOSSES)).toEqual([])
  })

  it("装饰符不参与比对，空首领名不会把所有阶段都撞出来", () => {
    expect(matchBossIds("「合金机铠 帕姆王」", BOSSES)).toEqual(["4.5-pf-top"])
    expect(matchBossIds("", BOSSES)).toEqual([])
    expect(matchBossIds(null, BOSSES)).toEqual([])
    expect(matchBossIds("玄鹿", BOSSES)).toEqual(["4.4-as-top"])
    expect(matchBossIds("邪愿莲华主", BOSSES)).toEqual([])
  })
})

describe("版本分段", () => {
  it("优先人工标注的 version，缺省时退回发布年份", () => {
    expect(versionLabelOf(makeArticle({version: "4.5"}))).toBe("4.5")
    expect(versionLabelOf(makeArticle({publishedAt: "2024-10-09"}))).toBe("2024 年")
    expect(versionLabelOf(makeArticle({publishedAt: null}))).toBe("更早")
  })

  it("段序按版本倒序，不受条目日期交错影响", () => {
    const labels = splitByVersion([
      makeArticle({id: "a", version: "4.3", publishedAt: "2026-11-01"}),
      makeArticle({id: "b", version: "4.5", publishedAt: "2026-10-02"}),
      makeArticle({id: "c", version: "4.10", publishedAt: "2026-10-20"}),
      makeArticle({id: "d", version: "4.1", publishedAt: "2026-09-30"}),
      makeArticle({id: "e", version: null, publishedAt: "2025-05-05"}),
    ]).map((section) => section.label)
    expect(labels).toEqual(["4.10", "4.5", "4.3", "4.1", "2025 年"])
  })

  it("同版本聚到一段，段内保持新→旧", () => {
    const sections = splitByVersion([
      makeArticle({id: "a", version: "4.5", publishedAt: "2026-08-01"}),
      makeArticle({id: "b", version: "4.5", publishedAt: "2026-07-20"}),
      makeArticle({id: "c", version: "4.4", publishedAt: "2026-06-01"}),
    ])
    expect(sections.map((section) => [section.label, section.items.map((item) => item.id)])).toEqual([
      ["4.5", ["a", "b"]],
      ["4.4", ["c"]],
    ])
  })
})

describe("dispatchArticles", () => {
  it("产物已按发布时间新→旧排序，且每条都有标题与分类", () => {
    expect(siteArticles.length).toBeGreaterThan(0)
    expect(siteArticles.every((article) => article.title && article.category)).toBe(true)
    const dates = siteArticles.map((article) => article.publishedAt ?? "")
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it("没有人工置顶时，首位是最新一篇强敌笔记", () => {
    const top = dispatchArticles(3)[0]
    const featured = siteArticles.find((article) => article.featured)
    const expected = featured ?? siteArticles.find((article) => article.category === SERIES_CATEGORY)
    expect(top?.id).toBe(expected?.id)
  })
})
