<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import AppIcon from '../components/ui/AppIcon.vue';
import { useToast } from '../composables/useToast';
import { runGridSimulation } from '../composables/useGridSimulation';
import type {
  GridSimulationInput,
  GridSimulationResult,
  GridSpacingType,
  KlineData
} from '../types';

defineOptions({
  name: 'GridSimulationView'
});

const { showToast } = useToast();

const form = reactive({
  startDate: '',
  stockCode: '',
  initialCapital: '',
  upperLimit: '',
  lowerLimit: '',
  spacing: '',
  spacingType: 'fixed' as GridSpacingType,
  gridStrategy: 'strategy1' as 'strategy1' | 'strategy2' | 'strategy3' | 'strategy4' | 'strategy5',
  sharesPerGrid: '', // 留空表示按 初始资金/档位数/触发价 自动估算
  buyThreshold: '', // 阈值全仓策略（strategy5）：股价 ≤ 此价全仓买入
  sellThreshold: '', // 阈值全仓策略（strategy5）：股价 ≥ 此价清仓卖出
  // 费用（可选，带默认值）
  commissionRate: '0.00025',
  minFee: '5',
  stampTaxRate: '0.0005',
  dividendPerShare: '0'
});

const result = ref<GridSimulationResult | null>(null);
const isRunning = ref(false);

const totalAssetsSeries = computed(() => {
  if (!result.value) return [];
  // 以每日收盘价近似总资产曲线用于最大回撤已在算法内计算，这里仅展示期末快照无需序列
  return [];
});

const fmt = (n: number, digits = 2) => n.toFixed(digits);

const profitClass = (v: number) => {
  if (v > 0) return 'profit-up'; // 红
  if (v < 0) return 'profit-down'; // 绿
  return 'profit-flat';
};

const typeLabel = (t: string) => {
  if (t === 'BUY') return '买入';
  if (t === 'SELL') return '卖出';
  return '分红';
};

const typeClass = (t: string) => {
  if (t === 'BUY') return 'status-tag-buy';
  if (t === 'SELL') return 'status-tag-sell';
  return 'status-tag-dividend';
};

const gridStrategyTip =
  '网格策略1（整批清仓）：上涨穿越时一次性卖出栈顶批次的全部持仓。\n' +
  '网格策略2（分步减仓）：上涨穿越时，对所有已穿越待减批次各卖出其买入量的一半（分两段减仓）。\n' +
  '网格策略3（隔两档卖出）：与策略1同为整批清仓，但需上穿「高两档」才卖（如 4.2 买入→上穿 4.6 卖出，4.4 买入→上穿 4.8 卖出）。\n' +
  '网格策略4（半仓平衡）：不依赖网格，按日收盘做半仓再平衡——目标持仓金额 = 可用资金 / 2，偏差超 ±5% 时按差额动态买卖。\n' +
  '网格策略5（阈值全仓）：不依赖网格，仅用两个触发价做全仓/空仓切换——空仓且收盘价 ≤ 买入触发价则全仓买入，持仓且收盘价 ≥ 卖出触发价则清仓卖出。';

