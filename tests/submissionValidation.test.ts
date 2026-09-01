import { describe, expect, it } from "vitest"
import {
  buildSubmissionRoster,
  describeSubmissionTarget,
  errorsOfStep,
  isUsableVideoUrl,
  stepOfField,
  submissionStepFields,
  validateSubmissionForm,
} from "@/services/submissionValidation"
import { fixtureConfig, fixtureSubmission } from "./fixtures/config"

const fieldsOf = (payload: Parameters<typeof validateSubmissionForm>[0]) =>
  validateSubmissionForm(payload, fixtureConfig).map((error) => error.field)

describe("submissionValidation 校验", () => {
  it("完整投稿通过校验，且每个字段都归属某个步骤", () => {
    expect(validateSubmissionForm(fixtureSubmission(), fixtureConfig)).toEqual([])
    expect(new Set(Object.values(submissionStepFields).flat()).size).toBe(12)
  })

  it("空表单按步骤顺序报告缺失字段", () => {
    const errors = validateSubmissionForm(
      fixtureSubmission({
        seasonId: "",
        bossId: "",
        author: "",
        videoUrl: "",
        teamName: "",
        cycle: "" as unknown as number,
        score: "" as unknown as number,
        cost: -1,
        units: [
          { unitId: "", eidolon: 0 },
          { unitId: "", eidolon: 0 },
          { unitId: "", eidolon: 0 },
          { unitId: "", eidolon: 0 },
        ],
        lightcones: [
          { unitId: "", superimposition: 1 },
          { unitId: "", superimposition: 1 },
          { unitId: "", superimposition: 1 },
          { unitId: "", superimposition: 1 },
        ],
      }),
      fixtureConfig,
    )

    expect(errors.map((error) => error.field)).toEqual([
      "seasonId",
      "bossId",
      "author",
      "videoUrl",
      "teamName",
      "units",
      "lightcones",
      "cycle",
      "score",
      "cost",
    ])
  })

  it("赛季与模式下没有可选阶段时提示改选赛季或模式", () => {
    const errors = validateSubmissionForm(fixtureSubmission({ mode: "as" }), fixtureConfig)

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("暂无可投稿的敌方阶段")
  })

  it("逐个槽位定位未配置的角色与光锥", () => {
    const submission = fixtureSubmission()
    submission.units[2].unitId = ""
    submission.lightcones[0].unitId = ""
    submission.lightcones[3].unitId = ""

    const messages = validateSubmissionForm(submission, fixtureConfig).map((error) => error.message)

    expect(messages).toContain("请为第 3 个槽位选择角色。")
    expect(messages).toContain("请为第 1、4 个槽位搭配光锥。")
  })

  it("队内角色重复时报出角色名，光锥允许重复", () => {
    const submission = fixtureSubmission()
    submission.units[1].unitId = "the-herta"

    expect(fieldsOf(submission)).toEqual(["units"])
    expect(validateSubmissionForm(submission, fixtureConfig)[0].message).toContain("大黑塔")
  })

  it("单位库外的 id 与命途不匹配的光锥分别给出提示", () => {
    const ghost = fixtureSubmission()
    ghost.units[0].unitId = "ghost"
    expect(fieldsOf(ghost)).toEqual(["units"])
    expect(validateSubmissionForm(ghost, fixtureConfig)[0].message).toContain("ghost")

    const mismatched = fixtureSubmission()
    mismatched.lightcones[0].unitId = "cruising"
    expect(fieldsOf(mismatched)).toEqual([])
    expect(buildSubmissionRoster(mismatched, fixtureConfig)[0].pathMismatch).toBe(true)
  })

  it("视频链接只接受完整的 http(s) 地址", () => {
    expect(isUsableVideoUrl("https://www.bilibili.com/video/BV1")).toBe(true)
    expect(isUsableVideoUrl("bilibili.com/video/BV1")).toBe(false)
    expect(isUsableVideoUrl("javascript:alert(1)")).toBe(false)
    expect(fieldsOf(fixtureSubmission({ videoUrl: " https://example " }))).toEqual(["videoUrl"])
  })

  it("0 轮竞速要求轮次为 0，成本受分桶上限约束", () => {
    expect(fieldsOf(fixtureSubmission({ category: "zeroCycle", cycle: 3 }))).toEqual(["cycle"])
    expect(fieldsOf(fixtureSubmission({ category: "zeroCycle", cycle: 0 }))).toEqual([])
    expect(fieldsOf(fixtureSubmission({ cost: 49 }))).toEqual(["cost"])
    expect(fieldsOf(fixtureSubmission({ cycle: 1.5 }))).toEqual(["cycle"])
  })

  it("错误可以按步骤筛选并回落到对应步骤", () => {
    const errors = validateSubmissionForm(
      fixtureSubmission({ author: "", units: fixtureSubmission().units.map((unit) => ({ ...unit, unitId: "" })) }),
      fixtureConfig,
    )

    expect(errorsOfStep(errors, "basic").map((error) => error.field)).toEqual(["author"])
    expect(errorsOfStep(errors, "team").map((error) => error.field)).toEqual(["units"])
    expect(errorsOfStep(errors, "result")).toEqual([])
    expect(stepOfField("author")).toBe("basic")
    expect(stepOfField("lightcones")).toBe("team")
    expect(stepOfField("cost")).toBe("result")
  })
})

describe("submissionValidation 预览", () => {
  it("目标描述取自配置中的赛季/模式/阶段 label", () => {
    const target = describeSubmissionTarget(fixtureSubmission(), fixtureConfig)

    expect(target).toMatchObject({
      seasonLabel: "4.5 当前期",
      modeLabel: "混沌回忆",
      stageName: "「黄金」的追猎者",
      categoryLabel: "满星记录",
      hp: "800,000 x2",
    })
  })

  it("阵容行带命座、叠影与限定/常驻分类", () => {
    const roster = buildSubmissionRoster(fixtureSubmission(), fixtureConfig)

    expect(roster).toHaveLength(4)
    expect(roster[0]).toMatchObject({
      characterName: "大黑塔",
      gold: "limited",
      eidolon: 0,
      lightconeName: "拂晓之前",
      superimposition: 1,
      pathMismatch: false,
    })
    expect(roster[3].gold).toBe("free")
    expect(roster[2]).toMatchObject({ characterName: "停云", eidolon: 6, superimposition: 5 })
  })

  it("单位缺失时用占位而不是空白", () => {
    const submission = fixtureSubmission()
    submission.units[0].unitId = ""
    submission.lightcones[0].unitId = ""

    expect(buildSubmissionRoster(submission, fixtureConfig)[0]).toMatchObject({
      characterName: "未选择",
      lightconeName: "未搭配",
      gold: "none",
    })
  })
})
