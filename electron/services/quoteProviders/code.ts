/**
 * 把证券代码归一化为 `sh` / `sz` / `bj` 前缀形式。
 *
 * 注意：`9` 开头并非全部属于北交所 —— 北交所新代码段是 `920xxx`，
 * 而 `900xxx` 是沪市 B 股，必须归为 `sh`。
 */
export function toPrefixedCode(stockCode: string): string {
  if (stockCode.startsWith('sh') || stockCode.startsWith('sz') || stockCode.startsWith('bj')) {
    return stockCode;
  }
  if (stockCode.startsWith('6') || stockCode.startsWith('5')) {
    return `sh${stockCode}`;
  }
  if (stockCode.startsWith('0') || stockCode.startsWith('1') || stockCode.startsWith('3')) {
    return `sz${stockCode}`;
  }
  // 北交所：8/4 为旧代码段，920 为 2024 年后的新代码段
  if (stockCode.startsWith('8') || stockCode.startsWith('4') || stockCode.startsWith('920')) {
    return `bj${stockCode}`;
  }
  // 9 开头中只有 920 属于北交所，其余（900xxx）为沪市 B 股
  if (stockCode.startsWith('9')) {
    return `sh${stockCode}`;
  }
  return `sz${stockCode}`;
}
