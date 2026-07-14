import { describe, expect, it } from "vitest"
import { seedConfig, seedRuns } from "@/data/seed"
import { buildPreferredLightconeByCharacter } from "@/services/submissionUtils"

describe("submissionUtils", () => {
  it("根据已收录记录的同槽位搭配生成角色常用光锥映射", () => {
    const preferred = buildPreferredLightconeByCharacter(seedRuns, seedConfig.units)

    expect(preferred.acheron).toBe("whereabouts")
    expect(preferred["the-herta"]).toBe("before-dawn")
  })
})
