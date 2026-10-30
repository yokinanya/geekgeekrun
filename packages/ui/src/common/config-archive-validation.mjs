import { normalizeCache } from './ux-validation.mjs'
import { LOG_LEVELS, LOG_RETENTION_RANGE } from './log-settings.mjs'
import { DB_BACKUP_INTERVAL_HOURS, DB_BACKUP_MODES, DB_BACKUP_KEEP_RANGE } from './db-backup.mjs'
import { JOB_STATUS_POLL_INTERVAL_HOURS, MAX_WAIT_SECONDS } from '@geekgeekrun/geek-auto-start-chat-with-boss/run-settings.mjs'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function settingsObject(config, file) {
  const value = config[file]
  if (value !== null && !record(value)) throw new Error(file + ' 配置须为对象')
  return value
}
function optionalBoolean(value, key, file) {
  if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(file + ' 的 ' + key + ' 须为布尔值')
}
function optionalNumber(value, key, { range, file }) {
  if (value[key] !== undefined && (!Number.isFinite(value[key]) || value[key] < range[0] || value[key] > range[1]))
    throw new Error(file + ' 的 ' + key + ' 不在有效范围')
}
export function validateAdditionalSettings(config) {
  const log = settingsObject(config, 'log.json')
  if (log) {
    optionalBoolean(log, 'enabled', 'log.json')
    optionalNumber(log, 'retentionDays', { range: LOG_RETENTION_RANGE, file: 'log.json' })
    if (log.level !== undefined && !LOG_LEVELS.includes(log.level)) throw new Error('日志级别无效')
  }
  const backup = settingsObject(config, 'db-backup.json')
  if (backup) {
    optionalBoolean(backup, 'enabled', 'db-backup.json')
    optionalNumber(backup, 'keep', { range: DB_BACKUP_KEEP_RANGE, file: 'db-backup.json' })
    if ((backup.mode !== undefined && !DB_BACKUP_MODES.includes(backup.mode)) ||
      (backup.intervalHours !== undefined && !DB_BACKUP_INTERVAL_HOURS.includes(backup.intervalHours)) ||
      (backup.dir !== undefined && typeof backup.dir !== 'string')) throw new Error('数据库备份设置无效')
  }
  const pace = settingsObject(config, 'run-pace.json')
  if (pace) {
    optionalBoolean(pace, 'pause', 'run-pace.json')
    optionalNumber(pace, 'actions', { range: [1, Number.MAX_SAFE_INTEGER], file: 'run-pace.json' })
    optionalNumber(pace, 'minutes', { range: [0, Number.MAX_SAFE_INTEGER], file: 'run-pace.json' })
    for (const key of ['jobListLoadWaitSeconds', 'jobDetailViewWaitSeconds'])
      optionalNumber(pace, key, { range: [0, MAX_WAIT_SECONDS], file: 'run-pace.json' })
  }
}
function validateWorkspace(value) {
  if (value === null) return
  if (!record(value) || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    (value.state !== null && !record(value.state))) throw new Error('界面工作区结构无效')
  if (!value.state) return
  const normalized = normalizeCache(value.state)
  if ((value.state.draft && !normalized?.draft) ||
    (value.state.follow && !normalized?.follow) ||
    (value.state.templates && normalized?.templates.length !== value.state.templates.length))
    throw new Error('界面草稿或模板内容无效，未导入配置')
}
export function validateArchiveStorage(storage) {
  validateWorkspace(storage['ux-workspace.json'])
  const poll = settingsObject(storage, 'job-status-poll-settings.json')
  if (poll) {
    optionalBoolean(poll, 'enabled', 'job-status-poll-settings.json')
    if (poll.intervalHours !== undefined && !JOB_STATUS_POLL_INTERVAL_HOURS.includes(poll.intervalHours))
      throw new Error('职位状态检查间隔无效')
  }
  for (const name of ['auto-reminder-resume-system-message-template.md', 'auto-reminder-open-message-template.md', 'last-used-browser-record'])
    if (storage[name] !== null && (typeof storage[name] !== 'string' || !storage[name].trim()))
      throw new Error(name + ' 内容无效')
  const prompt = storage['auto-reminder-resume-system-message-template.md']
  if (prompt !== null && !prompt.includes('__REPLACE_REAL_RESUME_HERE__')) throw new Error('跟进提示词缺少简历占位符')
  const cookies = storage['boss-cookies.json']
  if (cookies !== undefined && (!Array.isArray(cookies) || cookies.some(item =>
    !record(item) || typeof item.name !== 'string' || typeof item.value !== 'string'))) throw new Error('登录 Cookie 格式无效')
  const local = storage['boss-local-storage.json']
  if (local !== undefined && (!record(local) || Object.values(local).some(value => typeof value !== 'string')))
    throw new Error('登录网站存储格式无效')
}

export function validateArchiveModels(models, validate) {
  if (!Array.isArray(models) || models.some(model => !record(model))) throw new Error('AI 模型配置格式无效')
  for (const model of models) {
    for (const key of ['id', 'model', 'providerCompleteApiUrl', 'providerApiSecret', 'role'])
      if (model[key] !== undefined && typeof model[key] !== 'string') throw new Error('AI 模型字段须为文本')
    optionalBoolean(model, 'enabled', 'llm.json')
  }
  const enabled = models.filter(model => model.enabled)
  if (!enabled.some(model => model.model || model.providerCompleteApiUrl)) return
  const error = validate(enabled)
  if (error) throw new Error(error)
}

const stringList = value => Array.isArray(value) && value.every(item => typeof item === 'string')
function tablePreferences(value) {
  return record(value) && stringList(value.order) && record(value.widths) &&
    Object.values(value.widths).every(width => Number.isFinite(width) && width > 0) &&
    (value.hidden === undefined || stringList(value.hidden)) &&
    (value.pageSize === undefined || (Number.isInteger(value.pageSize) && value.pageSize > 0))
}
function filterPreferences(value) {
  if (!record(value)) return false
  return ['saved', 'recent'].every(key => value[key] === undefined || (Array.isArray(value[key]) &&
    value[key].every(item => record(item) && typeof item.id === 'string' && record(item.snapshot) &&
      typeof item.snapshot.keyword === 'string' && Array.isArray(item.snapshot.rows) && record(item.snapshot.columns))))
}
function preferenceValue(key, text) {
  if (key.startsWith('ux-')) return ['0', '1'].includes(text)
  if (key === 'ggr:run-data-filter-history-limit') return /^(?:0|[1-9]\d*)$/.test(text) && Number(text) <= 50
  let value
  try { value = JSON.parse(text) }
  catch { return false }
  return key.startsWith('ggr:run-data-table:') ? tablePreferences(value) : filterPreferences(value)
}
export function validateArchivePreferences(value, allowedKey) {
  if (!record(value) || Object.entries(value).some(([key, text]) =>
    !allowedKey(key) || typeof text !== 'string' || !preferenceValue(key, text)))
    throw new Error('界面偏好配置无效，请检查侧栏、表格或筛选设置')
}
