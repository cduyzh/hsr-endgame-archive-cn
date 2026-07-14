import { afterEach, describe, expect, it } from "vitest"
import { requireAdmin } from "../netlify/functions/_shared"

const originalUsername = process.env.ADMIN_REVIEW_USERNAME
const originalPassword = process.env.ADMIN_REVIEW_PASSWORD
const originalToken = process.env.ADMIN_REVIEW_TOKEN

afterEach(() => {
  if (originalUsername === undefined) delete process.env.ADMIN_REVIEW_USERNAME
  else process.env.ADMIN_REVIEW_USERNAME = originalUsername
  if (originalPassword === undefined) delete process.env.ADMIN_REVIEW_PASSWORD
  else process.env.ADMIN_REVIEW_PASSWORD = originalPassword
  if (originalToken === undefined) delete process.env.ADMIN_REVIEW_TOKEN
  else process.env.ADMIN_REVIEW_TOKEN = originalToken
})

describe("admin auth", () => {
  it("接受配置的管理员账号密码", () => {
    process.env.ADMIN_REVIEW_USERNAME = "reviewer"
    process.env.ADMIN_REVIEW_PASSWORD = "secret"
    delete process.env.ADMIN_REVIEW_TOKEN
    const authorization = `Basic ${Buffer.from("reviewer:secret").toString("base64")}`

    expect(requireAdmin({ headers: { authorization } })).toBeNull()
  })

  it("拒绝错误的管理员密码", () => {
    process.env.ADMIN_REVIEW_USERNAME = "reviewer"
    process.env.ADMIN_REVIEW_PASSWORD = "secret"
    const authorization = `Basic ${Buffer.from("reviewer:wrong").toString("base64")}`

    expect(requireAdmin({ headers: { authorization } })?.statusCode).toBe(401)
  })

  it("兼容只配置旧 ADMIN_REVIEW_TOKEN 的 Bearer 鉴权", () => {
    delete process.env.ADMIN_REVIEW_USERNAME
    delete process.env.ADMIN_REVIEW_PASSWORD
    process.env.ADMIN_REVIEW_TOKEN = "legacy-token"

    expect(requireAdmin({ headers: { authorization: "Bearer legacy-token" } })).toBeNull()
  })
})
