import { completionOptions, pickModel } from '../../../common/model-config.mjs'
import { jobMatchMessages, parseJobMatchResult, jobMatchDecision } from '@geekgeekrun/geek-auto-start-chat-with-boss/ai-job-match.mjs'
export const JOB_MATCH_MAX_TOKENS = 1600

export function matchJobData(detail) {
  const job = detail?.jobInfo || {}
  const company = detail?.brandComInfo || {}
  return { jobName: job.jobName, postDescription: job.postDescription, positionName: job.positionName,
    salary: job.salaryDesc, experience: job.experienceName, degree: job.degreeName,
    city: job.locationName, company: company.brandName, industry: company.industryName,
    companyDescription: company.introduce, skills: job.showSkills }
}

export function savedJobDetail(row) {
  if (!row || typeof row.encryptJobId !== 'string' || !row.encryptJobId.trim() ||
    typeof row.jobName !== 'string' || typeof row.description !== 'string')
    throw new Error('岗位名称或已保存的 JD 不完整，无法分析')
  return { jobInfo: { encryptId: row.encryptJobId, jobName: row.jobName, postDescription: row.description,
    positionName: row.positionName, salaryDesc: row.salaryDesc, experienceName: row.experienceName,
    degreeName: row.degreeName, locationName: row.cityName },
  brandComInfo: { brandName: row.companyName, industryName: row.companyIndustryName } }
}

export function createJobMatchEvaluator({ resume, settings, models, complete, save, now = Date.now }) {
  const model = pickModel(models)
  if (!model) throw new Error('请先在设置中保存有效的 AI 模型配置')
  return async detail => {
    try {
      const messages = jobMatchMessages({ resume, job: matchJobData(detail), instructions: settings.instructions })
      const response = await complete({ ...completionOptions(model), maxTokens: JOB_MATCH_MAX_TOKENS }, messages)
      if (response?.choices?.[0]?.finish_reason === 'length') throw new Error('AI 匹配响应被截断，请调整模型配置后重试')
      const result = jobMatchDecision(parseJobMatchResult(response?.choices?.[0]?.message?.content), settings)
      const evaluation = { ...result, evaluatedAt: now(), model: model.model }
      await save({ jobId: detail?.jobInfo?.encryptId, resume, settings, job: matchJobData(detail), evaluation })
      return evaluation
    } catch (error) {
      const message = String(error.message).split(model.providerApiSecret || '\0').join('[密钥已隐藏]')
      throw Object.assign(new Error('AUTO_CHAT_AI_MATCH_FAILED'), { detail: 'AI 岗位匹配失败，未继续开聊或收集：' + message })
    }
  }
}
