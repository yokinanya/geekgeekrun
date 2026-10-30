const DAYS_PER_WEEK = 7
const MINUTES_PER_HOUR = 60
export const WORK_HOURS_CHECK_INTERVAL_MS = 1000
export const WORK_HOURS_WAITING_STATE = 'waiting-work-hours'
export const DEFAULT_FOLLOW_WORK_HOURS = Object.freeze({
  enabled: true,
  weekdays: Object.freeze([1, 2, 3, 4, 5]),
  start: '09:00',
  end: '18:00'
})
export const WORK_WEEKDAYS = Object.freeze([
  [1, '周一'], [2, '周二'], [3, '周三'], [4, '周四'],
  [5, '周五'], [6, '周六'], [0, '周日']
].map(([value, label]) => Object.freeze({ value, label })))

export function initialFollowWorkHours(value = DEFAULT_FOLLOW_WORK_HOURS) {
  return { ...value, weekdays: Array.isArray(value?.weekdays) ? [...value.weekdays] : value?.weekdays }
}

const isClockTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const clockMinutes = value => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * MINUTES_PER_HOUR + minutes
}

const validWorkHoursShape = value =>
  value && typeof value === 'object' && !Array.isArray(value) && typeof value.enabled === 'boolean'
const validWeekday = day => Number.isInteger(day) && day >= 0 && day < DAYS_PER_WEEK
const validWeekdays = days =>
  Array.isArray(days) && days.length > 0 && days.every(validWeekday) && new Set(days).size === days.length
const validTimeRange = hours =>
  isClockTime(hours.start) && isClockTime(hours.end) && hours.start !== hours.end

export function followWorkHoursIssues(value = DEFAULT_FOLLOW_WORK_HOURS) {
  if (!validWorkHoursShape(value))
    return [{ field: 'follow-work-hours', text: '工作时间配置无效，请重新设置是否仅在工作时间处理消息。' }]
  if (!value.enabled) return []
  const issues = []
  if (!validWeekdays(value.weekdays))
    issues.push({ field: 'follow-work-days', text: '请选择至少一个工作日，星期不能重复。' })
  if (!validTimeRange(value))
    issues.push({ field: 'follow-work-time', text: '请填写有效且不同的开始、结束时间（24小时制）。' })
  return issues
}

function workWindow(day, hours) {
  const start = new Date(day), end = new Date(day)
  start.setHours(0, clockMinutes(hours.start), 0, 0)
  const crossesMidnight = clockMinutes(hours.end) < clockMinutes(hours.start)
  end.setDate(end.getDate() + Number(crossesMidnight))
  end.setHours(0, clockMinutes(hours.end), 0, 0)
  return { start, end }
}

export function followWorkHoursStatus(value, now = new Date()) {
  const hours = value === undefined ? DEFAULT_FOLLOW_WORK_HOURS : value
  const issues = followWorkHoursIssues(hours)
  if (issues.length) throw new TypeError(issues.map(issue => issue.text).join('；'))
  if (!hours.enabled) return { allowed: true, nextStart: null }
  // Include yesterday's shift so a selected Friday can continue into Saturday.
  for (let offset = -1; offset <= DAYS_PER_WEEK; offset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + offset)
    if (!hours.weekdays.includes(day.getDay())) continue
    const { start, end } = workWindow(day, hours)
    if (now >= start && now < end) return { allowed: true, nextStart: null, windowEnd: end }
    if (start > now) return { allowed: false, nextStart: start }
  }
  throw new RangeError('无法确定下一次工作时间，请检查工作日和系统时间。')
}

export function describeFollowWorkHours(value) {
  const hours = value === undefined ? DEFAULT_FOLLOW_WORK_HOURS : value
  if (followWorkHoursIssues(hours).length) return '工作时间配置无效，请核对'
  if (!hours.enabled) return '不限制处理时间'
  const days = WORK_WEEKDAYS.filter(day => hours.weekdays.includes(day.value)).map(day => day.label).join('、')
  const overnight = clockMinutes(hours.end) < clockMinutes(hours.start) ? '次日 ' : ''
  return `${days} ${hours.start}–${overnight}${hours.end}（电脑本地时间）`
}

export class FollowWorkHoursClosedError extends Error {
  constructor(nextStart, message = '已到非工作时间，本次待发内容已放弃，工作时间内重新检查会话。') {
    super(message)
    this.name = 'FollowWorkHoursClosedError'
    this.nextStart = nextStart
  }
}

export function createFollowWorkHoursGate({ readHours, now, sleep, onWaiting, onReady, yieldWhileWaiting }) {
  let activeWindowEnd = null
  const status = () => followWorkHoursStatus(readHours(), now())
  function assertCanProcess() {
    const current = status()
    if (!current.allowed) throw new FollowWorkHoursClosedError(current.nextStart)
    if (current.windowEnd && activeWindowEnd !== null && now().getTime() >= activeWindowEnd)
      throw new FollowWorkHoursClosedError(now(), '当前会话已跨过工作时段，待发内容已放弃，将重新检查会话。')
    activeWindowEnd = current.windowEnd?.getTime() ?? null
  }
  async function waitUntilOpen() {
    let current = status(), waited = false, previousStart = null
    while (!current.allowed) {
      const nextStart = current.nextStart.getTime()
      if (nextStart !== previousStart) onWaiting(current.nextStart)
      previousStart = nextStart
      waited = true
      await yieldWhileWaiting()
      await sleep(Math.min(WORK_HOURS_CHECK_INTERVAL_MS, Math.max(0, nextStart - now().getTime())))
      current = status()
    }
    activeWindowEnd = current.windowEnd?.getTime() ?? null
    if (waited) onReady()
  }
  return { assertCanProcess, waitUntilOpen }
}
