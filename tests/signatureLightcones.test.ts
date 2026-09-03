import { describe, expect, it } from "vitest"
import { seedConfig } from "@/data/seed"
import { signatureLightconeByCharacter } from "@/data/signatureLightcones"

const unitsById = new Map(seedConfig.units.map((unit) => [unit.id, unit]))
const limitedFiveStars = seedConfig.units.filter(
  (unit) => unit.kind === "character" && unit.rarity === 5 && unit.limited,
)

describe("专武映射表", () => {
  it("每个键都是五星限定角色", () => {
    for (const characterId of Object.keys(signatureLightconeByCharacter)) {
      const character = unitsById.get(characterId)
      expect(character?.kind, `角色 ${characterId} 不在单位库里`).toBe("character")
      expect(character?.rarity).toBe(5)
      expect(character?.limited).toBe(true)
    }
  })

  it("每个值都是同命途的光锥", () => {
    for (const [characterId, lightconeId] of Object.entries(signatureLightconeByCharacter)) {
      const character = unitsById.get(characterId)
      const lightcone = unitsById.get(lightconeId)
      expect(lightcone?.kind, `光锥 ${lightconeId} 不在单位库里`).toBe("lightcone")
      expect(lightcone?.rarity, `${character?.name} 的专武 ${lightcone?.name} 不是五星`).toBe(5)
      expect(lightcone?.path, `${character?.name} 与 ${lightcone?.name} 命途不同`).toBe(character?.path)
    }
  })

  it("覆盖全部五星限定角色，新角色上线后需重跑 pnpm sync:units", () => {
    const missing = limitedFiveStars
      .map((unit) => unit.id)
      .filter((id) => !signatureLightconeByCharacter[id])

    expect(missing, `缺少专武映射：${missing.join("、")}`).toEqual([])
  })

  it("没有两个角色共用同一把专武", () => {
    const values = Object.values(signatureLightconeByCharacter)
    expect(new Set(values).size).toBe(values.length)
  })
})
