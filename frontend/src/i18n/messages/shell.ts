const zh = {
  metaDescription: "AI Job Agent 本地求职工作台",
  notFoundTitle: "页面不存在",
  notFoundDescription: "这个页面不存在，返回工作区继续操作。",
  backToJobs: "返回岗位",
  cannotConnect: "无法连接本地服务",
  connecting: "正在连接本机工作区…",
  skipToContent: "跳到主要内容",
  nav: {
    label: "主导航",
    jobs: "岗位",
    today: "今日待办",
    applications: "申请",
    profile: "个人履历",
    preferences: "求职偏好",
    packages: "材料包",
    open: "打开导航",
    close: "关闭导航",
  },
  header: {
    context: "个人求职工作区",
    synced: "已同步",
    syncedTooltip: "状态来自本机工作区",
    language: "界面语言",
  },
  localFirst: "本地优先",
  localOnly: "数据仅保存在本机",
  workspaceConnected: "工作区已连接",
  editable: "可编辑",
  ready: "就绪",
  closeToast: "关闭提示",
};

type Messages = typeof zh;

const ja: Messages = {
  metaDescription: "AI Job Agent ローカル転職ワークスペース",
  notFoundTitle: "ページが見つかりません",
  notFoundDescription:
    "このページは存在しません。ワークスペースに戻って続けてください。",
  backToJobs: "求人に戻る",
  cannotConnect: "ローカルサービスに接続できません",
  connecting: "ローカルワークスペースに接続しています…",
  skipToContent: "メインコンテンツへ移動",
  nav: {
    label: "メインナビゲーション",
    jobs: "求人",
    today: "今日のタスク",
    applications: "応募",
    profile: "経歴",
    preferences: "希望条件",
    packages: "書類パッケージ",
    open: "ナビゲーションを開く",
    close: "ナビゲーションを閉じる",
  },
  header: {
    context: "個人の転職ワークスペース",
    synced: "同期済み",
    syncedTooltip: "ローカルワークスペースの状態です",
    language: "表示言語",
  },
  localFirst: "ローカルファースト",
  localOnly: "データはこの端末にのみ保存されます",
  workspaceConnected: "ワークスペース接続済み",
  editable: "編集可能",
  ready: "準備完了",
  closeToast: "通知を閉じる",
};

const en: Messages = {
  metaDescription: "AI Job Agent local job-search workspace",
  notFoundTitle: "Page not found",
  notFoundDescription:
    "This page does not exist. Return to the workspace to continue.",
  backToJobs: "Back to jobs",
  cannotConnect: "Cannot connect to the local service",
  connecting: "Connecting to the local workspace…",
  skipToContent: "Skip to main content",
  nav: {
    label: "Main navigation",
    jobs: "Jobs",
    today: "Today",
    applications: "Applications",
    profile: "Profile",
    preferences: "Preferences",
    packages: "Packages",
    open: "Open navigation",
    close: "Close navigation",
  },
  header: {
    context: "Personal job-search workspace",
    synced: "Synced",
    syncedTooltip: "State comes from the local workspace",
    language: "Display language",
  },
  localFirst: "Local-first",
  localOnly: "Data stays on this computer",
  workspaceConnected: "Workspace connected",
  editable: "Editable",
  ready: "Ready",
  closeToast: "Dismiss notification",
};

export const shell = { zh, ja, en };
