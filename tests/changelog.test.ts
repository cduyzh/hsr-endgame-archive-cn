import { describe, expect, it } from "vitest"
import { appVersion, changelogEntries, changelogTagLabels } from "@/data/changelog"

const VERSION_RE = /^\d+\.\d+\.\d+$/
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/

const versionKey = (version: string) => {
  const [major, minor, patch] = version.split(".").map(Number)
  return major * 10000 + minor * 100 + patch
}

describe("changelog 数据口径", () => {
  it("条目非空且版本号、日期格式合法", () => {
    expect(changelogEntries.length).toBeGreaterThan(0)
    for (const entry of changelogEntries) {
      expect(entry.version).toMatch(VERSION_RE)
      expect(entry.date).toMatch(DATE_RE)
      expect(entry.title.trim()).not.toBe("")
      expect(entry.items.length).toBeGreaterThan(0)
      for (const item of entry.items) {
        expect(item.text.trim()).not.toBe("")
      }
    }
  })

  it("版本号唯一且按新到旧排序", () => {
    const versions = changelogEntries.map((entry) => entry.version)
    expect(new Set(versions).size).toBe(versions.length)
    for (let i = 1; i < changelogEntries.length; i += 1) {
      expect(versionKey(changelogEntries[i - 1].version)).toBeGreaterThan(
        versionKey(changelogEntries[i].version),
      )
    }
  })

  it("appVersion 取自最新条目且 tag 均有中文标签", () => {
    expect(appVersion).toBe(changelogEntries[0].version)
    for (const entry of changelogEntries) {
      for (const item of entry.items) {
        expect(changelogTagLabels[item.tag]).toBeTruthy()
      }
    }
  })
})
