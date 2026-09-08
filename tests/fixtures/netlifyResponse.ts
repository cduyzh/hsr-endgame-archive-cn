/**
 * Netlify Function handler 的测试辅助。
 *
 * `Handler` 的返回类型是 `void | HandlerResponse`（允许 fire-and-forget），
 * 直接取 `.statusCode` / `.headers` / `.body` 在类型上都不成立。集中在这里收窄一次，
 * 顺带在 handler 真的没返回响应时抛出可读错误，而不是让断言报一堆 undefined。
 */
export interface HandlerResponseResult {
  statusCode: number
  headers: Record<string, string>
  body: string
}

export function asResponse(result: unknown): HandlerResponseResult {
  if (!result || typeof result !== "object") {
    throw new Error(`handler 没有返回响应对象，实际拿到：${String(result)}`)
  }
  return result as HandlerResponseResult
}

export function bodyOf<T = Record<string, unknown>>(result: unknown): T {
  return JSON.parse(asResponse(result).body) as T
}
