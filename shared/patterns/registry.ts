/**
 * 形态注册表
 * 通过 barrel import + spread 聚合所有形态定义
 * 新增 detector 时无需修改本文件，只需在对应 barrel 中 re-export
 */
import type { PatternDefinition } from '../types';

import * as single from './single';
import * as double from './double';
import * as triple from './triple';

/** 单根形态集合（每个文件导出名为 <patternKey>: PatternDefinition） */
const SINGLE_PATTERNS: PatternDefinition[] = Object.values(single);

/** 两根形态集合 */
const DOUBLE_PATTERNS: PatternDefinition[] = Object.values(double);

/** 三根及以上形态集合 */
const TRIPLE_PATTERNS: PatternDefinition[] = Object.values(triple);

/**
 * 全部形态注册表
 * 顺序：单根 → 两根 → 三根及以上
 * detectPatterns 按此顺序遍历
 */
export const REGISTRY: PatternDefinition[] = [
  ...SINGLE_PATTERNS,
  ...DOUBLE_PATTERNS,
  ...TRIPLE_PATTERNS,
];

/** 注册表统计常量（供测试与运行时校验） */
export const REGISTRY_COUNTS = {
  single: SINGLE_PATTERNS.length,
  double: DOUBLE_PATTERNS.length,
  triple: TRIPLE_PATTERNS.length,
  total: REGISTRY.length,
} as const;