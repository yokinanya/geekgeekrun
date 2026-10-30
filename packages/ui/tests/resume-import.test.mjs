import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { decodeMarkdownResume, validateResumeDocument, validateResumeList } from '../src/common/resume-document.mjs'

const source = buildSync({ entryPoints: [new URL('../src/common/utils/resume.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false }).outputFiles[0].text
const { formatResumeJsonToMarkdown, checkIsResumeContentValid, resumeContentEnoughDetect } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const document = { name: '求职简历', format: 'markdown', sourceName: 'resume.md', text: '# 经历\nPython / RAG 项目开发' }

test('UTF-8 Markdown supports BOM and Chinese and rejects empty, binary and invalid UTF-8 files', () => {
  assert.equal(decodeMarkdownResume(Buffer.from('\uFEFF' + document.text)), document.text)
  for (const bytes of [Buffer.from(' \n'), Buffer.from('a\0b'), Buffer.from([0xff, 0xfe, 0x80])])
    assert.throws(() => decodeMarkdownResume(bytes))
})
test('imported PDF text and Markdown work in the shared AI message resume path', () => {
  for (const format of ['pdf', 'markdown']) {
    const resume = { ...document, format }
    assert.equal(formatResumeJsonToMarkdown(resume), document.text)
    assert.equal(checkIsResumeContentValid(resume), true)
    assert.equal(resumeContentEnoughDetect(resume), false)
    assert.equal(resumeContentEnoughDetect({ ...resume, text: 'a'.repeat(800) }), true)
  }
})
test('invalid saved documents fail clearly; importing does not require artificial work or project fields', () => {
  for (const change of [{ format: 'docx' }, { text: '' }, { text: 'a\0b' }, { name: '' }, { sourceName: null }]) {
    assert.throws(() => validateResumeDocument({ ...document, ...change }))
    assert.equal(checkIsResumeContentValid({ ...document, ...change }), false)
  }
  assert.deepEqual(validateResumeList([document]), [document])
})
test('existing structured resumes still format and validate for matching and follow-up messages', () => {
  const resume = { content: { name: '求职者', geekWorkExpList: [{ company: '公司', positionName: '开发', workDescription: 'Python' }],
    geekProjExpList: [{ name: 'RAG 项目', projectDescription: '检索增强' }] } }
  assert.equal(checkIsResumeContentValid(resume), true)
  const markdown = formatResumeJsonToMarkdown(resume)
  for (const text of ['求职者', '# 工作经历', '公司', '# 项目经历', 'RAG 项目', '检索增强']) assert.ok(markdown.includes(text))
  assert.equal(checkIsResumeContentValid(null), false)
  assert.equal(formatResumeJsonToMarkdown(null), '')
  assert.throws(() => validateResumeList([{ content: {} }]), /格式无效/)
})
