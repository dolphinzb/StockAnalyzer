<script setup lang="ts">
/**
 * 行情库管理页面
 *
 * 布局：
 *   ┌──────────────────────────────────────────────┐
 *   │ 标题 + 控制状态徽章 + 更新时间 + 刷新          │
 *   ├──────────────────────────────────────────────┤
 *   │ 统计卡片：总数/待处理/运行中/成功/失败          │
 *   ├──────────────────────────────────────────────┤
 *   │ 当前任务与证券 / 最近错误                       │
 *   ├──────────────────────────────────────────────┤
 *   │ 全量回填操作区        │ 增量更新操作区          │
 *   ├──────────────────────────────────────────────┤
 *   │ 失败任务表                                     │
 *   └──────────────────────────────────────────────┘
 *
 * 约束：
 * - 首次打开显示「未开始」，不自动生成任务、不发起下载
 * - 不在页面自动触发增量更新，必须用户点击
 * - 全量回填与增量更新互斥，按钮按状态禁用
 */

import { computed } from 'vue';
import type { MarketDataKind, MarketSyncState } from '../../shared/types';
import { useMarketDataSync } from '../composables/useMarketDataSync';

defineOptions({
  name: 'MarketDataView',
});

const {
  status,
  loading,
  actionPending,
  loadError,
  manualRefresh,
  startFullBackfill,
  runIncremental,
  retryFailed,
} = useMarketDataSync();

/** 控制状态 → 中文标签 */
const STATE_LABELS: Record<MarketSyncState, string> = {
  idle: '未开始',
  running: '运行中',
  completed: '已完成',
  failed: '存在失败',
};

/** 数据类型 → 中文标签 */
const KIND_LABELS: Record<MarketDataKind, string> = {
  active_codes: '在市证券名录',
  delisted_codes: '退市证券清单',
  calendar: '交易日历',
  raw_daily: '原始日线',
  qfq_daily: '前复权日线',
  hfq_daily: '后复权日线',
};

const state = computed<MarketSyncState>(() => status.value?.state ?? 'idle');
const isRunning = computed(() => state.value === 'running');
const busy = computed(() => isRunning.value || actionPending.value !== null);

/** 是否存在未完成的全量任务（待处理/运行中） */
const hasUnfinishedTasks = computed(
  () => (status.value?.pending ?? 0) > 0 || (status.value?.running ?? 0) > 0
);

/** 增量更新是否可用：全量完成、无未完成任务、存在待补日期 */
const canRunIncremental = computed(() => {
  const current = status.value;
  if (!current || busy.value) {
    return false;
  }
  return (
    current.latestTradeDate !== null &&
    current.incrementalTaskCount > 0 &&
    !hasUnfinishedTasks.value
  );
});

/** 是否已是最新（无待补任务且全量已完成） */
const isUpToDate = computed(() => {
  const current = status.value;
  if (!current || current.latestTradeDate === null || hasUnfinishedTasks.value) {
    return false;
  }
  return current.incrementalTaskCount === 0;
});

const canRetry = computed(() => !busy.value && (status.value?.failed ?? 0) > 0);

const canStart = computed(() => !busy.value);

const failedTasks = computed(() => status.value?.failedTasks ?? []);

/** ISO 时间 → 本地可读时间 */
function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 失败任务的下次重试时间 */
function nextRetryText(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return '已到期';
  }
  return formatDateTime(value);
}

/** 任务键 → 可读文本（`600519:raw_daily` → `600519 · 原始日线`） */
function taskLabel(taskKey: string | null): string {
  if (!taskKey) {
    return '—';
  }
  const [code, kind] = taskKey.split(':');
  const label = KIND_LABELS[kind as MarketDataKind] ?? kind ?? '';
  return code === '__MARKET__' ? `市场级 · ${label}` : `${code} · ${label}`;
}

/** 控制状态徽章样式 */
const stateClass = computed(() => `state-${state.value}`);
</script>

