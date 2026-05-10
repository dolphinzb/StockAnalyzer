# Quickstart: 资金统计标签页开发

**Date**: 2026-05-09  
**Feature**: 016-fund-statistics

## Overview

本指南帮助开发者快速开始资金统计标签页的开发工作。该功能为资金管理页面增加第一个标签页，展示当前资金概览和60个月历史趋势。

## Prerequisites

- Node.js 18+ 
- npm 或 pnpm
- 已熟悉项目结构（Electron + Vue3 + TypeScript）
- 已阅读 [spec.md](./spec.md) 了解功能需求
- 已阅读 [data-model.md](./data-model.md) 了解数据结构

## Project Structure

```
specs/016-fund-statistics/
├── spec.md          # 功能规范
├── plan.md          # 实施计划
├── research.md      # 技术研究
├── data-model.md    # 数据模型
└── quickstart.md    # 本文件

src/
├── components/
│   └── FundStatistics.vue        # 新增：主组件
├── stores/
│   └── fundManagement.ts         # 扩展：新增API方法
electron/
├── services/
│   └── fundService.ts            # 扩展：新增服务方法
shared/types/
└── index.ts                      # 扩展：新增类型定义
```

## Development Steps

### Step 1: 扩展类型定义

**File**: `shared/types/index.ts`

添加以下类型定义：

```typescript
// 资金概览
export interface FundOverview {
  currentAccountBalance: number;
  currentHoldingsMarketValue: number;
  totalAssets: number;
}

// 月度资金数据
export interface MonthlyFundData {
  month: string; // YYYY-MM
  endOfMonthAccountBalance: number;
  endOfMonthHoldingsMarketValue: number;
  endOfMonthTotalAssets: number;
}

// 饼图数据项
export interface PieChartDataItem {
  label: string;
  value: number;
  color: string;
  percentage: number;
}
```

### Step 2: 扩展 Electron 服务层

**File**: `electron/services/fundService.ts`

新增两个方法：

```typescript
/**
 * 获取当前资金概览
 */
export async function getFundOverview(): Promise<FundOverview> {
  // 1. 获取最后一条transfer_records的accountBalance
  // 2. 获取当前所有持仓股票及holdingCount
  // 3. 获取各股票最新收盘价
  // 4. 计算持仓市值和总资产
}

/**
 * 获取过去60个月的月度资金数据
 */
export async function getMonthlyFundData(): Promise<MonthlyFundData[]> {
  // 1. 循环处理过去60个月
  // 2. 对每个月：
  //    - 获取月末账户余额
  //    - 获取月末持仓状态
  //    - 获取月末收盘价
  //    - 计算持仓市值
  // 3. 处理缺失数据（前值填充）
  // 4. 返回按月排序的数组
}
```

### Step 3: 扩展 IPC 接口

**File**: `electron/index.ts`

在 `handleFundManagementAPI` 中添加：

```typescript
ipcMain.handle('fund:getFundOverview', async () => {
  return await getFundOverview();
});

ipcMain.handle('fund:getMonthlyFundData', async () => {
  return await getMonthlyFundData();
});
```

**File**: `preload/index.ts`

在 `fundManagement` API 中添加：

```typescript
getFundOverview: () => ipcRenderer.invoke('fund:getFundOverview'),
getMonthlyFundData: () => ipcRenderer.invoke('fund:getMonthlyFundData'),
```

### Step 4: 扩展 Pinia Store

**File**: `src/stores/fundManagement.ts`

添加状态和方法：

```typescript
export const useFundManagementStore = defineStore('fundManagement', () => {
  // 现有状态...
  
  // 新增状态
  const fundOverview = ref<FundOverview | null>(null);
  const monthlyFundData = ref<MonthlyFundData[]>([]);
  const isLoadingOverview = ref(false);
  const isLoadingMonthly = ref(false);
  
  // 新增方法
  async function fetchFundOverview() {
    isLoadingOverview.value = true;
    try {
      fundOverview.value = await window.api.fundManagement.getFundOverview();
    } catch (error) {
      console.error('Failed to fetch fund overview:', error);
      throw error;
    } finally {
      isLoadingOverview.value = false;
    }
  }
  
  async function fetchMonthlyFundData() {
    isLoadingMonthly.value = true;
    try {
      monthlyFundData.value = await window.api.fundManagement.getMonthlyFundData();
    } catch (error) {
      console.error('Failed to fetch monthly fund data:', error);
      throw error;
    } finally {
      isLoadingMonthly.value = false;
    }
  }
  
  return {
    // 现有返回值...
    fundOverview,
    monthlyFundData,
    isLoadingOverview,
    isLoadingMonthly,
    fetchFundOverview,
    fetchMonthlyFundData,
  };
});
```

### Step 5: 扩展 useProfitChart Composable

**File**: `src/composables/useProfitChart.ts`

