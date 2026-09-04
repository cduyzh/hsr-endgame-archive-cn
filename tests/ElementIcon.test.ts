import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import ElementIcon from "@/components/ElementIcon.vue"
import { ELEMENT_ICON_SOURCES } from "@/data/elementIcons"
import type { ElementType } from "@/types/archive"

const elements: ElementType[] = ["物理", "火", "冰", "雷", "风", "量子", "虚数"]

describe("ElementIcon", () => {
  it("七个属性都有热链图标，且带中文无障碍名", () => {
    for (const element of elements) {
      const wrapper = mount(ElementIcon, { props: { element } })
      const img = wrapper.get("img")

      expect(img.attributes("src")).toBe(ELEMENT_ICON_SOURCES[element])
      expect(img.attributes("alt")).toBe(element)
      expect(img.attributes("title")).toBe(element)
    }
  })

  it("抗性百分比渲染在图标下方，弱点不带附注", () => {
    expect(mount(ElementIcon, { props: { element: "雷", value: "40%" } }).get("small").text()).toBe("40%")
    expect(mount(ElementIcon, { props: { element: "雷" } }).find("small").exists()).toBe(false)
  })

  it("图标加载失败时回落中文文字，不出破版", async () => {
    const wrapper = mount(ElementIcon, { props: { element: "冰", value: "20%" } })

    await wrapper.get("img").trigger("error")

    expect(wrapper.find("img").exists()).toBe(false)
    expect(wrapper.get("b").text()).toBe("冰")
    expect(wrapper.get("small").text()).toBe("20%")
  })

  it("切换属性后重新给远程图标一次机会", async () => {
    const wrapper = mount(ElementIcon, { props: { element: "火" } })
    await wrapper.get("img").trigger("error")
    expect(wrapper.find("img").exists()).toBe(false)

    await wrapper.setProps({ element: "风" })

    expect(wrapper.get("img").attributes("src")).toBe(ELEMENT_ICON_SOURCES.风)
  })
})
