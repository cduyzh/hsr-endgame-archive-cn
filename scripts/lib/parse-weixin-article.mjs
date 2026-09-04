/**
 * 微信公众号文章页（mp.weixin.qq.com/s/...）的元数据解析。
 *
 * 页面里的字段是 JS 字面量而不是 JSON，且正文图片走 `data-src` 懒加载，
 * 所以这里只做正则提取，不解析整棵 DOM（单页 3MB+）。
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

/** 正文之外的图片目录（页脚二维码、头像等）不参与文章渲染。 */
const NON_CONTENT_HOSTS = ["res.wx.qq.com", "wx.qlogo.cn"]

const ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
}

export function decodeEntities(text) {
  return String(text).replace(/&(#\d+|#x[0-9a-fA-F]+|\w+);/g, (match, name) => {
    if (name in ENTITY_MAP) return ENTITY_MAP[name]
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16))
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)))
    return match
  })
}

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const found = html.match(pattern)
    if (found && found[1] !== undefined) return found[1]
  }
  return null
}

/** 变量赋值可能是 `'x'`、`"x"`、`htmlDecode("x")`、`'x'.html(false)` 四种写法。 */
function varValue(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return [
    new RegExp(`var\\s+${escaped}\\s*=\\s*htmlDecode\\("([\\s\\S]*?)"\\s*\\)`),
    new RegExp(`var\\s+${escaped}\\s*=\\s*'([\\s\\S]*?)'\\s*(?:\\.html\\(false\\))?\\s*;`),
    new RegExp(`var\\s+${escaped}\\s*=\\s*"([\\s\\S]*?)"\\s*(?:\\.html\\(false\\))?\\s*;`),
  ]
}

/** unix 秒 -> `YYYY-MM-DD`，固定按北京时间取值，避免构建机时区影响产物。 */
export function formatPublishDate(seconds) {
  const ts = Number(seconds)
  if (!Number.isFinite(ts) || ts <= 0) return null
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts * 1000))
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ""
  const date = `${get("year")}-${get("month")}-${get("day")}`
  return date === "---" ? null : date
}

/** `/s/<shortid>` 里的 shortid 就是稳定主键；带 `?chksm=` 的变体要剥掉。 */
export function articleIdFromUrl(url) {
  const matched = String(url).match(/mp\.weixin\.qq\.com\/s\/([A-Za-z0-9_-]+)/)
  return matched ? matched[1] : null
}

/**
 * 系列判据：只看标题里有没有「强敌…侦察」这组字——「强敌」与「侦察」之间可能插字
 * （实测存在「强敌泰坦侦察笔记」）。栏目名后缀换过（笔记 / 狸记）、早期标题还带
 * 《崩坏：星穹铁道》前缀，所以不看后缀、不看开头、也不按赛季筛。
 */
const SERIES_PATTERN = /强敌[\u4e00-\u9fa5]{0,3}侦察/

export function isSeriesTitle(title) {
  return SERIES_PATTERN.test(String(title ?? ""))
}

export function categoryFromTitle(title) {
  return isSeriesTitle(title) ? "强敌机制" : "文章"
}

/** 栏目名 + 分隔符 + 首领名；分隔符有全角/半角竖线、冒号、破折号、间隔号。 */
const SUBJECT_PATTERN = /强敌[\u4e00-\u9fa5]{0,3}侦察[\u4e00-\u9fa5]{0,4}\s*[|｜:：\-–—·]\s*(.+)$/

/**
 * 「强敌侦察狸记 | 万色返空主，归寂」-> 「万色返空主，归寂」。
 * 取不到首领名（标题只有栏目名）时返回 `null`，不要拿栏目名当首领。
 */
export function articleSubject(title) {
  const raw = String(title ?? "").trim()
  if (!isSeriesTitle(raw)) return null

  const matched = raw.match(SUBJECT_PATTERN)
  if (matched) return matched[1].trim() || null

  const stripped = raw
    .replace(/^《[^》]*》/, "")
    .replace(/强敌[\u4e00-\u9fa5]{0,3}侦察[\u4e00-\u9fa5]{0,4}/g, "")
    .replace(/[|｜:：\-–—·]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return stripped || null
}

/** 正文从 `id="js_content"` 起，到第一个 `<script` 前止（页脚与推荐区都在其后）。 */
function extractBodyImages(html) {
  const start = html.indexOf('id="js_content"')
  if (start < 0) return []
  let end = html.indexOf("<script", start)
  if (end < 0) end = html.length
  const body = html.slice(start, end)

  const urls = []
  const seen = new Set()
  const tagPattern = /<img[^>]*?(?:data-src|src)\s*=\s*"([^"]+)"[^>]*?>/g
  for (const raw of body.matchAll(tagPattern)) {
    const src = decodeEntities(raw[1]).trim()
    if (!src.startsWith("http")) continue
    if (NON_CONTENT_HOSTS.some((host) => src.includes(`//${host}/`))) continue
    if (seen.has(src)) continue
    seen.add(src)
    urls.push(src)
  }
  return urls
}

/**
 * @returns {{
 *   id: string, url: string, title: string, subject: string|null, cover: string|null,
 *   images: string[], imageCount: number, publishedAt: string|null,
 *   sourceName: string, rawExcerpt: string
 * } | null} 解析不出标题与正文图时返回 null，交给调用方报错而不是写半条记录。
 */
export function parseWeixinArticle(html) {
  if (typeof html !== "string" || html.length === 0) return null

  if (/参数错误|该内容已被发布者删除|此内容因违规无法查看/.test(html)) return null

  const title = decodeEntities(firstMatch(html, varValue("msg_title")) ?? "").trim()
  const images = extractBodyImages(html)
  if (!title || images.length === 0) return null

  const link = firstMatch(html, varValue("msg_link"))
  const id = articleIdFromUrl(link ?? "")
  if (!id) return null

  const cover = firstMatch(html, varValue("msg_cdn_url"))
  const seconds = firstMatch(html, [/var\s+create_time\s*=\s*"?(\d{10})"?/])
  const nickname = decodeEntities(firstMatch(html, varValue("nickname")) ?? "").trim()
  const rawExcerpt = decodeEntities(firstMatch(html, varValue("msg_desc")) ?? "").trim()

  return {
    id,
    url: link ? link.trim() : `https://mp.weixin.qq.com/s/${id}`,
    title,
    subject: articleSubject(title),
    cover: cover ? cover.trim() : null,
    images,
    imageCount: images.length,
    publishedAt: formatPublishDate(seconds),
    sourceName: nickname ? `微信公众号 · ${nickname}` : "微信公众号",
    rawExcerpt,
  }
}

/**
 * 抓取单篇微信文章。必须**不带 Referer**：带非腾讯域名的 Referer 时
 * `mmbiz.qpic.cn` 会返回 140x140 的防盗链占位图而不是原图。
 */
export async function fetchWeixinArticle(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": UA,
      "accept-language": "zh-CN,zh;q=0.9",
    },
    redirect: "follow",
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return parseWeixinArticle(await response.text())
}
