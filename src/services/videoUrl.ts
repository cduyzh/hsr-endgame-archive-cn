// 视频链接的「同一支视频」判定口径。投稿查重（前端预检 + Netlify Function）共用这一份实现，
// 因此本文件不得用 @/ 别名做值导入（Functions 侧走相对路径被 esbuild 打包）。

/** B 站按子域匹配，短链域名单列。 */
const BILIBILI_HOSTS = ["bilibili.com", "b23.tv"]
const YOUTUBE_HOSTS = ["youtube.com", "youtube-nocookie.com", "youtu.be"]

export type VideoIdentity =
  /** B 站 BV 号——定长字符集，可安全按带边界的子串匹配。 */
  | { kind: "bvid"; value: string }
  /** YouTube 的 11 位视频 id。 */
  | { kind: "youtubeId"; value: string }
  /** 取不到平台 id（如 b23.tv 短链、av 号）时，退回「去协议、去 www./m.、去参数与尾斜杠」的 host+path。 */
  | { kind: "url"; value: string }

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, "")
}

function matchesHost(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

function firstPathSegment(url: URL): string {
  return url.pathname.split("/").filter(Boolean)[0] ?? ""
}

function bvidOf(url: URL): string | null {
  const matched = /\/video\/(BV[0-9A-Za-z]{8,14})(?:\/|$)/i.exec(url.pathname)
  return matched?.[1] ?? null
}

/** 只有短链与 av 号能确定指向单支视频；空间页、列表页一类的路径不参与查重。 */
function shortLinkOrAvIdentityOf(url: URL, host: string): VideoIdentity | null {
  const path = url.pathname.replace(/\/+$/, "")
  if (!path || path === "/") return null
  const isShortLink = matchesHost(host, ["b23.tv"])
  const isAvLink = /^\/video\/av\d+$/i.test(path)
  return isShortLink || isAvLink ? { kind: "url", value: `${host}${path}` } : null
}

function youtubeIdOf(url: URL): string | null {
  const queryId = url.pathname === "/watch" ? url.searchParams.get("v") : null
  const matched = /^\/(?:shorts|live|embed|v)\/([0-9A-Za-z_-]{11})/.exec(url.pathname)
  const shortLink =
    normalizeHost(url.hostname) === "youtu.be" && /^[0-9A-Za-z_-]{11}$/.test(firstPathSegment(url))
      ? firstPathSegment(url)
      : null
  const id = queryId ?? matched?.[1] ?? shortLink
  return id && /^[0-9A-Za-z_-]{11}$/.test(id) ? id : null
}

/** 解析不出可用身份（空值、非法 URL）时返回 null，由调用方决定放行还是报错。 */
export function videoIdentityOf(value: string | null | undefined): VideoIdentity | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null

  const host = normalizeHost(url.hostname)
  if (matchesHost(host, YOUTUBE_HOSTS)) {
    const id = youtubeIdOf(url)
    return id ? { kind: "youtubeId", value: id } : null
  }

  if (matchesHost(host, BILIBILI_HOSTS)) {
    const bvid = bvidOf(url)
    if (bvid) return { kind: "bvid", value: bvid }
    return shortLinkOrAvIdentityOf(url, host)
  }

  return null
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 带字母数字边界断言的正则源串，供 Postgres `~*` 与 JS `RegExp` 复用：
 * 边界能挡住 `av123` 命中 `av1234` 这类前缀误判，大小写由 `i` / `~*` 兜住。
 */
export function videoMatchPattern(identity: VideoIdentity): string {
  return `(^|[^0-9A-Za-z])${escapeRegExp(identity.value)}([^0-9A-Za-z]|$)`
}

/** storedUrl 是否就是该身份对应的那支视频。 */
export function matchesVideoIdentity(
  identity: VideoIdentity,
  storedUrl: string | null | undefined,
): boolean {
  if (!storedUrl?.trim()) return false
  return new RegExp(videoMatchPattern(identity), "i").test(storedUrl)
}

/** 两条链接是否指向同一支视频；任一侧解析不出身份即视为不重复。 */
export function isSameVideo(a: string, b: string): boolean {
  const identity = videoIdentityOf(a)
  return identity ? matchesVideoIdentity(identity, b) : false
}

/**
 * 查重命中的提示文案。前端预检与服务端入队拦截共用一句，避免两层措辞漂移
 * （本文件不含 @/ 值导入，Netlify Function 可以直接相对引用）。
 */
export const DUPLICATE_VIDEO_MESSAGE = "该视频链接在本敌方阶段已有投稿记录，请勿重复提交。"
