export type ChangelogTag = "feature" | "improve" | "fix" | "data"

export interface ChangelogItem {
	tag: ChangelogTag
	text: string
}

export interface ChangelogEntry {
	version: string
	date: string
	title: string
	items: ChangelogItem[]
}

export const changelogTagLabels: Record<ChangelogTag, string> = {
	feature: "新功能",
	improve: "优化",
	fix: "修复",
	data: "数据",
}

export const changelogEntries: ChangelogEntry[] = [
	{
		version: "0.2.0",
		date: "2026-09-02",
		title: "投稿凭证与配队预设",
		items: [
			{tag: "feature", text: "投稿成功后下发专属凭证，「我的投稿」页可反查审核进度并撤回记录"},
			{tag: "feature", text: "本机记忆作者名与最多 3 套配队预设，投稿时一键载入"},
			{tag: "feature", text: "新增「更新记录」页，头部徽章显示当前版本号"},
			{tag: "improve", text: "Boss 阶段数据接入远程静态快照，审核通过时自动补全 Boss 详细属性"},
		],
	},
	{
		version: "0.1.0",
		date: "2026-08",
		title: "站点首版上线",
		items: [
			{tag: "feature", text: "档案工作台：赛季 / 模式 / 阶段 / 分类 / 成本多维筛选与记录分组展示"},
			{tag: "feature", text: "投稿三步向导与管理员审核台"},
			{tag: "feature", text: "环境统计：角色与光锥使用率、常见队伍组合"},
			{tag: "data", text: "直连 static.nanoka.cc 静态数据源，敌方阶段与图片不再本地落盘"},
		],
	},
]

export const appVersion = changelogEntries[0]?.version ?? "0.0.0"