const strategyLabel = computed(() => {
  switch (form.gridStrategy) {
    case 'strategy1': return '网格策略1（整批清仓）';
    case 'strategy2': return '网格策略2（分步减仓）';
    case 'strategy3': return '网格策略3（隔两档卖出）';
    case 'strategy4': return '网格策略4（半仓平衡）';
    case 'strategy5': return '网格策略5（阈值全仓）';
    default: return '网格策略1（整批清仓）';
  }
});

  const validate = (): string | null => {
  if (!form.startDate) return '请选择开始日期';
  if (!form.stockCode) return '请输入股票代码';
  const initialCapital = parseFloat(form.initialCapital);
  if (!initialCapital || initialCapital <= 0) return '初始资金必须大于 0';

  // 阈值全仓（strategy5）：不依赖网格，校验两个触发价
  if (form.gridStrategy === 'strategy5') {
    const buyT = parseFloat(form.buyThreshold);
    const sellT = parseFloat(form.sellThreshold);
    if (!buyT || buyT <= 0) return '请填写买入触发价（须 > 0）';
    if (!sellT || sellT <= 0) return '请填写卖出触发价（须 > 0）';
    if (sellT <= buyT) return '卖出触发价须高于买入触发价';
    return null;
  }

  // 半仓平衡（strategy4）不依赖网格：跳过网格专属参数校验
  if (form.gridStrategy === 'strategy4') return null;

  const upper = parseFloat(form.upperLimit);
  const lower = parseFloat(form.lowerLimit);
  const spacing = parseFloat(form.spacing);
  if (!upper || !lower) return '请填写网格上下限';
  if (upper <= lower) return '网格上限必须大于下限';
  if (!spacing || spacing <= 0) return '网格间距必须大于 0';
  // 每格股数可留空（自动估算）；若填写则必须大于 0
  const sharesRaw = form.sharesPerGrid.trim();
  if (sharesRaw !== '' && (!(parseFloat(sharesRaw) > 0))) {
    return '每格股数必须大于 0（或留空自动估算）';
  }
  return null;
};

const buildInput = (): GridSimulationInput => {
  const sharesRaw = form.sharesPerGrid.trim();
  // 半仓平衡（strategy4）/ 阈值全仓（strategy5）不依赖网格参数，给合法默认兜底（引擎会忽略这些字段）
  const skipGrid = form.gridStrategy === 'strategy4' || form.gridStrategy === 'strategy5';
  return {
    startDate: form.startDate,
    stockCode: form.stockCode.trim(),
    initialCapital: parseFloat(form.initialCapital),
    upperLimit: skipGrid ? 0 : parseFloat(form.upperLimit),
    lowerLimit: skipGrid ? 0 : parseFloat(form.lowerLimit),
    spacing: skipGrid ? 1 : parseFloat(form.spacing),
    spacingType: form.spacingType,
    gridStrategy: form.gridStrategy,
    sharesPerGrid: sharesRaw === '' ? null : parseFloat(sharesRaw),
    commissionRate: parseFloat(form.commissionRate) || 0.00025,
    minFee: parseFloat(form.minFee) || 5,
    stampTaxRate: parseFloat(form.stampTaxRate) || 0.0005,
    dividendPerShare: parseFloat(form.dividendPerShare) || 0,
    buyThreshold: form.buyThreshold ? parseFloat(form.buyThreshold) : null,
    sellThreshold: form.sellThreshold ? parseFloat(form.sellThreshold) : null
  };
};

const runSimulation = async () => {
  const err = validate();
  if (err) {
    showToast(err, 'info');
    return;
  }

  isRunning.value = true;
  result.value = null;
  try {
    const input = buildInput();
    // 获取不复权日 K 数据（adjustType = '' 表示不复权，period = 'd' 固定日线），再按开始日期过滤
    const allKlines = await window.klineAPI.getChartData(input.stockCode, '', 'd');
    const klines = allKlines.filter(k => k.tradeDate >= input.startDate);
    if (!klines || klines.length === 0) {
      showToast('该股票历史数据不足', 'error');
      return;
    }
    // 清洗 K 线：确保价格为数值类型（数据库/序列化可能返回字符串或 null），并跳过无收盘价的交易日
    const cleaned: KlineData[] = [];
    for (const k of klines) {
      const close = typeof k.close === 'string' ? parseFloat(k.close) : k.close;
      if (close == null || Number.isNaN(close)) continue;
      cleaned.push({
        ...k,
        close,
        open: typeof k.open === 'string' ? parseFloat(k.open) : k.open,
        high: typeof k.high === 'string' ? parseFloat(k.high) : k.high,
        low: typeof k.low === 'string' ? parseFloat(k.low) : k.low,
      });
    }
    if (cleaned.length === 0) {
      showToast('该股票无有效收盘价数据', 'error');
      return;
    }
    const res = runGridSimulation(input, cleaned);
    result.value = res;
    showToast('仿真完成', 'success');
  } catch (error) {
    console.error('仿真错误:', error);
    showToast('仿真失败', 'error');
  } finally {
    isRunning.value = false;
  }
};

