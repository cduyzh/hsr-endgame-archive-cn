import {fileURLToPath, URL} from "node:url"
import vue from "@vitejs/plugin-vue"
import {defineConfig, type UserConfig} from "vite"
import type {UserConfig as VitestUserConfig} from "vitest/config"

// vitest 2.1 不给 vite 的 UserConfig 做模块增强，而 vitest/config 自带的 defineConfig 绑 vite5 类型、
// 会和 vite6 的插件类型打架，所以这里显式把 test 块并进来：仍然是类型检查，不是 as 断言。
type ViteConfigWithTest = UserConfig & Pick<VitestUserConfig, "test">

const config: ViteConfigWithTest = {
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 32200,
    hmr: false,
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
}

export default defineConfig(config)
