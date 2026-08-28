import type { Job } from "./types";

export const AI_PROMPTS = {
  jobSearch: `请使用 job-search skill 读取我的候选人资料和求职偏好，并根据我的需求选择合适的岗位搜索 skills（例如 geekly-search、green-search、tokyodev-search、linkedin-search 等）搜索新的岗位。请将符合条件的岗位导入 AI Job Agent，并使用 job-search job evaluate 为每个新岗位生成证据型匹配分析并持久化保存。`,
  profile: `请使用 job-search skill 读取我的候选人资料和求职偏好，基于已记录的事实生成一版更完整、适合日本中途求职的个人履历完善建议。重点完善个人简介、工作经历的成果表达、技能与语言信息；不能编造经历、数字、职级、日期或语言水平。请先给出建议内容和需要我确认的事实问题，确认后再通过既有工作流保存，不要静默覆盖本机资料。`,
  preferences: `请使用 job-search skill 读取我的候选人资料和求职偏好，结合日本中途求职目标，生成一版清晰、可执行的求职偏好建议。请检查目标职位、领域、地区、薪资、工作方式、不可接受条件和加分项之间的缺失与冲突；只能基于已知事实提出建议，标记需要我确认的推断，确认后再通过既有工作流保存，不要静默覆盖本机资料。`,
} as const;

export function buildJobAnalysisPrompt(
  job: Pick<Job, "id" | "title" | "company">,
): string {
  return `请使用 job-search skill 分析以下岗位与我的匹配度\n\n岗位 ID：${job.id}\n职位：${job.title}\n公司：${job.company || "未知公司"}`;
}

export function buildApplicationPromptFallback(applicationId: string): string {
  return `请使用 job-search skill 生成職務経歴書、履歴書：${applicationId}`;
}

export function buildApplicationDiscussionPrompt(
  applicationId: string,
): string {
  return `请使用 job-search skill 读取这份申请对应的岗位、我的候选人资料和求职偏好，与我讨论申请准备策略。

申请 ID：${applicationId}

请围绕岗位匹配、履历书与职务经历书的重点、可能被问到的问题和下一步行动提出问题与建议。只能基于已知事实讨论，不要编造经历、数字、职级、日期或申请进展。`;
}
