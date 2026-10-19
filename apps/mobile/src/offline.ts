import {useEffect, useState} from 'react';
import {Platform} from 'react-native';

export type OfflineAvailability = 'device' | 'preparing' | 'ready' | 'unavailable';
const supported = () => typeof navigator !== 'undefined' && globalThis.isSecureContext && 'serviceWorker' in navigator;
export function useOfflineApp() {
  const [availability, setAvailability] = useState<OfflineAvailability>(() => Platform.OS === 'web' ? supported() ? 'preparing' : 'unavailable' : 'device');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!supported()) return;
    let alive = true;
    const removers: (() => void)[] = [];
    void (async () => {
      // Only exported builds serve sw.js. Metro previews keep working without it.
      const registration = await navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'});
      const checkUpdate = () => { if (alive) setUpdateAvailable(Boolean(registration.waiting && navigator.serviceWorker.controller)); };
      checkUpdate();
      const onUpdate = () => {
        const worker = registration.installing;
        if (!worker) return;
        const check = () => {
          if (worker.state === 'installed' && alive && navigator.serviceWorker.controller) setUpdateAvailable(true);
          if (worker.state === 'redundant' && alive && !navigator.serviceWorker.controller) setAvailability('unavailable');
        };
        worker.addEventListener('statechange', check);
        removers.push(() => worker.removeEventListener('statechange', check));
      };
      registration.addEventListener('updatefound', onUpdate);
      removers.push(() => registration.removeEventListener('updatefound', onUpdate));
      onUpdate();
      await navigator.serviceWorker.ready;
      if (alive) setAvailability('ready');
    })().catch(() => { if (alive) setAvailability('unavailable'); });
    return () => { alive = false; removers.forEach(remove => remove()); };
  }, []);
  return {availability, updateAvailable};
}