const reset = () => {
  result.value = null;
};

// 避免未使用变量告警
void totalAssetsSeries.value;
</script>

<template>
  <div class="page grid-sim-view">
    <div class="card">
      <div class="card-header">
        <span>网格交易仿真参数</span>
      </div>
      <div class="form-grid">
        <div class="form-item">
          <label class="form-label">开始日期</label>
          <input class="input" v-model="form.startDate" type="date" />
        </div>
        <div class="form-item">
          <label class="form-label">股票代码</label>
          <input class="input" v-model="form.stockCode" type="text" placeholder="如 000001" />
        </div>
        <div class="form-item">
          <label class="form-label">初始资金</label>
          <input class="input" v-model="form.initialCapital" type="number" placeholder="如 100000" />
        </div>
        <!-- 网格类策略（strategy1/2/3）才显示网格参数 -->
        <template v-if="['strategy1', 'strategy2', 'strategy3'].includes(form.gridStrategy)">
          <div class="form-item">
            <label class="form-label">网格上限</label>
            <input class="input" v-model="form.upperLimit" type="number" step="0.01" placeholder="如 15" />
          </div>
          <div class="form-item">
            <label class="form-label">网格下限</label>
            <input class="input" v-model="form.lowerLimit" type="number" step="0.01" placeholder="如 8" />
          </div>
          <div class="form-item">
            <label class="form-label">网格间距</label>
            <input class="input" v-model="form.spacing" type="number" step="0.01" placeholder="如 1 或 0.05" />
          </div>
          <div class="form-item">
            <label class="form-label">间距类型</label>
            <select class="select" v-model="form.spacingType">
              <option value="fixed">固定金额</option>
              <option value="percentage">百分比(等比)</option>
            </select>
          </div>
          <div class="form-item">
            <label class="form-label">每格股数(留空自动)</label>
            <input class="input" v-model="form.sharesPerGrid" type="number" step="100" placeholder="留空=自动估算" />
            <span class="hint">留空时按「初始资金 ÷ 档位数 ÷ 触发价」估算并取整到100股</span>
          </div>
        </template>

        <!-- 阈值全仓策略（strategy5）才显示两个触发价 -->
        <template v-if="form.gridStrategy === 'strategy5'">
          <div class="form-item">
            <label class="form-label">买入触发价</label>
            <input class="input" v-model="form.buyThreshold" type="number" step="0.01" placeholder="股价 ≤ 此价则全仓买入" />
          </div>
          <div class="form-item">
            <label class="form-label">卖出触发价</label>
            <input class="input" v-model="form.sellThreshold" type="number" step="0.01" placeholder="股价 ≥ 此价则清仓卖出" />
          </div>
        </template>

        <!-- 半仓平衡策略（strategy4）说明 -->
        <div class="form-item" v-if="form.gridStrategy === 'strategy4'">
          <label class="form-label">策略说明</label>
          <span class="hint">半仓平衡不依赖网格：每日以收盘价做一次再平衡，目标持仓 = 可用资金 / 2，偏差超 ±5% 才买卖。</span>
        </div>

        <!-- 策略选择（始终显示） -->
        <div class="form-item">
          <label class="form-label">
            <span>网格策略</span>
            <span class="help-icon" tabindex="0" aria-label="网格策略说明">
              <AppIcon name="help" :size="16" />
              <span class="tooltip-pop">{{ gridStrategyTip }}</span>
            </span>
          </label>
          <select class="select" v-model="form.gridStrategy">
            <option value="strategy1">网格策略1（整批清仓）</option>
            <option value="strategy2">网格策略2（分步减仓）</option>
            <option value="strategy3">网格策略3（隔两档卖出）</option>
            <option value="strategy4">网格策略4（半仓平衡）</option>
            <option value="strategy5">网格策略5（阈值全仓）</option>
          </select>
        </div>
        <div class="form-item">
          <label class="form-label">手续费率</label>
          <input class="input" v-model="form.commissionRate" type="number" step="0.00001" placeholder="0.00025" />
        </div>
        <div class="form-item">
          <label class="form-label">最低手续费</label>
          <input class="input" v-model="form.minFee" type="number" step="0.01" placeholder="5" />
        </div>
        <div class="form-item">
          <label class="form-label">印花税(卖出)</label>
          <input class="input" v-model="form.stampTaxRate" type="number" step="0.00001" placeholder="0.0005" />
        </div>
        <div class="form-item">
          <label class="form-label">每股年股息(预留)</label>
          <input class="input" v-model="form.dividendPerShare" type="number" step="0.01" placeholder="0" :disabled="true" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" :disabled="isRunning" @click="runSimulation">
          {{ isRunning ? '仿真中...' : '开始仿真' }}
        </button>
        <button class="btn btn-secondary" @click="reset">重置</button>
      </div>
    </div>

    <div v-if="result" class="card result-card">
      <div class="card-header">
        <span>仿真结果</span>
      </div>

      <div class="metrics-row">
        <div class="metric-card">
          <div class="metric-title">期末总资产</div>
          <div class="metric-value">¥{{ fmt(result.finalTotalAssets) }}</div>
          <div class="metric-detail">期末现金: ¥{{ fmt(result.finalCash) }}</div>
          <div class="metric-detail">期末持仓: {{ result.finalHolding }} 股</div>
          <div class="metric-detail">期末价: ¥{{ fmt(result.finalPrice) }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">总收益</div>
          <div class="metric-value" :class="profitClass(result.totalProfit)">
            {{ result.totalProfit > 0 ? '+' : '' }}¥{{ fmt(result.totalProfit) }}
          </div>
          <div class="metric-detail" :class="profitClass(result.totalProfitRate)">
            收益率: {{ result.totalProfitRate > 0 ? '+' : '' }}{{ fmt(result.totalProfitRate) }}%
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-title">年化收益率</div>
          <div class="metric-value" :class="profitClass(result.annualizedReturn)">
            {{ result.annualizedReturn > 0 ? '+' : '' }}{{ fmt(result.annualizedReturn) }}%
          </div>
          <div class="metric-detail">按自然日计算</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">最大回撤</div>
          <div class="metric-value">{{ fmt(result.maxDrawdown) }}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">交易笔数</div>
          <div class="metric-value">{{ result.tradeCount }}</div>
        </div>
      </div>

      <div class="strategy-card">
        <div class="strategy-title">简化假设说明</div>
        <div class="strategy-content">
          <ul>
            <li>单日多档穿越时，按相邻档位游标每日最多成交一次（保守模型）</li>
            <li>年化收益率按自然日口径（含周末/停牌日）</li>
            <li>首版不含分红：不生成分红记录、不计入现金</li>
            <li>使用不复权数据，忽略除权影响（除权跳变当作普通网格穿越）</li>
            <li>当前策略：{{ strategyLabel }}</li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="result" class="card">
      <div class="card-header">
        <span>操作历史 ({{ result.operations.length }})</span>
      </div>
      <div class="table-wrap">
        <table class="op-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>类型</th>
              <th>成交价</th>
              <th>数量</th>
              <th>手续费</th>
              <th>操作后现金</th>
              <th>操作后持仓</th>
              <th>操作后市值</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(op, i) in result.operations" :key="i">
              <td>{{ op.date }}</td>
              <td><span :class="['status-tag', typeClass(op.type), { 'status-tag-virtual': op.virtual }]">{{ typeLabel(op.type) }}<template v-if="op.virtual"> (虚拟)</template></span></td>
              <td>¥{{ fmt(op.price) }}</td>
              <td>{{ op.shares }}</td>
              <td>¥{{ fmt(op.fee) }}</td>
              <td>¥{{ fmt(op.cashAfter) }}</td>
              <td>{{ op.holdingAfter }}</td>
              <td>¥{{ fmt(op.holdingValueAfter) }}</td>
            </tr>
            <tr v-if="result.operations.length === 0">
              <td colspan="8" class="empty">该区间内未触发任何网格交易</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// 页面骨架、卡片、按钮、表单控件均由全局基础类提供，此处只保留该页特有布局
.grid-sim-view {
  gap: var(--space-4);
  overflow: auto;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

// 表单控件不设最小宽度，由网格列宽决定
.form-item {
  > .input,
  > .select {
    min-width: 0;
  }

  .hint {
    font-size: var(--font-size-xs);
    line-height: var(--line-height-tight);
    color: var(--text-tertiary);
  }

  // 帮助图标：图形由 AppIcon 提供，此处只负责定位与悬浮提示
  .help-icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: var(--space-1);
    color: var(--text-tertiary);
    cursor: help;
    outline: none;

    &:hover,
    &:focus {
      color: var(--color-primary);
    }

    .tooltip-pop {
      visibility: hidden;
      opacity: 0;
      position: absolute;
      top: 150%;
      right: 0;
      z-index: var(--z-dropdown);
      width: max-content;
      max-width: 280px;
      padding: var(--space-2) var(--space-3);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-normal);
      line-height: var(--line-height-base);
      color: var(--chart-tooltip-text);
      text-align: left;
      white-space: pre-line;
      background: var(--chart-tooltip-bg);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      transition: opacity 0.15s ease;
      pointer-events: none;
    }

    &:hover .tooltip-pop,
    &:focus .tooltip-pop {
      visibility: visible;
      opacity: 1;
    }
  }
}

