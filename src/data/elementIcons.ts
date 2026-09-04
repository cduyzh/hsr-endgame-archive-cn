import type { ElementType } from "@/types/archive"

/**
 * 属性（弱点 / 抗性）图标的远程地址。
 *
 * 七个都是游戏内属性图标，由参考站 theherta.com 托管：本站只热链、不落盘、不代理，
 * 加载失败一律回落中文文字（见 `components/ElementIcon.vue`）。既有图源
 * `static.nanoka.cc` 不发布属性图标目录，所以这里不走 `services/dataSource.ts` 的 `IMAGE_BASES`。
 */
export const ELEMENT_ICON_SOURCES: Record<ElementType, string> = {
  物理: "https://theherta.com/elements/physical.png",
  火: "https://theherta.com/elements/fire.png",
  冰: "https://theherta.com/elements/ice.png",
  雷: "https://theherta.com/elements/lightning.png",
  风: "https://theherta.com/elements/wind.png",
  量子: "https://theherta.com/elements/quantum.png",
  虚数: "https://theherta.com/elements/imaginary.png",
}
