/**
 * 价格格式化工具模块
 * 
 * 根据证券类型（股票/基金）自动调整价格显示精度：
 * - 股票：2位小数（精确到分）
 * - 基金：3位小数（精确到厘）
 * 
 * 基金识别规则（基于代码前缀）：
 * - 51xxxx: 上交所ETF基金
 * - 15xxxx: 深交所ETF基金
 * - 16xxxx: 深交所LOF基金
 * - 50xxxx: 上交所LOF基金
 * - 52xxxx: 上交所货币基金
 * - 511xxx: 上交所债券ETF
 */

/**
 * 判断是否为基金
 * @param stockCode 股票代码
 * @returns true 表示是基金，false 表示是股票
 */
export function isFund(stockCode: string): boolean {
  return /^(51|15|16|50|52|511)/.test(stockCode);
}

/**
 * 获取价格显示精度
 * @param stockCode 股票代码
 * @returns 小数位数（基金返回3，股票返回2）
 */
export function getPricePrecision(stockCode: string): number {
  return isFund(stockCode) ? 3 : 2;
}

/**
 * 格式化价格显示
 * @param price 价格数值
 * @param stockCode 股票代码（可选，用于自动判断精度）
 * @returns 格式化后的价格字符串，如 "¥3.456" 或 "¥1856.79"
 */
export function formatPrice(price: number | null | undefined, stockCode?: string): string {
  if (price === null || price === undefined) {
    return '-';
  }
  
  const precision = stockCode ? getPricePrecision(stockCode) : 2;
  return `¥${price.toFixed(precision)}`;
}

/**
 * 格式化涨跌额显示
 * @param value 涨跌额数值
 * @param stockCode 股票代码（可选，用于自动判断精度）
 * @returns 格式化后的涨跌额字符串，如 "+0.123" 或 "-12.35"
 */
export function formatChange(value: number | null | undefined, stockCode?: string): string {
  if (value === null || value === undefined) {
    return '-';
  }
  
  const precision = stockCode ? getPricePrecision(stockCode) : 2;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(precision)}`;
}

/**
 * 格式化涨跌幅百分比显示
 * @param value 涨跌幅百分比数值
 * @param stockCode 股票代码（可选，用于自动判断精度）
 * @returns 格式化后的涨跌幅字符串，如 "+2.345%" 或 "-1.25%"
 */
export function formatChangePercent(value: number | null | undefined, stockCode?: string): string {
  if (value === null || value === undefined) {
    return '-';
  }
  
  const precision = stockCode ? getPricePrecision(stockCode) : 2;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(precision)}%`;
}
