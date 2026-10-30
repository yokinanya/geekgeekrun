import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ARCHIVE_CONFIG_FILES, ARCHIVE_STORAGE_FILES, createConfigArchive, parseConfigArchive,
  restoreArchiveSecrets, isPreferenceKey } from '../src/common/config-archive.mjs'
import { createConfigArchiveStore } from '../src/main/features/configuration-archive/store.mjs'
import atomic from '../../utils/atomic-file.cjs'

function fixture() {
  const defaults = new URL('../../geek-auto-start-chat-with-boss/default-config-file/', import.meta.url)
  const config = Object.fromEntries(ARCHIVE_CONFIG_FILES.map(name => {
    const file = new URL(name, defaults)
    return [name, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null]
  }))
  config['resumes.json'] = [{ format: 'markdown', name: 'resume', sourceName: 'resume.md', text: '# Python 简历' }]
  config['llm.json'] = [{ id: 'primary', enabled: true, model: 'model', providerCompleteApiUrl: 'https://ai.example/v1', providerApiSecret: 'test-key' }]
  config['dingtalk.json'].groupRobotAccessToken = 'test-token'
  config['boss.json'].autoReminder.geminiApiKey = 'old-test-key'
  const storage = Object.fromEntries(ARCHIVE_STORAGE_FILES.map(name => [name, null]))
  storage['auto-reminder-resume-system-message-template.md'] = '跟进 __REPLACE_REAL_RESUME_HERE__'
  storage['auto-reminder-open-message-template.md'] = '自我介绍'
  storage['job-status-poll-settings.json'] = { enabled: false, intervalHours: 24 }
  storage['boss-cookies.json'] = [{ name: 'token', value: 'test-login' }]
  storage['boss-local-storage.json'] = { user: 'test' }
  return { config, storage, preferences: { 'ux-nav-collapsed': '1', 'ggr:run-data-table:jobLibrary': '{"order":[],"widths":{}}' } }
}
const archive = options => createConfigArchive({ ...fixture(), includeSecrets: false, includeLogin: false, ...options })

