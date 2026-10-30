import { readConfigFile, storageFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { normalizeAiJobMatch } from '@geekgeekrun/geek-auto-start-chat-with-boss/ai-job-match.mjs'
import { completes } from '@geekgeekrun/utils/gpt-request.mjs'
import { pickModel, validModels, modelPair } from '../../../common/model-config.mjs'
import { checkIsResumeContentValid, formatResumeJsonToMarkdown } from '../../../common/utils/resume'
import { createJobMatchEvaluator } from './evaluator.mjs'
import { createJobMatchStore, contentHash, matchingSettingsHash } from './store.mjs'

export function assertAiMatchingReady(config: Record<string, any>) {
  const boss = config['boss.json']
  const settings = normalizeAiJobMatch(boss.aiJobMatch)
  if (!settings.enabled || (boss.autoChatRunMode === 'collect' && boss.collectOnlyMatchingJobs === false)) return
  const resume = (config['resumes.json'] || readConfigFile('resumes.json'))?.[0]
  if (!checkIsResumeContentValid(resume)) throw new Error('AI 匹配需要有效简历，请先导入并保存 PDF / Markdown 简历或填写结构化简历')
  const models = readConfigFile('llm.json')
  const error = validModels(modelPair(models))
  if (error || !pickModel(models)) throw new Error('AI 匹配需要保存有效的模型配置：' + (error || '尚未配置模型'))
}

export function jobMatchEvaluatorForRun(config: Record<string, any>) {
  assertAiMatchingReady(config)
  const settings = normalizeAiJobMatch(config['boss.json'].aiJobMatch)
  const resume = formatResumeJsonToMarkdown((config['resumes.json'] || readConfigFile('resumes.json'))?.[0])
  return createJobMatchEvaluator({ resume, settings, models: readConfigFile('llm.json'),
    complete: completes, save: createJobMatchStore(storageFilePath).save })
}

export function readSavedJobMatch(jobId: string) {
  const saved = createJobMatchStore(storageFilePath).read(jobId)
  if (!saved) return null
  const resume = formatResumeJsonToMarkdown(readConfigFile('resumes.json')?.[0])
  const settings = normalizeAiJobMatch(readConfigFile('boss.json').aiJobMatch)
  return { ...saved.evaluation, configurationChanged: saved.resumeHash !== contentHash(resume) ||
    saved.settingsHash !== matchingSettingsHash(settings) }
}
