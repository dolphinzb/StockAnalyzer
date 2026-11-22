/**
 * 设计令牌运行时读取工具
 *
 * 用途：Canvas 绘制（K 线图、利润图、资金图）无法使用 CSS 的 var()，
 * 需要把令牌的计算值读出来传给绘图 API。
 *
 * 行为约定：
 *   - 懒加载：首次调用时才读取，模块顶层不执行任何 DOM 访问
 *     （避免样式表尚未生效时读到空串）
 *   - 缓存：读取成功即缓存，同一令牌只读一次
 *   - 兜底：无 DOM 环境（单元测试 / 主进程）、读取为空时，依次使用
 *     调用方传入的 fallback → 内置兜底表
 */

const cache = new Map<string, string>();

/** 内置兜底值，保证任何情况下都能返回可用的颜色 */
const FALLBACKS: Record<string, string> = {
  '--color-primary': '#1890ff',
  '--color-primary-dark': '#0d6ed9',
  '--color-success': '#52c41a',
  '--color-warning': '#faad14',
  '--color-danger': '#ff4d4f',
  '--color-info': '#3b82f6',
  '--color-profit': '#ff4d4f',
  '--color-loss': '#52c41a',
  '--color-buy': '#52c41a',
  '--color-sell': '#ff4d4f',
  '--color-dividend': '#faad14',
  '--text-primary': '#333333',
  '--text-secondary': '#666666',
  '--text-tertiary': '#9ca3af',
  '--text-on-color': '#ffffff',
  '--border-color': '#e0e0e0',
  '--border-color-light': '#f3f4f6',
  '--border-color-strong': '#d1d5db',
  '--bg-primary': '#ffffff',
  '--bg-secondary': '#fafafa',
  '--bg-tertiary': '#f3f4f6',
  '--chart-volume-up': 'rgba(255, 77, 79, 0.5)',
  '--chart-volume-down': 'rgba(82, 196, 26, 0.5)',
  '--chart-tooltip-bg': 'rgba(0, 0, 0, 0.8)',
  '--chart-tooltip-text': '#ffffff',
};

/**
 * 读取一个设计令牌的计算值。
 * @param name 令牌名，如 `'--color-profit'`
 * @param fallback 读取失败时的返回值，省略时使用内置兜底表
 */
export function token(name: string, fallback?: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  let value = '';

  if (typeof document !== 'undefined') {
    try {
      value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    } catch {
      value = '';
    }
  }

  if (!value) {
    value = fallback ?? FALLBACKS[name] ?? '';
  }

  if (value) cache.set(name, value);
  return value;
}

/** 清空缓存（引入暗色主题等需要重新取值的场景调用） */
export function clearTokenCache(): void {
  cache.clear();
}
