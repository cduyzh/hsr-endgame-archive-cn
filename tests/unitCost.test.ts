import { describe, expect, it } from "vitest"
import { seedConfig } from "@/data/seed"
import {
  defaultEidolonFor,
  defaultSuperimpositionFor,
  getCharacterGoldKind,
  getLightconeGoldKind,
  getUnitGoldCounts,
} from "@/services/unitCost"
import type { ArchiveUnit } from "@/types/archive"

const units = seedConfig.units

function unit(id: string): ArchiveUnit {
  const found = units.find((entry) => entry.id === id)
  if (!found) throw new Error(`Fixture unit missing: ${id}`)
  return found
}

function costOf(pairs: Array<[string, number, string, number]>) {
  const characters = pairs.map(([characterId, eidolon]) => ({ unitId: characterId, eidolon }))
  const lightcones = pairs.map(([, , lightconeId, superimposition]) => ({ unitId: lightconeId, superimposition }))
  return getUnitGoldCounts(characters, lightcones, units)
}

describe("unitCost 光锥分类", () => {
  it("卡池限定、星琼商店常驻与无名勋礼各自分档", () => {
    expect(getLightconeGoldKind(unit("whereabouts"))).toBe("limited")
    expect(getLightconeGoldKind(unit("but-the-battle-isnt-over"))).toBe("standard")
    expect(getLightconeGoldKind(unit("night-on-the-milky-way"))).toBe("standard")
    expect(getLightconeGoldKind(unit("cruising"))).toBe("none")
    expect(getLightconeGoldKind(unit("dance-dance-dance"))).toBe("none")
  })

  it("单位缺失或类型不对时按不计成本处理", () => {
    expect(getLightconeGoldKind(null)).toBe("none")
    expect(getLightconeGoldKind(unit("acheron"))).toBe("none")
  })
})

describe("unitCost 默认值", () => {
  it("低星与开拓者默认满命，限定/常驻五星保留用户选择", () => {
    expect(defaultEidolonFor(getCharacterGoldKind(unit("tingyun")))).toBe(6)
    expect(defaultEidolonFor(getCharacterGoldKind(unit("trailblazer-remembrance")))).toBe(6)
    expect(defaultEidolonFor(getCharacterGoldKind(unit("acheron")))).toBeNull()
    expect(defaultEidolonFor(getCharacterGoldKind(unit("welt")))).toBeNull()
  })

  it("不计成本的光锥默认满叠影，计入成本的默认 S1", () => {
    expect(defaultSuperimpositionFor(getLightconeGoldKind(unit("dance-dance-dance")))).toBe(5)
    expect(defaultSuperimpositionFor(getLightconeGoldKind(unit("cruising")))).toBe(5)
    expect(defaultSuperimpositionFor(getLightconeGoldKind(unit("whereabouts")))).toBe(1)
    expect(defaultSuperimpositionFor(getLightconeGoldKind(unit("but-the-battle-isnt-over")))).toBe(1)
  })
})

describe("unitCost 成本口径", () => {
  it("限定五星角色算命座 + 1，限定五星光锥算叠影", () => {
    expect(costOf([["acheron", 0, "whereabouts", 1]])).toEqual({ limited: 2, standard: 0 })
    expect(costOf([["acheron", 1, "whereabouts", 1]])).toEqual({ limited: 3, standard: 0 })
    expect(costOf([["acheron", 6, "whereabouts", 5]])).toEqual({ limited: 12, standard: 0 })
  })

  it("常驻五星角色与星琼商店光锥计入常驻桶", () => {
    expect(costOf([["welt", 6, "night-on-the-milky-way", 5]])).toEqual({ limited: 0, standard: 12 })
  })

  it("低星角色、低星光锥与无名勋礼光锥都不计成本", () => {
    expect(
      costOf([
        ["tingyun", 6, "dance-dance-dance", 5],
        ["gallagher", 6, "post-op", 5],
        ["trailblazer-remembrance", 6, "cruising", 5],
      ]),
    ).toEqual({ limited: 0, standard: 0 })
  })

  it("四人满配为 48，与档案成本分桶上限一致", () => {
    expect(
      costOf([
        ["acheron", 6, "whereabouts", 5],
        ["firefly", 6, "whereabouts-should-dreams-rest", 5],
        ["robin", 6, "flowing-nightglow", 5],
        ["sunday", 6, "a-grounded-ascent", 5],
      ]),
    ).toEqual({ limited: 48, standard: 0 })
  })

  it("槽位缺少光锥或值越界时按边界钳位", () => {
    expect(getUnitGoldCounts([{ unitId: "acheron" }], [], units)).toEqual({ limited: 1, standard: 0 })
    // 命座钳到 E6 = 7，叠影低于 1 时兜到 S1 = 1。
    expect(costOf([["acheron", 99, "whereabouts", 0]])).toEqual({ limited: 8, standard: 0 })
    expect(costOf([["acheron", -3, "whereabouts", 9]])).toEqual({ limited: 6, standard: 0 })
  })

  it("单位库里查不到的 id 不计成本", () => {
    expect(
      getUnitGoldCounts(
        [{ unitId: "not-a-unit", eidolon: 6 }],
        [{ unitId: "not-a-cone", superimposition: 5 }],
        units,
      ),
    ).toEqual({ limited: 0, standard: 0 })
  })
})
