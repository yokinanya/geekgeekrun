<template>
  <div id="field-follow-work-hours" class="ux-work-hours">
    <ElSwitch
      id="follow-work-hours"
      :model-value="modelValue.enabled"
      active-text="仅在工作时间处理消息"
      aria-label="仅在工作时间处理消息"
      @update:model-value="setValue('enabled', $event)"
    />
    <template v-if="modelValue.enabled">
      <fieldset id="field-follow-work-days" data-validation-field="follow-work-days" :aria-describedby="daysError ? 'error-follow-work-days' : undefined">
        <legend>工作日</legend>
        <ElCheckboxGroup
          :model-value="modelValue.weekdays"
          aria-label="消息跟进工作日"
          :aria-invalid="Boolean(daysError)"
          @update:model-value="setValue('weekdays', $event)"
        >
          <ElCheckbox v-for="day in WORK_WEEKDAYS" :key="day.value" :value="day.value">
            {{ day.label }}
          </ElCheckbox>
        </ElCheckboxGroup>
        <p v-if="daysError" id="error-follow-work-days" class="ux-field-error" role="alert">{{ daysError }}</p>
      </fieldset>
      <fieldset id="field-follow-work-time" data-validation-field="follow-work-time" :aria-describedby="timeError ? 'error-follow-work-time' : 'follow-work-time-help'">
        <legend>每天的处理时段</legend>
        <div class="ux-work-hours__times">
          <label for="follow-work-start">开始时间
            <ElTimeSelect
              id="follow-work-start"
              name="follow-work-start"
              autocomplete="off"
              :model-value="modelValue.start"
              aria-label="消息处理开始时间"
              :aria-invalid="Boolean(timeError)"
              :clearable="false"
              start="00:00"
              end="23:59"
              step="00:15"
              @update:model-value="setValue('start', $event)"
            />
          </label>
          <label for="follow-work-end">结束时间
            <ElTimeSelect
              id="follow-work-end"
              name="follow-work-end"
              autocomplete="off"
              :model-value="modelValue.end"
              aria-label="消息处理结束时间"
              :aria-invalid="Boolean(timeError)"
              :clearable="false"
              start="00:00"
              end="23:59"
              step="00:15"
              @update:model-value="setValue('end', $event)"
            />
          </label>
        </div>
        <p v-if="timeError" id="error-follow-work-time" class="ux-field-error" role="alert">{{ timeError }}</p>
        <p id="follow-work-time-help" class="ux-hint">按电脑本地时间执行；结束时间早于开始时间时，表示次日结束，工作日按开始当天计算。</p>
      </fieldset>
      <p class="ux-hint">工作时间外暂停检查和发送，进入下一个工作时段后自动重新检查会话。保持应用运行才能自动继续。</p>
    </template>
    <p v-else class="ux-hint">已关闭时间限制，消息跟进可在任意时间检查和发送。</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElSwitch, ElCheckbox, ElCheckboxGroup, ElTimeSelect } from 'element-plus'
import { WORK_WEEKDAYS } from '../../../../common/follow-work-hours.mjs'

interface WorkHours {
  readonly enabled: boolean
  readonly weekdays: number[]
  readonly start: string
  readonly end: string
}
const props = defineProps<{
  modelValue: WorkHours
  issues: ReadonlyArray<{ field: string; text: string }>
}>()
const emit = defineEmits<{ (event: 'update:modelValue', value: WorkHours): void }>()
const daysError = computed(() => props.issues.find(issue => issue.field === 'follow-work-days')?.text)
const timeError = computed(() => props.issues.find(issue => issue.field === 'follow-work-time')?.text)

function setValue(key: keyof WorkHours, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<style scoped>
.ux-work-hours {
  display: grid;
  gap: 16px;
}

fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

legend {
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
  font-size: var(--ggr-font-size-body);
  font-weight: 600;
}

.ux-work-hours__times {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}

.ux-work-hours__times label {
  display: grid;
  gap: 6px;
  min-width: 0;
  font-size: var(--ggr-font-size-body);
}

.ux-work-hours__times :deep(.el-select) {
  width: 160px;
}

.ux-work-hours :deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
}

.ux-work-hours :deep(.el-checkbox) {
  margin-right: 0;
}

.ux-work-hours p {
  margin: 0;
}
</style>
