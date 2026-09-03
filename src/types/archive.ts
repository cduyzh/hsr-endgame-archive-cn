export type EndgameMode = "moc" | "pf" | "as" | "aa"
/**
 * 记录分类。库中 `runs.category` 是开放 text，新增取值只需在
 * `src/services/runUtils.ts` 的 `categoryLabels` / `categoryOptionsFor` 登记。
 * `asScore*` 只用于末日幻影（按剩余行动值计分），`plight*` 只用于异相仲裁的绝境阶段。
 */
export type RunCategory =
  | "all"
  | "zeroCycle"
  | "fullStars"
  | "plightZeroCycle"
  | "plightFullStars"
  | "asScore3400"
  | "asScore3650"
  | "asScore3850"
  | "asScore4000"
/** 记录在数据里实际携带的分类（不含筛选用的 `all`）。 */
export type SpecificRunCategory = Exclude<RunCategory, "all">
/**
 * 投稿时手动勾选、主页可筛选的稳定标记 id。落库复用 `runs.tags`（开放 jsonb 数组），
 * 中文文案唯一来源是 `src/services/runUtils.ts` 的 `flagLabels`。
 */
export type RunFlag = "revive" | "firewall" | "bpWeapon"
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

/**
 * 场地增益 / 机制条目。`desc` 已在解析阶段把上游 `#N[i]` 占位替换为 `param` 实际数值，
 * 组件直接渲染，不要再做代入。
 */
export interface StageBuff {
  id: string
  name: string
  desc: string
}

export interface BossStage {
  id: string
  seasonId: string
  mode: EndgameMode
  /** 首领展示名：可由怪物 icon 推导的家族短名（如「丰饶玄鹿」），解析不到时退回变体名或阶段名。 */
  name: string
  /** 当期游戏内的变体首领称谓（如「弗有垂暮的不老仙」），与 `name` 相同时省略。 */
  variantName?: string
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
  /** 赛季/首领机制：末日幻影的忆质、混沌回忆的记忆迷阵、虚构叙事的叙事机制等。 */
  mechanic: StageBuff | null
  /** 该阶段自身的增益与敌方词缀。 */
  stageBuffs: StageBuff[]
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
  category: SpecificRunCategory
  teamName: string
  author: string
  cycle: number
  score: number
  cost: number
  limitedCount: number
  standardCount: number
  submittedAt: string
  /** 库中开放 jsonb 数组，承载 `RunFlag` id；读取请用 `runUtils.flagsOfRun` 收窄。 */
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
  /**
   * 成本与分数的精确区间，`null` 表示该侧不限。
   * 分数只对 `as`（末日幻影）有意义；成本的快捷档位只是写入这两个字段的 UI 预设。
   */
  costMin: number | null
  costMax: number | null
  scoreMin: number | null
  scoreMax: number | null
  sort: SortKey
  grouping: boolean
  continuous: boolean
  unitKind: UnitKind
  flags: RunFlag[]
  selectedUnitIds: string[]
}

export interface SubmissionPayload {
  seasonId: string
  mode: EndgameMode
  bossId: string
  category: SpecificRunCategory
  author: string
  teamName: string
  cycle: number
  score: number
  cost: number
  videoUrl: string
  notes: string
  /** 投稿时手动勾选的标记，审核通过后原样写入 `runs.tags`。 */
  flags: RunFlag[]
  units: RunUnit[]
  lightcones: RunUnit[]
}

export type SubmissionReviewStatus = "pending" | "approved" | "rejected" | "withdrawn"

export interface SubmissionReview {
  id: string
  payload: SubmissionPayload
  status: SubmissionReviewStatus
  reviewerNote?: string | null
  ownerToken?: string | null
  createdAt: string
  reviewedAt?: string | null
}

/**
 * 投稿查重命中的历史记录：`视频链接 + 敌方阶段` 相同、且状态为待审或已通过的投稿（以及已入库档案）。
 * 由 `/api/submissions/check` 返回，供投稿向导展示「已存在记录」摘要。
 */
export interface DuplicateVideoMatch {
  id: string
  /** 命中来自审核队列还是已通过的公开档案。 */
  source: "submission" | "run"
  status: "pending" | "approved"
  author: string
  teamName: string
  bossId: string
  category: string
  videoUrl: string
  submittedAt: string
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
