import type { ArchiveRun, RunFlag } from "../types/archive"

/**
 * 终局标记（复活 / 火墙 / 大月卡武器）的判定原语。
 *
 * 单独成模块是因为 `runUtils.ts` 有 `@/services/unitCost` 的**值**导入，
 * Netlify Functions 打包不解析 Vite 别名、引不了它；而服务端 `parseFilters`
 * 也需要同一套合法性判定。本文件只做 `import type`，前后端都能相对引用。
 * `runUtils.ts` 会原样再导出，对外的「唯一来源」仍是 runUtils。
 */
export const flagOrder: RunFlag[] = ["revive", "firewall", "bpWeapon"]

/** 中文文案唯一来源。 */
export const flagLabels: Record<RunFlag, string> = {
  revive: "复活",
  firewall: "火墙",
  bpWeapon: "大月卡武器",
}

const flagValues = new Set<string>(flagOrder)

export function isRunFlag(value: unknown): value is RunFlag {
  return typeof value === "string" && flagValues.has(value)
}

/** `runs.tags` 是开放 text，这里只保留仍是合法标记的值，并按 `flagOrder` 归一顺序。 */
export function flagsOfRun(run: ArchiveRun): RunFlag[] {
  const tags = new Set(run.tags.filter(isRunFlag))
  return flagOrder.filter((flag) => tags.has(flag))
}
