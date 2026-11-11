const zh = {
  loadFailed: "材料包加载失败",
  restoreFailed: "恢复失败",
  retryInDetail: "请在申请详情中重试",
  loading: "正在读取材料包…",
  description: "不可变快照用于记录实际投递时使用的材料。",
  title: "材料包",
  fallbackLabel: "材料包",
  locked: "已锁定",
  restorable: "可恢复",
  createdAt: (date: string) => `创建于 ${date}`,
  fileCount: (count: number) => `${count} 个文件`,
  exactEvidence: "可作为精确文件证据",
  sourceOnly: "可作为材料来源",
  checkIntegrity: "需检查完整性",
  keptForever: "投递记录引用后永久保留",
  restore: "恢复到当前材料",
  emptyHint: "在申请详情中保存一次当前材料后，材料包会出现在这里。",
  emptyTitle: "还没有材料包",
};

type Messages = typeof zh;

const ja: Messages = {
  loadFailed: "書類パッケージを読み込めませんでした",
  restoreFailed: "復元に失敗しました",
  retryInDetail: "応募詳細からもう一度お試しください",
  loading: "書類パッケージを読み込んでいます…",
  description:
    "変更できないスナップショットで、実際の応募に使った書類を記録します。",
  title: "書類パッケージ",
  fallbackLabel: "書類パッケージ",
  locked: "ロック済み",
  restorable: "復元可能",
  createdAt: (date) => `${date} 作成`,
  fileCount: (count) => `ファイル ${count} 件`,
  exactEvidence: "正確なファイルの証跡として使用可能",
  sourceOnly: "書類の元データとして使用可能",
  checkIntegrity: "整合性の確認が必要",
  keptForever: "応募記録から参照されているため永久に保持されます",
  restore: "現在の書類に復元",
  emptyHint:
    "応募詳細で現在の書類を一度保存すると、書類パッケージがここに表示されます。",
  emptyTitle: "書類パッケージはまだありません",
};

const en: Messages = {
  loadFailed: "Could not load packages",
  restoreFailed: "Restore failed",
  retryInDetail: "Try again from the application details",
  loading: "Loading packages…",
  description:
    "Immutable snapshots record the materials actually used in a submission.",
  title: "Packages",
  fallbackLabel: "Package",
  locked: "Locked",
  restorable: "Restorable",
  createdAt: (date) => `Created ${date}`,
  fileCount: (count) => `${count} file(s)`,
  exactEvidence: "Usable as exact-file evidence",
  sourceOnly: "Usable as source material",
  checkIntegrity: "Integrity needs checking",
  keptForever: "Kept permanently because a submission references it",
  restore: "Restore to current materials",
  emptyHint:
    "Packages appear here after you save the current materials once from an application's details.",
  emptyTitle: "No packages yet",
};

export const packages = { zh, ja, en };
