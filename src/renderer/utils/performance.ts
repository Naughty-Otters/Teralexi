/**
 * Performance utility
 * 1. Calculate method execution time
 * @returns {void}
 * @date 2019-11-29
 */

import Timer from './timer'

type MemoryInfo = {
  jsHeapSizeLimit: number
  totalJSHeapSize: number
  usedJSHeapSize: number
}

class Performance {
  /**
   * Calculation result
   * @returns {Function}  Returns timing info
   * @date 2019-11-29
   */
  startExecute(name = ''): Function {
    const timer = Timer.start()
    const usedJSHeapSize = this.getMemoryInfo().usedJSHeapSize
    return (name2 = '') => {
      const executeTime = timer.stop()
      const endMemoryInfo = this.getMemoryInfo()
      console.log(
        '%cPerformance%c \n1. Route:%c%s%c\n2. Execution time: %c%sms%c \n3. Memory delta:%sB \n4. Allocated memory: %sMB \n5. Used memory:%sMB \n6. Free memory: %sMB',
        'padding: 2px 4px 2px 4px; background-color: #4caf50; color: #fff; border-radius: 4px;',
        '',
        'color: #ff6f00',
        `${name} ${name2}`,
        '',
        'color: #ff6f00',
        executeTime,
        '',
        endMemoryInfo.usedJSHeapSize - usedJSHeapSize,
        this.toMBSize(endMemoryInfo.jsHeapSizeLimit),
        this.toMBSize(endMemoryInfo.usedJSHeapSize),
        this.toMBSize(endMemoryInfo.totalJSHeapSize),
      )
    }
  }

  /**
   * Get memory info
   * @returns {MemoryInfo}
   * @date 2019-11-29
   */

  getMemoryInfo(): MemoryInfo {
    let memoryinfo = <MemoryInfo>{}
    if (window.performance && window.performance.memory) {
      memoryinfo = window.performance.memory
    }
    return memoryinfo
  }

  /**
   * Convert to MB
   * @returns {string}
   * @date 2019-11-29
   */
  toMBSize(byteSize: number): string {
    return (byteSize / (1024 * 1024)).toFixed(1)
  }
}

export default new Performance()
