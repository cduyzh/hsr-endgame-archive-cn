import { writeFile } from "node:fs/promises"

const reference = {
  source: "https://theherta.com/",
  capturedAt: new Date().toISOString(),
  policy: "仅保存观察到的信息架构与资源 URL，不下载、不复制、不作为运行时依赖。",
  layoutNotes: [
    "顶部工具栏包含统计、快捷入口、FAQ、投稿。",
    "桌面端为左侧筛选、中央记录、右侧角色/光锥选择器。",
    "移动端筛选堆叠在记录上方，保留高信息密度。",
  ],
  observedResourceKinds: [
    "角色图",
    "光锥图",
    "属性/命途图标",
    "boss 图",
    "文章封面",
    "公开 JSON 配置",
  ],
}

await writeFile("reference-inventory.json", `${JSON.stringify(reference, null, 2)}\n`)
