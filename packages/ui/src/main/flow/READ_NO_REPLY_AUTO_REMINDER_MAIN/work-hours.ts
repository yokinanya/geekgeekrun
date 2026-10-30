import { readConfigFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import {
  createFollowWorkHoursGate,
  WORK_HOURS_WAITING_STATE
} from '../../../common/follow-work-hours.mjs'
import type { createTaskProgress } from '../../features/task-progress'
import { yieldIfRequested } from '../../features/task-queue'

export function followWorkHoursGate(progress: ReturnType<typeof createTaskProgress>) {
  return createFollowWorkHoursGate({
    readHours: () => readConfigFile('boss.json').autoReminder?.workHours,
    now: () => new Date(),
    sleep,
    onWaiting: (nextStart: Date) => {
      progress.setExtras({ restUntil: nextStart.getTime() })
      progress.update(
        undefined,
        `当前不在工作时间，预计 ${nextStart.toLocaleString('zh-CN', { hour12: false })}（电脑本地时间）重新检查会话；保持应用运行可自动继续。`,
        WORK_HOURS_WAITING_STATE
      )
    },
    onReady: () => {
      progress.setExtras({ restUntil: 0 })
      progress.update(undefined, '已进入工作时间，正在重新检查会话')
    },
    yieldWhileWaiting: () => yieldIfRequested(() => undefined)
  })
}
