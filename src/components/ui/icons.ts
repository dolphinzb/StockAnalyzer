/**
 * 通用功能图标路径定义（零依赖，手写）
 *
 * 规格：viewBox 0 0 24 24、stroke currentColor、stroke-width 2、圆角端点
 *
 * 每个图标是「多条路径」数组：
 *   - 圆形与直线统一用 path 的 d 表达（`M...a...` / `M...L...`），
 *     避免在 SVG 内动态切换元素标签带来的命名空间问题
 *   - 因此不再受单条 d 字符串限制，多图元图标可正常表达
 */
export type IconName =
  | 'refresh'
  | 'check'
  | 'close'
  | 'warning'
  | 'error'
  | 'info'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'search'
  | 'download'
  | 'chevron-down'
  | 'chevron-right'
  | 'help'
  | 'file'
  | 'arrow-up';

export const ICON_PATHS: Record<IconName, string[]> = {
  // 顺时针旋转箭头
  refresh: ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  check: ['M20 6 9 17l-5-5'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  warning: [
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    'M12 9v4',
    'M12 17h.01',
  ],
  error: ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20', 'M12 8v4', 'M12 16h.01'],
  info: ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20', 'M12 16v-4', 'M12 8h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  edit: ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z', 'm15 5 4 4'],
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M10 11v6',
    'M14 11v6',
  ],
  search: ['M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'M21 21l-4.35-4.35'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  help: [
    'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20',
    'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3',
    'M12 17h.01',
  ],
  file: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M16 13H8',
    'M16 17H8',
  ],
  // 下跌方向由该图标旋转 180deg 表达
  'arrow-up': ['M12 19V5', 'm5 12 7-7 7 7'],
};
