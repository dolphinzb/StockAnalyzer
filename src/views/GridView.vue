<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useToast } from '../composables/useToast';
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

    const data = await window.gridApi.calculatePosition(params);
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

    const data = await window.gridApi.calculateOpen(params);
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
  <div class="grid-view">
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
            <label>选择持仓股票</label>
            <select v-model="form.selectedStock" @change="onStockChange(form.selectedStock)">
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
            <label>总金额</label>
            <input
              v-model="form.totalAmount"
              type="number"
              placeholder="请输入总金额"
            />
          </div>
          <div class="form-item">
            <label>当前股价</label>
            <input
              v-model="form.currentPrice"
              type="number"
              step="0.01"
              placeholder="请输入当前股价"
            />
          </div>
        </div>
        <div class="form-row">
          <div class="form-item">
            <label>当前持仓数量</label>
            <input
              v-model="form.currentHoldingCount"
              type="number"
              placeholder="请输入当前持仓数量"
              :disabled="!!form.selectedStock"
            />
          </div>
          <div class="form-item">
            <label>持仓均价</label>
            <input
              v-model="form.averageHoldingPrice"
              type="number"
              step="0.01"
              placeholder="请输入持仓均价"
              :disabled="!!form.selectedStock"
            />
          </div>
          <div class="form-item form-item-buttons">
            <button class="btn-primary" @click="calculate">计算</button>
            <button class="btn-secondary" @click="reset">重置</button>
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
                color: computedProfit > 0 ? '#f56c6c' : (computedProfit < 0 ? '#67c23a' : '#909399'),
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
            <div>• 当前偏差: {{ result.deviationPercent > 0 ? '持仓过多' : '持仓不足' }}</div>
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
            <label>总金额</label>
            <input
              v-model="openForm.totalAmount"
              type="number"
              placeholder="请输入总金额"
            />
          </div>
          <div class="form-item">
            <label>开仓股价</label>
            <input
              v-model="openForm.openPrice"
              type="number"
              step="0.01"
              placeholder="请输入开仓股价"
            />
          </div>
          <div class="form-item form-item-buttons">
            <button class="btn-primary" @click="calculateOpen">计算</button>
            <button class="btn-secondary" @click="resetOpen">重置</button>
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
.grid-view {
  padding: 1rem;
  height: 100%;
  overflow: auto;
}

.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border-color);
}

.tab {
  padding: 0.75rem 1.5rem;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;

  &:hover {
    color: var(--text-color);
  }

  &.active {
    color: var(--primary-color);
    border-bottom-color: var(--primary-color);
  }
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.card-header {
  font-weight: bold;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.form-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  input, select {
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 14px;
    min-width: 150px;
    background: var(--input-bg);
    color: var(--text-color);

    &:disabled {
      background: var(--disabled-bg);
      cursor: not-allowed;
    }

    &:focus {
      outline: none;
      border-color: var(--primary-color);
    }
  }
}

.form-item-buttons {
  flex-direction: row;
  align-items: flex-end;
  gap: 0.5rem;
}

.btn-primary {
  padding: 0.5rem 1rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: var(--color-primary-dark);
  }
}

.btn-secondary {
  padding: 0.5rem 1rem;
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
  gap: 1rem;
  margin-bottom: 1rem;
}

.metric-card {
  padding: 1rem;
  background: var(--secondary-bg);
  border-radius: 6px;
  text-align: center;

  &.adjust-buy {
    background: #fef0f0;
    border: 1px solid #f56c6c;
  }

  &.adjust-sell {
    background: #f0f9eb;
    border: 1px solid #67c23a;
  }

  &.adjust-none {
    background: #f4f4f5;
    border: 1px solid #909399;
  }
}

.metric-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.metric-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--text-color);
}

.metric-detail {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.descriptions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background: var(--secondary-bg);
  border-radius: 6px;
}

.desc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0;
}

.desc-label {
  color: var(--text-secondary);
  font-size: 14px;
}

.desc-value {
  font-weight: 500;
}

.desc-hint {
  margin-left: 0.5rem;
  font-size: 12px;
  color: var(--text-secondary);
}

.tag {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;

  &.tag-success {
    background: #f0f9eb;
    color: #67c23a;
  }

  &.tag-warning {
    background: #fdf6ec;
    color: #e6a23c;
  }
}

.alert {
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;

  &.alert-warning {
    background: #fdf6ec;
    border: 1px solid #e6a23c;
  }

  &.alert-success {
    background: #f0f9eb;
    border: 1px solid #67c23a;
  }

  &.alert-info {
    background: #f4f4f5;
    border: 1px solid #909399;
  }
}

.alert-title {
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.alert-content {
  font-size: 14px;
  line-height: 1.8;

  div {
    margin: 0.25rem 0;
  }
}

.strategy-card {
  background: #f9f9f9;
  border-radius: 6px;
  padding: 1rem;
  margin-top: 1rem;
}

.strategy-title {
  font-weight: bold;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.strategy-content {
  font-size: 14px;
  line-height: 1.8;

  p {
    margin: 0.5rem 0;
  }

  ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;

    li {
      margin: 0.25rem 0;
    }
  }
}
</style>
