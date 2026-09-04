import {describe, expect, it} from "vitest"
import fixtureHtml from "./fixtures/weixin-article.html?raw"
import {
  articleIdFromUrl,
  articleSubject,
  categoryFromTitle,
  decodeEntities,
  fetchWeixinArticle,
  formatPublishDate,
  isSeriesTitle,
  parseWeixinArticle,
} from "../scripts/lib/parse-weixin-article.mjs"

describe("parseWeixinArticle", () => {
  it("从 JS 字面量里取出标题、封面、链接与北京时间日期", () => {
    const article = parseWeixinArticle(fixtureHtml)
    expect(article).not.toBeNull()
    expect(article?.title).toBe("强敌侦察笔记 | 冥魂渡者，死龙残躯，玻吕刻斯")
    expect(article?.id).toBe("dcv9Y6zZ7lXu_AY-jOvWaA")
    expect(article?.url).toBe("https://mp.weixin.qq.com/s/dcv9Y6zZ7lXu_AY-jOvWaA")
    expect(article?.cover).toBe("https://mmbiz.qpic.cn/mmbiz_jpg/ABCDEF/0?wx_fmt=jpeg")
    expect(article?.publishedAt).toBe("2025-04-12")
    expect(article?.sourceName).toBe("微信公众号 · 崩坏星穹铁道")
    expect(article?.rawExcerpt).toBe("冥魂渡者，死龙残躯，玻吕刻斯…看起来好强大帕！")
    expect(article?.subject).toBe("冥魂渡者，死龙残躯，玻吕刻斯")
  })

  it("正文取图：按顺序去重、还原 &amp;、排除平台图与正文之后的页脚图", () => {
    const article = parseWeixinArticle(fixtureHtml)
    expect(article?.images).toEqual([
      "https://mmbiz.qpic.cn/mmbiz_png/AAA/640?wx_fmt=png&from=appmsg",
      "https://mmbiz.qpic.cn/mmbiz_jpg/BBB/640?wx_fmt=jpeg&from=appmsg",
      "https://mmbiz.qpic.cn/mmbiz_png/CCC/640?wx_fmt=png",
    ])
    expect(article?.imageCount).toBe(3)
  })

  it("兼容单引号写法与缺字段的文章页", () => {
    const singleQuote = parseWeixinArticle(
      fixtureHtml.replace(
        /var msg_title[^;]*;/,
        "var msg_title = '强敌侦察笔记 | 单引号'.html(false);",
      ),
    )
    expect(singleQuote?.title).toBe("强敌侦察笔记 | 单引号")

    const noCover = parseWeixinArticle(fixtureHtml.replace(/var msg_cdn_url[^;]*;/, ""))
    expect(noCover?.cover).toBeNull()
    expect(noCover?.title).toBe("强敌侦察笔记 | 冥魂渡者，死龙残躯，玻吕刻斯")
  })

  it("正文为空、文章被删或页面根本不是文章时返回 null", () => {
    expect(parseWeixinArticle("")).toBeNull()
    expect(parseWeixinArticle("<html><body>参数错误</body></html>")).toBeNull()
    expect(parseWeixinArticle("<html><body>该内容已被发布者删除</body></html>")).toBeNull()
    expect(
      parseWeixinArticle(fixtureHtml.replace(/<img[^>]*>/g, "").replace(/var msg_title[^;]*;/, "")),
    ).toBeNull()
  })
})

