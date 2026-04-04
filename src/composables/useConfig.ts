import { readonly, ref } from 'vue';
import type { AppConfig } from '../../shared/types';
import { API_PROVIDERS } from '../../shared/types';

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
    url: 'https://hq.sinajs.cn/list=',
  },
};

export function useConfig() {
  const config = ref<AppConfig>({ ...DEFAULT_CONFIG });
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
      const success = await window.configAPI.setConfig(plainConfig);
      console.log('[useConfig] setConfig result:', success);
      if (success) {
        config.value = newConfig;
        saveSuccess.value = true;
      } else {
        error.value = '保存配置失败';
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
    config.value = { ...DEFAULT_CONFIG };
  };

  const getApiProviderDefaultUrl = (provider: string): string => {
    const found = API_PROVIDERS.find((p) => p.value === provider);
    return found ? found.defaultUrl : DEFAULT_CONFIG.api.url;
  };

  const onApiProviderChange = (provider: string) => {
    config.value.api.provider = provider as AppConfig['api']['provider'];
    config.value.api.url = getApiProviderDefaultUrl(provider);
  };

  return {
    config: readonly(config),
    isLoading: readonly(isLoading),
    error: readonly(error),
    saveSuccess: readonly(saveSuccess),
    loadConfig,
    saveConfig: saveConfigToStore,
    resetToDefault,
    getApiProviderDefaultUrl,
    onApiProviderChange,
    API_PROVIDERS,
  };
}
