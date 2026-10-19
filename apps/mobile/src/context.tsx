import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {AppState, Platform} from 'react-native';
import {useNetworkState} from 'expo-network';
import {type Session} from '@supabase/supabase-js';
import {auth, apiUrl} from './auth';
import {secrets} from './security';
import {setTimeZone} from './locale';
import {DEMO_USER, openLife, uid, type LifeRepository, type Records} from './repository';
import {seedLife} from './seed';
import {useOfflineApp, type OfflineAvailability} from './offline';
import {connectionState, retryDelay, type Connection} from './sync-state';

type Mode = 'demo' | 'private';
function displayPreferences(data: Records) {
  const preference = data.setting.find(s => s.key === 'preferences');
  if (preference) {
    const settings = JSON.parse(String(preference.value_json));
    if (settings.timezone) setTimeZone(settings.timezone);
  }
  const ui = data.setting.find(s => s.key === 'ui');
  return ui ? JSON.parse(String(ui.value_json)) as {theme?: 'light' | 'dark'; sync?: {last_synced_at: string}} : {};
}
type Context = {
  repo: LifeRepository | null; records: Records | null;
  home: Awaited<ReturnType<LifeRepository['home']>> | null;
  mode: Mode | null; busy: boolean; error: string; notice: string;
  locked: boolean; hasPin: boolean; pending: number; session: Session | null;
  theme: 'dark' | 'light'; connection: Connection; syncing: boolean;
  syncError: string; lastSynced: string | null; cloudConfigured: boolean;
  offlineReady: OfflineAvailability; offlineUpdate: boolean;
  refresh: () => Promise<void>;
  run: (fn: (repo: LifeRepository) => Promise<unknown>, success?: string) => Promise<boolean>;
  notify: (text: string) => void; start: (mode: Mode) => Promise<void>;
  unlock: () => void; lock: () => void; setHasPin: (value: boolean) => void;
  setTheme: (mode: 'dark' | 'light') => Promise<void>; sync: () => Promise<void>;
  forgetAccount: () => Promise<void>;
};
const Life = createContext<Context | null>(null);
export function LifeProvider({children}: {children: React.ReactNode}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [repo, setRepo] = useState<LifeRepository | null>(null);
  const [records, setRecords] = useState<Records | null>(null);
  const [home, setHome] = useState<Context['home']>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [locked, setLocked] = useState(false), [hasPin, setHasPin] = useState(false);
  const [pending, setPending] = useState(0), [session, setSession] = useState<Session | null>(null);
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [privateUser, setPrivateUser] = useState(''), [offlineAccount, setOfflineAccount] = useState('');
  const [syncing, setSyncing] = useState(false), [syncError, setSyncError] = useState('');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const network = useNetworkState(), connection = connectionState(network), offline = useOfflineApp();
  const repoRef = useRef<LifeRepository | null>(null);
  const restoredSessionUser = useRef('');
  const syncFlight = useRef<Promise<boolean> | null>(null);
  const notify = useCallback((text: string) => setNotice(text), []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);

  useEffect(() => {
    let alive = true;
    const rememberSession = (next: Session | null) => {
      if (!alive) return;
      // Expired credentials cannot block PIN-protected access to already-local data.
      // The server still requires a fresh verified token for every online request.
      if (next) {
        const id = next.user.id;
        restoredSessionUser.current = id;
        if (repoRef.current && repoRef.current.user !== id) {
          repoRef.current = null; setRepo(null); setRecords(null); setHome(null);
          setLastSynced(null); setSyncError(''); setSyncing(false); syncFlight.current = null;
        }
        setOfflineAccount(id);
        void secrets.set('offline-account', id).catch(() => {});
      }
      setSession(next);
    };
    void (async () => {
      const [savedMode, pin, user, cachedAccount] = await Promise.all([
        secrets.get('mode'), secrets.get('pin'), secrets.get('user'), secrets.get('offline-account'),
      ]);
      const local = user ?? uid();
      if (!user) await secrets.set('user', local);
      if (!alive) return;
      setPrivateUser(local); setHasPin(Boolean(pin)); setLocked(Boolean(pin));
      if (savedMode === 'demo' || savedMode === 'private') setMode(savedMode);
      if (!restoredSessionUser.current && cachedAccount && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cachedAccount)) {
        setOfflineAccount(cachedAccount);
      }
      setBusy(false);
      // Account refresh happens after local bootstrap; it need not finish to open SQLite.
      if (auth) {
        try { const {data} = await auth.auth.getSession(); rememberSession(data.session); }
        catch { /* Offline dashboard remains usable with its device PIN. */ }
      }
    })().catch(e => { if (alive) {setError(String(e.message ?? e)); setBusy(false);} });
    const subscription = auth?.auth.onAuthStateChange((_event, next) => rememberSession(next));
    return () => { alive = false; subscription?.data.subscription.unsubscribe(); };
  }, []);

  const accountId = session?.user.id ?? offlineAccount;
  const identity = accountId || (mode === 'demo' ? DEMO_USER : privateUser);
  useEffect(() => {
    if (!mode || !identity || locked) return;
    let alive = true;
    void (async () => {
      const demo = mode === 'demo' && !accountId;
      const database = await openLife(identity, demo);
      await seedLife(database, demo);
      if (!alive) return;
      repoRef.current = database; setRepo(database);
      const [data, summary, count] = await Promise.all([database.all(), database.home(), database.pending()]);
      if (!alive) return;
      const preferences = displayPreferences(data);
      setRecords(data); setHome(summary); setPending(count?.n ?? 0);
      setLastSynced(preferences.sync?.last_synced_at ?? null);
      if (preferences.theme) setThemeState(preferences.theme);
    })().catch(e => { if (alive) setError(String(e.message ?? e)); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [mode, identity, locked, accountId]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {if (state !== 'active' && hasPin) setLocked(true);});
    return () => subscription.remove();
  }, [hasPin]);
  const refresh = useCallback(async () => {
    const database = repoRef.current; if (!database) return;
    const [data, summary, count] = await Promise.all([database.all(), database.home(), database.pending()]);
    if (database !== repoRef.current) return;
    const preferences = displayPreferences(data);
    setRecords(data); setHome(summary); setPending(count?.n ?? 0);
    setLastSynced(preferences.sync?.last_synced_at ?? null);
  }, []);
  const run = useCallback(async (fn: (database: LifeRepository) => Promise<unknown>, success?: string) => {
    const database = repoRef.current; if (!database) return false;
    setBusy(true);
    try {await fn(database); await refresh(); if (success) notify(success); return true;}
    catch (e) {notify(e instanceof Error ? e.message : 'Could not save. Your entries are still on this device.'); return false;}
    finally {setBusy(false);}
  }, [refresh, notify]);
  const start = useCallback(async (next: Mode) => {
    setBusy(true); setError(''); await secrets.set('mode', next);
    repoRef.current = null; setRepo(null); setRecords(null); setHome(null);
    setPending(0); setSyncError(''); setLastSynced(null); setSyncing(false); syncFlight.current = null; setMode(next); setLocked(false);
  }, []);
  const forgetAccount = useCallback(async () => {
    await secrets.remove('offline-account');
    restoredSessionUser.current = '';
    setOfflineAccount(''); setSession(null); repoRef.current = null;
    setRepo(null); setRecords(null); setHome(null); setLastSynced(null); setSyncError(''); setPending(0); setSyncing(false); syncFlight.current = null;
    if (hasPin) setLocked(true);
  }, [hasPin]);
  const setTheme = useCallback(async (next: 'dark' | 'light') => {
    setThemeState(next); await repoRef.current?.preference('theme', next);
  }, []);

  const performSync = useCallback((): Promise<boolean> => {
    if (syncFlight.current) return syncFlight.current;
    const database = repoRef.current;
    if (!database || database.demo || locked || connection === 'offline' || !session || !auth || !apiUrl) return Promise.resolve(false);
    setSyncing(true); setSyncError('');
    const task = (async () => {
      try {
        // Drain batches without spinning on a rejected command that makes no progress.
        for (let batch = 0; batch < 10; batch++) {
          const before = (await database.pending())?.n ?? 0;
          await database.sync(apiUrl, async () => {
            const {data, error} = await auth!.auth.getSession();
            if (error || !data.session || data.session.user.id !== database.user) throw new Error('Sign in again to sync. Your local records are safe.');
            return data.session.access_token;
          });
          const after = (await database.pending())?.n ?? 0;
          if (!after) break;
          if (after >= before) throw new Error('Some changes need review before the server can accept them. They remain saved here.');
        }
        await database.preference('sync', {last_synced_at: new Date().toISOString()});
        if (database === repoRef.current) await refresh();
        return true;
      } catch (e) {
        if (database === repoRef.current) {
          setSyncError(e instanceof Error && e.message === 'AUTH_REQUIRED' ? 'Sign in again to sync.' : e instanceof Error && e.message.startsWith('Some changes') ? e.message : 'Could not reach cloud sync. We’ll retry while the app is open.');
          await refresh().catch(() => {});
        }
        return false;
      } finally { if (database === repoRef.current) setSyncing(false); }
    })();
    syncFlight.current = task;
    void task.finally(() => {if (syncFlight.current === task) syncFlight.current = null;});
    return task;
  }, [locked, connection, session, refresh]);
  const sync = useCallback(async () => {
    if (connection === 'offline') {notify('You’re offline. Keep using the app; your changes are saved on this device.'); return;}
    if (!session || !auth || !apiUrl || repoRef.current?.demo) {
      notify(repoRef.current?.demo ? 'Demo data stays on this device. Sign in to use your personal cloud account.' : 'Cloud sync needs account and server setup. All changes are saved on this device.'); return;
    }
    const ok = await performSync(); notify(ok ? 'Sync finished. Check the status for any changes needing review.' : 'Sync could not finish. Your local records are safe.');
  }, [connection, session, performSync, notify]);
  useEffect(() => {
    if (!session || !auth || !apiUrl || !repo || repo.demo || locked || connection === 'offline') return;
    let alive = true, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {clearTimeout(timer); timer = setTimeout(() => void attempt(), delay);};
    const attempt = async () => {
      if (!alive) return;
      if (Platform.OS !== 'web' && AppState.currentState !== 'active') {schedule(30_000); return;}
      const ok = await performSync(); failures = ok ? 0 : failures + 1;
      if (alive) schedule(retryDelay(failures));
    };
    // Reconnect and local writes schedule a sync. Network work never blocks SQLite forms.
    schedule(pending ? 800 : 0);
    const subscription = AppState.addEventListener('change', state => {if (state === 'active') {failures = 0; schedule(0);}});
    return () => {alive = false; clearTimeout(timer); subscription.remove();};
  }, [repo, locked, connection, session, pending, performSync]);

  const value: Context = {
    repo, records, home, mode: accountId ? 'private' : mode, busy, error, notice, locked, hasPin, pending, session, theme,
    connection, syncing, syncError, lastSynced, cloudConfigured: Boolean(auth && apiUrl),
    offlineReady: offline.availability, offlineUpdate: offline.updateAvailable,
    refresh, run, notify, start, unlock: () => setLocked(false), lock: () => setLocked(true), setHasPin, setTheme, sync, forgetAccount,
  };
  return <Life.Provider value={value}>{children}</Life.Provider>;
}
export function useLife() {const value = useContext(Life); if (!value) throw new Error('Life provider missing'); return value;}
