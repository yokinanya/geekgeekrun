import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { writeJsonAtomicSync } from '@geekgeekrun/utils/atomic-json.mjs'
import { parseJobMatchResult } from '@geekgeekrun/geek-auto-start-chat-with-boss/ai-job-match.mjs'

export const contentHash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
export const matchingSettingsHash = ({ minScore, instructions }) => contentHash({ minScore, instructions })
export function createJobMatchStore(folder) {
  const directory = path.join(folder, 'ai-job-matches')
  const fileFor = id => {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('岗位编号为空，无法保存匹配结果')
    return path.join(directory, contentHash(id) + '.json')
  }
  return {
    save({ jobId, resume, settings, job, evaluation }) {
      const file = fileFor(jobId)
      fs.mkdirSync(directory, { recursive: true })
      writeJsonAtomicSync(file, { version: 1, jobId, resumeHash: contentHash(resume),
        settingsHash: matchingSettingsHash(settings), jobHash: contentHash(job), evaluation })
    },
    read(jobId) {
      const file = fileFor(jobId)
      let text
      try { text = fs.readFileSync(file, 'utf8') }
      catch (error) { if (error.code === 'ENOENT') return null; throw error }
      const data = JSON.parse(text)
      if (data?.version !== 1 || data.jobId !== jobId) throw new Error('已保存的 AI 匹配结果格式无效')
      parseJobMatchResult(JSON.stringify(data.evaluation))
      return data
    }
  }
}