<template>
  <div class="market-data-view">
    <header class="page-header">
      <div class="title-block">
        <h1>行情库</h1>
        <span class="state-badge" :class="stateClass">{{ STATE_LABELS[state] }}</span>
        <span v-if="status?.mode" class="mode-tag">
          {{ status.mode === 'full' ? '全量回填' : '增量更新' }}
        </span>
      </div>
      <div class="header-actions">
        <span class="updated-at">更新时间：{{ formatDateTime(status?.updatedAt ?? null) }}</span>
        <button class="btn btn-secondary" :disabled="loading" @click="manualRefresh">
          {{ loading ? '刷新中…' : '刷新状态' }}
        </button>
      </div>
    </header>

    <p v-if="loadError" class="alert alert-danger">{{ loadError }}</p>

    <section class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">任务总数</span>
        <strong class="stat-value">{{ status?.total ?? 0 }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">待处理</span>
        <strong class="stat-value">{{ status?.pending ?? 0 }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">运行中</span>
        <strong class="stat-value">{{ status?.running ?? 0 }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">成功</span>
        <strong class="stat-value stat-success">{{ status?.success ?? 0 }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">失败</span>
        <strong class="stat-value stat-danger">{{ status?.failed ?? 0 }}</strong>
      </div>
    </section>

    <section class="panel">
      <div class="panel-row">
        <span class="row-label">当前证券</span>
        <span class="row-value">
          <template v-if="status?.currentStockCode">
            {{ status.currentStockCode }}
            <span class="muted">{{ status.currentStockName ?? '' }}</span>
          </template>
          <span v-else class="muted">—</span>
        </span>
      </div>
      <div class="panel-row">
        <span class="row-label">当前任务</span>
        <span class="row-value">{{ taskLabel(status?.currentTaskKey ?? null) }}</span>
      </div>
      <div class="panel-row">
        <span class="row-label">最近错误</span>
        <span class="row-value error-text">{{ status?.lastError ?? '—' }}</span>
      </div>
    </section>

    <section class="action-grid">
      <div class="action-card">
        <h2>全量回填</h2>
        <p class="action-desc">
          覆盖沪深北全部 A 股（含退市），从 1990 年起拉取原始日线、前复权与后复权日线。
          任务会持久化，可随时中断并在下次继续。
        </p>
        <div class="action-buttons">
          <button class="btn btn-primary" :disabled="!canStart" @click="startFullBackfill">
            {{ status?.pending ? '继续全量回填' : '开始全量回填' }}
          </button>
          <button class="btn btn-secondary" :disabled="!canRetry" @click="retryFailed">
            重试失败
          </button>
        </div>
        <p v-if="isRunning" class="hint">同步运行中，按钮已禁用；可关闭页面，任务状态会持久化。</p>
      </div>

      <div class="action-card">
        <h2>增量更新</h2>
        <dl class="incremental-info">
          <div>
            <dt>最早缺失日期</dt>
            <dd>{{ status?.earliestMissingDate ?? '—' }}</dd>
          </div>
          <div>
            <dt>最新交易日</dt>
            <dd>{{ status?.latestTradeDate ?? '—' }}</dd>
          </div>
          <div>
            <dt>待补任务数</dt>
            <dd>{{ status?.incrementalTaskCount ?? 0 }}</dd>
          </div>
        </dl>
        <div class="action-buttons">
          <button class="btn btn-primary" :disabled="!canRunIncremental" @click="runIncremental">
            增量更新
          </button>
        </div>
        <p v-if="isUpToDate" class="hint hint-success">已是最新，无需增量更新。</p>
        <p v-else-if="status && hasUnfinishedTasks" class="hint">
          全量回填尚未完成，完成前不可执行增量更新。
        </p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>失败任务</h2>
        <span class="muted">最多展示最近 50 条；「重试失败」只重置失败任务，不影响已完成数据。</span>
      </div>
      <table v-if="failedTasks.length > 0" class="failed-table">
        <thead>
          <tr>
            <th>股票代码</th>
            <th>名称</th>
            <th>任务类型</th>
            <th>重试次数</th>
            <th>最近错误</th>
            <th>下次重试</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in failedTasks" :key="task.taskKey">
            <td>{{ task.stockCode ?? '—' }}</td>
            <td>{{ task.stockName ?? '—' }}</td>
            <td>{{ KIND_LABELS[task.dataKind] ?? task.dataKind }}</td>
            <td>{{ task.retryCount }}</td>
            <td class="error-text">{{ task.lastError ?? '—' }}</td>
            <td>{{ nextRetryText(task.nextRetryAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">暂无失败任务</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.market-data-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  min-height: 100%;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.title-block {
  display: flex;
  align-items: center;
  gap: var(--space-3);

  h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
  }
}

.state-badge {
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  border: 1px solid transparent;

  &.state-idle {
    color: var(--text-secondary);
    background-color: var(--bg-tertiary);
    border-color: var(--border-color);
  }

  &.state-running {
    color: var(--color-primary-dark);
    background-color: var(--bg-info-subtle);
    border-color: var(--color-primary);
  }

  &.state-completed {
    color: #237804;
    background-color: var(--bg-success-subtle);
    border-color: var(--color-success);
  }

  &.state-failed {
    color: var(--color-danger-dark);
    background-color: var(--bg-danger-subtle);
    border-color: var(--color-danger);
  }
}

.mode-tag {
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background-color: var(--bg-tertiary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.updated-at {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.alert {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);

  &.alert-danger {
    color: var(--color-danger-dark);
    background-color: var(--bg-danger-subtle);
    border: 1px solid var(--color-danger);
  }
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-3);
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.stat-value {
  font-size: var(--font-size-2xl);
  line-height: 1.1;

  &.stat-success {
    color: var(--color-success);
  }

  &.stat-danger {
    color: var(--color-danger);
  }
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.panel-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);

  h2 {
    margin: 0;
    font-size: var(--font-size-lg);
  }
}

.panel-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: baseline;
}

.row-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.row-value {
  font-size: var(--font-size-sm);
  word-break: break-all;
}

.muted {
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
}

.error-text {
  color: var(--color-danger-dark);
  word-break: break-all;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.action-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);

  h2 {
    margin: 0;
    font-size: var(--font-size-lg);
  }
}

.action-desc {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.6;
  color: var(--text-secondary);
}

.action-buttons {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.incremental-info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;

  div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  dt {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  dd {
    margin: 0;
    font-size: var(--font-size-md);
  }
}

.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.15s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.btn-primary {
  color: var(--text-on-color);
  background-color: var(--color-primary);

  &:not(:disabled):hover {
    background-color: var(--color-primary-dark);
  }
}

.btn-secondary {
  color: var(--text-primary);
  background-color: var(--bg-primary);
  border-color: var(--border-color-strong);

  &:not(:disabled):hover {
    background-color: var(--bg-hover);
  }
}

.hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);

  &.hint-success {
    color: var(--color-success);
  }
}

.failed-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-xs);

  th,
  td {
    padding: var(--space-2);
    text-align: left;
    border-bottom: 1px solid var(--border-color-light);
    vertical-align: top;
  }

  th {
    color: var(--text-secondary);
    font-weight: 500;
    background-color: var(--bg-tertiary);
  }
}

.empty {
  margin: 0;
  padding: var(--space-3) 0;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

@media (max-width: 1100px) {
  .stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .action-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
