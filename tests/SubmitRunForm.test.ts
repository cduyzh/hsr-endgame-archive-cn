import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import SubmitRunForm from "@/components/archive/SubmitRunForm.vue"
import { loadSubmissionDraft } from "@/composables/useSubmissionDraft"
import { buildSuggestedLightconeByCharacter } from "@/services/submissionUtils"
import { fixtureConfig, fixtureSubmission } from "./fixtures/config"
import { fixtureRuns } from "./fixtures/runs"

const DRAFT_KEY = "hsr-archive.submission-draft.v2"
const preferredLightconeByCharacter = buildSuggestedLightconeByCharacter(fixtureRuns, fixtureConfig.units)

const roster = [
  { id: "the-herta", keyword: "大黑塔" },
  { id: "ruan-mei", keyword: "阮" },
  { id: "tingyun", keyword: "停云" },
  { id: "trailblazer-remembrance", keyword: "开拓者" },
]

const cones = [
  { id: "before-dawn", keyword: "拂晓" },
  { id: "cruising", keyword: "星海" },
  { id: "dance-dance-dance", keyword: "舞" },
  { id: "before-dawn", keyword: "拂晓" },
]

function mountForm() {
  return mount(SubmitRunForm, {
    props: { config: fixtureConfig, preferredLightconeByCharacter },
    attachTo: document.body,
  })
}

function activeStepLabel(wrapper: ReturnType<typeof mountForm>) {
  return wrapper.get(".submission-step-tab.active").text()
}

function goNext(wrapper: ReturnType<typeof mountForm>) {
  return wrapper.get(".submission-nav .primary-action").trigger("click")
}

function fillBasics(wrapper: ReturnType<typeof mountForm>) {
  return Promise.all([
    wrapper.get('input[placeholder="展示名称，例如 夜航"]').setValue("夜航"),
    wrapper.get('input[type="url"]').setValue("https://www.bilibili.com/video/BV1xx411c7mD"),
  ])
}

async function pickCharacter(wrapper: ReturnType<typeof mountForm>, slot: number, keyword: string, unitId: string) {
  await wrapper.findAll(".unit-search-trigger")[slot * 2].trigger("click")
  await wrapper.get('input[placeholder="搜索角色或命途"]').setValue(keyword)
  await wrapper.get(`[data-unit-id="${unitId}"]`).trigger("click")
}

async function pickLightcone(wrapper: ReturnType<typeof mountForm>, slot: number, keyword: string, unitId: string) {
  await wrapper.findAll(".unit-search-trigger")[slot * 2 + 1].trigger("click")
  await wrapper.get('input[placeholder="搜索光锥或命途"]').setValue(keyword)
  await wrapper.get(`[data-unit-id="${unitId}"]`).trigger("click")
}

async function toTeamStep(wrapper: ReturnType<typeof mountForm>) {
  await fillBasics(wrapper)
  await goNext(wrapper)
}

async function fillTeam(wrapper: ReturnType<typeof mountForm>) {
  await wrapper.get('input[placeholder="例：大黑塔双同谐"]').setValue("大黑塔双同谐")
  for (const [index, entry] of roster.entries()) {
    await pickCharacter(wrapper, index, entry.keyword, entry.id)
  }
  for (const [index, entry] of cones.entries()) {
    await pickLightcone(wrapper, index, entry.keyword, entry.id)
  }
}

async function toResultStep(wrapper: ReturnType<typeof mountForm>) {
  await toTeamStep(wrapper)
  await fillTeam(wrapper)
  await goNext(wrapper)
}

