import {mount} from "@vue/test-utils"
import {describe, expect, it} from "vitest"
import RunGroupList from "@/components/archive/RunGroupList.vue"
import {seedConfig} from "@/data/seed"
import {fixtureRuns} from "./fixtures/runs"

describe("RunGroupList", () => {
  it("渲染分组并展开记录", async () => {
    const wrapper = mount(RunGroupList, {
      props: {
        groups: [{key: "g1", label: "大黑塔双同谐", runs: [fixtureRuns[0]!]}],
        units: seedConfig.units,
        loading: false,
        error: null,
        continuous: true,
        mode: "moc",
      },
    })

    expect(wrapper.text()).toContain("大黑塔双同谐")
    await wrapper.get("button.group-header").trigger("click")
    expect(wrapper.text()).toContain("档案员K")
    expect(wrapper.text()).toContain("视频")
    expect(wrapper.findAll("img").length).toBe(8)
    expect(wrapper.text()).toContain("限定")
    expect(wrapper.text()).toContain("常驻")
  })

  it("空列表展示明确空状态", () => {
    const wrapper = mount(RunGroupList, {
      props: {
        groups: [],
        units: seedConfig.units,
        loading: false,
        error: null,
        continuous: false,
        mode: "moc",
      },
    })

    expect(wrapper.text()).toContain("当前筛选没有匹配记录")
  })
})
