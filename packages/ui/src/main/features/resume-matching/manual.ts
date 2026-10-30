import { readConfigFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { normalizeAiJobMatch } from '@geekgeekrun/geek-auto-start-chat-with-boss/ai-job-match.mjs'
import { jobMatchEvaluatorForRun } from './index'
import { savedJobDetail } from './evaluator.mjs'
import type { RunDataPageQuery } from '../../../common/run-data'

export async function matchManualJob({ encryptJobId, query }: {
  encryptJobId: string; query: (payload: RunDataPageQuery) => Promise<{ data?: unknown }>
}) {
  const boss = readConfigFile('boss.json')
  if (!normalizeAiJobMatch(boss.aiJobMatch).enabled) return null
  const evaluate = jobMatchEvaluatorForRun({ 'boss.json': { ...boss, autoChatRunMode: 'chat' },
    'resumes.json': readConfigFile('resumes.json') })
  const rows = await query({ dataset: 'jobLibrary', filters: [{ field: 'encryptJobId', op: 'eq', value: encryptJobId }],
    pageNo: 1, pageSize: 1 })
  const detail = savedJobDetail((rows.data as { data?: unknown[] })?.data?.[0])
  let result
  try { result = await evaluate(detail) }
  catch (error) { throw new Error((error as Error & { detail?: string }).detail || (error as Error).message) }
  return result.accepted ? null : { status: 'not-matched' as const,
    message: `AI 匹配 ${result.score} 分（最低 ${result.minScore}）：${result.reason}；未打招呼` }
}
