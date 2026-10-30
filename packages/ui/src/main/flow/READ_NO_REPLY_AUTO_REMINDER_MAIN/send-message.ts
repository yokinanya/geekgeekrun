import type { Page } from 'puppeteer'
import { sleepWithRandomDelay, sleep } from '@geekgeekrun/utils/sleep.mjs'

interface FollowSendPermission {
  assertCanProcess: () => void
}

const EMOTION_MENU_DELAY_MS = 1000
const EMOTION_TAB_DELAY_MS = 1500
export async function sendLookForwardReplyEmotion(page: Page, permission: FollowSendPermission) {
  permission.assertCanProcess()
  const previous = await lastSentMessageKey(page)
  const emotionEntry = await page.$('.chat-conversation .message-controls .btn-emotion')
  await emotionEntry!.click()
  await sleepWithRandomDelay(EMOTION_MENU_DELAY_MS)
  const duckEmotionTab = await page.$(
    '.chat-conversation .message-controls .emotion .emotion-tab .emotion-sort:nth-child(3)'
  )
  await duckEmotionTab!.click()
  await sleepWithRandomDelay(EMOTION_TAB_DELAY_MS)
  const emoji = await page.$(
    '.chat-conversation .message-controls .emotion .emotion-box img[title=盼回复]'
  )
  permission.assertCanProcess()
  await emoji!.click()
  await waitForSentMessage(page, previous)
}

async function lastSentMessageKey(page: Page) {
  return page.evaluate(() => {
    const list =
      (document.querySelector('.message-content .chat-record') as any)?.__vue__?.list$ || []
    const last = list.filter((item) => item.isSelf).at(-1)
    return last ? String(last.mid ?? last.id ?? last.messageId ?? '') + ':' + String(last.time ?? '') : ''
  })
}

const SEND_CONFIRMATION_TIMEOUT_MS = 15000
async function waitForSentMessage(page: Page, previous: string) {
  await page.waitForFunction(
    (key) => {
      const list =
        (document.querySelector('.message-content .chat-record') as any)?.__vue__?.list$ || []
      const last = list.filter((item) => item.isSelf).at(-1)
      if (!last) return false
      const current = String(last.mid ?? last.id ?? last.messageId ?? '') + ':' + String(last.time ?? '')
      return current !== key && [1, 2].includes(last.status)
    },
    { timeout: SEND_CONFIRMATION_TIMEOUT_MS },
    previous
  ).catch(() => {
    throw new Error('SEND_CONFIRMATION_UNCERTAIN：无法确认消息是否发送，请在BOSS中核对后重新开始')
  })
}

const INPUT_FOCUS_DELAY_MS = 500
const TYPING_DELAY_MS = 50
const BEFORE_SEND_DELAY_MS = 1000
export async function sendMessage(page: Page, textToSend: string, permission: FollowSendPermission) {
  permission.assertCanProcess()
  const previous = await lastSentMessageKey(page)
  const input = (await page.$('.chat-conversation .message-controls .chat-input'))!
  await input.click()
  await sleep(INPUT_FOCUS_DELAY_MS)
  await input.click()
  await input.type(textToSend, { delay: TYPING_DELAY_MS })
  await sleep(BEFORE_SEND_DELAY_MS)
  permission.assertCanProcess()
  await page.click('.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)')
  await waitForSentMessage(page, previous)
}
