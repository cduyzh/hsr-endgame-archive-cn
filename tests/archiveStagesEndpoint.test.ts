import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BossStage } from "@/types/archive"
import { asResponse } from "./fixtures/netlifyResponse"

/**
 * `_staticSnapshot` 会真拉 `static.nanoka.cc`，这里整模块 mock 掉：
 * 本用例要守的是**端点自身的响应契约**（状态码、缓存头、body 形状），不是快照计算。
 */
const snapshotHolder: { current: unknown } = { current: null }

vi.mock("../netlify/functions/_staticSnapshot", () => ({
  getStaticSnapshot: async () => snapshotHolder.current,
}))

const { handler } = await import("../netlify/functions/archive-stages")

function stage(id: string, over: Partial<BossStage> = {}): BossStage {
  return {
    id,
    seasonId: id.slice(0, 3),
    mode: "aa",
    name: `首领 ${id}`,
    subtitle: "异相仲裁 · 示例",
    hp: "1,000,000 x2",
    speed: "158.4",
    toughness: "160",
    weakness: ["物理"],
    resist: { 雷: "20%" },
    clears: 0,
    mechanic: null,
    stageBuffs: [],
    bannerTone: "green",
    ...over,
  }
}

interface StagesBody {
  version?: string
  liveVersion?: string | null
  bosses?: BossStage[]
  message?: string
}

function call() {
  return handler({ httpMethod: "GET" } as never, {} as never)
}

describe("GET /api/archive/stages", () => {
  beforeEach(() => {
    snapshotHolder.current = {
      bosses: new Map<string, BossStage>([
        ["4.4-aa-k1", stage("4.4-aa-k1")],
        ["4.5-aa-checkmate", stage("4.5-aa-checkmate", { toughness: "360" })],
      ]),
      dataVersion: "4.5.52",
      liveVersion: "4.5",
    }
  })

  it("返回函数侧算好的快照，并带上边缘长缓存与按数据目录分的缓存标签", async () => {
    const response = asResponse(await call())
    const body = JSON.parse(response.body) as StagesBody

    expect(response.statusCode).toBe(200)
    expect(body).toMatchObject({ version: "4.5.52", liveVersion: "4.5" })
    expect(body.bosses?.map((boss) => boss.id)).toEqual(["4.4-aa-k1", "4.5-aa-checkmate"])
    // 前端就靠这两个字段判定赛季与「数据是否变了」
    expect(body.bosses?.[0]).toMatchObject({ toughness: "160", resist: { 雷: "20%" } })

    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8")
    expect(response.headers["cache-control"]).toBe("public, max-age=300")
    expect(response.headers["netlify-cdn-cache-control"]).toBe(
      "public, durable, max-age=3600, stale-while-revalidate=604800",
    )
    expect(response.headers["netlify-cache-tag"]).toBe("stages-4.5.52")
  })

  it("上游快照失败时返回 502 且绝不缓存，避免把错误钉在边缘", async () => {
    for (const broken of [null, { bosses: new Map(), dataVersion: "4.5.52" }]) {
      snapshotHolder.current = broken

      const response = asResponse(await call())

      expect(response.statusCode).toBe(502)
      expect((JSON.parse(response.body) as StagesBody).message).toBeTruthy()
      expect(response.headers["cache-control"]).toBe("no-store")
      expect(response.headers["netlify-cdn-cache-control"]).toBeUndefined()
    }
  })
})
