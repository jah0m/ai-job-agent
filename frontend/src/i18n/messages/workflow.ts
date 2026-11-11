const zh = {
  handoff: {
    readFailed: "读取失败",
    title: "在 Codex 中继续",
    description: "网页负责显示和管理结果，AI 工作需要你在 Codex 中发起。",
    close: "关闭交接说明",
    copied: "指令已复制",
    copy: "复制指令",
    copiedHint: "剪贴板中已有本次指令，尚未启动 AI 任务。",
    copyFailedHint: "自动复制不可用，请展开下方指令并手动复制。",
    sendTitle: "切换到 Codex 并发送",
    sendHint: "等待 Codex 回复；需要保存的数据，请按提示确认入库。",
    checkTitle: "回到这里核对结果",
    checkHint:
      "搜索结果需导入、分析和材料需保存后才会显示。讨论类任务的回答留在 Codex 中。",
    showPrompt: "查看或手动复制指令",
    promptLabel: "Codex 指令",
    refreshNote:
      "刷新只重新读取本地数据，不代表 AI 已完成。请核对最新内容和更新时间。",
    copyAgain: "重新复制",
    refresh: "刷新查看结果",
  },
  nextAction: {
    confirmClearDirty: "清除当前待办？未保存的修改也会丢失。",
    confirmClear: "清除当前待办？变更会保留在活动记录中。",
    updated: "待办已更新",
    updateFailed: "待办更新失败",
    eyebrow: "下一步行动",
    heading: "接下来要做什么？",
    completed: "已完成",
    intro: "设置一个具体行动；到期日可选，按本机日期在首页归类。",
    titleLabel: "行动内容",
    titlePlaceholder: "例如：联系中介确认面试时间",
    dueLabel: "到期日（可选）",
    saveAsNew: "保存为新待办",
    save: "保存待办",
    reopen: "重新打开",
    complete: "标记完成",
    clear: "清除待办",
    footer:
      "延期请修改到期日后保存。完成待办不会改变申请阶段；变更会保留在活动记录中。",
  },
  today: {
    title: "今日待办",
    description: "集中处理到期行动，再推进申请",
    completed: "待办已完成",
    completedHint: "可在申请详情设置下一步或重新打开。",
    updateFailed: "更新失败",
    noDate: "未设日期",
    completeLabel: (title: string) => `完成待办：${title}`,
    complete: "完成",
    editOrPostpone: "编辑 / 延期",
    localDate: "本机日期",
    listHeading: "行动列表",
    listHint: "逾期和今天到期的事项优先显示。",
    refresh: "刷新待办",
    loading: "正在读取待办…",
    loadFailed: (error: string) => `待办读取失败：${error}`,
    overdue: "已逾期",
    dueToday: "今天到期",
    none: "今天没有到期或逾期的待办。",
    upcoming: "之后到期",
    undated: "未设日期",
    unset: (count: number) =>
      `${count} 份进行中的申请尚未设置下一步，或上一项已完成。`,
    manageHint: "在申请详情中管理下一步行动。",
    toBoard: "前往申请看板 →",
  },
};

type Messages = typeof zh;

