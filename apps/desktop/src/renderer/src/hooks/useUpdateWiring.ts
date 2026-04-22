import { useEffect } from 'react';
import type { StoreApi } from 'zustand';
import type { UpdateState } from '../state/update-store';

export function useUpdateWiring(store: StoreApi<UpdateState> | null): void {
  useEffect(() => {
    if (!store) return;
    if (!window.codesign) {
      console.warn('[useUpdateWiring] window.codesign missing; update notifications disabled');
      return;
    }

    const offAvail = window.codesign.onUpdateAvailable((info) => {
      const typed = info as { version?: string };
      const version = typed.version ?? '';
      if (!version || !/^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(version)) return;
      const releaseUrl = `https://github.com/OpenCoworkAI/open-codesign/releases/tag/v${version}`;
      store.getState().setAvailable({ version, releaseUrl });
    });

    const offLatest = window.codesign.onUpdateNotAvailable(() => store.getState().setLatest());

    const offError = window.codesign.onUpdateError((msg) => store.getState().setError(msg));

    return () => {
      offAvail();
      offLatest();
      offError();
    };
  }, [store]);
}
