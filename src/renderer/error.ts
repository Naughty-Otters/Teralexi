import type { App } from 'vue'
import { nextTick } from 'vue'

function reportRendererError(payload: {
  message: string
  stack?: string
  info?: string
}) {
  const channel = window.ipcRendererChannel?.ReportClientError
  if (!channel?.invoke) return
  void channel.invoke(payload).catch(() => {})
}

export const errorHandler = (App: App<Element>) => {
  App.config.errorHandler = (err, vm, info) => {
    nextTick(() => {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      reportRendererError({ message, stack, info })

      if (import.meta.env.DEV) {
        console.group('%c >>>>>> Error Info >>>>>>', 'color:red')
        console.log(`%c ${info}`, 'color:blue')
        console.groupEnd()
        console.group(
          '%c >>>>>> Vue instance where error occurred >>>>>>',
          'color:green',
        )
        console.log(vm)
        console.groupEnd()
        console.group('%c >>>>>> Error cause and location >>>>>>', 'color:red')
        console.error(err)
        console.groupEnd()
      }
    })
  }

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection'
    const stack = reason instanceof Error ? reason.stack : undefined
    reportRendererError({ message, stack, info: 'unhandledrejection' })
  })
}