const ja: Messages = {
  handoff: {
    readFailed: "読み込みに失敗しました",
    title: "Codex で続ける",
    description:
      "Web 画面は結果の表示と管理を担当します。AI の作業は Codex から開始してください。",
    close: "引き継ぎ説明を閉じる",
    copied: "指示をコピーしました",
    copy: "指示をコピー",
    copiedHint:
      "クリップボードに今回の指示が入っています。AI タスクはまだ開始していません。",
    copyFailedHint:
      "自動コピーが使えません。下の指示を開いて手動でコピーしてください。",
    sendTitle: "Codex に切り替えて送信",
    sendHint:
      "Codex の返答を待ってください。保存が必要なデータは案内に従って登録を確認してください。",
    checkTitle: "ここに戻って結果を確認",
    checkHint:
      "検索結果はインポート後、分析と書類は保存後に表示されます。相談系タスクの回答は Codex に残ります。",
    showPrompt: "指示を表示・手動でコピー",
    promptLabel: "Codex への指示",
    refreshNote:
      "更新はローカルデータを再読み込みするだけで、AI の完了を意味しません。最新の内容と更新日時を確認してください。",
    copyAgain: "もう一度コピー",
    refresh: "更新して結果を確認",
  },
  nextAction: {
    confirmClearDirty:
      "現在のタスクを削除しますか？保存していない変更も失われます。",
    confirmClear: "現在のタスクを削除しますか？変更は活動履歴に残ります。",
    updated: "タスクを更新しました",
    updateFailed: "タスクの更新に失敗しました",
    eyebrow: "次のアクション",
    heading: "次に何をしますか？",
    completed: "完了",
    intro:
      "具体的なアクションを設定します。期日は任意で、端末の日付に基づいてホームで分類されます。",
    titleLabel: "アクション内容",
    titlePlaceholder: "例：エージェントに面接日程を確認する",
    dueLabel: "期日（任意）",
    saveAsNew: "新しいタスクとして保存",
    save: "タスクを保存",
    reopen: "再開",
    complete: "完了にする",
    clear: "タスクを削除",
    footer:
      "延期する場合は期日を変更して保存してください。タスクを完了しても応募ステージは変わりません。変更は活動履歴に残ります。",
  },
  today: {
    title: "今日のタスク",
    description: "期日のアクションをまとめて片付けてから、応募を進めましょう",
    completed: "タスクを完了しました",
    completedHint: "応募詳細で次のアクションを設定するか、再開できます。",
    updateFailed: "更新に失敗しました",
    noDate: "期日なし",
    completeLabel: (title) => `タスクを完了：${title}`,
    complete: "完了",
    editOrPostpone: "編集・延期",
    localDate: "端末の日付",
    listHeading: "アクション一覧",
    listHint: "期限切れと今日が期日の項目を優先して表示します。",
    refresh: "タスクを更新",
    loading: "タスクを読み込んでいます…",
    loadFailed: (error) => `タスクの読み込みに失敗しました：${error}`,
    overdue: "期限切れ",
    dueToday: "今日が期日",
    none: "今日が期日または期限切れのタスクはありません。",
    upcoming: "今後の期日",
    undated: "期日なし",
    unset: (count) =>
      `進行中の応募 ${count} 件で次のアクションが未設定か、前のアクションが完了しています。`,
    manageHint: "次のアクションは応募詳細で管理します。",
    toBoard: "応募ボードへ →",
  },
};

const en: Messages = {
  handoff: {
    readFailed: "Could not load",
    title: "Continue in Codex",
    description:
      "This page shows and manages results; AI work has to be started by you in Codex.",
    close: "Close handoff instructions",
    copied: "Prompt copied",
    copy: "Copy the prompt",
    copiedHint: "The prompt is on your clipboard. No AI task has started yet.",
    copyFailedHint:
      "Automatic copy is unavailable. Expand the prompt below and copy it manually.",
    sendTitle: "Switch to Codex and send it",
    sendHint:
      "Wait for Codex to reply; confirm saving any data when it asks you to.",
    checkTitle: "Come back here to check the result",
    checkHint:
      "Search results appear after import, and analyses and documents after they are saved. Answers to discussion tasks stay in Codex.",
    showPrompt: "View or copy the prompt manually",
    promptLabel: "Codex prompt",
    refreshNote:
      "Refreshing only re-reads local data; it does not mean the AI has finished. Check the latest content and update time.",
    copyAgain: "Copy again",
    refresh: "Refresh results",
  },
  nextAction: {
    confirmClearDirty:
      "Clear the current action? Unsaved changes will also be lost.",
    confirmClear:
      "Clear the current action? The change stays in the activity log.",
    updated: "Action updated",
    updateFailed: "Could not update the action",
    eyebrow: "Next action",
    heading: "What comes next?",
    completed: "Done",
    intro:
      "Set one concrete action. The due date is optional; the home view groups actions by this computer's date.",
    titleLabel: "Action",
    titlePlaceholder: "e.g. Ask the recruiter to confirm the interview time",
    dueLabel: "Due date (optional)",
    saveAsNew: "Save as new action",
    save: "Save action",
    reopen: "Reopen",
    complete: "Mark done",
    clear: "Clear action",
    footer:
      "To postpone, change the due date and save. Completing an action does not change the application stage; changes stay in the activity log.",
  },
  today: {
    title: "Today",
    description: "Clear due actions first, then move applications forward",
    completed: "Action completed",
    completedHint:
      "Set the next action or reopen it from the application details.",
    updateFailed: "Update failed",
    noDate: "No date",
    completeLabel: (title) => `Complete action: ${title}`,
    complete: "Done",
    editOrPostpone: "Edit / postpone",
    localDate: "local date",
    listHeading: "Actions",
    listHint: "Overdue items and items due today are shown first.",
    refresh: "Refresh actions",
    loading: "Loading actions…",
    loadFailed: (error) => `Could not load actions: ${error}`,
    overdue: "Overdue",
    dueToday: "Due today",
    none: "Nothing is due today or overdue.",
    upcoming: "Due later",
    undated: "No date",
    unset: (count) =>
      `${count} active application(s) have no next action, or the last one is done.`,
    manageHint: "Manage next actions from the application details.",
    toBoard: "Go to the application board →",
  },
};

export const workflow = { zh, ja, en };
