import type { Handler } from "@netlify/functions"
import { jsonResponse } from "./_shared"
import { getStaticSnapshot } from "./_staticSnapshot"

/**
 * 敌方阶段静态快照（`BossStage[]`）。
 *
 * 浏览器直连数据源要付 38 个请求、约 193KB gzip，而上游 `static.nanoka.cc` 的
 * `cache-control` 只有 `max-age=120`，等于每次访问都重新走一遍。改由本端点算一次、
 * 交给 Netlify 的边缘缓存复用；前端拿不到时仍会回落到浏览器直连计算（见
 * `src/services/staticArchiveConfig.ts`），所以本端点挂掉不会让页面白屏。
 */

/** 上游数据只在换版本时变，可以放心长缓存：边缘 1 小时新鲜、超时后先给旧值再后台回源。 */
const STAGE_CACHE_HEADERS = {
  "cache-control": "public, max-age=300",
  "netlify-cdn-cache-control": "public, durable, max-age=3600, stale-while-revalidate=604800",
}

export const handler: Handler = async () => {
  const snapshot = await getStaticSnapshot()
  if (!snapshot || snapshot.bosses.size === 0) {
    // 失败响应保持 jsonResponse 默认的 no-store，避免把 502 缓存住。
    return jsonResponse({ message: "远程静态快照拉取失败或为空，稍后重试" }, 502)
  }

  return jsonResponse(
    {
      version: snapshot.dataVersion,
      liveVersion: snapshot.liveVersion ?? null,
      bosses: [...snapshot.bosses.values()],
    },
    200,
    {
      ...STAGE_CACHE_HEADERS,
      // 数据目录变了标签就变，需要强行回源时按标签 purge 即可。
      "netlify-cache-tag": `stages-${snapshot.dataVersion}`,
    },
  )
}
