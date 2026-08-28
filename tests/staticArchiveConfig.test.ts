import { describe, expect, it } from "vitest"
import { seedConfig } from "@/data/seed"
import { mergeStaticArchiveConfig, type StaticArchiveSnapshot } from "@/services/staticArchiveConfig"
import type { ArchiveConfig, BossStage } from "@/types/archive"

function cloneSeedConfig(): ArchiveConfig {
  const config = structuredClone(seedConfig) as ArchiveConfig
  config.bosses = [
    {
      id: "flame-reaver",
      seasonId: "4.5",
      mode: "moc",
      name: "焚焰掠影",
      subtitle: "终局档案 / 上半",
      hp: "5,900,767 x2",
      speed: "174.2",
      toughness: "240",
      weakness: ["物理", "火", "风", "虚数"],
      resist: { 火: "20%", 冰: "20%", 雷: "20%", 量子: "20%" },
      clears: 0,
      memoryBuff: "",
      bannerTone: "red",
    },
    {
      id: "murata-graphia",
      seasonId: "4.5",
      mode: "moc",
      name: "缪拉塔・创绘者",
      subtitle: "终局档案 / 下半",
      hp: "4,820,400 x2",
      speed: "158.4",
      toughness: "210",
      weakness: ["冰", "雷", "量子"],
      resist: { 物理: "20%", 虚数: "20%" },
      clears: 0,
      memoryBuff: "",
      bannerTone: "cyan",
    },
  ] as BossStage[]
  return config
}

describe("staticArchiveConfig", () => {
  it("用静态镜像快照覆盖当前赛季和当前敌方阶段标签", () => {
    const snapshot: StaticArchiveSnapshot = {
      liveVersion: "4.5",
      cacheVersion: "4.5.51",
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

    expect(config.seasons.find((season) => season.isCurrent)?.label).toBe("4.5 当前期")
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
