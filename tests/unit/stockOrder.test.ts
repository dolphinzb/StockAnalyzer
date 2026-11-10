import { describe, expect, it } from 'vitest';
import { applyOrder, moveArrayItem } from '../../src/utils/stockOrder';

/** 构造带 id 的测试项 */
function createItems(ids: number[]): Array<{ id: number; label: string }> {
  return ids.map(id => ({ id, label: `股票${id}` }));
}

describe('moveArrayItem', () => {
  it('向上移动元素', () => {
    const result = moveArrayItem(['a', 'b', 'c', 'd'], 2, 0);
    expect(result).toEqual(['c', 'a', 'b', 'd']);
  });

  it('向下移动元素', () => {
    const result = moveArrayItem(['a', 'b', 'c', 'd'], 0, 2);
    expect(result).toEqual(['b', 'c', 'a', 'd']);
  });

  it('位置未变化时返回内容相同的副本', () => {
    const items = ['a', 'b', 'c'];
    const result = moveArrayItem(items, 1, 1);
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it('越界下标时返回原数组副本且不修改入参', () => {
    const items = ['a', 'b', 'c'];
    expect(moveArrayItem(items, -1, 1)).toEqual(items);
    expect(moveArrayItem(items, 0, 3)).toEqual(items);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('applyOrder', () => {
  it('按给定 id 顺序重排', () => {
    const items = createItems([1, 2, 3]);
    const result = applyOrder(items, [3, 1, 2]);
    expect(result.map(item => item.id)).toEqual([3, 1, 2]);
  });

  it('orderedIds 缺少的项按原相对顺序追加到末尾', () => {
    const items = createItems([1, 2, 3, 4]);
    const result = applyOrder(items, [4, 2]);
    expect(result.map(item => item.id)).toEqual([4, 2, 1, 3]);
  });

  it('orderedIds 中不存在的 id 被忽略', () => {
    const items = createItems([1, 2]);
    const result = applyOrder(items, [99, 2, 1]);
    expect(result.map(item => item.id)).toEqual([2, 1]);
  });

  it('空 orderedIds 时保持原顺序', () => {
    const items = createItems([1, 2, 3]);
    const result = applyOrder(items, []);
    expect(result.map(item => item.id)).toEqual([1, 2, 3]);
  });

  it('不修改入参数组', () => {
    const items = createItems([1, 2, 3]);
    applyOrder(items, [3, 2, 1]);
    expect(items.map(item => item.id)).toEqual([1, 2, 3]);
  });
});
