<template>
  <section class="job-match-review" aria-labelledby="job-match-title">
    <h3 id="job-match-title">AI 简历匹配</h3>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" role="alert" />
    <p v-if="loading" role="status">正在读取匹配记录…</p>
    <template v-else-if="result">
      <div class="match-score">
        <strong>{{ result.score }}<small> / 100</small></strong>
        <ElTag :type="result.accepted ? 'success' : 'warning'">{{ result.accepted ? '匹配达标' : '未通过匹配' }}</ElTag>
      </div>
      <p>{{ result.reason }}</p>
      <p class="match-meta">阈值 {{ result.minScore }} 分 · {{ result.model }} · {{ new Date(result.evaluatedAt).toLocaleString() }}</p>
      <ElAlert v-if="result.configurationChanged" type="warning" :closable="false" title="简历或匹配设置已变化；此处展示上次分析结果，请重新分析。" />
      <template v-for="section in sections" :key="section.key">
        <h4>{{ section.title }}</h4>
        <ul v-if="result[section.key].length"><li v-for="(item, index) in result[section.key]" :key="index">{{ item }}</li></ul>
        <p v-else class="match-meta">无</p>
      </template>
    </template>
    <p v-else class="match-meta">此岗位尚无 AI 匹配记录。</p>
    <p class="match-meta">分析会把已保存的岗位描述和简历发送给当前 AI 服务商，仅判断匹配度。</p>
    <ElButton type="primary" plain :loading="analyzing" :disabled="loading || !job.description" @click="analyze">
      {{ result ? '重新分析匹配度' : '分析此岗位匹配度' }}
    </ElButton>
    <p v-if="!job.description" class="match-meta">此岗位缺少已保存的职责描述，无法分析。</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElAlert, ElButton, ElTag } from 'element-plus'

const props = defineProps<{ job: { encryptJobId: string | number; description?: string | null } }>()
interface MatchResult {
  score: number; suitable: boolean; accepted: boolean; reason: string; minScore: number
  strengths: string[]; gaps: string[]; model: string; evaluatedAt: number; configurationChanged?: boolean
}
const sections = [{ key: 'strengths' as const, title: '匹配优势' }, { key: 'gaps' as const, title: '差距与待确认项' }]
const result = ref<MatchResult | null>(null), error = ref('')
const loading = ref(false), analyzing = ref(false)
let requestId = 0
watch(() => props.job.encryptJobId, async jobId => {
  const request = ++requestId
  loading.value = true
  result.value = null
  error.value = ''
  try {
    const saved = await electron.ipcRenderer.invoke('ux-job-match-result', String(jobId))
    if (request === requestId) result.value = saved
  } catch (err) { if (request === requestId) error.value = (err as Error).message }
  finally { if (request === requestId) loading.value = false }
}, { immediate: true })
async function analyze() {
  if (analyzing.value) return
  const request = requestId
  analyzing.value = true
  error.value = ''
  try {
    const analysis = await electron.ipcRenderer.invoke('ux-job-match-evaluate',
      JSON.parse(JSON.stringify({ ...props.job, encryptJobId: String(props.job.encryptJobId) })))
    if (request === requestId) result.value = analysis
  } catch (err) { if (request === requestId) error.value = (err as Error).message }
  finally { analyzing.value = false }
}
</script>

<style scoped>
.job-match-review { border-bottom: 1px solid var(--el-border-color-light); padding-bottom: 20px; margin-bottom: 20px; overflow-wrap: anywhere; }
.job-match-review h3 { margin: 0 0 14px; font-size: 15px; }
.job-match-review h4 { margin-bottom: 6px; font-size: 13px; }
.job-match-review p, .job-match-review li { line-height: 1.7; }
.job-match-review ul { padding-left: 20px; }
.match-score { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.match-score strong { font-size: 30px; font-variant-numeric: tabular-nums; }
.match-score small { font-size: 13px; font-weight: normal; color: var(--el-text-color-secondary); }
.match-meta { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
