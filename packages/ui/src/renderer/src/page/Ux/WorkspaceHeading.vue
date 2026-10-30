<template>
  <header class="ux-workspace-heading">
    <div class="ux-page-title">
      <h1>{{ title }}</h1>
      <slot />
    </div>
    <p class="ux-workspace-description">{{ descriptions[page] }}</p>
  </header>
</template>

<script setup lang="ts">
const descriptions = {
  auto: '按步骤设置条件，收集岗位或向符合条件的招聘者打招呼。',
  follow: '跟进对方已读未回复的会话，开始前确认联系范围和消息内容。',
  records: '查看已开聊、已跳过和已标记的岗位，使用搜索与筛选查找记录。',
  library: '查找本机保存的职位、收藏、招聘者和公司资料。',
  tasks: '查看运行进度、处理待办任务，或查阅历史记录。',
  settings: '按需配置账号、浏览器、任务和AI，修改后留意各组的保存提示。'
} as const

defineProps<{
  title: string
  page: keyof typeof descriptions
}>()
</script>
