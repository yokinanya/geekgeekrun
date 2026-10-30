import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import {
  createFollowWorkHoursGate, initialFollowWorkHours, FollowWorkHoursClosedError
} from '../src/common/follow-work-hours.mjs'

const source = fs.readFileSync(new URL('../src/main/flow/READ_NO_REPLY_AUTO_REMINDER_MAIN/index.ts', import.meta.url), 'utf8')
const entryStart = source.indexOf('export async function runEntry()')
const entryCode = transformSync(
  source.slice(entryStart, source.indexOf("process.once('uncaughtException'", entryStart)).replace('export ', ''),
  { loader: 'ts' }
).code
const stop = new Error('fixture reached browser discovery')

function entryFixture(initial, waitingSleep) {
  let clock = +new Date(`2026-10-30T${initial}`)
  const events = []
  const workHours = createFollowWorkHoursGate({
    readHours: () => initialFollowWorkHours(), now: () => new Date(clock),
    sleep: async milliseconds => {
      events.push('sleep')
      if (waitingSleep) return waitingSleep()
      clock += milliseconds
    },
    onWaiting: () => events.push('waiting'),
    onReady: () => events.push('ready'),
    yieldWhileWaiting: async () => events.push('yield')
  })
  const context = vm.createContext({
    app: { whenReady: async () => {}, on() {} }, runRecordId: 42, workHours,
    process: { env: { GEEKGEEKRUND_WORKER_ID: 'readNoReplyAutoReminderMain' } },
    initPublicIpc() {}, connectToDaemon: async () => {}, sendToDaemon: async () => {},
    getLastUsedAndAvailableBrowser: async () => { events.push('browser'); throw stop }
  })
  vm.runInContext(entryCode, context)
  return { run: () => context.runEntry(), events }
}

test('the actual follow worker waits before any browser discovery or login setup outside work hours', async () => {
  const waiting = new Error('fixture stop while waiting')
  const fixture = entryFixture('20:00:00', () => { throw waiting })
  await assert.rejects(fixture.run(), error => error === waiting)
  assert.deepEqual(fixture.events, ['waiting', 'yield', 'sleep'])
})

test('the actual follow worker enters browser setup only after work hours begin', async () => {
  const fixture = entryFixture('08:59:59')
  await assert.rejects(fixture.run(), error => error === stop)
  assert.deepEqual(fixture.events, ['waiting', 'yield', 'sleep', 'ready', 'browser'])
})

const sendStart = source.indexOf('      const messageList = historyMessageList')
const sendCode = transformSync(
  'async function runSend() {' +
    source.slice(sendStart, source.indexOf("      taskProgress.update('sent'", sendStart)) + '}',
  { loader: 'ts' }
).code

test('crossing work hours during AI generation bypasses both existing fallback send paths', async () => {
  for (const hasHistory of [false, true]) {
    const closed = new FollowWorkHoursClosedError(new Date('2026-11-02T09:00:00'))
    const sends = []
    const context = vm.createContext({
      historyMessageList: hasHistory ? [{ isSelf: true, bizType: 0 }] : [],
      recentMessageQuantityForLlm: 8, openContentSource: 2, rechatContentSource: 2, rechatLlmFallback: 1,
      OPEN_CONTENT_SOURCE: { CONSTANT_CONTENT: 1 }, RECHAT_CONTENT_SOURCE: { GEMINI_WITH_CHAT_CONTEXT: 2 },
      RECHAT_LLM_FALLBACK: { SEND_LOOK_FORWARD_EMOTION: 1 }, constantOpenContent: 'fixture opening',
      FollowWorkHoursClosedError, workHours: {}, pageMapByName: { boss: {} }, console: { log() {} },
      getGptContent: async () => 'fixture AI content',
      sendMessage: async (_page, text) => { sends.push(text); throw closed },
      sendLookForwardReplyEmotion: async () => assert.fail('work-hours closure must not trigger an emotion fallback')
    })
    vm.runInContext(sendCode, context)
    await assert.rejects(context.runSend(), error => error === closed)
    assert.deepEqual(sends, ['fixture AI content'])
  }
})
