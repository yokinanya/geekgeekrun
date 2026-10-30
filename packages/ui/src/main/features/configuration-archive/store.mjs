import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { ARCHIVE_CONFIG_FILES, ARCHIVE_STORAGE_FILES, ARCHIVE_LOGIN_FILES,
  createConfigArchive, restoreArchiveSecrets } from '../../../common/config-archive.mjs'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const arrayFiles = new Set(['resumes.json', 'sample-company-list.json'])
const jsonStorage = new Set(['ux-workspace.json', 'job-status-poll-settings.json', ...ARCHIVE_LOGIN_FILES])

export function createConfigArchiveStore({ configFolder, storageFolder, readConfig, readStorage, writeBatch, defaultPrompts }) {
  function capture(preferences = {}) {
    const unknown = fs.readdirSync(configFolder).filter(file => file.endsWith('.json') && !ARCHIVE_CONFIG_FILES.includes(file))
    if (unknown.length) throw new Error('存在当前版本未识别的配置文件，请检查后再导出：' + unknown.join('、'))
    const config = Object.fromEntries(ARCHIVE_CONFIG_FILES.map(name => [name, readConfig(name) ?? (arrayFiles.has(name) ? [] : null)]))
    const storage = Object.fromEntries([...ARCHIVE_STORAGE_FILES, ...ARCHIVE_LOGIN_FILES]
      .map(name => [name, readStorage(name, { isJson: jsonStorage.has(name) }) || null]))
    return { config, storage, preferences }
  }
  function apply({ archive, expectedHash }) {
    const current = capture()
    if (hash(current) !== expectedHash) throw new Error('预览后本机配置已变化，请重新选择配置文件并确认覆盖')
    const config = restoreArchiveSecrets({ incoming: archive.config, current: current.config, containsSecrets: archive.containsSecrets })
    const workspace = archive.storage['ux-workspace.json']
    const signature = hash([config['boss.json'], config['target-company-list.json'], config['common-job-condition-config.json']])
    const nextWorkspace = { revision: (current.storage['ux-workspace.json']?.revision || 0) + 1,
      state: workspace?.state || null, signature }
    const entries = Object.entries(config).map(([name, value]) => [path.join(configFolder, name), JSON.stringify(value)])
    for (const name of [...ARCHIVE_STORAGE_FILES, ...(archive.containsLogin ? ARCHIVE_LOGIN_FILES : [])]) {
      if (name === 'ux-workspace.json') continue
      const value = archive.storage[name] ?? defaultPrompts[name] ?? (jsonStorage.has(name) ? null : '')
      entries.push([path.join(storageFolder, name), jsonStorage.has(name) ? JSON.stringify(value) : value])
    }
    entries.push([path.join(storageFolder, 'ux-workspace.json'), JSON.stringify(nextWorkspace)],
      [path.join(storageFolder, 'ux-close-draft.json'), JSON.stringify({ version: 1, encrypted: false, data: '{"state":null,"models":null}' })])
    writeBatch(entries)
    return { preferences: archive.preferences }
  }
  return {
    export: options => createConfigArchive({ ...capture(options.preferences), ...options }),
    fingerprint: () => hash(capture()),
    apply
  }
}
