import type { RunFlag } from "@/types/archive"

/**
 * 标记图标的远程地址。
 *
 * 三个都是游戏内图标，由参考站 theherta.com 托管：本站只热链、不落盘、不代理，
 * 加载失败一律回落 lucide（见 `components/FlagIcon.vue`）。既有图源
 * `static.nanoka.cc` 没有技能图标目录，所以这里不走 `services/dataSource.ts` 的 `IMAGE_BASES`。
 */
export const FLAG_ICON_SOURCES: Record<RunFlag, string> = {
  revive: "https://theherta.com/skill_icons/SkillIcon_1407_Passive.webp",
  firewall: "https://theherta.com/skill_icons/sw999_talent.webp",
  bpWeapon: "https://theherta.com/skill_icons/Icon_Nameless_Honor.png",
}
