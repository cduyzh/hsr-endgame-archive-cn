export type EndgameMode = "moc" | "pf" | "as" | "aa"
export type RunCategory = "all" | "zeroCycle" | "fullStars"
export type SortKey = "score" | "limited" | "latest"
export type UnitKind = "character" | "lightcone"
export type UnitPath =
  | "毁灭"
  | "巡猎"
  | "智识"
  | "同谐"
  | "虚无"
  | "存护"
  | "丰饶"
  | "记忆"
  | "欢愉"
export type ElementType = "物理" | "火" | "冰" | "雷" | "风" | "量子" | "虚数"

export interface Season {
  id: string
  label: string
  isCurrent: boolean
}

export interface ModeOption {
  id: EndgameMode
  label: string
  shortLabel: string
  badge?: string
}

export interface BossStage {
  id: string
  seasonId: string
  mode: EndgameMode
  name: string
  subtitle: string
  imageUrl?: string
  imageAlt?: string
  monsters?: BossMonsterInfo[]
  hp: string
  speed: string
  toughness: string
  weakness: ElementType[]
  resist: Partial<Record<ElementType, string>>
  clears: number
  memoryBuff: string
  bannerTone: "red" | "cyan" | "amber" | "green"
}

export interface BossMonsterInfo {
  id: string
  name: string
  rank: string
  imageUrl?: string
  imageAlt?: string
  weakness: ElementType[]
  description?: string
}

export interface ArchiveUnit {
  id: string
  kind: UnitKind
  name: string
  path: UnitPath
  element?: ElementType
  rarity: 3 | 4 | 5
  limited: boolean
}

export interface RunUnit {
  unitId: string
  eidolon?: number
  superimposition?: number
}

export interface ArchiveRun {
  id: string
  seasonId: string
  mode: EndgameMode
  bossId: string
  category: Exclude<RunCategory, "all">
  teamName: string
  author: string
  cycle: number
  score: number
  cost: number
  limitedCount: number
  standardCount: number
  submittedAt: string
  tags: string[]
  videoUrl?: string
  units: RunUnit[]
  lightcones: RunUnit[]
}

export interface ArticleSummary {
  id: string
  title: string
  excerpt: string
  category: string
  publishedAt: string
  readMinutes: number
}

export interface ArchiveConfig {
  seasons: Season[]
  modes: ModeOption[]
  bosses: BossStage[]
  units: ArchiveUnit[]
  articles: ArticleSummary[]
}

export interface ArchiveFilters {
  seasonId: string
  mode: EndgameMode
  bossId: string
  category: RunCategory
  teamSize: number | "all"
  cost: "all" | "0-8" | "9-16" | "17-32" | "33-48"
  sort: SortKey
  grouping: boolean
  continuous: boolean
  unitKind: UnitKind
  flags: string[]
  selectedUnitIds: string[]
}

export interface SubmissionPayload {
  seasonId: string
  mode: EndgameMode
  bossId: string
  category: Exclude<RunCategory, "all">
  author: string
  teamName: string
  cycle: number
  score: number
  cost: number
  videoUrl: string
  notes: string
  units: RunUnit[]
  lightcones: RunUnit[]
}

export type SubmissionReviewStatus = "pending" | "approved" | "rejected"

export interface SubmissionReview {
  id: string
  payload: SubmissionPayload
  status: SubmissionReviewStatus
  reviewerNote?: string | null
  createdAt: string
  reviewedAt?: string | null
}

export interface AdminSession {
  username: string
  authorization: string
}

export interface MetaStats {
  characterUsage: Array<{ unit: ArchiveUnit; count: number; rate: number }>
  lightconeUsage: Array<{ unit: ArchiveUnit; count: number; rate: number }>
  teamCombos: Array<{ name: string; count: number; bestCycle: number }>
  costBuckets: Array<{ label: string; count: number }>
}
