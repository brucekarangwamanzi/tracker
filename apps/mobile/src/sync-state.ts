export type Connection = 'unknown' | 'online' | 'offline';
export function connectionState(state: { isConnected?: boolean; isInternetReachable?: boolean }): Connection {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  if (state.isConnected === true || state.isInternetReachable === true) return 'online';
  return 'unknown';
}

export interface SyncState {
  connection: Connection;
  demo: boolean;
  configured: boolean;
  signedIn: boolean;
  syncing: boolean;
  pending: number;
  conflicts: number;
  error: string;
  lastSynced: string | null;
}
export function syncDescription(state: SyncState): { label: string; detail: string; tone: 'green' | 'amber' | 'red'; icon: 'cloud-offline-outline' | 'cloud-done-outline' | 'sync-outline' | 'phone-portrait-outline' | 'alert-circle-outline' } {
  const saved = state.pending ? `${state.pending} change${state.pending === 1 ? '' : 's'} saved on this device.` : 'Your records are saved on this device.';
  if (state.connection === 'offline') return { label: 'Offline · saved here', detail: `${saved} Keep using the app. ${state.configured ? 'Reconnect and sign in to sync.' : 'Cloud sync is not configured yet.'}`, tone: 'amber', icon: 'cloud-offline-outline' };
  if (state.demo) return { label: state.connection === 'online' ? 'Online · demo' : 'Demo · on device', detail: 'Sample data stays on this device and is never uploaded to a personal account.', tone: 'green', icon: 'phone-portrait-outline' };
  if (!state.configured) return { label: state.connection === 'online' ? 'Online · on device' : 'Saved on device', detail: `${saved} Cloud sync needs account and server setup.`, tone: 'amber', icon: 'phone-portrait-outline' };
  if (!state.signedIn) return { label: 'Sign in to sync', detail: `${saved} Your local dashboard stays available; sign in online to sync.`, tone: 'amber', icon: 'cloud-offline-outline' };
  if (state.syncing) return { label: 'Syncing…', detail: `${saved} You can keep adding entries while sync runs.`, tone: 'green', icon: 'sync-outline' };
  if (state.conflicts) return { label: 'Needs review', detail: `${state.conflicts} conflict${state.conflicts === 1 ? '' : 's'} need your choice. Both versions are retained.`, tone: 'amber', icon: 'alert-circle-outline' };
  if (state.error) return { label: 'Sync needs retry', detail: `${saved} ${state.error}`, tone: 'amber', icon: 'alert-circle-outline' };
  if (state.pending) return { label: `${state.pending} waiting to sync`, detail: `${saved} Changes sync automatically while the app is open and connected.`, tone: 'amber', icon: 'sync-outline' };
  if (state.lastSynced) return { label: 'Synced', detail: 'All queued changes have been accepted. This device has the latest downloaded records.', tone: 'green', icon: 'cloud-done-outline' };
  return { label: 'Ready to sync', detail: `${saved} Waiting for the first successful sync.`, tone: 'green', icon: 'sync-outline' };
}

export function retryDelay(failures: number): number {
  return failures === 0 ? 30_000 : Math.min(300_000, 5_000 * 2 ** Math.min(6, failures - 1));
}
