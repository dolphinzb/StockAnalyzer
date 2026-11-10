/**
 * 将数组中指定下标的元素移动到目标位置
 * 越界或位置未变化时返回原数组的副本，不修改入参
 * @param items 原数组
 * @param from 起始下标
 * @param to 目标下标
 * @returns 移动后的新数组
 */
export function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  const result = items.slice();
  if (from === to) {
    return result;
  }
  if (from < 0 || from >= result.length || to < 0 || to >= result.length) {
    return result;
  }
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}

/**
 * 按给定的 id 顺序重排列表
 * 未出现在 orderedIds 中的项按原相对顺序追加到末尾，orderedIds 中不存在的 id 直接忽略
 * @param items 原列表
 * @param orderedIds 目标顺序的 id 列表
 * @returns 重排后的新数组
 */
export function applyOrder<T extends { id: number }>(items: T[], orderedIds: number[]): T[] {
  const remaining = new Map(items.map(item => [item.id, item]));
  const result: T[] = [];

  for (const id of orderedIds) {
    const item = remaining.get(id);
    if (item) {
      result.push(item);
      remaining.delete(id);
    }
  }

  for (const item of items) {
    if (remaining.has(item.id)) {
      result.push(item);
      remaining.delete(item.id);
    }
  }

  return result;
}
