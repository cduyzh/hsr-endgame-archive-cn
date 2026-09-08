/**
 * 业务 API 的基础前缀。
 *
 * `archiveService.ts` 与 `staticArchiveConfig.ts` 都要用它，但后者被前者 import，
 * 从 archiveService 反向导出会形成循环依赖，所以单独放一个模块。
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? ""