describe("系列判据与首领名", () => {
  it("标题含「强敌侦察」即算系列文章，不看栏目名后缀也不看开头", () => {
    expect(isSeriesTitle("强敌侦察笔记 | 冥魂渡者")).toBe(true)
    expect(isSeriesTitle("强敌侦察狸记 | 万色返空主，归寂")).toBe(true)
    expect(isSeriesTitle("《崩坏：星穹铁道》强敌侦察笔记 | 金血忆灵")).toBe(true)
    expect(isSeriesTitle("强敌泰坦侦察笔记 | 「天谴之矛」尼卡多利")).toBe(true)
    expect(isSeriesTitle("4.3 竞速档案：哪些队伍正在抬头")).toBe(false)
    expect(isSeriesTitle("")).toBe(false)
    expect(isSeriesTitle(null)).toBe(false)

    expect(categoryFromTitle("强敌侦察狸记 | 合金机铠•帕姆王")).toBe("强敌机制")
    expect(categoryFromTitle("投稿格式与审核标准")).toBe("文章")
  })

  it("首领名取分隔符之后的部分，兼容全角竖线、冒号与破折号", () => {
    expect(articleSubject("强敌侦察笔记 | 冥魂渡者，死龙残躯，玻吕刻斯")).toBe("冥魂渡者，死龙残躯，玻吕刻斯")
    expect(articleSubject("强敌侦察笔记｜极乐颠倒•邪愿莲华主")).toBe("极乐颠倒•邪愿莲华主")
    expect(articleSubject("强敌侦察狸记：始作画者，无量塔绘世")).toBe("始作画者，无量塔绘世")
    expect(articleSubject("强敌侦察笔记 - 步离战首·呼雷")).toBe("步离战首·呼雷")
    expect(articleSubject("《崩坏：星穹铁道》强敌侦察笔记 | 示死祸源：深魇蝗灾")).toBe("示死祸源：深魇蝗灾")
    expect(articleSubject("强敌泰坦侦察笔记 | 「天谴之矛」尼卡多利")).toBe("「天谴之矛」尼卡多利")
  })

  it("没有分隔符时剥掉栏目名，只有栏目名时返回 null", () => {
    expect(articleSubject("强敌侦察笔记 火花大会@Official")).toBe("火花大会@Official")
    expect(articleSubject("强敌侦察笔记")).toBeNull()
    expect(articleSubject("《崩坏：星穹铁道》强敌侦察狸记")).toBeNull()
    expect(articleSubject("4.3 竞速档案：哪些队伍正在抬头")).toBeNull()
    expect(articleSubject(null)).toBeNull()
  })
})

describe("articleIdFromUrl", () => {
  it("接受带查询参数的短链变体，拒绝非文章地址", () => {
    expect(articleIdFromUrl("https://mp.weixin.qq.com/s/AbC-_123")).toBe("AbC-_123")
    expect(articleIdFromUrl("https://mp.weixin.qq.com/s/AbC-_123?chksm=xyz&scene=1")).toBe("AbC-_123")
    expect(articleIdFromUrl("https://mp.weixin.qq.com/profile?src=3")).toBeNull()
    expect(articleIdFromUrl("https://example.com/s/AbC")).toBeNull()
  })
})

describe("formatPublishDate", () => {
  it("按北京时间换算日期，非法值返回 null", () => {
    expect(formatPublishDate("1744432200")).toBe("2025-04-12")
    // 北京时间 12 月 31 日 23:30 —— UTC 还是同一天，必须按北京时间取值
    expect(formatPublishDate(String(Math.floor(Date.UTC(2025, 10, 31, 15, 30) / 1000)))).toBe("2025-12-01")
    expect(formatPublishDate("0")).toBeNull()
    expect(formatPublishDate("abc")).toBeNull()
  })
})

describe("decodeEntities", () => {
  it("还原属性里常见的 HTML 实体", () => {
    expect(decodeEntities("a&amp;b&quot;c&#39;d&lt;e&gt;f&nbsp;g&#x4e2d;")).toBe('a&b"c\'d<e>f g中')
  })
})

describe("fetchWeixinArticle", () => {
  it("不发送 Referer，并把页面文本交给解析器", async () => {
    const calls = []
    const stub = async (url, init) => {
      calls.push({url, headers: init?.headers ?? {}})
      return {ok: true, status: 200, text: async () => fixtureHtml}
    }
    const article = await fetchWeixinArticle("https://mp.weixin.qq.com/s/dcv9Y6zZ7lXu_AY-jOvWaA", stub)
    expect(article?.id).toBe("dcv9Y6zZ7lXu_AY-jOvWaA")
    expect(calls[0].headers.referer).toBeUndefined()
    expect(calls[0].headers["user-agent"]).toContain("Mozilla/5.0")
  })

  it("非 2xx 直接抛错，不静默产出半条记录", async () => {
    const stub = async () => ({ok: false, status: 403, text: async () => ""})
    await expect(fetchWeixinArticle("https://mp.weixin.qq.com/s/x", stub)).rejects.toThrow(/403/)
  })
})
