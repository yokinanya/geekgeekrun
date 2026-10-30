import { ipcMain } from 'electron'
import path from 'node:path'
import { readConfigFile, configFolderPath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { normalizeAiJobMatch } from '@geekgeekrun/geek-auto-start-chat-with-boss/ai-job-match.mjs'
import { writeFilesAtomicSync } from '@geekgeekrun/utils/atomic-json.mjs'
import { validateResumeDocument } from '../../../common/resume-document.mjs'
import { formatResumeJsonToMarkdown } from '../../../common/utils/resume'
import { exclusiveConfig } from '../config-queue'
import { assertAiMatchingReady, readSavedJobMatch, jobMatchEvaluatorForRun } from './index'
import { savedJobDetail } from './evaluator.mjs'

function loadResumeSettings() {
  const document = readConfigFile('resumes.json')?.[0] || null
  return { document, text: formatResumeJsonToMarkdown(document),
    settings: normalizeAiJobMatch(readConfigFile('boss.json').aiJobMatch) }
}

export function initResumeMatchingIpc() {
  ipcMain.handle('ux-resume-load', loadResumeSettings)
  ipcMain.handle('ux-resume-save', (_, payload) => exclusiveConfig(async () => {
    const settings = normalizeAiJobMatch(payload?.settings)
    const previous = readConfigFile('resumes.json') || []
    const resumes = payload.document === undefined ? previous : [
      { ...validateResumeDocument(payload.document), updateTime: Date.now() }, ...previous.slice(1)
    ]
    const boss = { ...readConfigFile('boss.json'), aiJobMatch: settings }
    assertAiMatchingReady({ 'boss.json': boss, 'resumes.json': resumes })
    writeFilesAtomicSync([
      [path.join(configFolderPath, 'resumes.json'), JSON.stringify(resumes)],
      [path.join(configFolderPath, 'boss.json'), JSON.stringify(boss)]
    ])
    return loadResumeSettings()
  }))
  ipcMain.handle('ux-job-match-result', (_, jobId) => readSavedJobMatch(jobId))
  ipcMain.handle('ux-job-match-evaluate', async (_, row) => {
    const detail = savedJobDetail(row)
    const boss = readConfigFile('boss.json')
    const settings = { ...normalizeAiJobMatch(boss.aiJobMatch), enabled: true }
    const evaluate = jobMatchEvaluatorForRun({ 'boss.json': { ...boss, aiJobMatch: settings },
      'resumes.json': readConfigFile('resumes.json') })
    try { return await evaluate(detail) }
    catch (error) { throw new Error((error as Error & { detail?: string }).detail || (error as Error).message) }
  })
}
