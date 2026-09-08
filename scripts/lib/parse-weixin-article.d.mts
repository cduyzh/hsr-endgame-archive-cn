/**
 * `parse-weixin-article.mjs` 的类型声明。
 *
 * 同步脚本保持纯 JS（不经过构建），但 `tests/weixinArticle.test.ts` 直接 import 它，
 * 没有这份声明就会在 typecheck 里报 TS7016，并连带把测试里的回调参数推成隐式 any。
 * 签名以 `parse-weixin-article.mjs` 的真实导出为准。
 */

/** `parseWeixinArticle` 命中时的返回形状（不命中返回 `null`）。 */
export interface WeixinArticleMeta {
  id: string
  url: string
  title: string
  /** 从标题「强敌侦察* | <首领名>」提取的首领名；非系列文章为 `null`。 */
  subject: string | null
  cover: string | null
  images: string[]
  imageCount: number
  /** 北京时间 `YYYY-MM-DD`；取不到 `create_time` 时为 `null`。 */
  publishedAt: string | null
  sourceName: string
  /** 原文 `msg_desc`，供同步脚本人工判断分类与摘要。 */
  rawExcerpt: string
}

export interface WeixinFetchInit {
  headers?: Record<string, string>
  redirect?: string
}

export interface WeixinFetchResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

export function decodeEntities(text: string): string
export function formatPublishDate(seconds: number | string | null | undefined): string | null
export function articleIdFromUrl(url: string): string | null
export function isSeriesTitle(title: string | null | undefined): boolean
export function categoryFromTitle(title: string | null | undefined): string
export function articleSubject(title: string | null | undefined): string | null
export function parseWeixinArticle(html: string): WeixinArticleMeta | null
export function fetchWeixinArticle(
  url: string,
  fetchImpl?: (input: string, init?: WeixinFetchInit) => Promise<WeixinFetchResponse>,
): Promise<WeixinArticleMeta | null>
