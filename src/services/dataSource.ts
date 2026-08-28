/**
 * 统一数据源配置
 *
 * 页面所有 JSON 与图片资源均直连 static.nanoka.cc 读取（已开放 CORS），
 * 本站不再代理或落盘任何数据文件，以降低 Netlify 带宽与存储占用。
 */

export const DATA_SITE = 'https://static.nanoka.cc'

export function dataSourceUrl(path: string): string {
  return `${DATA_SITE}${path.startsWith('/') ? path : `/${path}`}`
}

/** 各类图片的远程基础路径 */
export const IMAGE_BASES = {
  monster: `${DATA_SITE}/assets/hsr/monstermiddleicon`,
  character: `${DATA_SITE}/assets/hsr/avatarshopicon`,
  lightcone: `${DATA_SITE}/assets/hsr/lightconemediumicon`,
  path: `${DATA_SITE}/assets/hsr/pathicon`,
} as const

/**
 * 构建怪物中图远程 URL。
 * 9 位实例怪物 id 自动回退到基础 id（参考 nanoka 的命名规则）。
 */
export function monsterImageUrl(monsterId: number | string): string {
  const raw = Number(monsterId)
  const baseId = raw >= 1e8 ? Math.floor(raw / 100) : raw
  const id = baseId % 10 === 0 ? baseId : Math.floor(baseId / 10) * 10
  return `${IMAGE_BASES.monster}/Monster_${id}.webp`
}
