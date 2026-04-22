import type { LLMProviderId, PersistedStore } from '../../types';

export function activeProviderIdForFeature(
  feature: keyof PersistedStore['featureProviderOverrides'],
  overrides: PersistedStore['featureProviderOverrides'],
  activeProviderId: LLMProviderId
): LLMProviderId {
  return overrides[feature] ?? activeProviderId;
}