.form-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.result-card {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.metric-card {
  padding: var(--space-4);
  text-align: center;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.metric-title {
  margin-bottom: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.metric-value {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.metric-detail {
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.profit-up {
  color: var(--color-profit);
}

.profit-down {
  color: var(--color-loss);
}

.profit-flat {
  color: var(--text-tertiary);
}

.strategy-card {
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.strategy-title {
  margin-bottom: var(--space-2);
  font-weight: var(--font-weight-semibold);
}

.strategy-content {
  font-size: var(--font-size-sm);
  line-height: var(--line-height-loose);

  ul {
    margin: var(--space-2) 0;
    padding-left: var(--space-5);

    li {
      margin: var(--space-1) 0;
    }
  }
}

.table-wrap {
  max-height: 400px;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.op-table {
  width: 100%;
  font-size: var(--font-size-xs);
  border-collapse: collapse;

  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid var(--border-color);
  }

  th:first-child,
  td:first-child,
  th:nth-child(2),
  td:nth-child(2) {
    text-align: left;
  }

  thead th {
    position: sticky;
    top: 0;
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
    background: var(--card-bg);
  }

  tbody tr:hover {
    background: var(--bg-hover);
  }

  .empty {
    padding: var(--space-5);
    text-align: center;
    color: var(--text-secondary);
  }
}

// 操作类型状态标签（与全局 .tag 区分：此处为方角状态标记）
.status-tag {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-sm);

  &.status-tag-buy {
    background: var(--bg-danger-subtle);
    color: var(--color-buy);
  }

  &.status-tag-sell {
    background: var(--bg-success-subtle);
    color: var(--color-sell);
  }

  &.status-tag-dividend {
    background: var(--bg-info-subtle);
    color: var(--color-info);
  }

  &.status-tag-virtual {
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
    border: 1px dashed var(--border-color-strong);
  }
}
</style>