function respondWith(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("SubmitRunForm 分步向导", () => {
  it("必填未完成时停在第一步，并汇总首个错误", async () => {
    const wrapper = mountForm()

    await goNext(wrapper)

    expect(wrapper.get(".submission-error").text()).toContain("请填写作者展示名称")
    expect(activeStepLabel(wrapper)).toContain("基础信息")
    expect(wrapper.findAll(".submission-step-tab")[1].attributes()).toHaveProperty("disabled")
    wrapper.unmount()
  })

  it("逐步解锁步骤签，可回退并保留已填内容", async () => {
    const wrapper = mountForm()

    await toTeamStep(wrapper)
    expect(activeStepLabel(wrapper)).toContain("队伍配置")

    await fillTeam(wrapper)
    await goNext(wrapper)
    expect(activeStepLabel(wrapper)).toContain("成绩与预览")

    await wrapper.get(".submission-nav button").trigger("click")
    expect(activeStepLabel(wrapper)).toContain("队伍配置")
    expect(wrapper.get('input[placeholder="例：大黑塔双同谐"]').element.value).toBe("大黑塔双同谐")

    await wrapper.findAll(".submission-step-tab")[0].trigger("click")
    expect(wrapper.get('input[placeholder="展示名称，例如 夜航"]').element.value).toBe("夜航")
    wrapper.unmount()
  })

  it("敌方阶段随赛季与模式联动，切换后自动选中该模式首个阶段", async () => {
    const wrapper = mountForm()

    await wrapper.findAll(".mode-grid .mode-tab")[3].trigger("click")

    const stageOptions = wrapper.findAll(".split-fields select")[1].findAll("option")
    expect(stageOptions.map((option) => option.attributes("value"))).toEqual(["4.5-aa-k1", "4.5-aa-plight"])
    expect(wrapper.text()).toContain("异相仲裁 · K1")
    wrapper.unmount()
  })

  it("选择角色后自动带入常用光锥，队内已选角色在其余槽位置灰", async () => {
    const wrapper = mountForm()

    await toTeamStep(wrapper)
    await pickCharacter(wrapper, 0, "黄泉", "acheron")
    expect(wrapper.findAll('button[aria-label^="选择光锥"]')[0].attributes("aria-label")).toContain("行于流逝的岸")

    await wrapper.findAll(".unit-search-trigger")[2].trigger("click")
    await wrapper.get('input[placeholder="搜索角色或命途"]').setValue("黄泉")
    const duplicate = wrapper.get('[data-unit-id="acheron"]')
    expect(duplicate.attributes()).toHaveProperty("disabled")
    expect(duplicate.text()).toContain("已在队伍中")
    wrapper.unmount()
  })

  it("光锥允许在不同队伍槽位重复选择", async () => {
    const wrapper = mountForm()

    await toTeamStep(wrapper)
    for (const index of [0, 1]) {
      await pickLightcone(wrapper, index, "舞", "dance-dance-dance")
      expect(wrapper.findAll('button[aria-label^="选择光锥"]')[index].attributes("aria-label")).toContain("舞！舞！舞！")
    }
    wrapper.unmount()
  })

  it("光锥列表优先展示与已选角色同命途的选项", async () => {
    const wrapper = mountForm()

    await toTeamStep(wrapper)
    await pickCharacter(wrapper, 0, "阿格莱雅", "aglaea")
    await wrapper.findAll(".unit-search-trigger")[1].trigger("click")

    const firstLightconeId = wrapper.get(".unit-search-option").attributes("data-unit-id")
    const firstLightcone = fixtureConfig.units.find((unit) => unit.id === firstLightconeId)
    expect(firstLightcone?.path).toBe("记忆")
    expect(firstLightcone?.rarity).toBe(5)
    wrapper.unmount()
  })

  it("第二步按成本口径实时统计限定与常驻", async () => {
    const wrapper = mountForm()

    await toTeamStep(wrapper)
    await pickCharacter(wrapper, 0, "大黑塔", "the-herta")
    await pickCharacter(wrapper, 1, "停云", "tingyun")
    // 大黑塔 E0 = 1 + 自动带入的专武 S1 = 1；停云是低星角色，满命也不计成本。
    expect(wrapper.get(".team-cost-chip").text()).toContain("限定 2 · 常驻 0 · 成本 2")

    await pickLightcone(wrapper, 0, "星海", "cruising")
    expect(wrapper.findAll(".submission-team-slot")[0].text()).toContain("命途不同")
    // 换成无名勋礼光锥后不计叠影成本，成本回落到角色本体。
    expect(wrapper.get(".team-cost-chip").text()).toContain("限定 1 · 常驻 0 · 成本 1")
    wrapper.unmount()
  })

  it("选角色带出专武并按类别给默认叠影与命座", async () => {
    const wrapper = mountForm()

    await toTeamStep(wrapper)
    await pickCharacter(wrapper, 0, "黄泉", "acheron")
    const [firstSlot] = wrapper.findAll(".submission-team-slot")
    expect(firstSlot.text()).toContain("行于流逝的岸")
    expect(firstSlot.findAll(".level-segments")[1].get("button.active").text()).toBe("S1")
    // 限定五星角色保留 E0，交给用户按实际结算改。
    expect(firstSlot.findAll(".level-segments")[0].get("button.active").text()).toBe("E0")

    await pickCharacter(wrapper, 1, "停云", "tingyun")
    const secondSlot = wrapper.findAll(".submission-team-slot")[1]
    expect(secondSlot.findAll(".level-segments")[0].get("button.active").text()).toBe("E6")

    await pickLightcone(wrapper, 2, "舞", "dance-dance-dance")
    expect(wrapper.findAll(".submission-team-slot")[2].findAll(".level-segments")[1].get("button.active").text()).toBe("S5")
    wrapper.unmount()
  })

  it("成本按队伍自动填充，手改后不再覆盖并可一键重算", async () => {
    const wrapper = mountForm()
    const costInput = () => wrapper.findAll('input[type="number"]')[2]

    await toTeamStep(wrapper)
    await wrapper.get('input[placeholder="例：大黑塔双同谐"]').setValue("黄泉双同谐")
    // 三名限定五星各 E0 + 自动带入的专武 S1 = 2，停云是低星角色不计成本。
    await pickCharacter(wrapper, 0, "黄泉", "acheron")
    await pickCharacter(wrapper, 1, "停云", "tingyun")
    await pickCharacter(wrapper, 2, "银狼", "silver-wolf")
    await pickCharacter(wrapper, 3, "阮", "ruan-mei")
    await goNext(wrapper)

    expect(costInput().element.value).toBe("6")

    await costInput().setValue("9")
    await wrapper.findAll(".submission-step-tab")[1].trigger("click")
    await pickLightcone(wrapper, 0, "星海", "cruising")
    await wrapper.findAll(".submission-step-tab")[2].trigger("click")

    expect(costInput().element.value).toBe("9")
    expect(wrapper.get(".submission-preview-metrics").text()).toContain("成本 9")
    expect(wrapper.get(".submission-preview-metrics").text()).toContain("自动合计 5")

    await wrapper.get('button[aria-label^="按队伍重算成本"]').trigger("click")
    expect(costInput().element.value).toBe("5")
    wrapper.unmount()
  })

  it("第三步汇总投稿预览", async () => {
    const wrapper = mountForm()

    await toResultStep(wrapper)

    const preview = wrapper.get(".submission-preview").text()
    expect(preview).toContain("混沌回忆")
    expect(preview).toContain("「黄金」的追猎者")
    expect(preview).toContain("满星记录")
    expect(preview).toContain("拂晓之前")
    expect(wrapper.get(".submission-preview-metrics").text()).toContain("限定 4 · 常驻 0")
    expect(wrapper.get(".submission-preview-metrics").text()).toContain("成本 4")
    wrapper.unmount()
  })

  it("0 轮竞速分类下轮次非 0 会被拦下", async () => {
    const wrapper = mountForm()

    await fillBasics(wrapper)
    await wrapper.findAll(".submission-category-grid button")[0].trigger("click")
    await goNext(wrapper)
    await fillTeam(wrapper)
    await goNext(wrapper)

    await wrapper.get('input[type="number"]').setValue("2")
    await wrapper.get("form").trigger("submit")

    expect(wrapper.get(".submission-error").text()).toContain("「0 轮竞速」要求轮次为 0")
    expect(activeStepLabel(wrapper)).toContain("成绩与预览")
    wrapper.unmount()
  })

  it("提交时若前置步骤有错会跳回该步骤并只给一条汇总", async () => {
    const wrapper = mountForm()

    await toResultStep(wrapper)
    await wrapper.findAll(".submission-step-tab")[0].trigger("click")
    await wrapper.get('input[placeholder="展示名称，例如 夜航"]').setValue("")
    await wrapper.findAll(".submission-step-tab")[2].trigger("click")

    await wrapper.get("form").trigger("submit")

    expect(activeStepLabel(wrapper)).toContain("基础信息")
    expect(wrapper.findAll(".submission-error")).toHaveLength(1)
    expect(wrapper.get(".submission-error").text()).toContain("请填写作者展示名称")
    wrapper.unmount()
  })

  it("提交成功后展示投稿编号，再提交一条时重置表单", async () => {
    const fetchMock = stubFetch(respondWith(202, { id: "sub_test_1", status: "pending" }))
    const wrapper = mountForm()

    await toResultStep(wrapper)
    await wrapper.get("form").trigger("submit")
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      author: "夜航",
      bossId: "4.5-moc-top",
      teamName: "大黑塔双同谐",
      seasonId: "4.5",
    })
    expect(wrapper.get(".submission-success").text()).toContain("sub_test_1")

    await wrapper.get(".submission-success-actions button").trigger("click")
    expect(wrapper.get('input[placeholder="展示名称，例如 夜航"]').element.value).toBe("")
    expect(activeStepLabel(wrapper)).toContain("基础信息")
    wrapper.unmount()
  })

  it("网络异常时保留已填内容并提示失败", async () => {
    stubFetch(respondWith(500, { message: "写入审核队列失败" }))
    const wrapper = mountForm()

    await toResultStep(wrapper)
    await wrapper.get("form").trigger("submit")
    await flushPromises()

    expect(wrapper.get(".submission-error").text()).toContain("写入审核队列失败")
    expect(wrapper.get(".submission-preview-meta").text()).toContain("大黑塔双同谐")
    expect(wrapper.findAll(".submission-step-tab")[2].classes()).toContain("active")
    wrapper.unmount()
  })

  it("分类选项随模式与敌方阶段联动", async () => {
    const wrapper = mountForm()
    const categoryLabelsOnPage = () => wrapper.findAll(".submission-category-grid button").map((button) => button.text())

    expect(categoryLabelsOnPage()).toEqual(["0 轮竞速", "满星记录"])

    await wrapper.findAll(".mode-grid .mode-tab")[2].trigger("click")
    expect(categoryLabelsOnPage()).toEqual(["3400-3650", "3650-3850", "3850-3899", "4000 满分"])

    await wrapper.findAll(".mode-grid .mode-tab")[3].trigger("click")
    expect(categoryLabelsOnPage()).toEqual(["0 轮竞速", "满星记录"])

    await wrapper.findAll(".split-fields select")[1].setValue("4.5-aa-plight")
    expect(categoryLabelsOnPage()).toEqual(["绝境 0 轮竞速", "绝境满星记录"])
    wrapper.unmount()
  })

  it("末日幻影按分数自动归档，手选过分类后不再覆盖", async () => {
    const wrapper = mountForm()

    await fillBasics(wrapper)
    await wrapper.findAll(".mode-grid .mode-tab")[2].trigger("click")
    await goNext(wrapper)
    expect(wrapper.find(".submission-error").exists()).toBe(false)

    await fillTeam(wrapper)
    await goNext(wrapper)

    const scoreInput = wrapper.findAll('input[type="number"]')[1]
    await scoreInput.setValue("3860")
    expect(wrapper.get(".submission-preview-meta").text()).toContain("3850-3899")

    await wrapper.findAll(".submission-step-tab")[0].trigger("click")
    await wrapper.findAll(".submission-category-grid button")[0].trigger("click")
    await wrapper.findAll(".submission-step-tab")[2].trigger("click")

    await scoreInput.setValue("3660")
    expect(wrapper.get(".submission-preview-meta").text()).toContain("3400-3650")
    wrapper.unmount()
  })

  it("误关弹窗后重开会恢复草稿，可丢弃", async () => {
    const wrapper = mountForm()
    await fillBasics(wrapper)
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(loadSubmissionDraft()?.payload.author).toBe("夜航")
    wrapper.unmount()

    const reopened = mountForm()
    expect(reopened.get(".submission-draft-note").text()).toContain("已恢复上次未提交的草稿")
    expect(reopened.get('input[placeholder="展示名称，例如 夜航"]').element.value).toBe("夜航")

    await reopened.get(".submission-draft-note button").trigger("click")
    expect(reopened.find(".submission-draft-note").exists()).toBe(false)
    expect(reopened.get('input[placeholder="展示名称，例如 夜航"]').element.value).toBe("")

    // 重置后的空表单不该被防抖写回成幽灵草稿
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(loadSubmissionDraft()).toBeNull()
    reopened.unmount()
  })

  it("草稿会记住步骤位置，提交成功后清除", async () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ payload: fixtureSubmission(), stepIndex: 2, unlockedIndex: 2, savedAt: new Date().toISOString() }),
    )
    const wrapper = mountForm()

    expect(activeStepLabel(wrapper)).toContain("成绩与预览")
    expect(wrapper.find(".submission-preview").exists()).toBe(true)

    stubFetch(respondWith(202, { id: "sub_draft_1", status: "pending" }))
    await wrapper.get("form").trigger("submit")
    await flushPromises()

    expect(wrapper.get(".submission-success").text()).toContain("sub_draft_1")
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(loadSubmissionDraft()).toBeNull()
    wrapper.unmount()
  })
})
