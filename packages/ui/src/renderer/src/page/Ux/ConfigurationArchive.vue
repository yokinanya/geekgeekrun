<template>
  <section class="ux-card" aria-labelledby="config-archive-title">
    <h2 id="config-archive-title">全量配置导入与导出</h2>
    <p class="ux-hint">备份任务条件、工作时间、AI 模型、简历、运行偏好、通知、提示词、模板和表格偏好。导出内容以已经保存的配置为准。</p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" role="alert" />
    <div class="archive-options">
      <ElCheckbox v-model="includeSecrets" :disabled="busy">包含 AI / 通知密钥</ElCheckbox>
      <ElCheckbox v-model="includeLogin" :disabled="busy">包含 BOSS 登录凭证</ElCheckbox>
    </div>
    <ElAlert v-if="includeSecrets || includeLogin" type="warning" :closable="false"
      title="导出文件会以明文保存选中的凭证，请存放在可信的位置。" />
    <p class="ux-hint">未包含密钥时，导入会保留本机同一服务的已有密钥；更换服务需重新填写。未包含登录凭证时，保留本机登录。数据库、运行进度及数据目录不随配置迁移。</p>
    <div class="ux-settings-actions">
      <ElButton :loading="action === 'export'" :disabled="busy" @click="exportConfig">导出全量配置</ElButton>
      <ElButton type="primary" plain :loading="action === 'preview'" :disabled="busy" @click="previewImport">导入全量配置</ElButton>
    </div>
    <ElDialog :model-value="Boolean(preview)" title="确认覆盖本机配置" width="min(560px, 90vw)"
      append-to-body :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @close="cancel">
      <template v-if="preview">
        <p class="archive-file">{{ preview.fileName }}</p>
        <dl class="archive-summary">
          <dt>导出时间</dt><dd>{{ new Date(preview.exportedAt).toLocaleString() }}</dd>
          <dt>配置内容</dt><dd>{{ preview.configCount }} 项设置 · {{ preview.resumeCount }} 份简历 · {{ preview.templateCount }} 个模板</dd>
          <dt>服务密钥</dt><dd>{{ preview.containsSecrets ? '用文件中的密钥覆盖' : '保留本机同一服务的已有密钥' }}</dd>
          <dt>BOSS 登录</dt><dd>{{ preview.containsLogin ? '用文件中的登录凭证覆盖' : '保留本机登录凭证' }}</dd>
        </dl>
        <ElAlert type="warning" :closable="false" title="确认后覆盖已保存的配置和界面草稿，并重新载入主界面。当前数据库和任务进度保留。" />
        <ElAlert v-if="error" :title="error" type="error" :closable="false" role="alert" />
      </template>
      <template #footer>
        <ElButton :disabled="busy" @click="cancel">取消导入</ElButton>
        <ElButton type="danger" :loading="action === 'apply'" :disabled="busy" @click="applyImport">覆盖配置并重新载入</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElAlert, ElButton, ElCheckbox, ElDialog } from 'element-plus'
import { toast } from '../../features/Toast'
import { isPreferenceKey } from '../../../../common/config-archive.mjs'

const emit = defineEmits<{ imported: [] }>()
const includeSecrets = ref(false), includeLogin = ref(false)
const action = ref(''), error = ref('')
const preview = ref<{ token: string; fileName: string; exportedAt: string; containsSecrets: boolean;
  containsLogin: boolean; configCount: number; resumeCount: number; templateCount: number } | null>(null)
const busy = computed(() => Boolean(action.value))
function preferences() {
  return Object.fromEntries(Object.keys(localStorage).filter(isPreferenceKey).map(key => [key, localStorage.getItem(key)]))
}
async function exportConfig() {
  action.value = 'export'
  error.value = ''
  try {
    const result = await electron.ipcRenderer.invoke('ux-config-export', {
      includeSecrets: includeSecrets.value, includeLogin: includeLogin.value, preferences: preferences() })
    if (result) toast.success('配置已导出：' + result.fileName)
  } catch (err) { error.value = (err as Error).message }
  finally { action.value = '' }
}
async function previewImport() {
  action.value = 'preview'
  error.value = ''
  try { preview.value = await electron.ipcRenderer.invoke('ux-config-import-preview') }
  catch (err) { error.value = (err as Error).message }
  finally { action.value = '' }
}
async function cancel() {
  if (busy.value) return
  try {
    await electron.ipcRenderer.invoke('ux-config-import-cancel')
    preview.value = null
  } catch (err) { error.value = (err as Error).message }
}
async function applyImport() {
  if (!preview.value || busy.value) return
  action.value = 'apply'
  error.value = ''
  try {
    const result = await electron.ipcRenderer.invoke('ux-config-import-apply', preview.value.token)
    try {
      for (const key of Object.keys(localStorage).filter(isPreferenceKey)) localStorage.removeItem(key)
      for (const [key, value] of Object.entries(result.preferences)) localStorage.setItem(key, value as string)
    } catch (err) {
      throw new Error('配置文件已导入，但界面偏好写入失败：' + (err as Error).message)
    }
    emit('imported')
  } catch (err) { error.value = (err as Error).message }
  finally { action.value = '' }
}
</script>

<style scoped>
.archive-options { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 12px 0; }
.el-alert { margin: 12px 0; }
.archive-file { overflow-wrap: anywhere; font-weight: 600; }
.archive-summary { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px 20px; line-height: 1.6; }
.archive-summary dt { color: var(--el-text-color-secondary); }
.archive-summary dd { margin: 0; overflow-wrap: anywhere; }
</style>
