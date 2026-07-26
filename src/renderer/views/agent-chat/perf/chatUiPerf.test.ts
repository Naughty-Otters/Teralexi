import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  chatUiPerfMark,
  getChatUiPerfCounters,
  isChatUiPerfMarksEnabled,
  recordIngressChunk,
  resetChatUiPerfCounters,
  setChatUiPerfMarksEnabled,
  setChatUiPerfStressMode,
} from './chatUiPerf'

describe('chatUiPerf mark gating', () => {
  beforeEach(() => {
    resetChatUiPerfCounters()
    setChatUiPerfStressMode(false)
    setChatUiPerfMarksEnabled(false)
    vi.stubGlobal('performance', {
      mark: vi.fn(),
      measure: vi.fn(),
    })
  })

  afterEach(() => {
    setChatUiPerfMarksEnabled(false)
    setChatUiPerfStressMode(false)
    resetChatUiPerfCounters()
    vi.unstubAllGlobals()
  })

  it('does not emit timeline marks when opt-in is off', () => {
    setChatUiPerfStressMode(true)
    recordIngressChunk()
    chatUiPerfMark('normalize')
    expect(isChatUiPerfMarksEnabled()).toBe(false)
    expect(performance.mark).not.toHaveBeenCalled()
    expect(getChatUiPerfCounters().ingressChunks).toBe(1)
  })

  it('emits timeline marks when opt-in is on under stress mode', () => {
    setChatUiPerfStressMode(true)
    setChatUiPerfMarksEnabled(true)
    chatUiPerfMark('normalize')
    expect(performance.mark).toHaveBeenCalledWith('chat:normalize')
  })
})
