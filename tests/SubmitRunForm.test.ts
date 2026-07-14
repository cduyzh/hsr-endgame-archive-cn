import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import SubmitRunForm from "@/components/archive/SubmitRunForm.vue"
import { seedConfig, seedRuns } from "@/data/seed"
import { buildPreferredLightconeByCharacter } from "@/services/submissionUtils"

const preferredLightconeByCharacter = buildPreferredLightconeByCharacter(seedRuns, seedConfig.units)

describe("SubmitRunForm", () => {
  it("缺少必要字段时给出本地校验提示", async () => {
    const wrapper = mount(SubmitRunForm, {
      props: {
        config: seedConfig,
        preferredLightconeByCharacter,
      },
    })

    await wrapper.get("form").trigger("submit")

    expect(wrapper.text()).toContain("请补全作者、队伍、视频链接、角色和光锥")
  })

  it("选择角色后自动带入常用光锥，并禁止队内重复角色", async () => {
    const wrapper = mount(SubmitRunForm, {
      props: {
        config: seedConfig,
        preferredLightconeByCharacter,
      },
      attachTo: document.body,
    })

    await wrapper.findAll('button[aria-label^="选择角色"]')[0].trigger("click")
    await wrapper.get('input[placeholder="搜索角色或命途"]').setValue("黄泉")
    await wrapper.get('[data-unit-id="acheron"]').trigger("click")

    expect(wrapper.findAll('button[aria-label^="选择光锥"]')[0].attributes("aria-label")).toContain(
      "行于流逝的岸",
    )

    await wrapper.findAll('button[aria-label^="选择角色"]')[1].trigger("click")
    await wrapper.get('input[placeholder="搜索角色或命途"]').setValue("黄泉")
    expect(wrapper.get('[data-unit-id="acheron"]').attributes()).toHaveProperty("disabled")

    wrapper.unmount()
  })

  it("光锥允许在不同队伍槽位重复选择", async () => {
    const wrapper = mount(SubmitRunForm, {
      props: {
        config: seedConfig,
        preferredLightconeByCharacter,
      },
      attachTo: document.body,
    })

    for (const index of [0, 1]) {
      await wrapper.findAll('button[aria-label^="选择光锥"]')[index].trigger("click")
      await wrapper.get('input[placeholder="搜索光锥或命途"]').setValue("舞！舞！舞！")
      const option = wrapper.get('[data-unit-id="dance-dance-dance"]')
      expect(option.attributes()).not.toHaveProperty("disabled")
      await option.trigger("click")
    }

    expect(wrapper.findAll('button[aria-label^="选择光锥"]')[0].attributes("aria-label")).toContain("舞！舞！舞！")
    expect(wrapper.findAll('button[aria-label^="选择光锥"]')[1].attributes("aria-label")).toContain("舞！舞！舞！")

    wrapper.unmount()
  })

  it("角色五星优先，光锥按已选角色命途和稀有度优先排序", async () => {
    const wrapper = mount(SubmitRunForm, {
      props: {
        config: seedConfig,
        preferredLightconeByCharacter,
      },
      attachTo: document.body,
    })

    await wrapper.findAll('button[aria-label^="选择角色"]')[0].trigger("click")
    const firstCharacterId = wrapper.get(".unit-search-option").attributes("data-unit-id")
    expect(seedConfig.units.find((unit) => unit.id === firstCharacterId)?.rarity).toBe(5)

    await wrapper.get('input[placeholder="搜索角色或命途"]').setValue("阿格莱雅")
    await wrapper.get('[data-unit-id="aglaea"]').trigger("click")
    await wrapper.findAll('button[aria-label^="选择光锥"]')[0].trigger("click")

    const firstLightconeId = wrapper.get(".unit-search-option").attributes("data-unit-id")
    const firstLightcone = seedConfig.units.find((unit) => unit.id === firstLightconeId)
    expect(firstLightcone?.path).toBe("记忆")
    expect(firstLightcone?.rarity).toBe(5)

    wrapper.unmount()
  })
})
