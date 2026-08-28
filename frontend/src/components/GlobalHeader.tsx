import * as Tooltip from "@radix-ui/react-tooltip";

export function GlobalHeader() {
  return (
    <header className="global-header">
      <div className="global-header-left">
        <span className="header-context">个人求职工作区</span>
      </div>
      <div className="global-header-right">
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="sync-indicator">
                <span className="status-dot" />
                已同步
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tooltip-content" sideOffset={6}>
                状态来自本机工作区
                <Tooltip.Arrow className="tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
        <span className="header-avatar" aria-hidden="true">
          J
        </span>
      </div>
    </header>
  );
}
