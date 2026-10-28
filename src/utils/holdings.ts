import type { HoldingMarketDetail } from '../../shared/types';

/**
 * 持仓市值明细行构建工具
 *
 * 资金统计页的「资产分布」饼图与右侧「持仓明细」表格依赖同一份数据：
 * - 统一排序（市值降序）
 * - 统一占比口径（单只市值 / 总资产）
 * - 统一配色（饼图扇区颜色与表格颜色圆点一致）
 *
 * 因此将排序、占比、配色收敛到本模块的纯函数中，便于单元测试与复用。
 */

/**
 * 持仓标的配色板
 * 按排序结果循环取色，颜色与账户余额扇区（蓝色 #3b82f6）保持区分
 */
export const HOLDINGS_COLORS: string[] = [
  '#f97316', // 橙
  '#10b981', // 绿
  '#8b5cf6', // 紫
  '#ef4444', // 红
  '#eab308', // 黄
  '#06b6d4', // 青
  '#ec4899', // 粉
  '#84cc16', // 黄绿
  '#6366f1', // 靛蓝
  '#14b8a6', // 蓝绿
  '#f43f5e', // 玫红
  '#a855f7', // 紫红
];

/**
 * 持仓明细展示行
 * 在原始明细基础上补充占比、进度条宽度与颜色
 */
export interface HoldingsBreakdownRow extends HoldingMarketDetail {
  /** 占总资产百分比（总资产为 0 或缺少行情数据时为 null，展示层显示「—」） */
  percentage: number | null;
  /** 进度条宽度百分比，限制在 0–100 之间 */
  barWidth: number;
  /** 饼图扇区与表格共用的颜色 */
  color: string;
}

/**
 * 构建持仓明细展示行
 * @param holdings 后端返回的逐只持仓明细
 * @param totalAssets 总资产（账户余额 + 持仓市值，作为占比分母）
 * @returns 按市值降序排列、附带占比/进度条/颜色的行数据
 */
export function buildHoldingsRows(
  holdings: HoldingMarketDetail[],
  totalAssets: number
): HoldingsBreakdownRow[] {
  // 复制一份再排序，避免修改调用方传入的数组
  const sorted = [...holdings].sort((a, b) => {
    // 先按市值降序；市值相同则按代码升序，保证顺序稳定
    if (b.marketValue !== a.marketValue) {
      return b.marketValue - a.marketValue;
    }
    return a.stockCode.localeCompare(b.stockCode);
  });

  return sorted.map((item, index) => {
    // 缺少行情数据时市值无法计算，占比按「—」处理
    // 总资产为 0 时同样无法计算占比，避免除零产生 NaN/Infinity
    const percentage =
      item.hasKlineData && totalAssets > 0
        ? (item.marketValue / totalAssets) * 100
        : null;

    // 进度条宽度限制在 0–100，防止极端数据溢出容器
    const barWidth = percentage === null ? 0 : Math.min(100, Math.max(0, percentage));

    return {
      ...item,
      percentage,
      barWidth,
      // 按排序顺序循环取色，保证饼图与表格颜色一一对应
      color: HOLDINGS_COLORS[index % HOLDINGS_COLORS.length],
    };
  });
}
