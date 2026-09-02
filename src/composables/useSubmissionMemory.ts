import {onScopeDispose, shallowRef, watch} from "vue"
import type {SubmissionPayload} from "@/types/archive"

const MEMORY_KEY = "hsr-archive.submission-memory.v1"
const MAX_PRESETS = 3

export interface SubmissionPresetSlot {
  unitId: string
  eidolon: number
}

export interface SubmissionPresetLightcone {
  unitId: string
  superimposition: number
}

export interface SubmissionTeamPreset {
  id: string
  name: string
  units: SubmissionPresetSlot[]
  lightcones: SubmissionPresetLightcone[]
}

export interface SubmissionMemory {
  author: string
  presets: SubmissionTeamPreset[]
  /** 投稿成功后下发的 own_xxx 凭证，本地缓存用于"我的投稿"页查自己提的记录。 */
  tokens: string[]
}

const EMPTY_MEMORY: SubmissionMemory = {author: "", presets: [], tokens: []}
const MAX_TOKENS = 50

function memoryStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isSlotArray(value: unknown): value is SubmissionPresetSlot[] {
  return Array.isArray(value) && value.every((slot) => slot && typeof slot === "object" && typeof (slot as {unitId?: unknown}).unitId === "string")
}

function isLightconeArray(value: unknown): value is SubmissionPresetLightcone[] {
  return Array.isArray(value) && value.every((slot) => slot && typeof slot === "object" && typeof (slot as {unitId?: unknown}).unitId === "string")
}

function isPreset(value: unknown): value is SubmissionTeamPreset {
  const preset = value as SubmissionTeamPreset | null
  return Boolean(
    preset
    && typeof preset === "object"
    && typeof preset.id === "string"
    && typeof preset.name === "string"
    && isSlotArray(preset.units)
    && isLightconeArray(preset.lightcones),
  )
}

function isMemory(value: unknown): value is SubmissionMemory {
  const memory = value as SubmissionMemory | null
  return Boolean(
    memory
    && typeof memory === "object"
    && typeof memory.author === "string"
    && Array.isArray(memory.presets)
    && memory.presets.every(isPreset)
    && Array.isArray(memory.tokens)
    && memory.tokens.every((token) => typeof token === "string"),
  )
}

function loadMemory(): SubmissionMemory {
  const raw = memoryStorage()?.getItem(MEMORY_KEY)
  if (!raw) return {...EMPTY_MEMORY}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isMemory(parsed)) return {...EMPTY_MEMORY}
    return {
      author: parsed.author,
      presets: parsed.presets.slice(0, MAX_PRESETS),
      tokens: parsed.tokens.slice(0, MAX_TOKENS),
    }
  } catch {
    return {...EMPTY_MEMORY}
  }
}

function persist(memory: SubmissionMemory) {
  try {
    memoryStorage()?.setItem(MEMORY_KEY, JSON.stringify(memory))
  } catch {
    /* 隐私模式或配额耗尽时静默降级 */
  }
}

function makeId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function useSubmissionMemory(options: {
  payload: SubmissionPayload
  teamSlotCount: number
}) {
  const {payload, teamSlotCount} = options
  const memory = shallowRef<SubmissionMemory>(loadMemory())

  /** 写回 localStorage 的小工具：避免多处直接拼 memory.value。 */
  const update = (next: SubmissionMemory) => {
    memory.value = next
    persist(next)
  }

  const setAuthor = (value: string) => {
    const trimmed = value.trim()
    if (memory.value.author === trimmed) return
    update({...memory.value, author: trimmed})
  }

  const saveCurrentAsPreset = (name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return null
    const preset: SubmissionTeamPreset = {
      id: makeId(),
      name: trimmedName,
      units: payload.units.map((slot) => ({unitId: slot.unitId, eidolon: slot.eidolon})),
      lightcones: payload.lightcones.map((slot) => ({unitId: slot.unitId, superimposition: slot.superimposition})),
    }
    const existing = memory.value.presets
    const replaceIndex = existing.findIndex((entry) => entry.name === trimmedName)
    const nextPresets = replaceIndex >= 0
      ? existing.map((entry, index) => (index === replaceIndex ? preset : entry))
      : [preset, ...existing].slice(0, MAX_PRESETS)
    update({...memory.value, presets: nextPresets})
    return preset
  }

  const applyPreset = (presetId: string) => {
    const preset = memory.value.presets.find((entry) => entry.id === presetId)
    if (!preset) return false
    const blankSlot = () => ({unitId: "", eidolon: 0})
    const blankLightcone = () => ({unitId: "", superimposition: 1})
    payload.units = Array.from({length: teamSlotCount}, (_, index) => preset.units[index] ?? blankSlot())
    payload.lightcones = Array.from({length: teamSlotCount}, (_, index) => preset.lightcones[index] ?? blankLightcone())
    return true
  }

  const removePreset = (presetId: string) => {
    update({...memory.value, presets: memory.value.presets.filter((entry) => entry.id !== presetId)})
  }

  /** 提交成功后由表单调用，把下发的 ownerToken 入队首；重复 token 会被去重。 */
  const addToken = (token: string) => {
    const trimmed = token.trim()
    if (!trimmed) return
    if (memory.value.tokens.includes(trimmed)) return
    update({...memory.value, tokens: [trimmed, ...memory.value.tokens].slice(0, MAX_TOKENS)})
  }

  const removeToken = (token: string) => {
    if (!memory.value.tokens.includes(token)) return
    update({...memory.value, tokens: memory.value.tokens.filter((entry) => entry !== token)})
  }

  const clearTokens = () => {
    if (memory.value.tokens.length === 0) return
    update({...memory.value, tokens: []})
  }

  /** 提交成功后只更新作者名记忆；预设是手动管理的，不动。空字符串视为不更新，避免提交后清空表单时把记忆也擦掉。 */
  watch(
    () => payload.author,
    (author) => {
      const trimmed = (author ?? "").trim()
      if (!trimmed) return
      if (memory.value.author === trimmed) return
      update({...memory.value, author: trimmed})
    },
  )

  onScopeDispose(() => {
    /* shallowRef + watch 自动清理，无需手动 stop */
  })

  return {
    memory,
    maxPresets: MAX_PRESETS,
    setAuthor,
    saveCurrentAsPreset,
    applyPreset,
    removePreset,
    addToken,
    removeToken,
    clearTokens,
  }
}
