import { readonly, ref } from 'vue';
import type { AppConfig } from '../../shared/types';
import { API_PROVIDERS, getQuoteEndpoint } from '../../shared/types';

export const DEFAULT_CONFIG: AppConfig = {
  trading: {
    morningStart: '09:30',
    morningEnd: '11:30',
    afternoonStart: '13:00',
    afternoonEnd: '15:00',
  },
  polling: {
    interval: 1,
  },
  api: {
    provider: 'sina',
    // 端点从只读元数据派生，不写字面量
    url: getQuoteEndpoint('sina'),
  },
};

/** 深拷贝默认配置，避免切换 provider 时改写共享的 DEFAULT_CONFIG.api 引用 */
const cloneDefaultConfig = (): AppConfig => JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;

export function useConfig() {
  const config = ref<AppConfig>(cloneDefaultConfig());
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const saveSuccess = ref(false);

  const loadConfig = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const loadedConfig = await window.configAPI.getConfig();
      if (loadedConfig) {
        config.value = loadedConfig;
      }
    } catch (e) {
      error.value = '加载配置失败';
      console.error('Failed to load config:', e);
    } finally {
      isLoading.value = false;
    }
  };

  const saveConfigToStore = async (newConfig: AppConfig): Promise<boolean> => {
    isLoading.value = true;
    error.value = null;
    saveSuccess.value = false;
    try {
      const plainConfig = JSON.parse(JSON.stringify(newConfig));
      const result = await window.configAPI.setConfig(plainConfig);
      // 只有布尔 true 才算成功；IPC 参数校验失败会返回结构化错误对象
      const success = result === true;
      console.log('[useConfig] setConfig result:', result);
      if (success) {
        // 主进程按 provider 派生 api.url，回读一次保证只读字段与落盘值一致
        const saved = await window.configAPI.getConfig();
        config.value = saved ?? newConfig;
        saveSuccess.value = true;
      } else {
        error.value = typeof result === 'object' && result !== null
          ? `保存配置失败：${result.message}`
          : '保存配置失败';
      }
      return success;
    } catch (e) {
      error.value = '保存配置失败';
      console.error('Failed to save config:', e);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  const resetToDefault = () => {
    config.value = cloneDefaultConfig();
  };

  const getApiProviderEndpoint = (provider: string): string => {
    const found = API_PROVIDERS.find((p) => p.value === provider);
    return found ? found.endpoint : DEFAULT_CONFIG.api.url;
  };

  /** 切换数据源：只改 provider 与只读展示的端点，端点最终以主进程派生值为准 */
  const onApiProviderChange = (provider: string) => {
    const found = API_PROVIDERS.find((p) => p.value === provider);
    if (!found) return;
    config.value.api.provider = found.value;
    config.value.api.url = found.endpoint;
  };

  return {
    config: readonly(config),
    isLoading: readonly(isLoading),
    error: readonly(error),
    saveSuccess: readonly(saveSuccess),
    loadConfig,
    saveConfig: saveConfigToStore,
    resetToDefault,
    getApiProviderEndpoint,
    onApiProviderChange,
    API_PROVIDERS,
  };
}
