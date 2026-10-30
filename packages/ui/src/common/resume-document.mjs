export const RESUME_FORMATS = Object.freeze(['pdf', 'markdown'])
export const RESUME_CONTENT_WARNING_LENGTH = 800

export function validateResumeDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    !RESUME_FORMATS.includes(value.format) || typeof value.text !== 'string' || !value.text.trim() ||
    value.text.includes('\0') || typeof value.name !== 'string' || !value.name.trim() ||
    typeof value.sourceName !== 'string')
    throw new TypeError('导入简历无效：请检查格式、名称及提取后的正文')
  return { name: value.name.trim(), format: value.format, text: value.text.trim(), sourceName: value.sourceName }
}

export function decodeMarkdownResume(bytes) {
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new Error('Markdown 简历须使用 UTF-8 编码，请转换编码后重新导入') }
  if (!text.trim() || text.includes('\0')) throw new Error('Markdown 简历没有有效文本')
  return text.trim()
}

export function validateResumeList(value) {
  if (!Array.isArray(value)) throw new TypeError('简历配置须为数组')
  for (const item of value) {
    if (item?.format !== undefined || item?.text !== undefined) {
      validateResumeDocument(item)
      continue
    }
    const content = item?.content
    if (!content || typeof content !== 'object' || Array.isArray(content) ||
      !Array.isArray(content.geekWorkExpList) || !Array.isArray(content.geekProjExpList))
      throw new TypeError('结构化简历格式无效')
    for (const key of ['name', 'workYearDesc', 'expectJob', 'userDescription'])
      if (content[key] != null && typeof content[key] !== 'string') throw new TypeError('简历字段须为文本')
    for (const entry of [...content.geekWorkExpList, ...content.geekProjExpList])
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Object.values(entry).some(field => field != null && typeof field !== 'string'))
        throw new TypeError('简历经历字段格式无效')
  }
  return value
}
