import { decodeMarkdownResume, validateResumeDocument } from '../../../../common/resume-document.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

async function pdfResumeText(bytes: ArrayBuffer) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/build/pdf.mjs')
  GlobalWorkerOptions.workerSrc = workerUrl
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, stopAtErrors: true })
  try {
    const pdf = await task.promise
    const pages: string[] = []
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const content = await page.getTextContent()
      pages.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim())
      page.cleanup()
    }
    const text = pages.filter(Boolean).join('\n\n')
    if (!text.trim()) throw new Error('此 PDF 没有可提取的文字，可能是扫描件。请先 OCR 识别或导入 Markdown 简历')
    return text
  } catch (error) {
    if ((error as Error).name === 'PasswordException') throw new Error('PDF 已加密，请移除密码后重新导入')
    throw new Error('PDF 简历解析失败：' + (error as Error).message)
  } finally {
    await task.destroy()
  }
}

export async function importResumeFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['pdf', 'md', 'markdown'].includes(extension || '')) throw new Error('请选择 PDF 或 Markdown（.md / .markdown）简历')
  const bytes = await file.arrayBuffer()
  const text = extension === 'pdf' ? await pdfResumeText(bytes) : decodeMarkdownResume(bytes)
  return validateResumeDocument({ name: file.name.replace(/\.(pdf|md|markdown)$/i, ''),
    sourceName: file.name, format: extension === 'pdf' ? 'pdf' : 'markdown', text })
}
