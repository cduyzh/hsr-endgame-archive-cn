import configData from "./config.json"
import runsData from "./runs.json"
import type { ArchiveConfig, ArchiveRun } from "@/types/archive"

export const seedConfig = configData as ArchiveConfig
export const seedRuns = runsData as ArchiveRun[]
