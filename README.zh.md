# AI Job Agent

简体中文 | [English](README.md)

**为日本中途求职打造的本地工作台：用 AI Job Agent 管理进度，用 Codex 搜索岗位、分析匹配度并准备日文申请材料。**

AI Job Agent 把分散在招聘网站、聊天记录和文件夹里的求职信息整理到一个本地工作区。你可以保存候选人资料和求职偏好，筛选不同平台的岗位，跟踪每一份申请，并准确记录真实投递时使用的文件。

## 安装

### 推荐：把 GitHub 地址交给 Codex

复制本仓库的 GitHub 页面地址，打开一个 Codex 任务并发送：

> 帮我安装并启动 AI Job Agent：`<粘贴 GitHub 仓库地址>`

Codex 会检查 Python、Node.js/npm 和 Bun，克隆仓库并完成本地安装。安装结束后，可以在该项目中直接发送：

> 启动 AI Job Agent

### 手动安装

需要 Python 3.11 或更高版本、Node.js/npm，以及用于岗位搜索工具的 Bun。

```powershell
git clone <GitHub 仓库地址> ai-job-agent
Set-Location ai-job-agent

python -m pip install -e ".[web]"

Push-Location frontend
npm install
npm run build
Pop-Location

& '.agents\skills\job-search-web\scripts\start_web.ps1'
```

然后打开 `http://127.0.0.1:8765`。

## 第一次使用

Codex 会以生产模式启动本地仪表盘。第一次使用时：

1. 完善个人履历；
2. 设置目标职种、地点、工作方式和不可妥协条件；
3. 让 Codex 搜索并导入第一批岗位。

完整说明见[首次使用指南](docs/user/first-use-guide.md)。参与开发请阅读[开发与环境配置](docs/developer/development.md)。

## 它能帮你完成什么

- **集中管理候选人信息**：保存工作经历、技能、语言能力、证书和可验证成果。
- **搜索多个招聘来源**：支持 Green、Geekly、LinkedIn、TokyoDev、LAPRAS，以及使用 HERP/HRMOS 的公司招聘页。
- **分析岗位匹配度**：基于已确认的履历和偏好，给出有证据的优势、差距、硬性条件和待确认问题。
- **跟踪求职进度**：在岗位和申请看板中管理收藏、跳过、材料准备、面试、Offer 和结束状态。
- **准备日文申请材料**：让 Codex 针对岗位起草和修改履歴書、職務経歴書，同时保留事实一致性和修改 revision。
- **保留投递证据**：上传最终 PDF/DOCX，记录真实投递的渠道、时间和准确文件，并自动创建不可变材料包。
- **支持面试与复盘**：根据岗位、候选人证据和已投递材料准备面试，并记录最终结果。

## 推荐工作流程

1. 在 AI Job Agent 中维护个人履历和求职偏好。
2. 让 Codex 从合适的平台搜索岗位并保存结果。
3. 查看原始职位和 AI 匹配分析，完成收藏或跳过。
4. 为目标岗位创建申请记录。
5. 让 Codex 准备履歴書和職務経歴書，在当前材料中预览和修改。
6. 使用 Word、Google Docs、公司模板或 Markdown Resume Studio 完成外部排版。
7. 在招聘网站、邮件或中介渠道中完成真实投递。
8. 回到 AI Job Agent，记录实际发送的文件和投递信息。

## AI Job Agent、Codex 和招聘平台的分工

| 部分 | 负责什么 |
| --- | --- |
| **AI Job Agent** | 管理本地岗位、个人资料、申请阶段、当前材料、材料包和投递记录。 |
| **Codex + Skills** | 搜索公开岗位、分析匹配度、准备材料和面试内容。 |
| **外部招聘平台或邮件** | 完成真正的申请提交和文件发送。 |

AI Job Agent 不会替你向公司投递，也不会把“生成材料”或“记录已投递”解释为文件已经发送。它目前不生成 PDF；最终排版和导出应在外部工具中完成。

## 本地数据与隐私

候选人资料、职位原文、匹配分析、申请历史、生成材料、上传文件和 SQLite 索引都保存在本机的 `.job-search/` 目录中。该目录默认被 Git 忽略，个人数据不会进入仓库。

材料的状态也有明确区分：

- `draft/` 是唯一可修改的当前材料；
- `packages/` 保存不可变材料包；
- `submitted/` 保存投递记录及其文件哈希。

## 文档

- **使用者**：[首次使用指南](docs/user/first-use-guide.md)
- **开发者**：[开发与环境配置](docs/developer/development.md)、[系统架构](docs/developer/architecture.md)、[存储模型](docs/developer/storage-model.md)
- **AI Agent**：[仓库规则](AGENTS.md)和 [Agent 工作流](.agents/README.md)

## 项目边界

- AI 分析是求职辅助，不代表雇主判断。
- 不会绕过登录、验证码、访问限制或平台速率限制。
- 不会自动填写或提交外部申请表。
- 重要履历信息保存前会请你确认。
- 日本申请默认同时准备履歴書和職務経歴書，除非岗位或用户另有要求。

## License

[MIT](LICENSE)。
