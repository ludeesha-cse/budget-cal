// The single place that decides which BillingAdapter the app uses.

import { Platform } from 'react-native';
import { createStubBillingAdapter } from './stubBillingAdapter';
import { createPlayBillingAdapter } from './playBillingAdapter';
import type { BillingAdapter } from './types';

let adapter: BillingAdapter | null = null;

export function getBillingAdapter(): BillingAdapter {
  if (!adapter) {
    // iOS has neither a sign-in implementation (Stage 18a) nor an Apple
    // IAP backend yet, so it gets the stub until Apple IAP lands — branch
    // here rather than inside any screen.
    if (Platform.OS === 'android') {
      adapter = createPlayBillingAdapter();
    } else {
      adapter = createStubBillingAdapter();
    }
  }
  return adapter;
}

export * from './types';
