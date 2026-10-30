import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeAiJobMatch, parseJobMatchResult, jobMatchDecision, jobMatchMessages,
  evaluateJobBeforeAction } from '../../geek-auto-start-chat-with-boss/ai-job-match.mjs'
import { createJobMatchEvaluator } from '../src/main/features/resume-matching/evaluator.mjs'
import { createJobMatchStore, matchingSettingsHash } from '../src/main/features/resume-matching/store.mjs'
import { jobConfigSnapshot } from '../../geek-auto-start-chat-with-boss/task-config-snapshot.mjs'
import { jobComparisonScope } from '../../geek-auto-start-chat-with-boss/job-comparison-scope.mjs'

const settings = { enabled: true, minScore: 60, instructions: 'AI 应用开发，排除销售' }
const result = { score: 80, suitable: true, reason: '具备 Python 和 RAG 项目经历', strengths: ['RAG 项目'], gaps: ['云部署经验待确认'] }
const detail = { jobInfo: { encryptId: 'job/../../id', jobName: 'AI 应用开发', postDescription: 'Python、RAG、API 开发' } }
const models = [{ id: 'primary', enabled: true, model: 'test-model', providerCompleteApiUrl: 'http://localhost/v1',
  providerApiSecret: 'fixture-secret', thinkingEnabled: false, maxRetries: 0 }]