新增饼图绘制方法：

```typescript
const drawPieChart = (
  data: Array<{ label: string; value: number; color: string }>,
  options: { showLabels?: boolean; showPercentages?: boolean } = {}
) => {
  if (!canvasRef) return;
  
  const canvas = canvasRef;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // 处理DPR和Canvas尺寸
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  // 计算总价值
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  if (totalValue === 0) {
    // 显示"暂无数据"
    return;
  }
  
  // 绘制饼图
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const radius = Math.min(centerX, centerY) - 40; // 留边距
  
  let startAngle = -Math.PI / 2; // 从顶部开始
  
  data.forEach((item) => {
    const sliceAngle = (item.value / totalValue) * 2 * Math.PI;
    
    // 绘制扇区
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    
    // 可选：绘制标签和百分比
    if (options.showLabels) {
      // 计算标签位置（扇区中心）
      const labelAngle = startAngle + sliceAngle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
      const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      let labelText = item.label;
      if (options.showPercentages) {
        const percentage = ((item.value / totalValue) * 100).toFixed(1);
        labelText += `\n${percentage}%`;
      }
      ctx.fillText(labelText, labelX, labelY);
    }
    
    startAngle += sliceAngle;
  });
  
  // 设置鼠标事件监听（tooltip）
  setupPieChartMouseEvents(canvas, data, totalValue);
};
```

### Step 6: 创建 FundStatistics 组件

**File**: `src/components/FundStatistics.vue`

```vue
<template>
  <div class="fund-statistics">
    <!-- 加载状态 -->
    <div v-if="store.isLoadingOverview || store.isLoadingMonthly" class="loading">
      加载中...
    </div>
    
    <!-- 错误提示 -->
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="loadData">重试</button>
    </div>
    
    <!-- 正常显示 -->
    <template v-else>
      <!-- 数值卡片 -->
      <div class="overview-cards">
        <div class="card">
          <h3>账户余额</h3>
          <p class="amount">¥{{ formatAmount(store.fundOverview?.currentAccountBalance || 0) }}</p>
        </div>
        <div class="card">
          <h3>持仓金额</h3>
          <p class="amount">¥{{ formatAmount(store.fundOverview?.currentHoldingsMarketValue || 0) }}</p>
        </div>
      </div>
      
      <!-- 饼图 -->
      <div class="chart-container">
        <h3>资产分布</h3>
        <canvas ref="pieCanvasRef"></canvas>
        <!-- Tooltip -->
        <div v-if="pieTooltip.visible" class="tooltip" :style="{ left: pieTooltip.x + 'px', top: pieTooltip.y + 'px' }">
          <div>{{ pieTooltip.label }}</div>
          <div>¥{{ formatAmount(pieTooltip.value) }} ({{ pieTooltip.percentage }}%)</div>
        </div>
      </div>
      
      <!-- 折线图 -->
      <div class="chart-container">
        <h3>历史趋势（过去60个月）</h3>
        <canvas ref="lineCanvasRef"></canvas>
        <!-- Tooltip -->
        <div v-if="lineTooltip.visible" class="tooltip" :style="{ left: lineTooltip.x + 'px', top: lineTooltip.y + 'px' }">
          <div>{{ lineTooltip.label }}</div>
          <div>账户余额: ¥{{ formatAmount(lineTooltip.accountBalance) }}</div>
          <div>持仓金额: ¥{{ formatAmount(lineTooltip.holdingsValue) }}</div>
          <div>总资产: ¥{{ formatAmount(lineTooltip.totalAssets) }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useFundManagementStore } from '../stores/fundManagement';
import { useProfitChart } from '../composables/useProfitChart';

const store = useFundManagementStore();
const error = ref<string | null>(null);

const pieCanvasRef = ref<HTMLCanvasElement | null>(null);
const lineCanvasRef = ref<HTMLCanvasElement | null>(null);

const pieTooltip = ref({ visible: false, x: 0, y: 0, label: '', value: 0, percentage: 0 });
const lineTooltip = ref({ visible: false, x: 0, y: 0, label: '', accountBalance: 0, holdingsValue: 0, totalAssets: 0 });

let pieChart: ReturnType<typeof useProfitChart>;
let lineChart: ReturnType<typeof useProfitChart>;

const formatAmount = (amount: number): string => {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const loadData = async () => {
  error.value = null;
  try {
    await Promise.all([
      store.fetchFundOverview(),
      store.fetchMonthlyFundData()
    ]);
    
    // 绘制饼图
    if (store.fundOverview) {
      const pieData = [
        { 
          label: '账户余额', 
          value: store.fundOverview.currentAccountBalance, 
          color: '#3b82f6' 
        },
        { 
          label: '持仓金额', 
          value: store.fundOverview.currentHoldingsMarketValue, 
          color: '#f97316' 
        }
      ];
      pieChart.drawPieChart(pieData, { showLabels: true, showPercentages: true });
    }
    
    // 绘制折线图
    if (store.monthlyFundData.length > 0) {
      const lineData = store.monthlyFundData.map(item => ({
        label: item.month,
        accountBalance: item.endOfMonthAccountBalance,
        holdingsValue: item.endOfMonthHoldingsMarketValue,
        totalAssets: item.endOfMonthTotalAssets
      }));
      lineChart.drawMultiLineChart(lineData); // 需要实现多折线绘制
    }
  } catch (err) {
    error.value = '加载数据失败，请重试';
    console.error(err);
  }
};

onMounted(() => {
  pieChart = useProfitChart(pieCanvasRef.value);
  lineChart = useProfitChart(lineCanvasRef.value);
  loadData();
});
</script>

<style scoped lang="scss">
.fund-statistics {
  padding: 20px;
  
  .overview-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-bottom: 30px;
    
    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      
      h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
        color: #6b7280;
      }
      
      .amount {
        margin: 0;
        font-size: 24px;
        font-weight: bold;
        color: #111827;
      }
    }
  }
  
  .chart-container {
    position: relative;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
    
    h3 {
      margin: 0 0 15px 0;
      font-size: 16px;
      color: #374151;
    }
    
    canvas {
      width: 100%;
      height: 300px;
    }
  }
  
  .loading, .error {
    text-align: center;
    padding: 40px;
    color: #6b7280;
  }
  
  .error {
    button {
      margin-top: 10px;
      padding: 8px 16px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      
      &:hover {
        background: #2563eb;
      }
    }
  }
  
  .tooltip {
    position: fixed;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    transform: translate(-50%, -100%);
    margin-top: -10px;
  }
}
</style>
```

