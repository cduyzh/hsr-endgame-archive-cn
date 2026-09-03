import type { Handler } from "@netlify/functions"
import { findDuplicateVideoRecords, jsonResponse } from "./_shared"
import { videoIdentityOf } from "../../src/services/videoUrl"

/**
 * 投稿前的视频链接查重：GET /api/submissions/check?videoUrl=...&bossId=...
 * 只读、无需鉴权，命中口径与 POST /api/submissions 的入队拦截完全一致（复用 findDuplicateVideoRecords）。
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return jsonResponse({ message: "Method Not Allowed" }, 405)

  const params = new URLSearchParams(event.rawQuery ?? "")
  const videoUrl = params.get("videoUrl")?.trim() ?? ""
  const bossId = params.get("bossId")?.trim() ?? ""

  // 解析不出视频身份（非 B 站/YouTube、取不到 BV 号与视频 id）时不报错，交给字段校验与入队查重。
  if (!videoUrl || !bossId || !videoIdentityOf(videoUrl)) return jsonResponse({ duplicate: false, matches: [] })

  const matches = await findDuplicateVideoRecords({ videoUrl, bossId })
  return jsonResponse({ duplicate: matches.length > 0, matches })
}
