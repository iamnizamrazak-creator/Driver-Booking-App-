import { useCallback, useEffect, useState } from 'react';
import type { AppName, Me, PublicConfig } from '../../../shared/types.ts';
import { api, ApiError, closeSocket, setApp } from './api.ts';

/** Loads public config + the signed-in user for one app. `me === null` means signed out. */
export function useSession(app: AppName) {
  setApp(app);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else throw err;
    }
  }, []);

  useEffect(() => {
    api<PublicConfig>('/config').then(setConfig);
    refresh().catch(() => setMe(null));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    closeSocket();
    setMe(null);
  }, []);

  return { config, me, setMe, refresh, logout, loading: !config || me === undefined };
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}