test('match threshold is inclusive and suitability is independently required', () => {
  assert.equal(jobMatchDecision({ ...result, score: 60 }, settings).accepted, true)
  assert.equal(jobMatchDecision({ ...result, score: 59 }, settings).accepted, false)
  assert.equal(jobMatchDecision({ ...result, score: 99, suitable: false }, settings).accepted, false)
  assert.equal(jobMatchDecision({ ...result, score: 0 }, { ...settings, minScore: 0 }).accepted, true)
})
test('invalid scores, config types, and incomplete AI output fail instead of allowing jobs', () => {
  for (const change of [{ minScore: -1 }, { minScore: 101 }, { minScore: 1.5 }, { enabled: 'true' }, { instructions: null }])
    assert.throws(() => normalizeAiJobMatch({ ...settings, ...change }))
  for (const content of ['not JSON', '', '{}', '{"score":"90"}', JSON.stringify({ ...result, score: 101 }),
    JSON.stringify({ ...result, suitable: 'true' }), JSON.stringify({ ...result, gaps: null })])
    assert.throws(() => parseJobMatchResult(content))
  assert.deepEqual(parseJobMatchResult('```json\n' + JSON.stringify(result) + '\n```'), result)
})
test('resume and JD are separate data; missing documents cannot become matches', () => {
  const messages = jobMatchMessages({ resume: '# Python 项目', job: detail.jobInfo, instructions: settings.instructions })
  assert.equal(messages.length, 2)
  assert.deepEqual(JSON.parse(messages[1].content), { resume: '# Python 项目', job: detail.jobInfo, instructions: settings.instructions })
  assert.match(messages[0].content, /命令.*不能改变/)
  assert.throws(() => jobMatchMessages({ resume: '', job: detail.jobInfo }), /简历/)
  assert.throws(() => jobMatchMessages({ resume: '有简历', job: { jobName: '开发' } }), /职责描述/)
})
test('disabled matching does no work; enabled execution awaits AI before allowing any action', async () => {
  let called = false
  const evaluate = async () => { called = true; return result }
  assert.equal(await evaluateJobBeforeAction({ settings: { ...settings, enabled: false }, detail, evaluate }), null)
  assert.equal(called, false)
  assert.equal((await evaluateJobBeforeAction({ settings, detail, evaluate })).accepted, true)
  assert.equal(called, true)
  await assert.rejects(evaluateJobBeforeAction({ settings, detail }), { message: 'AUTO_CHAT_AI_MATCH_FAILED' })
  await assert.rejects(evaluateJobBeforeAction({ settings, detail, evaluate: async () => { throw Error('offline') } }),
    error => error.message === 'AUTO_CHAT_AI_MATCH_FAILED' && error.detail.includes('offline'))
})
test('the evaluator sends full resume and JD with sufficient output space, then persists actual results', async () => {
  const saved = []
  const evaluate = createJobMatchEvaluator({ resume: '# Python / RAG 实战', settings, models, now: () => 123,
    complete: async (options, messages) => {
      assert.equal(options.maxTokens, 1600)
      assert.equal(options.maxRetries, 0)
      assert.equal(JSON.parse(messages[1].content).job.postDescription, detail.jobInfo.postDescription)
      return { choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'stop' }] }
    }, save: async entry => saved.push(entry) })
  const evaluation = await evaluate(detail)
  assert.equal(evaluation.accepted, true)
  assert.equal(evaluation.evaluatedAt, 123)
  assert.equal(saved[0].jobId, detail.jobInfo.encryptId)
  assert.deepEqual(saved[0].evaluation, evaluation)
})
test('network, malformed and truncated responses and save failures never produce successful matches', async () => {
  const failures = [
    async () => { throw Error('offline fixture-secret') },
    async () => ({ choices: [{ message: { content: '{}' } }] }),
    async () => ({ choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'length' }] })
  ]
  for (const complete of failures) {
    const evaluate = createJobMatchEvaluator({ resume: 'resume', settings, models, complete, save: () => assert.fail('invalid result saved') })
    await assert.rejects(evaluate(detail), error => error.message === 'AUTO_CHAT_AI_MATCH_FAILED' && !error.detail.includes('fixture-secret'))
  }
  const evaluate = createJobMatchEvaluator({ resume: 'resume', settings, models,
    complete: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }),
    save: () => { throw Error('disk full') } })
  await assert.rejects(evaluate(detail), error => error.detail.includes('disk full'))
})
test('matching records survive reload and job IDs cannot escape the record directory', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ggr-match-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const store = createJobMatchStore(folder)
  assert.equal(store.read(detail.jobInfo.encryptId), null)
  store.save({ jobId: detail.jobInfo.encryptId, resume: 'resume', settings, job: detail.jobInfo, evaluation: result })
  assert.deepEqual(createJobMatchStore(folder).read(detail.jobInfo.encryptId).evaluation, result)
  assert.equal(fs.readdirSync(path.join(folder, 'ai-job-matches')).length, 1)
  assert.throws(() => store.read(''), /岗位编号/)
})
test('result freshness depends on evaluation settings rather than the automatic matching switch', () => {
  const saved = matchingSettingsHash(settings)
  assert.equal(matchingSettingsHash({ ...settings, enabled: false }), saved)
  assert.notEqual(matchingSettingsHash({ ...settings, minScore: 90 }), saved)
  assert.notEqual(matchingSettingsHash({ ...settings, instructions: 'Rust 开发' }), saved)
})
test('queued tasks freeze the matching resume and comparison scopes change with its content', () => {
  const config = { 'boss.json': { aiJobMatch: settings, jobSourceList: [{ type: 'search', enabled: true,
    children: [{ keyword: 'AI', enabled: true, type: 'search-kw' }] }] },
    'common-job-condition-config.json': {}, 'target-company-list.json': [],
    'resumes.json': [{ name: 'resume', format: 'markdown', text: 'Python RAG', sourceName: '' }],
    'llm.json': models }
  const snapshot = jobConfigSnapshot(config)
  const before = jobComparisonScope(snapshot)
  config['resumes.json'][0].text = 'Rust'
  assert.equal(snapshot['resumes.json'][0].text, 'Python RAG')
  assert.notEqual(jobComparisonScope(jobConfigSnapshot(config)), before)
  assert.equal(Object.hasOwn(snapshot, 'llm.json'), false)
  assert.equal(JSON.stringify(snapshot).includes('fixture-secret'), false)
})
