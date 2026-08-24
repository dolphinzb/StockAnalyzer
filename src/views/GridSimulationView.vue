<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useToast } from '../composables/useToast';
import { runGridSimulation } from '../composables/useGridSimulation';
import type {
  GridSimulationInput,
  GridSimulationResult,
  GridSpacingType
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
  gridStrategy: 'strategy1' as 'strategy1' | 'strategy2' | 'strategy3',
  sharesPerGrid: '', // 留空表示按 初始资金/档位数/触发价 自动估算
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
  if (t === 'BUY') return 'tag-buy';
  if (t === 'SELL') return 'tag-sell';
  return 'tag-dividend';
};

const gridStrategyTip =
  '网格策略1（整批清仓）：上涨穿越时一次性卖出栈顶批次的全部持仓。\n' +
  '网格策略2（分步减仓）：上涨穿越时，对所有已穿越待减批次各卖出其买入量的一半（分两段减仓）。\n' +
  '网格策略3（隔两档卖出）：与策略1同为整批清仓，但需上穿「高两档」才卖（如 4.2 买入→上穿 4.6 卖出，4.4 买入→上穿 4.8 卖出）。';

const validate = (): string | null => {
  if (!form.startDate) return '请选择开始日期';
  if (!form.stockCode) return '请输入股票代码';
  const initialCapital = parseFloat(form.initialCapital);
  const upper = parseFloat(form.upperLimit);
  const lower = parseFloat(form.lowerLimit);
  const spacing = parseFloat(form.spacing);
  if (!initialCapital || initialCapital <= 0) return '初始资金必须大于 0';
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
  return {
    startDate: form.startDate,
    stockCode: form.stockCode.trim(),
    initialCapital: parseFloat(form.initialCapital),
    upperLimit: parseFloat(form.upperLimit),
    lowerLimit: parseFloat(form.lowerLimit),
    spacing: parseFloat(form.spacing),
    spacingType: form.spacingType,
    gridStrategy: form.gridStrategy,
    sharesPerGrid: sharesRaw === '' ? null : parseFloat(sharesRaw),
    commissionRate: parseFloat(form.commissionRate) || 0.00025,
    minFee: parseFloat(form.minFee) || 5,
    stampTaxRate: parseFloat(form.stampTaxRate) || 0.0005,
    dividendPerShare: parseFloat(form.dividendPerShare) || 0
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
    // 获取不复权日 K 数据（adjustType = '' 表示不复权），再按开始日期过滤
    const allKlines = await window.klineAPI.getChartData(input.stockCode, '');
    const klines = allKlines.filter(k => k.tradeDate >= input.startDate);
    if (!klines || klines.length === 0) {
      showToast('该股票历史数据不足', 'error');
      return;
    }
    const res = runGridSimulation(input, klines);
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
void totalAssetsSeries;
</script>

<template>
  <div class="grid-sim-view">
    <div class="card">
      <div class="card-header">
        <span>网格交易仿真参数</span>
      </div>
      <div class="form-grid">
        <div class="form-item">
          <label>开始日期</label>
          <input v-model="form.startDate" type="date" />
        </div>
        <div class="form-item">
          <label>股票代码</label>
          <input v-model="form.stockCode" type="text" placeholder="如 000001" />
        </div>
        <div class="form-item">
          <label>初始资金</label>
          <input v-model="form.initialCapital" type="number" placeholder="如 100000" />
        </div>
        <div class="form-item">
          <label>网格上限</label>
          <input v-model="form.upperLimit" type="number" step="0.01" placeholder="如 15" />
        </div>
        <div class="form-item">
          <label>网格下限</label>
          <input v-model="form.lowerLimit" type="number" step="0.01" placeholder="如 8" />
        </div>
        <div class="form-item">
          <label>网格间距</label>
          <input v-model="form.spacing" type="number" step="0.01" placeholder="如 1 或 0.05" />
        </div>
        <div class="form-item">
          <label>间距类型</label>
          <select v-model="form.spacingType">
            <option value="fixed">固定金额</option>
            <option value="percentage">百分比(等比)</option>
          </select>
        </div>
        <div class="form-item">
          <label>
            <span>网格策略</span>
            <span class="help-icon" tabindex="0" aria-label="网格策略说明">?
              <span class="tooltip-pop">{{ gridStrategyTip }}</span>
            </span>
          </label>
          <select v-model="form.gridStrategy">
            <option value="strategy1">网格策略1（整批清仓）</option>
            <option value="strategy2">网格策略2（分步减仓）</option>
            <option value="strategy3">网格策略3（隔两档卖出）</option>
          </select>
        </div>
        <div class="form-item">
          <label>每格股数(留空自动)</label>
          <input v-model="form.sharesPerGrid" type="number" step="100" placeholder="留空=自动估算" />
          <span class="hint">留空时按「初始资金 ÷ 档位数 ÷ 触发价」估算并取整到100股</span>
        </div>
        <div class="form-item">
          <label>手续费率</label>
          <input v-model="form.commissionRate" type="number" step="0.00001" placeholder="0.00025" />
        </div>
        <div class="form-item">
          <label>最低手续费</label>
          <input v-model="form.minFee" type="number" step="0.01" placeholder="5" />
        </div>
        <div class="form-item">
          <label>印花税(卖出)</label>
          <input v-model="form.stampTaxRate" type="number" step="0.00001" placeholder="0.0005" />
        </div>
        <div class="form-item">
          <label>每股年股息(预留)</label>
          <input v-model="form.dividendPerShare" type="number" step="0.01" placeholder="0" :disabled="true" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-primary" :disabled="isRunning" @click="runSimulation">
          {{ isRunning ? '仿真中...' : '开始仿真' }}
        </button>
        <button class="btn-secondary" @click="reset">重置</button>
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
            <li>当前策略：{{ form.gridStrategy === 'strategy2' ? '网格策略2（分步减仓）' : form.gridStrategy === 'strategy3' ? '网格策略3（隔两档卖出）' : '网格策略1（整批清仓）' }}</li>
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
              <td><span :class="['tag', typeClass(op.type), { 'tag-virtual': op.virtual }]">{{ typeLabel(op.type) }}<template v-if="op.virtual"> (虚拟)</template></span></td>
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
.grid-sim-view {
  padding: 1rem;
  height: 100%;
  overflow: auto;
}

.card {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1rem;
}

.card-header {
  font-weight: bold;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .hint {
    font-size: 11px;
    color: var(--text-tertiary, #aaa);
    line-height: 1.3;
  }

  .help-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    margin-left: 4px;
    border-radius: 50%;
    background: var(--text-tertiary, #aaa);
    color: #fff;
    font-size: 10px;
    font-weight: bold;
    cursor: help;
    position: relative;
    outline: none;

    .tooltip-pop {
      visibility: hidden;
      opacity: 0;
      position: absolute;
      top: 150%;
      right: 0;
      z-index: 50;
      width: max-content;
      max-width: 280px;
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      background: #303133;
      color: #fff;
      font-size: 12px;
      font-weight: normal;
      line-height: 1.5;
      white-space: pre-line;
      text-align: left;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      transition: opacity 0.15s ease;
      pointer-events: none;
    }

    &:hover .tooltip-pop,
    &:focus .tooltip-pop {
      visibility: visible;
      opacity: 1;
    }
  }

  input, select {
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 14px;
    background: var(--input-bg);
    color: var(--text-color);

    &:focus {
      outline: none;
      border-color: var(--primary-color);
    }
  }
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.btn-primary {
  padding: 0.5rem 1.5rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: var(--color-primary-dark);
  }
}

.btn-secondary {
  padding: 0.5rem 1.5rem;
  background: var(--secondary-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: var(--hover-bg);
  }
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
  gap: 1rem;
  margin-bottom: 1rem;
}

.metric-card {
  padding: 1rem;
  background: var(--secondary-bg);
  border-radius: 6px;
  text-align: center;
}

.metric-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.metric-value {
  font-size: 18px;
  font-weight: bold;
  color: var(--text-color);
}

.metric-detail {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.profit-up { color: #f56c6c; }
.profit-down { color: #67c23a; }
.profit-flat { color: #909399; }

.strategy-card {
  background: #f9f9f9;
  border-radius: 6px;
  padding: 1rem;
  margin-top: 1rem;
}

.strategy-title {
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.strategy-content {
  font-size: 14px;
  line-height: 1.8;

  ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;

    li { margin: 0.25rem 0; }
  }
}

.table-wrap {
  max-height: 400px;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.op-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    padding: 0.5rem 0.75rem;
    text-align: right;
    border-bottom: 1px solid var(--border-color);
    white-space: nowrap;
  }

  th:first-child, td:first-child,
  th:nth-child(2), td:nth-child(2) {
    text-align: left;
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--card-bg);
    font-weight: bold;
    color: var(--text-secondary);
  }

  tbody tr:hover {
    background: var(--hover-bg);
  }

  .empty {
    text-align: center;
    color: var(--text-secondary);
    padding: 1.5rem;
  }
}

.tag {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;

  &.tag-buy {
    background: #fef0f0;
    color: #f56c6c;
  }

  &.tag-sell {
    background: #f0f9eb;
    color: #67c23a;
  }

  &.tag-dividend {
    background: #ecf5ff;
    color: #409eff;
  }

  &.tag-virtual {
    background: #f4f4f5;
    color: #909399;
    border: 1px dashed #c0c4cc;
  }
}
</style>
