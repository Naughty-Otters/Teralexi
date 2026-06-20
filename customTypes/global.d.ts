import { ipcRenderer, shell } from 'electron'
import type { IIpcRendererInvoke, IIpcRendererOn } from '../src/ipc/index'

/**
 */
type IpcRendererInvoke = {
  [key in keyof IIpcRendererInvoke]: {
    /**
     * @param args 参数
     * @returns
     */
    invoke: IIpcRendererInvoke[key]
  }
}

/**
 * 渲染进程监听事件
 */
type IpcRendererOn = {
  [key in keyof IIpcRendererOn]: {
    /**
     * 渲染进程监听事件
     * @param listener 监听事件
     * @returns
     */
    on: (listener: IIpcRendererOn[key]) => void
    /**
     * 渲染进程监听一次事件
     * @param listener
     * @returns
     */
    once: (listener: IIpcRendererOn[key]) => void
    /**
     * 渲染进程移除所有监听
     * @returns
     */
    removeAllListeners: () => void
    /**
     * 移除单个监听（必须与 `on` / `once` 注册的函数引用相同）
     */
    removeListener: (listener: IIpcRendererOn[key]) => void
  }
}

interface AnyObject {
  [key: string]: any
}

interface memoryInfo {
  jsHeapSizeLimit: number
  totalJSHeapSize: number
  usedJSHeapSize: number
}

declare global {
  interface Window {
    performance: {
      memory: memoryInfo
    }
    /**
     * 渲染进程的IPC通道
     * 但是只能是给主进程发消息(invoke)和监听主进程的消息(on/once)
     */
    ipcRendererChannel: IpcRendererInvoke & IpcRendererOn
    systemInfo: {
      platform: string
      release: string
      arch: string
      nodeVersion: string
      electronVersion: string
    }
    shell: typeof shell
    crash: {
      start: () => void
    }
  }
}
