import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import UnitPickerDrawer from "@/components/archive/UnitPickerDrawer.vue"
import { seedConfig } from "@/data/seed"

describe("UnitPickerDrawer", () => {
  it("角色按命途分组展示", () => {
    const wrapper = mount(UnitPickerDrawer, {
      props: {
        open: true,
        unitKind: "character",
        units: seedConfig.units,
        selectedUnitIds: [],
      },
    })

    const headings = wrapper.findAll(".unit-path-group h3").map((node) => node.text())

    expect(headings.some((text) => text.includes("智识"))).toBe(true)
    expect(headings.some((text) => text.includes("记忆"))).toBe(true)
    expect(wrapper.findAll(".unit-path-group img").length).toBeGreaterThan(0)
  })

  it("光锥按命途分组展示", () => {
    const wrapper = mount(UnitPickerDrawer, {
      props: {
        open: true,
        unitKind: "lightcone",
        units: seedConfig.units,
        selectedUnitIds: [],
      },
    })

    const headings = wrapper.findAll(".unit-path-group h3").map((node) => node.text())

    expect(headings.some((text) => text.includes("巡猎"))).toBe(true)
    expect(headings.some((text) => text.includes("丰饶"))).toBe(true)
    expect(wrapper.findAll(".unit-tile").length).toBe(
      seedConfig.units.filter((unit) => unit.kind === "lightcone").length,
    )
  })
})
