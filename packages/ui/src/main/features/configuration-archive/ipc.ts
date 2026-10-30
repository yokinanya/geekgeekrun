import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { configFolderPath, storageFilePath, readConfigFile, readStorageFile, ensureConfigFileExist,
  ensureStorageFileExist } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { writeFileAtomicSync, writeFilesAtomicSync } from '@geekgeekrun/utils/atomic-json.mjs'
import { parseConfigArchive } from '../../../common/config-archive.mjs'
import { defaultPromptMap } from '../../flow/READ_NO_REPLY_AUTO_REMINDER_MAIN/boss-operation'
import { exclusiveConfig } from '../config-queue'
import { getBusyTaskNames } from '../task-queue'
import { updateSettingsEvents } from '../update-settings'
import { readUpdateSettings } from '../../../common/update-settings.mjs'
import { createConfigArchiveStore } from './store.mjs'

type Candidate = { token: string; archive: ReturnType<typeof parseConfigArchive>; expectedHash: string }
let candidate: Candidate | null = null
const store = () => createConfigArchiveStore({ configFolder: configFolderPath, storageFolder: storageFilePath,
  readConfig: readConfigFile, readStorage: readStorageFile, writeBatch: writeFilesAtomicSync,
  defaultPrompts: Object.fromEntries(Object.values(defaultPromptMap).map(info => [info.fileName, info.content])) })

async function assertImportIdle() {
  const busy = await getBusyTaskNames()
  if (busy.length) throw new Error('请先停止运行或排队的任务再导入配置：' + busy.join('、'))
}
function initializeFolders() {
  ensureConfigFileExist()
  ensureStorageFileExist()
}
async function prepareImport(event: Electron.IpcMainInvokeEvent) {
  await assertImportIdle()
  const parent = BrowserWindow.fromWebContents(event.sender)
  const options: Electron.OpenDialogOptions = { title: '选择全量配置文件', properties: ['openFile'],
    filters: [{ name: 'GeekGeekRun 配置', extensions: ['json'] }] }
  const selection = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (selection.canceled || !selection.filePaths.length) return null
  const archive = parseConfigArchive(await fs.readFile(selection.filePaths[0], 'utf8'))
  return exclusiveConfig(async () => {
    initializeFolders()
    const token = randomUUID()
    candidate = { token, archive, expectedHash: store().fingerprint() }
    return { token, fileName: path.basename(selection.filePaths[0]), exportedAt: archive.exportedAt,
      containsSecrets: archive.containsSecrets, containsLogin: archive.containsLogin,
      configCount: Object.keys(archive.config).length,
      templateCount: archive.storage['ux-workspace.json']?.state?.templates?.length || 0,
      resumeCount: archive.config['resumes.json'].length }
  })
}
async function exportSettings(event: Electron.IpcMainInvokeEvent, options) {
  if (!options || typeof options.includeSecrets !== 'boolean' || typeof options.includeLogin !== 'boolean')
    throw new Error('请选择密钥与登录凭证的导出方式')
  const archive = await exclusiveConfig(async () => { initializeFolders(); return store().export(options) })
  const parent = BrowserWindow.fromWebContents(event.sender)
  const saveOptions = { title: '导出全量配置', defaultPath: `geekgeekrun-settings-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }] }
  const selection = parent ? await dialog.showSaveDialog(parent, saveOptions) : await dialog.showSaveDialog(saveOptions)
  if (selection.canceled || !selection.filePath) return null
  writeFileAtomicSync(selection.filePath, JSON.stringify(archive, null, 2))
  return { fileName: path.basename(selection.filePath) }
}
export function initConfigurationArchiveIpc() {
  ipcMain.handle('ux-config-export', exportSettings)
  ipcMain.handle('ux-config-import-preview', prepareImport)
  ipcMain.handle('ux-config-import-apply', (_, token) => exclusiveConfig(async () => {
    await assertImportIdle()
    if (!candidate || candidate.token !== token) throw new Error('配置预览已失效，请重新选择文件')
    const result = store().apply(candidate)
    candidate = null
    updateSettingsEvents.emit('changed', readUpdateSettings(readConfigFile('update.json')))
    return result
  }))
  ipcMain.handle('ux-config-import-cancel', () => { candidate = null })
}
