<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useToast } from '../composables/useToast';
import { token } from '../utils/designTokens';
import type { CalculateOpenInput, CalculatePositionInput, OpenResult, Position, PositionResult } from '../types';

defineOptions({
  name: 'GridView'
});

const { showToast } = useToast();

const activeTab = ref('trade');

const form = reactive({
  selectedStock: '',
  totalAmount: '',
  currentPrice: '',
  currentHoldingCount: '',
  averageHoldingPrice: ''
});

const holdingList = ref<Position[]>([]);
const result = ref<PositionResult | null>(null);

const openForm = reactive({
  totalAmount: '',
  openPrice: ''
});

const openResult = ref<OpenResult | null>(null);

const computedProfit = computed(() => {
  if (!result.value) return 0;
  const currentValue = parseFloat(form.currentHoldingCount) * parseFloat(form.currentPrice);
  const cost = result.value.currentPositionAmount;
  return currentValue - cost;
});

const computedProfitRate = computed(() => {
  if (!result.value || result.value.currentPositionAmount === 0) return 0;
  return (computedProfit.value / result.value.currentPositionAmount) * 100;
});

const loadHoldingList = async () => {
  try {
    const data = await window.positionApi.getPositions();
    holdingList.value = data;
  } catch (error) {
    console.error('加载持仓列表失败:', error);
    showToast('加载持仓列表失败', 'error');
  }
};

const onStockChange = (stockCode: string) => {
  if (!stockCode) {
    form.currentHoldingCount = '';
    form.averageHoldingPrice = '';
    return;
  }

  const selectedHolding = holdingList.value.find(item => item.stockCode === stockCode);
  if (selectedHolding) {
    form.currentHoldingCount = selectedHolding.holdingCount.toString();
    form.averageHoldingPrice = selectedHolding.holdingPrice.toString();
    showToast(`已自动填充 ${selectedHolding.stockName} 的持仓信息`, 'success');
  }
};

const calculate = async () => {
  if (!form.totalAmount || !form.currentPrice || !form.currentHoldingCount || !form.averageHoldingPrice) {
    showToast('请填写所有字段', 'info');
    return;
  }

  try {
    const params: CalculatePositionInput = {
      totalAmount: parseFloat(form.totalAmount),
      currentPrice: parseFloat(form.currentPrice),
      currentHoldingCount: parseInt(form.currentHoldingCount),
      averageHoldingPrice: parseFloat(form.averageHoldingPrice)
    };

    const data = await window.gridAPI.calculatePosition(params);
    result.value = data;
    showToast('计算成功', 'success');
  } catch (error) {
    console.error('计算错误:', error);
    showToast('计算失败', 'error');
  }
};

const reset = () => {
  form.selectedStock = '';
  form.totalAmount = '';
  form.currentPrice = '';
  form.currentHoldingCount = '';
  form.averageHoldingPrice = '';
  result.value = null;
};

const getAdjustedPositionAmount = () => {
  if (!result.value) return 0;
  const currentPositionAmount = result.value.currentPositionAmount;
  const adjustmentAmount = result.value.adjustAmount * parseFloat(form.currentPrice);
  return currentPositionAmount + adjustmentAmount;
};

const getAdjustedAvailableFunds = () => {
  if (!result.value) return 0;
  return parseFloat(form.totalAmount) - getAdjustedPositionAmount();
};

const calculateOpen = async () => {
  if (!openForm.totalAmount || !openForm.openPrice) {
    showToast('请填写所有字段', 'info');
    return;
  }

  try {
    const params: CalculateOpenInput = {
      totalAmount: parseFloat(openForm.totalAmount),
      openPrice: parseFloat(openForm.openPrice)
    };

    const data = await window.gridAPI.calculateOpen(params);
    openResult.value = data;
    showToast('计算成功', 'success');
  } catch (error) {
    console.error('计算错误:', error);
    showToast('计算失败', 'error');
  }
};

const resetOpen = () => {
  openForm.totalAmount = '';
  openForm.openPrice = '';
  openResult.value = null;
};

onMounted(() => {
  loadHoldingList();
});
</script>

