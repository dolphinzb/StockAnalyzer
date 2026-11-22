<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { AppConfig, AppInfo } from '../../shared/types';
import { DEFAULT_CONFIG, useConfig } from '../composables/useConfig';
import { useToast } from '../composables/useToast';
import { useBackup } from '../composables/useBackup';

defineOptions({
  name: 'SettingsView'
});

const {
  config,
  isLoading,
  loadConfig,
  saveConfig,
  resetToDefault,
  onApiProviderChange,
  API_PROVIDERS,
} = useConfig();

const { showToast } = useToast();
const { triggerManualBackup } = useBackup();
const localConfig = ref<AppConfig | null>(null);
const isBackingUp = ref(false);

const appInfo = ref<AppInfo | null>(null);

/** 读取版本与运行环境信息；失败时关于区整体降级为占位 */
const loadAppInfo = async (): Promise<void> => {
  try {
    const info = await window.electronAPI?.getAppInfo();
    appInfo.value = info ?? null;
  } catch {
    appInfo.value = null;
  }
};

/** 打开日志目录，失败时给出可见提示 */
const handleOpenLogDir = async (): Promise<void> => {
  try {
    const result = await window.logApi.openLogDirectory();
    if (!result.success) {
      showToast(`打开日志目录失败: ${result.error ?? '未知错误'}`, 'error');
    }
  } catch (error) {
    showToast(`打开日志目录失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
  }
};

/** 打开数据库文件所在目录，失败时给出可见提示 */
const handleOpenDbDir = async (): Promise<void> => {
  try {
    const result = await window.electronAPI?.openDbDirectory();
    if (!result?.success) {
      showToast(`打开数据库目录失败: ${result?.error ?? '未知错误'}`, 'error');
    }
  } catch (error) {
    showToast(`打开数据库目录失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
  }
};

onMounted(async () => {
  void loadAppInfo();
  await loadConfig();
  if (config.value) {
    localConfig.value = JSON.parse(JSON.stringify(config.value));
  } else {
    showToast('配置加载失败，使用默认配置', 'error');
    localConfig.value = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
});

watch(() => config.value, (newConfig) => {
  localConfig.value = JSON.parse(JSON.stringify(newConfig));
}, { deep: true });

const handleProviderChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  if (localConfig.value) {
    onApiProviderChange(target.value);
  }
};

const handleSave = async () => {
  if (!localConfig.value) return;

  const success = await saveConfig(localConfig.value);
  if (success) {
    showToast('配置保存成功', 'success');
  } else {
    showToast('配置保存失败', 'error');
  }
};

const handleReset = () => {
  resetToDefault();
  if (localConfig.value) {
    localConfig.value = JSON.parse(JSON.stringify(config.value));
  }
};

const handleBackup = async () => {
  isBackingUp.value = true;
  try {
    const result = await triggerManualBackup();
    if (result.success) {
      showToast('备份成功', 'success');
    } else {
      showToast(`备份失败: ${result.error || '未知原因'}`, 'error');
    }
  } catch (error) {
    showToast('备份失败', 'error');
  } finally {
    isBackingUp.value = false;
  }
};
</script>

<template>
  <div class="page settings-view">
    <h2 class="page-title">设置</h2>

    <div v-if="isLoading" class="loading">加载中...</div>

    <form v-else-if="localConfig" class="settings-form" @submit.prevent="handleSave">
      <section class="settings-section">
        <h3>交易时间段</h3>
        <div class="form-grid">
          <div class="form-group">
            <label for="morningStart">上午开始时间</label>
            <input
              id="morningStart"
              v-model="localConfig.trading.morningStart"
              class="input"
              type="time"
              required
            />
          </div>
          <div class="form-group">
            <label for="morningEnd">上午结束时间</label>
            <input
              id="morningEnd"
              v-model="localConfig.trading.morningEnd"
              class="input"
              type="time"
              required
            />
          </div>
          <div class="form-group">
            <label for="afternoonStart">下午开始时间</label>
            <input
              id="afternoonStart"
              v-model="localConfig.trading.afternoonStart"
              class="input"
              type="time"
              required
            />
          </div>
          <div class="form-group">
            <label for="afternoonEnd">下午结束时间</label>
            <input
              id="afternoonEnd"
              v-model="localConfig.trading.afternoonEnd"
              class="input"
              type="time"
              required
            />
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h3>轮询设置</h3>
        <div class="form-group">
          <label for="interval">轮询间隔（分钟）</label>
          <input
            id="interval"
            v-model.number="localConfig.polling.interval"
            class="input"
            type="number"
            min="1"
            max="30"
            required
          />
          <span class="form-hint">范围: 1-30 分钟</span>
        </div>
      </section>

      <section class="settings-section">
        <h3>API 设置</h3>
        <div class="form-group">
          <label for="provider">API 提供商</label>
          <select
            id="provider"
            class="select"
            :value="localConfig.api.provider"
            @change="handleProviderChange"
          >
            <option
              v-for="provider in API_PROVIDERS"
              :key="provider.value"
              :value="provider.value"
            >
              {{ provider.label }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label for="apiUrl">API 地址</label>
          <input
            id="apiUrl"
            v-model="localConfig.api.url"
            class="input"
            type="text"
            readonly
            aria-readonly="true"
          />
          <span class="form-hint">地址由所选数据源决定，不可修改</span>
        </div>
      </section>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary" :disabled="isLoading">
          {{ isLoading ? '保存中...' : '保存' }}
        </button>
        <button type="button" class="btn btn-secondary" @click="handleReset" :disabled="isLoading">
          重置
        </button>
      </div>
    </form>

    <section class="settings-section backup-section">
      <h3>数据备份</h3>
      <p class="backup-description">
        手动备份数据库文件，备份文件将保存在与当前数据库相同的目录中。
      </p>
      <button 
        type="button" 
        class="btn btn-primary" 
        @click="handleBackup" 
        :disabled="isBackingUp"
      >
        {{ isBackingUp ? '备份中...' : '备份数据库' }}
      </button>
    </section>

    <section class="settings-section about-section">
      <h3>关于</h3>
      <dl v-if="appInfo" class="about-list">
        <div class="about-row">
          <dt>版本</dt>
          <dd>v{{ appInfo.version }}{{ appInfo.isDev ? ' (dev)' : '' }}</dd>
        </div>
        <div class="about-row">
          <dt>数据库</dt>
          <dd class="path" :title="appInfo.dbPath">{{ appInfo.dbPath }}</dd>
        </div>
        <div class="about-row">
          <dt>日志目录</dt>
          <dd class="path" :title="appInfo.logDir">{{ appInfo.logDir }}</dd>
        </div>
      </dl>
      <p v-else class="about-placeholder">版本信息暂不可用</p>
      <div class="about-actions">
        <button type="button" class="btn btn-secondary" @click="handleOpenLogDir">
          打开日志目录
        </button>
        <button type="button" class="btn btn-secondary" @click="handleOpenDbDir">
          打开数据库目录
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
// 页面骨架、按钮、表单控件均由全局基础类提供，此处只保留该页特有布局
.settings-view {
  max-width: 800px;
  margin: 0 auto;

  .page-title {
    margin-bottom: var(--space-5);
  }
}

.loading {
  padding: var(--space-6);
  font-size: var(--font-size-sm);
  text-align: center;
  color: var(--text-secondary);
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.settings-section {
  padding: var(--space-5);
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);

  h3 {
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-2);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-color);
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
  }

  // 轮询间隔为短数字，不撑满整行
  input[type='number'] {
    max-width: 7.5rem;
  }

  .form-hint {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }
}

.form-actions {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-2);
}

.message {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-sm);
}

.message-success {
  background: var(--bg-success-subtle);
  color: var(--color-success);
  border: 1px solid var(--color-success);
}

.message-error {
  background: var(--bg-danger-subtle);
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
}

.backup-section {
  margin-top: var(--space-4);

  .backup-description {
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-base);
    color: var(--text-secondary);
  }
}

.about-section {
  margin-top: var(--space-4);

  .about-list {
    margin: 0 0 var(--space-4);
  }

  .about-row {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-1) 0;
    font-size: var(--font-size-sm);
    line-height: var(--line-height-base);

    dt {
      flex: 0 0 4.5rem;
      color: var(--text-secondary);
    }

    dd {
      flex: 1;
      min-width: 0;
      margin: 0;
    }
  }

  .path {
    font-family: Consolas, 'Courier New', monospace;
    word-break: break-all;
  }

  .about-placeholder {
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .about-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
}
</style>
