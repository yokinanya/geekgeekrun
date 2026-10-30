import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  DEFAULT_FOLLOW_WORK_HOURS, initialFollowWorkHours, followWorkHoursIssues,
  followWorkHoursStatus, describeFollowWorkHours, createFollowWorkHoursGate,
  FollowWorkHoursClosedError
} from '../src/common/follow-work-hours.mjs'
import { followIssues } from '../src/common/ux-validation.mjs'

const localDate = (day, time) => new Date(`${day}T${time}`)
const statusAt = (day, time, hours) => followWorkHoursStatus(hours, localDate(day, time))
const schedule = overrides => ({ ...initialFollowWorkHours(), ...overrides })

test('existing settings get independent enabled weekday defaults without changing the original', () => {
  const hours = initialFollowWorkHours()
  assert.deepEqual(hours, DEFAULT_FOLLOW_WORK_HOURS)
  hours.weekdays.push(6)
  assert.deepEqual(DEFAULT_FOLLOW_WORK_HOURS.weekdays, [1, 2, 3, 4, 5])
  const source = schedule({ weekdays: [1], start: '10:30' })
  const copy = initialFollowWorkHours(source)
  assert.deepEqual(copy, source)
  assert.notEqual(copy.weekdays, source.weekdays)
})

test('weekday boundaries include start and exclude end down to the millisecond', () => {
  assert.equal(statusAt('2026-10-30', '08:59:59.999').allowed, false)
  assert.equal(statusAt('2026-10-30', '09:00:00.000').allowed, true)
  assert.equal(statusAt('2026-10-30', '17:59:59.999').allowed, true)
  const closed = statusAt('2026-10-30', '18:00:00.000')
  assert.equal(closed.allowed, false)
  assert.equal(+closed.nextStart, +localDate('2026-11-02', '09:00:00'))
})

test('weekend waits until Monday and custom working days follow the local calendar', () => {
  for (const day of ['2026-10-31', '2026-11-01']) {
    const status = statusAt(day, '12:00:00')
    assert.equal(status.allowed, false)
    assert.equal(+status.nextStart, +localDate('2026-11-02', '09:00:00'))
  }
  const hours = schedule({ weekdays: [0], start: '10:15', end: '16:45' })
  assert.equal(statusAt('2026-11-01', '10:15:00', hours).allowed, true)
  assert.equal(+statusAt('2026-11-01', '16:45:00', hours).nextStart, +localDate('2026-11-08', '10:15:00'))
})

test('overnight shifts belong to their starting weekday and resume after a weekend correctly', () => {
  const hours = schedule({ weekdays: [5], start: '22:00', end: '06:00' })
  assert.equal(statusAt('2026-10-30', '21:59:59', hours).allowed, false)
  assert.equal(statusAt('2026-10-30', '22:00:00', hours).allowed, true)
  assert.equal(statusAt('2026-10-31', '05:59:59', hours).allowed, true)
  assert.equal(statusAt('2026-10-31', '06:00:00', hours).allowed, false)
  assert.equal(statusAt('2026-10-30', '05:00:00', hours).allowed, false)
  assert.equal(+statusAt('2026-10-31', '06:00:00', hours).nextStart, +localDate('2026-11-06', '22:00:00'))
})

test('disabling hours removes the restriction explicitly, including on weekends', () => {
  const hours = schedule({ enabled: false })
  assert.deepEqual(statusAt('2026-11-01', '02:00:00', hours), { allowed: true, nextStart: null })
  assert.equal(describeFollowWorkHours(hours), '不限制处理时间')
})

test('invalid persisted settings fail visibly and cannot silently allow sending', () => {
  const invalid = [
    null, [], '09:00', {}, schedule({ enabled: 'true' }),
    schedule({ weekdays: [] }), schedule({ weekdays: [7] }), schedule({ weekdays: [1, 1] }),
    schedule({ weekdays: ['1'] }), schedule({ start: '9:00' }),
    schedule({ end: '24:00' }), schedule({ start: '18:00' }), schedule({ end: null })
  ]
  for (const hours of invalid) {
    assert.ok(followWorkHoursIssues(hours).length, JSON.stringify(hours))
    assert.throws(() => followWorkHoursStatus(hours), TypeError)
    assert.match(describeFollowWorkHours(hours), /无效/)
  }
  const issues = followIssues({ source: 'emotion', days: 21, interval: 10, workHours: schedule({ weekdays: [] }) })
  assert.deepEqual(issues.map(issue => issue.field), ['follow-work-days'])
})

