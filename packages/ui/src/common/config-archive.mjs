import { validateJobFilterConfig } from '@geekgeekrun/geek-auto-start-chat-with-boss/job-filter-config.mjs'
import { normalizeRunPolicy } from '@geekgeekrun/geek-auto-start-chat-with-boss/run-policy.mjs'
import { validModels } from './model-config.mjs'
import { validateResumeList } from './resume-document.mjs'
import { followWorkHoursIssues } from './follow-work-hours.mjs'
import { readUpdateSettings } from './update-settings.mjs'
import { validateAdditionalSettings, validateArchiveStorage, validateArchivePreferences, validateArchiveModels } from './config-archive-validation.mjs'

export const CONFIG_ARCHIVE_FORMAT = 'geekgeekrun-settings'
export const CONFIG_ARCHIVE_VERSION = 1
export const ARCHIVE_CONFIG_FILES = Object.freeze([
  'boss.json', 'common-job-condition-config.json', 'target-company-list.json', 'sample-company-list.json',
  'llm.json', 'dingtalk.json', 'resumes.json', 'run-policy.json', 'run-pace.json',
  'db-backup.json', 'log.json', 'update.json'
])
export const ARCHIVE_STORAGE_FILES = Object.freeze([
  'auto-reminder-resume-system-message-template.md', 'auto-reminder-open-message-template.md',
  'ux-workspace.json', 'last-used-browser-record', 'job-status-poll-settings.json'
])
export const ARCHIVE_LOGIN_FILES = Object.freeze(['boss-cookies.json', 'boss-local-storage.json'])
export const isPreferenceKey = key => ['ux-nav-collapsed', 'ux-rail-expanded', 'ggr:run-data-filter-history-limit'].includes(key) ||
  /^ggr:run-data-(?:table|filters):[\w:-]+$/.test(key)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const copy = value => JSON.parse(JSON.stringify(value))

function validateTree(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('配置包含不安全的字段')
    validateTree(item)
  }
}
function exactFiles(value, allowed, label) {
  if (!record(value) || Object.keys(value).some(key => !allowed.includes(key)) ||
    allowed.some(key => !Object.hasOwn(value, key))) throw new Error(label + '文件清单无效或不完整')
}
function validateConfig(config) {
  exactFiles(config, ARCHIVE_CONFIG_FILES, '配置')
  for (const file of ['boss.json', 'common-job-condition-config.json', 'dingtalk.json'])
    if (!record(config[file])) throw new Error(file + ' 结构无效')
  validateJobFilterConfig(config['boss.json'])
  validateJobFilterConfig(config['common-job-condition-config.json'])
  for (const file of ['target-company-list.json', 'sample-company-list.json']) {
    if (!Array.isArray(config[file]) || config[file].some(value => typeof value !== 'string'))
      throw new Error(file + ' 须为公司名称数组')
  }
  validateArchiveModels(config['llm.json'], validModels)
  validateResumeList(config['resumes.json'])
  if (config['run-policy.json'] !== null) normalizeRunPolicy(config['run-policy.json'], { legacy: true })
  if (config['update.json'] !== null) readUpdateSettings(config['update.json'])
  const hours = config['boss.json'].autoReminder?.workHours
  if (hours !== undefined && followWorkHoursIssues(hours).length) throw new Error('消息工作时间配置无效')
  validateAdditionalSettings(config)
}
function withoutSecrets(config) {
  const result = copy(config)
  result['llm.json'] = result['llm.json'].map(({ providerApiSecret, hasProviderApiSecret, ...model }) => model)
  delete result['dingtalk.json'].groupRobotAccessToken
  delete result['dingtalk.json'].hasGroupRobotAccessToken
  if (result['boss.json'].autoReminder) {
    delete result['boss.json'].autoReminder.geminiApiKey
    delete result['boss.json'].autoReminder.hasGeminiApiKey
  }
  return result
}
export function createConfigArchive({ config, storage, preferences, includeSecrets, includeLogin, exportedAt = new Date().toISOString() }) {
  const archive = { format: CONFIG_ARCHIVE_FORMAT, version: CONFIG_ARCHIVE_VERSION, exportedAt,
    containsSecrets: includeSecrets, containsLogin: includeLogin,
    config: includeSecrets ? copy(config) : withoutSecrets(config),
    storage: Object.fromEntries([...ARCHIVE_STORAGE_FILES, ...(includeLogin ? ARCHIVE_LOGIN_FILES : [])]
      .map(name => [name, storage[name] ?? null])), preferences: copy(preferences) }
  return parseConfigArchive(JSON.stringify(archive))
}
export function parseConfigArchive(text) {
  let value
  try { value = JSON.parse(text) }
  catch { throw new Error('配置文件不是有效的 JSON，未修改任何设置') }
  if (value?.format !== CONFIG_ARCHIVE_FORMAT) throw new Error('这不是 GeekGeekRun 的全量配置文件')
  if (value.version !== CONFIG_ARCHIVE_VERSION) throw new Error('不支持此配置版本，请使用相同版本的软件导入')
  if (typeof value.containsSecrets !== 'boolean' || typeof value.containsLogin !== 'boolean' ||
    typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)))
    throw new Error('配置文件元数据无效')
  validateTree(value)
  validateConfig(value.config)
  exactFiles(value.storage, [...ARCHIVE_STORAGE_FILES, ...(value.containsLogin ? ARCHIVE_LOGIN_FILES : [])], '附加设置')
  validateArchiveStorage(value.storage)
  validateArchivePreferences(value.preferences, isPreferenceKey)
  if (!value.containsSecrets && JSON.stringify(value.config) !== JSON.stringify(withoutSecrets(value.config)))
    throw new Error('文件标注不包含密钥，但检测到凭证字段，请核对文件来源')
  return value
}
export function restoreArchiveSecrets({ incoming, current, containsSecrets }) {
  if (containsSecrets) return copy(incoming)
  const result = copy(incoming)
  result['llm.json'] = result['llm.json'].map(model => {
    const saved = current['llm.json'].find(item => (model.id ? item.id === model.id : item.model === model.model) &&
      item.providerCompleteApiUrl === model.providerCompleteApiUrl)
    return { ...model, providerApiSecret: saved?.providerApiSecret || '' }
  })
  result['dingtalk.json'].groupRobotAccessToken = current['dingtalk.json'].groupRobotAccessToken || ''
  if (result['boss.json'].autoReminder && current['boss.json'].autoReminder?.geminiApiKey)
    result['boss.json'].autoReminder.geminiApiKey = current['boss.json'].autoReminder.geminiApiKey
  return result
}
