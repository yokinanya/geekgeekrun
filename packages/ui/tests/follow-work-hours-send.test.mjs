import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  createFollowWorkHoursGate, initialFollowWorkHours, FollowWorkHoursClosedError
} from '../src/common/follow-work-hours.mjs'

const file = fileURLToPath(new URL('../src/main/flow/READ_NO_REPLY_AUTO_REMINDER_MAIN/send-message.ts', import.meta.url))
const compiled = await build({
  entryPoints: [file], bundle: true, format: 'cjs', platform: 'node', write: false,
  plugins: [{
    name: 'isolated-follow-clock',
    setup(builder) {
      builder.onResolve({ filter: /utils\/sleep\.mjs$/ }, () => ({ path: 'clock', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export const sleep=ms=>globalThis.__followSendClock.sleep(ms); export const sleepWithRandomDelay=sleep;'
      }))
    }
  }]
})
const loaded = new Module(file)
loaded._compile(compiled.outputFiles[0].text, file)
const { sendMessage, sendLookForwardReplyEmotion } = loaded.exports

function sendFixture(t, time) {
  let clock = +new Date(`2026-10-30T${time}`)
  const actions = []
  globalThis.__followSendClock = { sleep: async milliseconds => { clock += milliseconds } }
  t.after(() => { delete globalThis.__followSendClock })
  const page = {
    evaluate: async () => '',
    $: async selector => ({
      click: async () => actions.push(selector),
      type: async text => { actions.push(`type:${text}`); clock += text.length * 50 }
    }),
    click: async selector => actions.push(selector),
    waitForFunction: async () => actions.push('confirmed')
  }
  const permission = createFollowWorkHoursGate({
    readHours: () => initialFollowWorkHours(), now: () => new Date(clock)
  })
  return { actions, page, permission }
}

test('text sending refuses the real final click if typing and waiting cross closing time', async t => {
  const fixture = sendFixture(t, '17:59:59')
  await assert.rejects(sendMessage(fixture.page, 'fixture only', fixture.permission), FollowWorkHoursClosedError)
  assert.ok(fixture.actions.includes('type:fixture only'))
  assert.ok(!fixture.actions.some(action => action.includes('btn-send') || action === 'confirmed'))
})

test('emotion sending refuses the actual emoji click if opening the picker crosses closing time', async t => {
  const fixture = sendFixture(t, '17:59:59')
  await assert.rejects(sendLookForwardReplyEmotion(fixture.page, fixture.permission), FollowWorkHoursClosedError)
  assert.ok(fixture.actions.some(action => action.includes('btn-emotion')))
  assert.ok(!fixture.actions.some(action => action.includes('img[title=盼回复]') || action === 'confirmed'))
})

test('off-hours calls perform no browser interaction for either send type', async t => {
  const fixture = sendFixture(t, '20:00:00')
  await assert.rejects(sendMessage(fixture.page, 'fixture only', fixture.permission), FollowWorkHoursClosedError)
  await assert.rejects(sendLookForwardReplyEmotion(fixture.page, fixture.permission), FollowWorkHoursClosedError)
  assert.deepEqual(fixture.actions, [])
})

test('during work hours both send types still require page confirmation', async t => {
  const fixture = sendFixture(t, '10:00:00')
  await sendMessage(fixture.page, 'fixture only', fixture.permission)
  await sendLookForwardReplyEmotion(fixture.page, fixture.permission)
  assert.ok(fixture.actions.some(action => action.includes('btn-send')))
  assert.ok(fixture.actions.some(action => action.includes('img[title=盼回复]')))
  assert.equal(fixture.actions.filter(action => action === 'confirmed').length, 2)
})

test('an uncertain send after closing remains an explicit error and never becomes a time-based retry', async t => {
  const fixture = sendFixture(t, '17:59:58')
  fixture.page.waitForFunction = async () => {
    await globalThis.__followSendClock.sleep(15000)
    throw Error('fixture confirmation timeout')
  }
  await assert.rejects(sendMessage(fixture.page, 'ok', fixture.permission), /SEND_CONFIRMATION_UNCERTAIN/)
  assert.equal(fixture.actions.filter(action => action.includes('btn-send')).length, 1)
})
