interface DesktopMsgProps {
  /** Title */
  title: string
  /** Body */
  body: string
  /** ICON */
  icon?: string
}

/**
 * @export
 * @Author: Sky
 * @Date: 2019-09-29 20:23:16
 * @Last Modified by: Sky
 * @Last Modified time: 2019-09-29 21:01:24
 * @param {DesktopMsgProps} option
 * @returns
 * @feature For basic notifications pass title and body; for notifications with an icon also pass icon (accepts an image URL). Returns true when the user clicks the notification.
 * Since this returns a promise, use .then() to handle the result
 **/

export function DesktopMsg(option: DesktopMsgProps): Promise<boolean> {
  const msgfunc = new window.Notification(option.title, option)
  return new Promise((resolve) => {
    msgfunc.onclick = () => {
      resolve(true)
    }
  })
}
