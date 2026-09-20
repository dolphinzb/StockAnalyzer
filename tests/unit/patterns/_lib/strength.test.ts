import { describe, it, expect } from 'vitest';
import { clamp01, strengthByRatio, blendStrength, proximity } from '../../../../shared/patterns/_lib/strength';

describe('shared/patterns/_lib/strength', () => {
  describe('clamp01', () => {
    it('clamps negative values to 0', () => {
      expect(clamp01(-0.5)).toBe(0);
    });

    it('clamps values above 1 to 1', () => {
      expect(clamp01(1.5)).toBe(1);
    });

    it('passes through values in [0, 1]', () => {
      expect(clamp01(0.3)).toBe(0.3);
    });

    it('returns 0 for NaN', () => {
      expect(clamp01(Number.NaN)).toBe(0);
    });
  });

  describe('strengthByRatio', () => {
    it('returns 0 when actual <= minRequired', () => {
      expect(strengthByRatio(2, 2, 4)).toBe(0);
      expect(strengthByRatio(1, 2, 4)).toBe(0);
    });

    it('returns 1 when actual >= ideal', () => {
      expect(strengthByRatio(4, 2, 4)).toBe(1);
      expect(strengthByRatio(10, 2, 4)).toBe(1);
    });

    it('linearly interpolates between minRequired and ideal', () => {
      // (3 - 2) / (4 - 2) = 0.5
      expect(strengthByRatio(3, 2, 4)).toBeCloseTo(0.5, 6);
    });

    it('returns binary when ideal <= minRequired (degenerate)', () => {
      expect(strengthByRatio(3, 2, 2)).toBe(1);
      expect(strengthByRatio(1, 2, 2)).toBe(0);
    });
  });

  describe('blendStrength', () => {
    it('returns 0 for empty parts', () => {
      expect(blendStrength([])).toBe(0);
    });

    it('averages the inputs', () => {
      expect(blendStrength([0.4, 0.6])).toBeCloseTo(0.5, 6);
    });

    it('clamps inputs before averaging', () => {
      expect(blendStrength([-0.5, 1.5])).toBeCloseTo(0.5, 6);
    });
  });

  describe('proximity', () => {
    it('returns 1 when actual == target', () => {
      expect(proximity(0.5, 0.5, 0.1)).toBe(1);
    });

    it('returns 0 when diff >= tolerance', () => {
      expect(proximity(0.7, 0.5, 0.1)).toBe(0);
      expect(proximity(0.3, 0.5, 0.1)).toBe(0);
    });

    it('linearly interpolates inside tolerance', () => {
      // diff = 0.05, tolerance = 0.1 → 1 - 0.5 = 0.5
      expect(proximity(0.55, 0.5, 0.1)).toBeCloseTo(0.5, 6);
    });

    it('returns binary when tolerance <= 0', () => {
      expect(proximity(0.5, 0.5, 0)).toBe(1);
      expect(proximity(0.4, 0.5, 0)).toBe(0);
    });
  });

  describe('monotonicity for hammer (lower shadow / body)', () => {
    // 锤子线下影线 ≥ 2 倍实体为最低要求，≥ 3 倍实体为理想
    const body = 1;
    const lower = 2.5; // 介于 2 与 3 之间
    const strength = strengthByRatio(lower, 2 * body, 3 * body);
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeLessThan(1);

    const stronger = strengthByRatio(3.5, 2, 3);
    expect(stronger).toBeGreaterThan(strength);
  });

  describe('monotonicity for bullish_engulfing (curr/prev body ratio)', () => {
    // 吞没形态要求 curr 实体 ≥ 1.5 倍 prev；理想 ≥ 2 倍
    const weaker = strengthByRatio(1.6, 1.5, 2.0);
    const stronger = strengthByRatio(1.9, 1.5, 2.0);
    expect(stronger).toBeGreaterThan(weaker);
  });

  describe('monotonicity for morning_star (penetration)', () => {
    // 启明星要求末根阳线收盘 ≥ 中点 + 0.5 × 首根实体；理想 1.0
    const weaker = strengthByRatio(0.6, 0.5, 1.0);
    const stronger = strengthByRatio(0.85, 0.5, 1.0);
    expect(stronger).toBeGreaterThan(weaker);
  });
});