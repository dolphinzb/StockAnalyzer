import type { QuoteProviderId } from '../../../shared/types';
import { eastmoneyProvider } from './eastmoney';
import { sinaProvider } from './sina';
import { tencentProvider } from './tencent';
import type { QuoteProvider } from './types';

export { QuoteProviderError } from './types';
export type { QuoteProvider, QuoteRequest } from './types';

const PROVIDERS: Record<QuoteProviderId, QuoteProvider> = {
  sina: sinaProvider,
  eastmoney: eastmoneyProvider,
  tencent: tencentProvider,
};

/**
 * 按 provider 取适配器。未知值回退新浪，保证脏配置不会让轮询整体崩溃。
 */
export function getProvider(id: QuoteProviderId | string): QuoteProvider {
  return PROVIDERS[id as QuoteProviderId] ?? sinaProvider;
}