<template>
  <div class="page grid-view">
    <div class="tabs">
      <button
        :class="['tab', { active: activeTab === 'trade' }]"
        @click="activeTab = 'trade'"
      >
        交易计算
      </button>
      <button
        :class="['tab', { active: activeTab === 'open' }]"
        @click="activeTab = 'open'"
      >
        开仓计算
      </button>
    </div>

    <div v-if="activeTab === 'trade'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <span>网格交易持仓计算</span>
        </div>
        <div class="form-row">
          <div class="form-item">
            <label class="form-label">选择持仓股票</label>
            <select class="select" v-model="form.selectedStock" @change="onStockChange(form.selectedStock)">
              <option value="">请选择持仓股票</option>
              <option
                v-for="item in holdingList"
                :key="item.stockCode"
                :value="item.stockCode"
              >
                {{ item.stockName }}({{ item.stockCode }})
              </option>
            </select>
          </div>
          <div class="form-item">
            <label class="form-label">总金额</label>
            <input class="input"
              v-model="form.totalAmount"
              type="number"
              placeholder="请输入总金额"
            />
          </div>
          <div class="form-item">
            <label class="form-label">当前股价</label>
            <input class="input"
              v-model="form.currentPrice"
              type="number"
              step="0.01"
              placeholder="请输入当前股价"
            />
          </div>
        </div>
        <div class="form-row">
          <div class="form-item">
            <label class="form-label">当前持仓数量</label>
            <input class="input"
              v-model="form.currentHoldingCount"
              type="number"
              placeholder="请输入当前持仓数量"
              :disabled="!!form.selectedStock"
            />
          </div>
          <div class="form-item">
            <label class="form-label">持仓均价</label>
            <input class="input"
              v-model="form.averageHoldingPrice"
              type="number"
              step="0.01"
              placeholder="请输入持仓均价"
              :disabled="!!form.selectedStock"
            />
          </div>
          <div class="form-item form-item-buttons">
            <button class="btn btn-primary" @click="calculate">计算</button>
            <button class="btn btn-secondary" @click="reset">重置</button>
          </div>
        </div>
      </div>

      <div v-if="result" class="card result-card">
        <div class="card-header">
          <span>网格计算结果</span>
        </div>

        <div class="metrics-row">
          <div class="metric-card">
            <div class="metric-title">当前持仓</div>
            <div class="metric-value">{{ form.currentHoldingCount }} 股</div>
            <div class="metric-detail">均价: ¥{{ parseFloat(form.averageHoldingPrice).toFixed(2) }}</div>
            <div class="metric-detail">金额: ¥{{ result.currentPositionAmount.toFixed(2) }}</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">目标持仓</div>
            <div class="metric-value">{{ result.targetPosition }} 股</div>
            <div class="metric-detail">现价: ¥{{ parseFloat(form.currentPrice).toFixed(2) }}</div>
            <div class="metric-detail">金额: ¥{{ result.targetPositionAmount.toFixed(2) }}</div>
          </div>
          <div
            class="metric-card"
            :class="{
              'adjust-buy': result.adjustAmount > 0 && Math.abs(result.deviationPercent) > 10,
              'adjust-sell': result.adjustAmount < 0 && Math.abs(result.deviationPercent) > 10,
              'adjust-none': result.adjustAmount === 0 || Math.abs(result.deviationPercent) <= 10
            }"
          >
            <div class="metric-title">
              {{ Math.abs(result.deviationPercent) <= 10 ? '无需调整' : (result.adjustAmount > 0 ? '需要买入' : '需要卖出') }}
            </div>
            <div class="metric-value">{{ Math.abs(result.deviationPercent) <= 10 ? 0 : Math.abs(result.adjustAmount) }} 股</div>
            <div class="metric-detail">
              {{ Math.abs(result.deviationPercent) <= 10 ? '偏差在正常范围内' : '金额: ¥' + (Math.abs(result.adjustAmount) * parseFloat(form.currentPrice)).toFixed(2) }}
            </div>
            <div v-if="Math.abs(result.deviationPercent) > 10" class="metric-detail">
              手数: {{ Math.abs(result.adjustAmount) / 100 }} 手
            </div>
          </div>
        </div>

        <div class="descriptions">
          <div class="desc-item">
            <span class="desc-label">总资金</span>
            <span class="desc-value">¥{{ parseFloat(form.totalAmount).toFixed(2) }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-label">可用资金</span>
            <span class="desc-value">¥{{ (parseFloat(form.totalAmount) - result.currentPositionAmount).toFixed(2) }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-label">持仓市值</span>
            <span class="desc-value">¥{{ (parseFloat(form.currentHoldingCount) * parseFloat(form.currentPrice)).toFixed(2) }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-label">持仓成本</span>
            <span class="desc-value">¥{{ result.currentPositionAmount.toFixed(2) }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-label">浮动盈亏</span>
            <span
              :style="{
                color: computedProfit > 0 ? token('--color-profit') : (computedProfit < 0 ? token('--color-loss') : token('--text-tertiary')),
                fontWeight: 'bold'
              }"
            >
              {{ computedProfit > 0 ? '+' : '' }}¥{{ computedProfit.toFixed(2) }}
              ({{ computedProfitRate.toFixed(2) }}%)
            </span>
          </div>
          <div class="desc-item">
            <span class="desc-label">偏差百分比</span>
            <span>
              <span
                :class="['tag', Math.abs(result.deviationPercent) > 10 ? 'tag-warning' : 'tag-success']"
              >
                {{ result.deviationPercent > 0 ? '+' : '' }}{{ result.deviationPercent.toFixed(2) }}%
              </span>
              <span class="desc-hint">
                {{ Math.abs(result.deviationPercent) > 10 ? '超出正常范围，建议调整' : '在正常范围内' }}
              </span>
            </span>
          </div>
        </div>

        <div v-if="Math.abs(result.deviationPercent) > 10" class="alert alert-warning">
          <div class="alert-title">操作建议</div>
          <div class="alert-content">
            <div>• 当前偏差: {{ result.deviationPercent > 0 ? '持仓不足' : '持仓过多' }}</div>
            <div>• 建议操作: {{ result.adjustAmount > 0 ? '买入' : '卖出' }} {{ Math.abs(result.adjustAmount) }} 股 ({{ Math.abs(result.adjustAmount) / 100 }} 手)</div>
            <div>• 预计金额: ¥{{ (Math.abs(result.adjustAmount) * parseFloat(form.currentPrice)).toFixed(2) }}</div>
            <div>• 调整后持仓: {{ parseInt(form.currentHoldingCount) + result.adjustAmount }} 股</div>
            <div>• 操作后持仓金额: ¥{{ getAdjustedPositionAmount().toFixed(2) }}</div>
            <div>• 操作后可用资金: ¥{{ getAdjustedAvailableFunds().toFixed(2) }}</div>
            <div>• 调整后占比: 约50%达到网格平衡</div>
          </div>
        </div>
        <div v-else class="alert alert-success">
          持仓状态良好，当前持仓偏差在正常范围内(±10%)，暂无需调整。继续按照网格策略执行即可。
        </div>

        <div class="strategy-card">
          <div class="strategy-title">网格交易策略说明</div>
          <div class="strategy-content">
            <p>📊 <strong>核心原则：</strong>持仓金额约为总金额的50%，保持半仓策略</p>
            <p>📈 <strong>调整规则：</strong>当偏差超过±10%时进行调仓操作</p>
            <p>💡 <strong>操作建议：</strong></p>
            <ul>
              <li>股价下跌时买入，降低持仓成本</li>
              <li>股价上涨时卖出，锁定部分利润</li>
              <li>始终保持半仓状态，确保有足够资金应对波动</li>
              <li>调整数量为100股的整数倍</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'open'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <span>网格交易开仓计算</span>
        </div>
        <div class="form-row">
          <div class="form-item">
            <label class="form-label">总金额</label>
            <input class="input"
              v-model="openForm.totalAmount"
              type="number"
              placeholder="请输入总金额"
            />
          </div>
          <div class="form-item">
            <label class="form-label">开仓股价</label>
            <input class="input"
              v-model="openForm.openPrice"
              type="number"
              step="0.01"
              placeholder="请输入开仓股价"
            />
          </div>
          <div class="form-item form-item-buttons">
            <button class="btn btn-primary" @click="calculateOpen">计算</button>
            <button class="btn btn-secondary" @click="resetOpen">重置</button>
          </div>
        </div>
      </div>

      <div v-if="openResult" class="card result-card">
        <div class="card-header">
          <span>开仓计算结果</span>
        </div>

        <div class="metrics-row">
          <div class="metric-card">
            <div class="metric-title">总资金</div>
            <div class="metric-value">¥{{ parseFloat(openForm.totalAmount).toFixed(2) }}</div>
            <div class="metric-detail">用于网格交易</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">开仓金额</div>
            <div class="metric-value">¥{{ openResult.openAmount.toFixed(2) }}</div>
            <div class="metric-detail">占比: 50%</div>
          </div>
          <div class="metric-card adjust-buy">
            <div class="metric-title">建议买入数量</div>
            <div class="metric-value">{{ openResult.buyCount }} 股</div>
            <div class="metric-detail">手数: {{ openResult.buyCount / 100 }} 手</div>
          </div>
        </div>

        <div class="descriptions">
          <div class="desc-item">
            <span class="desc-label">开仓价格</span>
            <span class="desc-value">¥{{ parseFloat(openForm.openPrice).toFixed(2) }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-label">预计花费</span>
            <span class="desc-value">¥{{ (openResult.buyCount * parseFloat(openForm.openPrice)).toFixed(2) }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-label">剩余资金</span>
            <span class="desc-value">¥{{ (parseFloat(openForm.totalAmount) - openResult.openAmount).toFixed(2) }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-label">资金占比</span>
            <span class="desc-value">50% / 50%</span>
          </div>
        </div>

        <div class="alert alert-info">
          <div class="alert-title">开仓操作建议</div>
          <div class="alert-content">
            <div>• 建议买入: {{ openResult.buyCount }} 股 ({{ openResult.buyCount / 100 }} 手)</div>
            <div>• 预计花费: ¥{{ (openResult.buyCount * parseFloat(openForm.openPrice)).toFixed(2) }}</div>
            <div>• 持仓金额: ¥{{ openResult.openAmount.toFixed(2) }} (占总资金50%)</div>
            <div>• 可用资金: ¥{{ (parseFloat(openForm.totalAmount) - openResult.openAmount).toFixed(2) }} (占总资金50%)</div>
            <div>• 持仓成本: ¥{{ parseFloat(openForm.openPrice).toFixed(2) }}/股</div>
          </div>
        </div>

        <div class="strategy-card">
          <div class="strategy-title">开仓策略说明</div>
          <div class="strategy-content">
            <p>📊 <strong>开仓原则：</strong>首次开仓使用总资金的50%建仓</p>
            <p>📈 <strong>资金分配：</strong>保持50%持仓，50%现金的平衡状态</p>
            <p>💡 <strong>操作建议：</strong></p>
            <ul>
              <li>首次建仓按计算数量买入</li>
              <li>保留50%资金用于后续加仓</li>
              <li>股价下跌时可继续买入降低成本</li>
              <li>股价上涨时可卖出部分锁定利润</li>
              <li>买入数量为100股的整数倍</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// 页面骨架、卡片、按钮、表单控件均由全局基础类提供，此处只保留该页特有布局
.grid-view {
  overflow: auto;
}

.tabs {
  display: flex;
  gap: 0;
  margin-bottom: var(--space-4);
  border-bottom: 2px solid var(--border-color);
}

.tab {
  margin-bottom: -2px;
  padding: var(--space-3) var(--space-5);
  font-family: inherit;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: var(--text-primary);
  }

  &.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-bottom: var(--space-4);

  &:last-child {
    margin-bottom: 0;
  }
}

// 表单控件最小宽度，避免窄屏下挤压
.form-item {
  > .input,
  > .select {
    min-width: 9.375rem; // 150px
  }
}

.form-item-buttons {
  flex-direction: row;
  align-items: flex-end;
  gap: var(--space-2);
}

.result-card {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.metric-card {
  padding: var(--space-4);
  text-align: center;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);

  &.adjust-buy {
    background: var(--bg-danger-subtle);
    border: 1px solid var(--color-danger);
  }

  &.adjust-sell {
    background: var(--bg-success-subtle);
    border: 1px solid var(--color-success);
  }

  &.adjust-none {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color-strong);
  }
}

.metric-title {
  margin-bottom: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.metric-value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.metric-detail {
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.descriptions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding: var(--space-4);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.desc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) 0;
}

.desc-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.desc-value {
  font-weight: var(--font-weight-medium);
}

.desc-hint {
  margin-left: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.alert {
  margin-bottom: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-md);

  &.alert-warning {
    background: var(--bg-warning-subtle);
    border: 1px solid var(--color-warning);
  }

  &.alert-success {
    background: var(--bg-success-subtle);
    border: 1px solid var(--color-success);
  }

  &.alert-info {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color-strong);
  }
}

.alert-title {
  margin-bottom: var(--space-2);
  font-weight: var(--font-weight-semibold);
}

.alert-content {
  font-size: var(--font-size-sm);
  line-height: var(--line-height-loose);

  div {
    margin: var(--space-1) 0;
  }
}

.strategy-card {
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.strategy-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-weight: var(--font-weight-semibold);
}

.strategy-content {
  font-size: var(--font-size-sm);
  line-height: var(--line-height-loose);

  p {
    margin: var(--space-2) 0;
  }

  ul {
    margin: var(--space-2) 0;
    padding-left: var(--space-5);

    li {
      margin: var(--space-1) 0;
    }
  }
}
</style>
