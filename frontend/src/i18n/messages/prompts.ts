type JobRef = { id: string; title: string; company?: string };
type JobUrlRef = { id: string; url: string };

const zh = {
  jobSearch: `请使用 job-search skill 读取我的候选人资料和求职偏好，并根据我的需求选择合适的岗位搜索 skills（例如 geekly-search、green-search、tokyodev-search、linkedin-search 等）搜索新的岗位。排除求职偏好中列出的拉黑公司；公司名称不明确时标记出来供我确认。请将符合条件的岗位导入 AI Job Agent。导入完成后询问我是否需要对岗位进行分析。`,
  profile: `请使用 job-search skill 读取我的候选人资料和求职偏好，基于已记录的事实生成一版更完整、适合日本中途求职的个人履历完善建议。重点完善个人简介、工作经历的成果表达、技能与语言信息；不能编造经历、数字、职级、日期或语言水平。请先给出建议内容和需要我确认的事实问题，确认后再通过既有工作流保存，不要静默覆盖本机资料。`,
  preferences: `请使用 job-search skill 来生成我的求职偏好建议。请基于已记录的事实生成一版更完整、适合日本中途求职的求职偏好完善建议。重点完善希望的工作类型、行业、公司规模、职位类型、薪资范围、工作地点、语言要求和需要拉黑的公司；不能编造经历、数字、职级、日期或语言水平。请先给出建议内容和需要我确认的事实问题，确认后再通过既有工作流保存，不要静默覆盖本机资料。`,
  jobAnalysis: (job: JobRef) =>
    `请使用 job-search skill 分析以下岗位与我的匹配度\n\n岗位 ID：${job.id}\n职位：${job.title}\n公司：${job.company || "未知公司"}`,
  jobRefresh: (job: JobUrlRef) =>
    `请使用 job-search skill 重新获取并更新以下已保存岗位的信息。\n\n岗位 ID：${job.id}\n公开岗位 URL：${job.url}`,
  applicationFallback: (applicationId: string) =>
    `请使用 job-search skill 只生成职位定制的職務経歴書（shokumu-keirekisho.md）：${applicationId}`,
  applicationDiscussion: (applicationId: string) =>
    `请使用 job-search skill 读取这份申请对应的岗位、我的候选人资料和求职偏好，与我讨论申请准备策略。\n\n申请 ID：${applicationId}\n\n请围绕岗位匹配、職務経歴書的重点、可能被问到的问题和下一步行动提出问题与建议。只能基于已知事实讨论，不要编造经历、数字、职级、日期或申请进展。`,
};

type Messages = typeof zh;

const ja: Messages = {
  jobSearch: `job-search skill を使って私の候補者プロフィールと希望条件を読み込み、ニーズに合う求人検索 skill（geekly-search、green-search、tokyodev-search、linkedin-search など）を選んで新しい求人を検索してください。希望条件にあるブラックリスト企業は除外し、会社名が不明確な場合は確認できるよう印を付けてください。条件に合う求人を AI Job Agent にインポートし、インポート後に求人の分析が必要か私に確認してください。`,
  profile: `job-search skill を使って私の候補者プロフィールと希望条件を読み込み、記録済みの事実に基づいて、日本の中途採用向けにより充実した経歴の改善案を作成してください。自己紹介、職務経歴の成果の表現、スキルと語学情報を重点的に改善してください。経験・数字・役職・日付・語学レベルを捏造しないでください。まず改善案と私に確認すべき事実の質問を示し、確認後に既存のワークフローで保存してください。ローカルデータを黙って上書きしないでください。`,
  preferences: `job-search skill を使って私の希望条件の改善案を作成してください。記録済みの事実に基づいて、日本の中途採用向けにより充実した希望条件の改善案を作成してください。希望する働き方、業界、企業規模、職種、年収レンジ、勤務地、語学要件、ブラックリスト企業を重点的に改善してください。経験・数字・役職・日付・語学レベルを捏造しないでください。まず改善案と私に確認すべき事実の質問を示し、確認後に既存のワークフローで保存してください。ローカルデータを黙って上書きしないでください。`,
  jobAnalysis: (job) =>
    `job-search skill を使って、次の求人と私のマッチ度を分析してください\n\n求人 ID：${job.id}\n職種：${job.title}\n会社：${job.company || "会社名不明"}`,
  jobRefresh: (job) =>
    `job-search skill を使って、次の保存済み求人の情報を再取得して更新してください。\n\n求人 ID：${job.id}\n公開求人 URL：${job.url}`,
  applicationFallback: (applicationId) =>
    `job-search skill を使って、求人に合わせた職務経歴書（shokumu-keirekisho.md）のみを作成してください：${applicationId}`,
  applicationDiscussion: (applicationId) =>
    `job-search skill を使って、この応募に対応する求人、私の候補者プロフィールと希望条件を読み込み、応募準備の戦略を一緒に検討してください。\n\n応募 ID：${applicationId}\n\n求人とのマッチ、職務経歴書で強調する点、聞かれそうな質問、次のアクションについて質問と提案をしてください。既知の事実のみに基づいて議論し、経験・数字・役職・日付・選考状況を捏造しないでください。`,
};

const en: Messages = {
  jobSearch: `Use the job-search skill to read my candidate profile and job preferences, then pick suitable job-search skills for my needs (for example geekly-search, green-search, tokyodev-search, linkedin-search) and search for new jobs. Exclude the blacklisted companies in my preferences; flag any job whose company name is unclear so I can confirm it. Import the matching jobs into AI Job Agent, and when the import is done, ask me whether I want the jobs analyzed.`,
  profile: `Use the job-search skill to read my candidate profile and job preferences, and based only on the recorded facts, draft a more complete profile suited to mid-career job hunting in Japan. Focus on the summary, how results are expressed in my work experience, and my skills and languages. Do not invent experience, numbers, titles, dates, or language levels. First show me the suggestions and the factual questions I need to confirm; after I confirm, save through the existing workflow. Do not silently overwrite local data.`,
  preferences: `Use the job-search skill to draft suggestions for my job preferences. Based only on the recorded facts, draft more complete preferences suited to mid-career job hunting in Japan. Focus on preferred work style, industries, company size, role types, salary range, locations, language requirements, and companies to blacklist. Do not invent experience, numbers, titles, dates, or language levels. First show me the suggestions and the factual questions I need to confirm; after I confirm, save through the existing workflow. Do not silently overwrite local data.`,
  jobAnalysis: (job) =>
    `Use the job-search skill to analyze how well the following job matches me\n\nJob ID: ${job.id}\nTitle: ${job.title}\nCompany: ${job.company || "Unknown company"}`,
  jobRefresh: (job) =>
    `Use the job-search skill to re-fetch and update the following saved job.\n\nJob ID: ${job.id}\nPublic job URL: ${job.url}`,
  applicationFallback: (applicationId) =>
    `Use the job-search skill to generate only the job-specific 職務経歴書 (shokumu-keirekisho.md): ${applicationId}`,
  applicationDiscussion: (applicationId) =>
    `Use the job-search skill to read the job for this application, my candidate profile, and my job preferences, and discuss an application strategy with me.\n\nApplication ID: ${applicationId}\n\nAsk questions and make suggestions about job fit, what the 職務経歴書 should emphasize, likely interview questions, and next actions. Discuss only known facts; do not invent experience, numbers, titles, dates, or application progress.`,
};

export const prompts = { zh, ja, en };
