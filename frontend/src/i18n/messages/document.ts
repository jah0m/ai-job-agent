const zh = {
  previewOnly: "在线申请文档仅支持 shokumu-keirekisho.md",
  editOnly: "在线编辑仅支持 shokumu-keirekisho.md",
  backToApplication: "返回申请",
  cannotRead: "无法读取这份文档",
  loading: "正在读取文档…",
  downloadMarkdown: "下载職務経歴書 Markdown",
  editDraft: "编辑職務経歴書草稿",
  currentRevision: (revision: number | string) =>
    `当前材料 · Revision ${revision}`,
  packageFallback: "材料包",
  needPdf: "需要导出 PDF？",
  pdfHint:
    "下载 Markdown 后，可使用 Markdown Resume Studio 调整版式并导出 PDF。",
  openStudio: "打开 Markdown Resume Studio",
  previewLabel: (title: string) => `${title}预览`,
  defaultLabel: (title: string) => `在线编辑 · ${title}`,
  cannotPrepare: "无法准备编辑器",
  preparing: "正在准备编辑器…",
  saveFailed: "保存失败",
  editTitle: (title: string) => `编辑工作草稿 · ${title}`,
  editorNoteTitle: "这里只保存当前材料",
  editorNote:
    "保存不会覆盖既有材料包，也不会向雇主发送文件；记录投递时系统会自动保存不可变快照。",
  draftLabel: "草稿标签",
  markdownContent: "Markdown 内容",
  saveToDraft: "保存到工作草稿",
};

type Messages = typeof zh;

const ja: Messages = {
  previewOnly:
    "オンラインの応募書類は shokumu-keirekisho.md のみ対応しています",
  editOnly: "オンライン編集は shokumu-keirekisho.md のみ対応しています",
  backToApplication: "応募に戻る",
  cannotRead: "この書類を読み込めません",
  loading: "書類を読み込んでいます…",
  downloadMarkdown: "職務経歴書の Markdown をダウンロード",
  editDraft: "職務経歴書の下書きを編集",
  currentRevision: (revision) => `現在の書類 · Revision ${revision}`,
  packageFallback: "書類パッケージ",
  needPdf: "PDF に書き出しますか？",
  pdfHint:
    "Markdown をダウンロードしたあと、Markdown Resume Studio でレイアウトを整えて PDF に書き出せます。",
  openStudio: "Markdown Resume Studio を開く",
  previewLabel: (title) => `${title}のプレビュー`,
  defaultLabel: (title) => `オンライン編集 · ${title}`,
  cannotPrepare: "エディターを準備できません",
  preparing: "エディターを準備しています…",
  saveFailed: "保存に失敗しました",
  editTitle: (title) => `作業中の下書きを編集 · ${title}`,
  editorNoteTitle: "ここでは現在の書類のみ保存されます",
  editorNote:
    "保存しても既存の書類パッケージは上書きされず、企業にファイルが送られることもありません。応募を記録すると、変更できないスナップショットが自動で保存されます。",
  draftLabel: "下書きのラベル",
  markdownContent: "Markdown の内容",
  saveToDraft: "下書きに保存",
};

const en: Messages = {
  previewOnly:
    "Online application documents support only shokumu-keirekisho.md",
  editOnly: "Online editing supports only shokumu-keirekisho.md",
  backToApplication: "Back to application",
  cannotRead: "Cannot read this document",
  loading: "Loading document…",
  downloadMarkdown: "Download 職務経歴書 Markdown",
  editDraft: "Edit 職務経歴書 draft",
  currentRevision: (revision) => `Current materials · Revision ${revision}`,
  packageFallback: "Package",
  needPdf: "Need a PDF?",
  pdfHint:
    "After downloading the Markdown, you can adjust the layout and export a PDF with Markdown Resume Studio.",
  openStudio: "Open Markdown Resume Studio",
  previewLabel: (title) => `${title} preview`,
  defaultLabel: (title) => `Online edit · ${title}`,
  cannotPrepare: "Cannot prepare the editor",
  preparing: "Preparing the editor…",
  saveFailed: "Save failed",
  editTitle: (title) => `Edit working draft · ${title}`,
  editorNoteTitle: "This saves only the current materials",
  editorNote:
    "Saving does not overwrite existing packages or send files to an employer; recording a submission automatically saves an immutable snapshot.",
  draftLabel: "Draft label",
  markdownContent: "Markdown content",
  saveToDraft: "Save to working draft",
};

export const documentView = { zh, ja, en };
