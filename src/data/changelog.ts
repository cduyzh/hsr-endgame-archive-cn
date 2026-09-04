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
		version: "0.7.0",
		date: "2026-09-04",
		title: "敌方数值口径修正与属性图标",
		items: [
			{tag: "fix", text: "弱点改取首领怪物自身弱点的全集：此前用的是阶段的 damage_type，它只是弱点的一部分——4.4 异相仲裁将杀关漏了「雷」，4.4 末日幻影星启的「心蕉如火的猴把戏」本无弱点却被显示 4 个属性"},
			{tag: "fix", text: "韧性按游戏内展示值重新换算并补上单怪修正值，此前整体偏大 3 倍（4.4 银枝 480 → 160、4.4 史瓦罗 360 → 140、4.4 将杀关 1080 → 360）"},
			{tag: "fix", text: "速度补上同一份详情里的修正值（4.4 异相仲裁将杀关 158.4 → 173.4）"},
			{tag: "improve", text: "多阶段首领在各阶段血量上限不相等时改为按阶段逐个列出（4.5 异相仲裁将杀关 `12,395,970 x3` → `12,395,970 / 15,494,962 / 12,395,970`），不再一律压成 `xN` 让人误以为每管血量相同"},
			{tag: "feature", text: "敌方面板新增「非弱点属性」的抗性百分比，逐个属性列出 20%～80%"},
			{tag: "improve", text: "WEAK 与 RESIST 改用游戏内属性图标展示，图标加载失败自动回落中文属性名"},
			{tag: "data", text: "4.4 / 4.5 全部 24 个可比阶段与参考站逐字段对账，韧性、弱点、抗性三项完全一致"},
		],
	},
	{
		version: "0.6.0",
		date: "2026-09-04",
		title: "强敌侦察系列全量口径",
		items: [
			{tag: "improve", text: "收录判据放宽为「标题含『强敌…侦察』」：「强敌」与「侦察」之间允许插字（如「强敌泰坦侦察笔记」），并覆盖栏目改名后的「强敌侦察狸记」与早期带《崩坏：星穹铁道》前缀的标题，不再按赛季或版本筛选，全系列首领笔记都在收录范围内"},
			{tag: "data", text: "回填 21 篇强敌侦察笔记（2023-02 至 2026-07，共 376 张原文配图），后续新增仍按人工传链接的方式补进清单后同步"},
			{tag: "feature", text: "从标题自动提取首领名，用于与站内敌方阶段做候选匹配（只作建议，人工确认的关联仍以清单里的 bossIds 为准）"},
			{tag: "improve", text: "/articles 的强敌机制组内再按版本分段（未标注版本时退回按年份），条目改用紧凑行式：小方图 + 首领名 + 日期与图数"},
			{tag: "improve", text: "首页速报在没有人工作置顶时默认取最新一篇强敌笔记，新增文章不必再回头改清单"},
		],
	},
	{
		version: "0.5.0",
		date: "2026-09-03",
		title: "文章模块独立化",
		items: [
			{tag: "feature", text: "档案速报与 /articles 改读独立的文章数据层，卡片带封面、分类、日期与阅读时长；新增 /articles/:id 详情页，顺序渲染原文配图并给出「查看微信原文」外链"},
			{tag: "feature", text: "新增 pnpm sync:articles：按 scripts/article-sources.json 里的清单抓取《崩坏：星穹铁道》官方公众号「强敌侦察笔记」等文章，生成 src/data/articles.json"},
			{tag: "improve", text: "文章配图统一走新的渲染出口热链微信图床（no-referrer + 防盗链占位图自检 + 加载失败回落），本站不落盘任何图片"},
		],
	},
	{
		version: "0.4.0",
		date: "2026-09-03",
		title: "标记图标与检索区间",
		items: [
			{tag: "feature", text: "成本与分数改为精确区间检索，可只填一端；四个成本档保留为快捷预设，分数区间只在末日幻影出现"},
			{tag: "improve", text: "复活 / 火墙 / 大月卡武器启用游戏内图标，筛选卡、投稿表单、记录徽标与审核台统一呈现，图标不可用时自动回落通用图标"},
			{tag: "improve", text: "检索控制台重排：赛季并入模式标题行、敌方阶段改两列芯片、标记卡图标在上并按标记各自着色、分组与紧凑列表改成开关"},
		],
	},
	{
		version: "0.3.0",
		date: "2026-09-03",
		title: "投稿视频链接查重",
		items: [
			{tag: "feature", text: "视频链接填完即自动查重：同一支录像在同一敌方阶段已有待审或已通过的投稿时，就地给出已有记录摘要并挡住提交"},
			{tag: "improve", text: "忽略跟踪参数、www./m. 前缀与末尾斜杠识别同一支 B 站 / YouTube 录像；换阶段或改链接会立即重新检测"},
			{tag: "fix", text: "补齐「我的投稿」查询与撤回接口在 netlify.toml 中缺失的转发规则"},
		],
	},
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
