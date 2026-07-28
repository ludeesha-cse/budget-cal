// The single place that decides which BillingAdapter the app uses.
//
// Swap the factory below for a real one (see stubBillingAdapter.ts's
// header for the three steps) and every screen picks it up.

import { Platform } from 'react-native';
import { createStubBillingAdapter } from './stubBillingAdapter';
import type { BillingAdapter } from './types';

let adapter: BillingAdapter | null = null;

export function getBillingAdapter(): BillingAdapter {
  if (!adapter) {
    // iOS has neither a sign-in implementation (Stage 18a) nor an Apple
    // IAP backend yet, so it gets the same stub Android currently does —
    // when Apple IAP lands, branch here rather than inside any screen.
    if (Platform.OS === 'android') {
      adapter = createStubBillingAdapter();
    } else {
      adapter = createStubBillingAdapter();
    }
  }
  return adapter;
}

export * from './types';
