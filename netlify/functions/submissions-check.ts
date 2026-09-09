import type { Handler } from "@netlify/functions"
import { findDuplicateVideoRecords, jsonResponse } from "./_shared"
import { videoIdentityOf } from "../../src/services/videoUrl"

/**
 * 投稿前的视频链接查重：GET /api/submissions/check?videoUrl=...&bossId=...&excludeIds=a,b
 * 只读、无需鉴权，命中口径与 POST /api/submissions 的入队拦截完全一致（复用 findDuplicateVideoRecords）。
 * `excludeIds` 只服务二次编辑：修订沿用原投稿的视频与阶段，不排除就会自己撞自己。
 */
const MAX_EXCLUDE_IDS = 8

function sanitizeExcludeIds(raw: string | null): string[] {
  if (!raw) return []
  const set = new Set<string>()
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim()
    if (!trimmed || trimmed.length > 120) continue
    set.add(trimmed)
    if (set.size >= MAX_EXCLUDE_IDS) break
  }
  return [...set]
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return jsonResponse({ message: "Method Not Allowed" }, 405)

  const params = new URLSearchParams(event.rawQuery ?? "")
  const videoUrl = params.get("videoUrl")?.trim() ?? ""
  const bossId = params.get("bossId")?.trim() ?? ""
  const excludeIds = sanitizeExcludeIds(params.get("excludeIds"))

  // 解析不出视频身份（非 B 站/YouTube、取不到 BV 号与视频 id）时不报错，交给字段校验与入队查重。
  if (!videoUrl || !bossId || !videoIdentityOf(videoUrl)) return jsonResponse({ duplicate: false, matches: [] })

  const matches = await findDuplicateVideoRecords({ videoUrl, bossId, excludeIds })
  return jsonResponse({ duplicate: matches.length > 0, matches })
}
