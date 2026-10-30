<template>
  <div class="run-data-table__empty" role="status" aria-live="polite">
    <p v-if="loading">正在加载记录…</p>
    <template v-else-if="error">
      <p class="run-data-table__empty-error">记录加载失败</p>
      <p class="run-data-table__empty-detail">{{ error }}</p>
      <ElButton size="small" type="primary" plain @click="emit('retry')">重新加载</ElButton>
    </template>
    <template v-else-if="filtered">
      <p>没有符合当前筛选条件的记录</p>
      <p class="run-data-table__empty-detail">可调整搜索词或筛选条件，也可以清除筛选后重新查看。</p>
      <ElButton size="small" type="primary" plain @click="emit('clear')">清除筛选</ElButton>
    </template>
    <template v-else>
      <p>{{ message || '暂无数据' }}</p>
      <ElButton v-if="action" size="small" type="primary" plain @click="emit('navigate')">
        {{ action.label }}
      </ElButton>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ElButton } from 'element-plus'

defineProps<{
  loading: boolean
  error: string
  filtered: boolean
  message?: string
  action?: { label: string; page: string }
}>()

const emit = defineEmits<{
  (event: 'clear'): void
  (event: 'retry'): void
  (event: 'navigate'): void
}>()
</script>

<style scoped>
.run-data-table__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  padding: 16px;
  line-height: 1.6;
  white-space: normal;
  overflow-wrap: anywhere;
}

.run-data-table__empty p {
  margin: 0;
}

.run-data-table__empty-error {
  color: var(--el-color-danger);
}

.run-data-table__empty-detail {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
