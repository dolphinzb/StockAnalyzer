<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { AppConfig } from '../../shared/types';
import { DEFAULT_CONFIG, useConfig } from '../composables/useConfig';
import { useToast } from '../composables/useToast';

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
const localConfig = ref<AppConfig | null>(null);

onMounted(async () => {
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
</script>

<template>
  <div class="settings-view">
    <h2>设置</h2>

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
              type="time"
              required
            />
          </div>
          <div class="form-group">
            <label for="morningEnd">上午结束时间</label>
            <input
              id="morningEnd"
              v-model="localConfig.trading.morningEnd"
              type="time"
              required
            />
          </div>
          <div class="form-group">
            <label for="afternoonStart">下午开始时间</label>
            <input
              id="afternoonStart"
              v-model="localConfig.trading.afternoonStart"
              type="time"
              required
            />
          </div>
          <div class="form-group">
            <label for="afternoonEnd">下午结束时间</label>
            <input
              id="afternoonEnd"
              v-model="localConfig.trading.afternoonEnd"
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
            type="text"
            required
          />
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
  </div>
</template>

<style scoped lang="scss">
.settings-view {
  padding: 1.5rem;
  max-width: 800px;
  margin: 0 auto;

  h2 {
    font-size: 1.75rem;
    margin-bottom: 1.5rem;
    color: var(--text-primary);
  }
}

.loading {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-section {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.25rem;

  h3 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 0.5rem;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;

  label {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  input,
  select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.9375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition: border-color 0.2s, box-shadow 0.2s;

    &:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
    }
  }

  input[type="number"] {
    max-width: 120px;
  }

  .form-hint {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.btn {
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.btn-primary {
  background: var(--color-primary);

  &:hover:not(:disabled) {
    background: var(--color-primary-hover, #3595f5);
  }
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);

  &:hover:not(:disabled) {
    background: var(--border-color);
  }
}

.message {
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-top: 1rem;
  font-size: 0.875rem;
}

.message-success {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
  border: 1px solid #67c23a;
}

.message-error {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
  border: 1px solid #f56c6c;
}
</style>
