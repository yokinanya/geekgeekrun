<template>
  <section class="ux-card ux-resume-settings" aria-labelledby="resume-settings-title">
    <div class="ux-section-head">
      <h2 id="resume-settings-title">简历与岗位匹配</h2>
      <ElTag :type="settings.enabled ? 'success' : 'info'">{{ settings.enabled ? 'AI 匹配已启用' : 'AI 匹配未启用' }}</ElTag>
    </div>
    <p class="ux-hint">先导入并核对简历，再让 AI 对比岗位职责、技能与经历。简历和岗位信息将在匹配时发送给你配置的 AI 服务商。</p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" role="alert" />
    <div v-if="loading" role="status">正在读取简历与匹配设置…</div>
    <template v-else>
      <div class="ux-inline">
        <ElButton :loading="importing" :disabled="saving" @click="fileInput?.click()">导入 PDF / Markdown</ElButton>
        <ElButton :disabled="saving || importing" @click="emit('edit-structured')">手动填写结构化简历</ElButton>
        <input ref="fileInput" class="resume-file-input" type="file" accept=".pdf,.md,.markdown"
          aria-label="选择 PDF 或 Markdown 简历" @change="chooseFile" />
        <span class="ux-hint" role="status">{{ sourceLabel }}</span>
      </div>
      <ElForm label-position="top" @submit.prevent="save">
        <ElFormItem label="简历名称" label-for="resume-document-name">
          <ElInput id="resume-document-name" v-model="name" autocomplete="off" :disabled="locked" />
        </ElFormItem>
        <ElFormItem label="简历正文（可直接核对和修改）" label-for="resume-document-text">
          <ElInput id="resume-document-text" v-model="text" type="textarea" :rows="10" :disabled="locked"
            autocomplete="off" placeholder="导入简历或粘贴 Markdown 正文…" />
        </ElFormItem>
        <p class="ux-hint">{{ text.trim().length }} 字。PDF 仅在本机提取文字；扫描件需先完成 OCR。保存后也可供消息跟进使用。</p>
        <ElFormItem label="启用 AI 匹配">
          <ElSwitch v-model="settings.enabled" :disabled="locked" aria-label="启用 AI 简历岗位匹配" />
        </ElFormItem>
        <ElAlert type="info" :closable="false"
          title="启用后，以 AI 判断替代岗位名称、分类和描述的关键词匹配；城市、薪资、工作经验、公司排除及必需条件仍生效。只收集全部岗位时不调用 AI。" />
        <div class="resume-match-fields">
          <ElFormItem label="最低匹配分数" label-for="resume-min-score">
            <ElInputNumber id="resume-min-score" v-model="settings.minScore" :min="0" :max="MATCH_SCORE_MAX"
              :precision="0" :disabled="locked" />
            <p class="ux-hint">0–100 分；须同时满足“AI 判断适合”且分数达标，才会开聊或按条件收集。</p>
          </ElFormItem>
          <ElFormItem label="求职方向与偏好" label-for="resume-match-instructions">
            <ElInput id="resume-match-instructions" v-model="settings.instructions" type="textarea" :rows="4"
              :disabled="locked" placeholder="例如：偏向 AI 应用开发，重视 Python / RAG 项目经验，排除销售和驻场外包…" />
          </ElFormItem>
        </div>
        <p class="ux-hint">AI 请求失败或结果无效时，任务会暂停并显示原因；低分岗位只略过，不会因此在 BOSS 标记“不合适”。修改对新建或确认恢复的任务生效。</p>
        <div class="ux-settings-actions">
          <ElButton type="primary" native-type="submit" :loading="saving" :disabled="importing">保存简历与匹配设置</ElButton>
          <ElButton :disabled="locked" @click="load">重新读取</ElButton>
          <span class="ux-hint" role="status">{{ dirty ? '有未保存的修改' : '已保存' }}</span>
        </div>
      </ElForm>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElForm, ElFormItem, ElInput, ElInputNumber, ElMessageBox, ElSwitch, ElTag } from 'element-plus'
import { toast } from '../../features/Toast'
import { DEFAULT_AI_JOB_MATCH, MATCH_SCORE_MAX } from '@geekgeekrun/geek-auto-start-chat-with-boss/ai-job-match.mjs'
import { importResumeFile } from './resume-import'

const emit = defineEmits<{
  saved: [settings: typeof DEFAULT_AI_JOB_MATCH]
  'edit-structured': []
}>()
const fileInput = ref<HTMLInputElement>()
const settings = ref({ ...DEFAULT_AI_JOB_MATCH })
const text = ref(''), name = ref('默认简历'), error = ref(''), baseline = ref('')
const source = ref<{ format?: string; sourceName?: string } | null>(null)
const loading = ref(true), importing = ref(false), saving = ref(false)
const locked = computed(() => loading.value || importing.value || saving.value)
const snapshot = () => JSON.stringify({ text: text.value, name: name.value, settings: settings.value, source: source.value })
const dirty = computed(() => Boolean(baseline.value) && snapshot() !== baseline.value)
const sourceLabel = computed(() => source.value?.sourceName ? `来源：${source.value.sourceName}` : text.value ? '本地已保存的简历' : '尚未保存简历')
let savedText = '', savedName = ''

function apply(data) {
  settings.value = data.settings
  text.value = data.text
  name.value = data.document?.name || '默认简历'
  source.value = data.document
  savedText = text.value
  savedName = name.value
  baseline.value = snapshot()
}
async function canDiscard() {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('简历或匹配设置尚未保存。确认放弃这些修改？', '未保存的修改',
      { confirmButtonText: '放弃修改', cancelButtonText: '返回编辑', type: 'warning' })
    return true
  } catch { return false }
}
async function load() {
  if (!(await canDiscard())) return
  await reload()
}
async function reload() {
  loading.value = true
  error.value = ''
  try { apply(await electron.ipcRenderer.invoke('ux-resume-load')) }
  catch (err) { error.value = (err as Error).message }
  finally { loading.value = false }
}
async function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  error.value = ''
  try {
    const document = await importResumeFile(file)
    text.value = document.text
    name.value = document.name
    source.value = document
  } catch (err) { error.value = (err as Error).message }
  finally { importing.value = false; input.value = '' }
}
async function save() {
  if (locked.value) return
  saving.value = true
  error.value = ''
  try {
    const changed = text.value !== savedText || name.value !== savedName || source.value?.sourceName !== JSON.parse(baseline.value).source?.sourceName
    const document = changed ? { format: source.value?.format || 'markdown', sourceName: source.value?.sourceName || '',
      name: name.value, text: text.value } : undefined
    apply(await electron.ipcRenderer.invoke('ux-resume-save', { settings: { ...settings.value }, document }))
    emit('saved', { ...settings.value })
    toast.success('简历与匹配设置已保存')
  } catch (err) { error.value = (err as Error).message }
  finally { saving.value = false }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => { void load(); window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
defineExpose({ canDiscard, dirty, reload })
</script>

<style scoped>
.ux-resume-settings { min-width: 0; }
.ux-resume-settings .el-form { margin-top: 18px; }
.ux-resume-settings .el-alert { margin: 14px 0; }
.resume-file-input { display: none; }
.resume-match-fields { display: grid; grid-template-columns: minmax(190px, 1fr) minmax(0, 2fr); gap: 24px; margin-top: 20px; }
.resume-match-fields .ux-hint { width: 100%; }
@media (max-width: 1000px) { .resume-match-fields { grid-template-columns: minmax(0, 1fr); gap: 0; } }
</style>
