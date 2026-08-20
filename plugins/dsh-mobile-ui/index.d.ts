/**
 * dshm-ui host 侧类型声明。
 * 纯 JS 实现,此文件仅为 npm types 字段提供最小声明。
 * 职责: 移动设置面板端点(原版 UI 拉起/版本检查/目录选择器/session log 热切换)。
 * 无任何 restart/reload 能力。
 */
export interface DshmUiContext {
  webServer: {
    register(opts: {
      kind: string;
      path: string;
      handler: (req: unknown, res: unknown) => void;
    }): void;
  };
  loader: {
    entries(): Iterable<{ id: string; disabled: boolean; update(opts: { disabled?: boolean }): Promise<void> }>;
  };
}

export declare function apply(ctx: DshmUiContext): void;

