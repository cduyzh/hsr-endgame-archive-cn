import { describe, expect, it } from "vitest"
import { seedConfig } from "@/data/seed"
import { mergeStaticArchiveConfig, type StaticArchiveSnapshot } from "@/services/staticArchiveConfig"
import type { ArchiveConfig } from "@/types/archive"

function cloneSeedConfig(): ArchiveConfig {
  return structuredClone(seedConfig) as ArchiveConfig
}

describe("staticArchiveConfig", () => {
  it("用静态镜像快照覆盖当前赛季和当前敌方阶段标签", () => {
    const snapshot: StaticArchiveSnapshot = {
      liveVersion: "4.3",
      cacheVersion: "4.3.56",
      seasons: {
        moc: "扫除风暴",
      },
      phases: {
        moc: [
          {
            name: "蛮神，疯王，纷争的化身",
            subtitle: "混沌回忆 / 扫除风暴其十二 / 上半",
            weakness: ["雷", "量子"],
            memoryBuff: "每个轮开始时，随机使1名我方目标立即行动。",
            imageUrl: "/assets/hsr/monsters/Monster_4014010.webp",
            imageAlt: "蛮神，疯王，纷争的化身 敌方图片",
            monsters: [
              {
                id: "4014010",
                name: "蛮神，疯王，纷争的化身",
                rank: "LittleBoss",
                imageUrl: "/assets/hsr/monsters/Monster_4014010.webp",
                imageAlt: "蛮神，疯王，纷争的化身 敌方图片",
                weakness: ["冰", "雷", "量子"],
                description: "泰坦",
              },
            ],
          },
          {
            name: "至上巨擘",
            subtitle: "混沌回忆 / 扫除风暴其十二 / 下半",
            weakness: ["火", "虚数"],
            memoryBuff: "每个轮开始时，随机使1名我方目标立即行动。",
            imageUrl: "/assets/hsr/monsters/Monster_3003030.webp",
            imageAlt: "至上巨擘 敌方图片",
          },
        ],
      },
    }

    const config = mergeStaticArchiveConfig(cloneSeedConfig(), snapshot)

    expect(config.seasons.find((season) => season.isCurrent)?.label).toBe("4.3 当前期")
    expect(config.bosses.find((boss) => boss.id === "flame-reaver")).toMatchObject({
      name: "蛮神，疯王，纷争的化身",
      subtitle: "混沌回忆 / 扫除风暴其十二 / 上半",
      weakness: ["雷", "量子"],
      imageUrl: "/assets/hsr/monsters/Monster_4014010.webp",
      monsters: expect.arrayContaining([
        expect.objectContaining({
          id: "4014010",
          name: "蛮神，疯王，纷争的化身",
          imageUrl: "/assets/hsr/monsters/Monster_4014010.webp",
        }),
      ]),
    })
    expect(config.bosses.find((boss) => boss.id === "murata-graphia")).toMatchObject({
      name: "至上巨擘",
      subtitle: "混沌回忆 / 扫除风暴其十二 / 下半",
      weakness: ["火", "虚数"],
    })
  })

  it("静态镜像不可用时保留 seed 配置", () => {
    const config = cloneSeedConfig()

    expect(mergeStaticArchiveConfig(config, null)).toEqual(config)
  })
})
