import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Position } from '../types';

export const usePositionStore = defineStore('position', () => {
  const positions = ref<Position[]>([]);

  function updatePositions(newPositions: Position[]): void {
    positions.value = newPositions;
  }

  function handlePriceUpdate(stockCode: string, price: number): void {
    const position = positions.value.find(p => p.stockCode === stockCode);
    if (position) {
      position.currentPrice = price;
      if (position.holdingCount > 0 && position.holdingPrice > 0) {
        position.profitAmount = Math.round((price - position.holdingPrice) * position.holdingCount * 1000) / 1000;
        position.profitRatio = Math.round((price - position.holdingPrice) / position.holdingPrice * 10000) / 100;
      }
    }
  }

  function setupPriceListener(): () => void {
    const unsubPrice = window.stockWatcherAPI.onPriceUpdate((updates) => {
      updates.forEach(update => {
        handlePriceUpdate(update.stockCode, update.price);
      });
    });
    return unsubPrice;
  }

  return {
    positions,
    updatePositions,
    handlePriceUpdate,
    setupPriceListener,
  };
});