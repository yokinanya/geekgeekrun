<template>
  <section
    v-if="compact || state.status !== 'valid'"
    class="ux-login-status"
    :class="[{ 'is-compact': compact }, `is-${state.status}`]"
    role="status"
    aria-label="BOSS直聘登录状态"
  >
    <div class="ux-login-status__content">
      <div class="ux-login-status__heading">
        <span>BOSS账号</span>
        <strong>{{ statusText }}</strong>
      </div>
      <p v-if="state.status !== 'valid'">
        <span v-if="state.detail && state.status !== 'checking'">{{ state.detail }}；</span>
        {{ guidance[state.status] }}
      </p>
    </div>
    <div class="ux-login-status__actions">
      <ElButton
        v-if="state.status === 'missing' || state.status === 'invalid'"
        type="primary"
        size="small"
        :plain="compact"
        @click="emit('login')"
        >{{ state.status === 'missing' ? '去登录' : '重新登录' }}</ElButton
      >
      <ElButton
        v-if="state.status === 'restricted' || state.status === 'unknown'"
        type="primary"
        size="small"
        plain
        @click="emit('settings')"
        >账号设置</ElButton
      >
      <ElButton
        v-if="state.status !== 'valid'"
        size="small"
        :loading="state.status === 'checking'"
        @click="emit('refresh')"
        >{{ state.status === 'checking' ? '检测中' : '重新检测' }}</ElButton
      >
      <ElButton v-else size="small" link @click="emit('refresh')">重新检测</ElButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElButton } from 'element-plus'

defineProps<{
  state: { status: string; detail: string }
  statusText: string
  compact?: boolean
}>()

const emit = defineEmits<{
  (event: 'login'): void
  (event: 'settings'): void
  (event: 'refresh'): void
}>()

const guidance: Readonly<Record<string, string>> = {
  checking: '正在确认账号状态，开始任务前也会再次检测。',
  missing: '完成登录后即可开始任务。',
  invalid: '请重新登录后再开始任务。',
  restricted: '请在BOSS网站完成验证或稍后重试，再重新检测；原有登录凭证保留。',
  unknown: '可以重新检测，或在账号设置中检查登录凭证。'
}
</script>

<style scoped>
.ux-login-status {
  --status-color: var(--el-color-warning);
  --status-background: var(--el-color-warning-light-9);
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid var(--el-color-warning-light-5);
  border-left: 3px solid var(--status-color);
  border-radius: 4px;
  background: var(--status-background);
}

.ux-login-status.is-invalid {
  --status-color: var(--el-color-danger);
  --status-background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-5);
}

.ux-login-status.is-checking {
  --status-color: var(--el-color-info);
  --status-background: var(--el-fill-color-light);
  border-color: var(--el-border-color);
}

.ux-login-status.is-valid {
  --status-color: var(--el-color-success);
  --status-background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-5);
}

.ux-login-status__content {
  flex: 1;
  min-width: 0;
}

.ux-login-status__heading {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 13px;
}

.ux-login-status strong {
  color: var(--status-color);
}

.ux-login-status p {
  margin: 4px 0 0;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.ux-login-status__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ux-login-status__actions .el-button {
  margin-left: 0;
}

.ux-login-status.is-compact {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 0;
  padding: 10px;
}

@media (max-width: 960px) {
  .ux-login-status {
    flex-wrap: wrap;
    gap: 8px;
  }

  .ux-login-status__content {
    flex-basis: 100%;
  }
}
</style>