test('full configuration round-trips work hours, resume, prompt, model and UI preferences', () => {
  const value = archive({ includeSecrets: true, includeLogin: true })
  assert.deepEqual(parseConfigArchive(JSON.stringify(value)), value)
  assert.deepEqual(value.config['boss.json'].autoReminder.workHours.weekdays, [1, 2, 3, 4, 5])
  assert.equal(value.config['resumes.json'][0].text, '# Python 简历')
  assert.equal(value.config['llm.json'][0].providerApiSecret, 'test-key')
  assert.equal(value.storage['boss-cookies.json'][0].value, 'test-login')
  assert.equal(value.preferences['ux-nav-collapsed'], '1')
})
test('credentials are explicitly omitted by default and login data never enters the file unless selected', () => {
  const text = JSON.stringify(archive())
  for (const secret of ['test-key', 'test-token', 'old-test-key', 'test-login', 'providerApiSecret', 'geminiApiKey'])
    assert.equal(text.includes(secret), false, secret)
  assert.equal(Object.hasOwn(archive().storage, 'boss-cookies.json'), false)
  assert.equal(archive().containsSecrets, false)
})
test('credential-free imports preserve same-provider keys without leaking them to a changed service', () => {
  const current = fixture().config, incoming = archive().config
  const restored = restoreArchiveSecrets({ incoming, current, containsSecrets: false })
  assert.equal(restored['llm.json'][0].providerApiSecret, 'test-key')
  assert.equal(restored['dingtalk.json'].groupRobotAccessToken, 'test-token')
  const changed = structuredClone(incoming)
  changed['llm.json'][0].providerCompleteApiUrl = 'https://different.example/v1'
  assert.equal(restoreArchiveSecrets({ incoming: changed, current, containsSecrets: false })['llm.json'][0].providerApiSecret, '')
  const full = archive({ includeSecrets: true }).config
  full['llm.json'][0].providerApiSecret = ''
  assert.equal(restoreArchiveSecrets({ incoming: full, current, containsSecrets: true })['llm.json'][0].providerApiSecret, '')
  assert.equal(incoming['llm.json'][0].providerApiSecret, undefined)
})
test('factory-default blank AI config is exportable without demanding a paid AI setup', () => {
  const data = fixture()
  data.config['llm.json'] = [{ enabled: true, model: '', providerCompleteApiUrl: '', providerApiSecret: '' }]
  assert.doesNotThrow(() => createConfigArchive({ ...data, includeSecrets: false, includeLogin: false }))
})
test('bad versions, malformed files, unsafe filenames, invalid schedules and bogus metadata reject before writing', () => {
  assert.throws(() => parseConfigArchive('not JSON'), /JSON/)
  const variations = [
    value => { value.version = 999 },
    value => { value.config['../../outside.json'] = {} },
    value => { delete value.config['boss.json'] },
    value => { value.config['boss.json'].autoReminder.workHours.weekdays = [] },
    value => { value.config['boss.json'].aiJobMatch = { enabled: true, minScore: '60', instructions: '' } },
    value => { value.preferences['arbitrary-key'] = 'x' },
    value => { value.config['llm.json'][0].providerApiSecret = 'unmarked-key' },
    value => { value.config['resumes.json'] = [{ text: '' }] },
    value => { value.storage['auto-reminder-resume-system-message-template.md'] = 'missing placeholder' },
    value => { value.config['log.json'] = { enabled: 'yes' } }
  ]
  for (const mutate of variations) {
    const value = archive()
    mutate(value)
    assert.throws(() => parseConfigArchive(JSON.stringify(value)))
  }
  const text = JSON.stringify(archive()).replace('"config":{', '"config":{"__proto__":{"polluted":true},')
  assert.throws(() => parseConfigArchive(text), /不安全/)
})
function diskStore(t, writeBatch = atomic.writeFilesAtomicSync) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ggr-archive-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const configFolder = path.join(folder, 'config'), storageFolder = path.join(folder, 'storage')
  fs.mkdirSync(configFolder); fs.mkdirSync(storageFolder)
  const data = fixture()
  for (const [name, value] of Object.entries(data.config)) fs.writeFileSync(path.join(configFolder, name), JSON.stringify(value))
  for (const [name, value] of Object.entries(data.storage)) if (value !== null)
    fs.writeFileSync(path.join(storageFolder, name), name.endsWith('.json') ? JSON.stringify(value) : value)
  const read = (folder, name, isJson) => {
    const file = path.join(folder, name)
    if (!fs.existsSync(file)) return null
    const text = fs.readFileSync(file, 'utf8')
    return isJson ? JSON.parse(text) : text
  }
  return { configFolder, storageFolder, store: createConfigArchiveStore({ configFolder, storageFolder,
    readConfig: name => read(configFolder, name, true),
    readStorage: (name, { isJson }) => read(storageFolder, name, isJson), writeBatch,
    defaultPrompts: { 'auto-reminder-resume-system-message-template.md': 'default __REPLACE_REAL_RESUME_HERE__',
      'auto-reminder-open-message-template.md': 'default opening' } }) }
}
test('import restores configuration atomically and discards obsolete close drafts without touching login or DB', t => {
  const { store, configFolder, storageFolder } = diskStore(t)
  fs.writeFileSync(path.join(storageFolder, 'public.db'), 'unchanged DB')
  fs.writeFileSync(path.join(storageFolder, 'ux-close-draft.json'), 'old pending draft')
  const value = archive()
  value.config['boss.json'].aiJobMatch.minScore = 85
  const result = store.apply({ archive: value, expectedHash: store.fingerprint() })
  assert.equal(JSON.parse(fs.readFileSync(path.join(configFolder, 'boss.json'))).aiJobMatch.minScore, 85)
  assert.equal(fs.readFileSync(path.join(storageFolder, 'public.db'), 'utf8'), 'unchanged DB')
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageFolder, 'boss-cookies.json')))[0].value, 'test-login')
  assert.deepEqual(JSON.parse(JSON.parse(fs.readFileSync(path.join(storageFolder, 'ux-close-draft.json'))).data), { state: null, models: null })
  assert.deepEqual(result.preferences, value.preferences)
  assert.doesNotThrow(() => store.export({ includeSecrets: false, includeLogin: false, preferences: result.preferences }))
})
test('changes after the preview refuse to overwrite newer settings', t => {
  const { store, configFolder } = diskStore(t), expectedHash = store.fingerprint()
  fs.writeFileSync(path.join(configFolder, 'dingtalk.json'), '{"groupRobotAccessToken":"newer"}')
  assert.throws(() => store.apply({ archive: archive(), expectedHash }), /配置已变化/)
  assert.equal(JSON.parse(fs.readFileSync(path.join(configFolder, 'dingtalk.json'))).groupRobotAccessToken, 'newer')
})
test('a failed replacement rolls every earlier config file back', t => {
  let failAt = ''
  const io = { ...fs, renameSync(from, to) {
    if (to === failAt) { failAt = ''; throw Object.assign(new Error('test disk error'), { code: 'ENOSPC' }) }
    return fs.renameSync(from, to)
  } }
  const { store, configFolder } = diskStore(t, atomic.createAtomicFileIO({ io }).writeFilesAtomicSync)
  const before = fs.readFileSync(path.join(configFolder, 'boss.json'), 'utf8')
  const value = archive()
  value.config['boss.json'].aiJobMatch.minScore = 90
  failAt = path.join(configFolder, 'dingtalk.json')
  assert.throws(() => store.apply({ archive: value, expectedHash: store.fingerprint() }), /test disk error/)
  assert.equal(fs.readFileSync(path.join(configFolder, 'boss.json'), 'utf8'), before)
})
test('only application view preferences belong in an exported file', () => {
  assert.equal(isPreferenceKey('ggr:run-data-filters:jobLibrary'), true)
  assert.equal(isPreferenceKey('ggr:run-data-filter-history-limit'), true)
  assert.equal(isPreferenceKey('some-session-token'), false)
})
test('status polling settings round-trip through the storage file actually read by the scheduler', t => {
  const { store, configFolder, storageFolder } = diskStore(t)
  const value = store.export({ includeSecrets: false, includeLogin: false, preferences: {} })
  assert.deepEqual(value.storage['job-status-poll-settings.json'], { enabled: false, intervalHours: 24 })
  assert.equal(Object.hasOwn(value.config, 'job-status-poll-settings.json'), false)
  value.storage['job-status-poll-settings.json'] = { enabled: true, intervalHours: 12 }
  store.apply({ archive: value, expectedHash: store.fingerprint() })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(storageFolder, 'job-status-poll-settings.json'))),
    { enabled: true, intervalHours: 12 })
  assert.equal(fs.existsSync(path.join(configFolder, 'job-status-poll-settings.json')), false)
  value.storage['job-status-poll-settings.json'].intervalHours = 13
  assert.throws(() => parseConfigArchive(JSON.stringify(value)), /检查间隔/)
})
test('an unset optional storage setting stays valid through repeated imports and exports', t => {
  const { store, storageFolder } = diskStore(t)
  const value = archive()
  value.storage['job-status-poll-settings.json'] = null
  store.apply({ archive: value, expectedHash: store.fingerprint() })
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageFolder, 'job-status-poll-settings.json'))), null)
  assert.equal(store.export({ includeSecrets: false, includeLogin: false, preferences: {} })
    .storage['job-status-poll-settings.json'], null)
})
test('real table and saved filter preferences survive export and reject malformed content', () => {
  const preferences = {
    'ggr:run-data-table:jobLibrary': JSON.stringify({ order: ['jobName'], widths: { jobName: 220 }, hidden: ['bossName'], pageSize: 20 }),
    'ggr:run-data-filters:jobLibrary': JSON.stringify({ saved: [{ id: 'filter-1', at: 123, name: 'Python',
      snapshot: { keyword: 'Python', rows: [{ field: 'jobName', op: 'contains', value: 'Python' }], columns: { cityName: ['上海'] } } }], recent: [] }),
    'ggr:run-data-filter-history-limit': '5', 'ux-nav-collapsed': '1'
  }
  assert.deepEqual(archive({ preferences }).preferences, preferences)
  for (const text of ['null', '[]', '{"order":[],"widths":{"jobName":-1}}'])
    assert.throws(() => archive({ preferences: { 'ggr:run-data-table:jobLibrary': text } }), /偏好/)
})
