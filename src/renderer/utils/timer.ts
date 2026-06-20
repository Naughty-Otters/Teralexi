/**
 * Timer
 * Supports chaining
 * timeout()
 *  .then(()=>{
 *     return inTheEnd();
 *   })
 *  .then(()=>{
 *      return inTheEnd();
 *   });
 *
 * @date 2019-11-25
 */
class Timer {
  /**
   * Delay operation
   * @returns {void}
   * @date 2019-11-25
   */
  timeout(interval: number, args?: any): Promise<Timer> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(args)
      }, interval)
    })
  }

  /**
   * Wait for a code block to finish before continuing
   * @returns {void}
   * @date 2019-11-25
   */
  inTheEnd(): Promise<Timer> {
    return this.timeout(0)
  }

  /**
   * Recurring timer, continues next cycle after callback completes
   * @param {Number} interval Interval
   * @param {Function} [callback] Callback
   * @returns {Object}
   * @date 2019-11-25
   */
  interval(interval: number, callback: Function) {
    this.timeout(interval).then(() => {
      typeof callback === 'function' &&
        callback() !== false &&
        this.interval(interval, callback)
    })
    return { then: (c) => (callback = c) }
  }

  /**
   * Timer, unit: milliseconds
   * @returns {void}
   * @date 2019-11-29
   */
  start() {
    const startDate = new Date()
    return {
      stop() {
        const stopDate = new Date()
        return stopDate.getTime() - startDate.getTime()
      },
    }
  }
}

export default new Timer()
