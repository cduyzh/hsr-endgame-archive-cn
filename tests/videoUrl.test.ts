import { describe, expect, it } from "vitest"
import {
  DUPLICATE_VIDEO_MESSAGE,
  isSameVideo,
  videoIdentityOf,
  videoMatchPattern,
} from "@/services/videoUrl"

/** 投稿查重口径的守卫：同一支录像的粘贴变体必须折叠成同一身份，伪装域名与页面链接不参与查重。 */
const bilibiliVariants = [
  "https://www.bilibili.com/video/BV1TubY67E2r/",
  "https://bilibili.com/video/BV1TubY67E2r",
  "https://m.bilibili.com/video/BV1TubY67E2r?p=2",
  "https://www.bilibili.com/video/BV1TubY67E2r/?vd_source=abc123&spm_id_from=333.788",
  "http://www.bilibili.com/video/BV1TubY67E2r",
  "https://www.bilibili.com/video/bv1TubY67E2r",
]

const youtubeVariants = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtu.be/dQw4w9WgXcQ?t=42",
  "https://m.youtube.com/shorts/dQw4w9WgXcQ",
  "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "https://www.youtube.com/live/dQw4w9WgXcQ?feature=shared",
  "https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ",
]

const identityValue = (value: string) => videoIdentityOf(value)?.value.toLowerCase()

describe("videoUrl 视频身份归一", () => {
  it("同一支 B 站录像的不同粘贴形式折叠成同一个 BV 号", () => {
    const values = new Set(bilibiliVariants.map(identityValue))
    expect([...values]).toEqual(["bv1tuby67e2r"])
    for (const variant of bilibiliVariants) {
      expect(videoIdentityOf(variant)?.kind).toBe("bvid")
      expect(isSameVideo(bilibiliVariants[0], variant)).toBe(true)
    }
  })

  it("YouTube 的 watch / youtu.be / shorts / live / embed 都归到同一个视频 id", () => {
    const values = new Set(youtubeVariants.map(identityValue))
    expect([...values]).toEqual(["dqw4w9wgxcq"])
    for (const variant of youtubeVariants) {
      expect(videoIdentityOf(variant)?.kind).toBe("youtubeId")
      expect(isSameVideo(youtubeVariants[0], variant)).toBe(true)
    }
  })

  it("跨平台与不同录像不会互认", () => {
    expect(isSameVideo(bilibiliVariants[0], youtubeVariants[0])).toBe(false)
    expect(
      isSameVideo(
        "https://www.bilibili.com/video/BV1TubY67E2r",
        "https://www.bilibili.com/video/BV1TubY67E2s",
      ),
    ).toBe(false)
  })

  it("取不到视频 id 的 B 站链接退回规范化 URL，且带边界断言不误认前缀", () => {
    const av = videoIdentityOf("https://www.bilibili.com/video/av12345678?p=1")
    expect(av).toMatchObject({ kind: "url", value: "bilibili.com/video/av12345678" })
    expect(isSameVideo("https://bilibili.com/video/av12345678/", "https://www.bilibili.com/video/av12345678/?spm=1")).toBe(
      true,
    )
    expect(isSameVideo("https://bilibili.com/video/av12345678", "https://www.bilibili.com/video/av123456789")).toBe(
      false,
    )
  })

  it("b23.tv 短链只能按自身比对，与解析后的长链不互认", () => {
    expect(videoIdentityOf("https://b23.tv/aBCdEf")).toMatchObject({
      kind: "url",
      value: "b23.tv/aBCdEf",
    })
    expect(isSameVideo("https://b23.tv/aBCdEf", "https://b23.tv/aBcDeF?share_source=weibo")).toBe(true)
    expect(isSameVideo("https://b23.tv/aBCdEf", "https://www.bilibili.com/video/BV1TubY67E2r")).toBe(false)
  })

  it("伪装域名、非视频页与非法输入一律解析不出身份", () => {
    for (const value of [
      "https://bilibili.com.evil.com/video/BV1TubY67E2r",
      "https://evil.com/youtu.be/dQw4w9WgXcQ",
      "https://example.com/video/BV1TubY67E2r",
      "https://space.bilibili.com/12345",
      "https://www.bilibili.com/",
      "https://www.youtube.com/watch",
      "bilibili.com/video/BV1TubY67E2r",
      "javascript:alert(1)",
      "   ",
    ]) {
      expect(videoIdentityOf(value), value).toBeNull()
    }
    expect(videoIdentityOf(null)).toBeNull()
    expect(videoIdentityOf(undefined)).toBeNull()
    expect(isSameVideo("", "https://www.bilibili.com/video/BV1TubY67E2r")).toBe(false)
  })

  it("匹配模式会转义正则元字符并卡住字母数字边界", () => {
    const pattern = videoMatchPattern({ kind: "url", value: "bilibili.com/video/av1" })
    expect(new RegExp(pattern).test("https://bilibiliXcom/video/av1")).toBe(false)
    expect(new RegExp(pattern).test("https://www.bilibili.com/video/av1?spm=x")).toBe(true)

    const bvid = videoMatchPattern({ kind: "bvid", value: "BV1TubY67E2r" })
    expect(new RegExp(bvid, "i").test("https://www.bilibili.com/video/BV1TubY67E2rXY")).toBe(false)
    expect(new RegExp(bvid).test("https://m.bilibili.com/video/bv1tubY67E2r/")).toBe(false)
    expect(new RegExp(bvid, "i").test("https://m.bilibili.com/video/bv1tubY67E2r/")).toBe(true)
  })

  it("查重命中的提示文案前后端共用一句", () => {
    expect(DUPLICATE_VIDEO_MESSAGE).toContain("请勿重复提交")
  })
})
