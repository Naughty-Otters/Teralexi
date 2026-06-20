// Menu definitions. See https://electronjs.org/docs/api/menu
import { dialog, Menu } from 'electron'
import type { MenuItemConstructorOptions, MenuItem } from 'electron'
import { type, arch, release } from 'os'
import { version } from '../../../package.json'
import { createLogger, instrumentObjectMethods } from '@main/logger'

const menu: Array<MenuItemConstructorOptions | MenuItem> = [
  {
    label: 'setting',
    submenu: [
      {
        label: 'Reload',
        accelerator: 'F5',
        role: 'reload',
      },
      {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+F4',
        role: 'close',
      },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        role: 'undo',
      },
      {
        label: 'Redo',
        accelerator: 'Shift+CmdOrCtrl+Z',
        role: 'redo',
      },
      {
        type: 'separator',
      },
      {
        label: 'Cut',
        accelerator: 'CmdOrCtrl+X',
        role: 'cut',
      },
      {
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        role: 'copy',
      },
      {
        label: 'Paste',
        accelerator: 'CmdOrCtrl+V',
        role: 'paste',
      },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        role: 'selectAll',
      },
    ],
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About',
        click: function () {
          dialog.showMessageBox({
            title: 'About',
            type: 'info',
            message: 'electron-Vue Framework',
            detail: `Version：${version}\n: ${
              process.versions.v8
            }\nCurrent system：${type()} ${arch()} ${release()}`,
            noLink: true,
            buttons: ['View GitHub', 'OK'],
          })
        },
      },
    ],
  },
]

const log = createLogger('hooks.menu')

export const useMenu = () => {
  const createMenu = () => {
    log.info('Creating application menu', {
      isDevelopment: process.env.NODE_ENV === 'development',
    })
    if (process.env.NODE_ENV === 'development') {
      menu.push({
        label: 'Developer Settings',
        submenu: [
          {
            label: 'Toggle Developer Mode',
            accelerator: 'CmdOrCtrl+I',
            role: 'toggleDevTools',
          },
        ],
      })
    }
    // Assign template
    const menuTemplate = Menu.buildFromTemplate(menu)
    // Load template
    Menu.setApplicationMenu(menuTemplate)
  }
  return instrumentObjectMethods({
    createMenu,
  }, log.child({ scope: 'hooks.menu.factory' }))
}