test('the confirmation summary exposes local time and overnight day ownership', () => {
  assert.match(describeFollowWorkHours(), /周一.*周五.*09:00.*18:00.*电脑本地时间/)
  assert.match(describeFollowWorkHours(schedule({ weekdays: [5], start: '22:00', end: '06:00' })), /周五.*22:00.*次日 06:00/)
})

function gateFixture(initial, initialHours = schedule()) {
  let clock = +initial, hours = initialHours
  const events = []
  const gate = createFollowWorkHoursGate({
    readHours: () => hours,
    now: () => new Date(clock),
    sleep: async milliseconds => { events.push(['sleep', milliseconds]); clock += milliseconds },
    onWaiting: nextStart => events.push(['waiting', +nextStart]),
    onReady: () => events.push(['ready']),
    yieldWhileWaiting: async () => events.push(['yield'])
  })
  return { gate, events, setHours: value => { hours = value }, setClock: value => { clock = +value } }
}

test('off-hours waiting yields without processing and rechecks when the opening arrives', async () => {
  const fixture = gateFixture(localDate('2026-10-30', '08:59:58.500'))
  assert.throws(fixture.gate.assertCanProcess, FollowWorkHoursClosedError)
  await fixture.gate.waitUntilOpen()
  assert.doesNotThrow(fixture.gate.assertCanProcess)
  assert.deepEqual(fixture.events.map(event => event[0]), ['waiting', 'yield', 'sleep', 'yield', 'sleep', 'ready'])
  assert.deepEqual(fixture.events.filter(event => event[0] === 'sleep').map(event => event[1]), [1000, 500])
})

test('long-running work and AI requests cannot send once local time crosses the boundary', () => {
  const fixture = gateFixture(localDate('2026-10-30', '17:59:59'))
  fixture.gate.assertCanProcess()
  fixture.setClock(localDate('2026-10-30', '18:00:00'))
  assert.throws(fixture.gate.assertCanProcess, error => error instanceof FollowWorkHoursClosedError &&
    +error.nextStart === +localDate('2026-11-02', '09:00:00'))
  fixture.setHours(schedule({ enabled: false }))
  assert.doesNotThrow(fixture.gate.assertCanProcess)
})

test('resuming the computer during a later work window cannot send content from before the break', async () => {
  const fixture = gateFixture(localDate('2026-10-30', '17:59:59'))
  await fixture.gate.waitUntilOpen()
  fixture.gate.assertCanProcess()
  fixture.setClock(localDate('2026-11-02', '10:00:00'))
  assert.throws(fixture.gate.assertCanProcess, error => error instanceof FollowWorkHoursClosedError && /跨过工作时段/.test(error.message))
  await fixture.gate.waitUntilOpen()
  assert.doesNotThrow(fixture.gate.assertCanProcess)
})

test('waiting can be interrupted by queue yielding and propagates errors without resuming old work', async () => {
  const queued = new Error('fixture worker yielded')
  const gate = createFollowWorkHoursGate({
    readHours: () => schedule(), now: () => localDate('2026-10-31', '12:00:00'),
    sleep: () => assert.fail('a yielded worker must not continue waiting'),
    onWaiting() {}, onReady: () => assert.fail('not in work hours'),
    yieldWhileWaiting: async () => { throw queued }
  })
  await assert.rejects(gate.waitUntilOpen(), error => error === queued)
})

test('weekday windows use the computer timezone across daylight saving changes', () => {
  const moduleUrl = new URL('../src/common/follow-work-hours.mjs', import.meta.url).href
  for (const [day, expectedOffset] of [['2026-03-08', '-04:00'], ['2026-11-01', '-05:00']]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { followWorkHoursStatus } from ${JSON.stringify(moduleUrl)};
      const status = followWorkHoursStatus({enabled:true,weekdays:[0],start:'09:00',end:'18:00'}, new Date('${day}T08:00:00'));
      if (+status.nextStart !== +new Date('${day}T09:00:00${expectedOffset}')) throw Error('Wrong local opening');
    `], { encoding: 'utf8', env: { ...process.env, TZ: 'America/New_York' }, timeout: 5000 })
    assert.equal(result.status, 0, result.stderr)
  }
})
