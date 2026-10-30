import { RESUME_CONTENT_WARNING_LENGTH, validateResumeDocument } from '../resume-document.mjs'

export interface ResumeContent {
  name: string
  workYearDesc: string
  expectJob: string
  userDescription: string
  geekWorkExpList: Array<{
    company: string
    positionName: string
    startYearMon: string | null
    endYearMon: string | null
    performance: string
    workDescription: string
  }>
  geekProjExpList: Array<{
    name: string
    startYearMon: string
    endYearMon: string
    roleName: string
    projectDescription: string
    performance: string
  }>
  expectSalary: [string, string]
}

export function formatResumeJsonToMarkdown(resume) {
  if (resume?.format !== undefined || resume?.text !== undefined) return validateResumeDocument(resume).text
  if (!resume?.content) return ''
  const content = resume.content as ResumeContent
  return [
    formatFields([['# 姓名', content.name], ['# 工作年限', content.workYearDesc],
      ['# 期望职位', content.expectJob], ['# 个人优势', content.userDescription]]),
    formatWorkExperiences(content.geekWorkExpList),
    formatProjectExperiences(content.geekProjExpList)
  ].filter(Boolean).join('\n\n')
}

function formatFields(fields: Array<[string, string | undefined]>) {
  return fields.filter(([, value]) => value?.trim()).map(pair => pair.join('\n')).join('\n\n')
}

function formatWorkExperiences(entries: ResumeContent['geekWorkExpList']) {
  const text = entries.filter(item => item.company?.trim()).map(item =>
    `## ${item.company}\n\n` + formatFields([['职务', item.positionName],
      ['工作描述', item.workDescription], ['工作业绩', item.performance]])
  ).join('\n\n')
  return text ? '# 工作经历\n' + text : ''
}

function formatProjectExperiences(entries: ResumeContent['geekProjExpList']) {
  const text = entries.filter(item => item.name?.trim()).map(item =>
    `## ${item.name}\n\n` + formatFields([['项目角色', item.roleName],
      ['工作描述', item.projectDescription], ['工作业绩', item.performance]])
  ).join('\n\n')
  return text ? '# 项目经历\n' + text : ''
}

export function checkIsResumeContentValid(resumeItem: { content?: ResumeContent; text?: string; format?: string }) {
  if (resumeItem?.format !== undefined || resumeItem?.text !== undefined) {
    try { return Boolean(validateResumeDocument(resumeItem).text) }
    catch { return false }
  }
  return Boolean(
    !!resumeItem?.content &&
    resumeItem.content.geekProjExpList?.[0]?.name?.trim() &&
    resumeItem.content.geekWorkExpList?.[0]?.company?.trim()
  )
}

export function resumeContentEnoughDetect(resumeItem: { content?: ResumeContent; text?: string }) {
  return formatResumeJsonToMarkdown(resumeItem).length >= RESUME_CONTENT_WARNING_LENGTH
}