### Step 7: 调整标签页顺序

**File**: `src/views/FundManagementView.vue`

修改模板中的标签顺序：

```vue
<div class="tab-navigation">
  <button
    class="tab-button"
    :class="{ active: activeTab === 'statistics' }"
    @click="activeTab = 'statistics'"
  >
    资金统计
  </button>
  <button
    class="tab-button"
    :class="{ active: activeTab === 'transfers' }"
    @click="activeTab = 'transfers'"
  >
    资金明细
  </button>
  <button
    class="tab-button"
    :class="{ active: activeTab === 'profit' }"
    @click="activeTab = 'profit'"
  >
    盈亏统计
  </button>
</div>

<!-- 资金统计标签页 -->
<div v-if="activeTab === 'statistics'" class="tab-content">
  <FundStatistics />
</div>

<!-- 资金明细标签页 -->
<div v-else-if="activeTab === 'transfers'" class="tab-content">
  <TransferRecordList ... />
</div>

<!-- 盈亏统计标签页 -->
<div v-else-if="activeTab === 'profit'" class="tab-content">
  <ProfitStatistics />
</div>
```

导入新组件：

```typescript
import FundStatistics from '../components/FundStatistics.vue';
```

初始化 activeTab：

```typescript
const activeTab = ref('statistics'); // 默认显示资金统计
```

## Testing

### Manual Testing Checklist

- [ ] 页面加载后自动显示资金统计数据
- [ ] 数值卡片正确显示账户余额和持仓金额
- [ ] 饼图正确显示占比，鼠标悬停显示tooltip
- [ ] 折线图显示60个月数据，鼠标悬停显示详细信息
- [ ] 无数据时显示友好提示
- [ ] 错误时显示Modal并允许重试
- [ ] 标签页顺序正确：资金统计 → 资金明细 → 盈亏统计

### Performance Testing

- [ ] 页面加载时间 < 3秒
- [ ] 饼图和折线图渲染流畅
- [ ] 鼠标悬停tooltip响应时间 < 0.3秒

## Common Issues

### Issue 1: Canvas 图表不显示

**Symptom**: Canvas元素存在但图表未绘制

**Solution**:
- 检查Canvas宽高是否正确设置
- 确认DPR处理逻辑
- 检查数据是否为空

### Issue 2: 月度数据查询慢

**Symptom**: 加载60个月数据超过3秒

**Solution**:
- 检查数据库索引是否创建
- 优化SQL查询，避免N+1问题
- 考虑批量查询kline_data

### Issue 3: Tooltip 位置不准确

**Symptom**: Tooltip显示位置偏离鼠标位置

**Solution**:
- 检查坐标计算逻辑（考虑DPR）
- 确认使用的是clientX/clientY而非offsetX/offsetY

## Next Steps

完成以上步骤后：

1. 运行应用测试功能
2. 根据测试结果调整样式和交互
3. 编写单元测试（如需要）
4. 提交代码审查

## References

- [spec.md](./spec.md) - 功能规范
- [plan.md](./plan.md) - 实施计划
- [data-model.md](./data-model.md) - 数据模型
- [research.md](./research.md) - 技术研究
