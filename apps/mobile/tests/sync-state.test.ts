import {describe, it, expect} from 'vitest';
import {connectionState, syncDescription, retryDelay, type SyncState} from '../src/sync-state';
const base: SyncState = {connection: 'online', demo: false, configured: true, signedIn: true, syncing: false, pending: 0, conflicts: 0, error: '', lastSynced: null};
describe('honest offline and cloud status', () => {
  it('does not infer a connection from missing information and respects unreachable internet', () => {
    expect(connectionState({})).toBe('unknown');
    expect(connectionState({isConnected: true, isInternetReachable: false})).toBe('offline');
    expect(connectionState({isConnected: true})).toBe('online');
  });
  it('does not claim cloud sync just because the device is online or the queue is empty', () => {
    expect(syncDescription({...base, configured: false}).label).toBe('Online · on device');
    expect(syncDescription(base).label).toBe('Ready to sync');
    expect(syncDescription({...base, demo: true}).label).toBe('Online · demo');
  });
  it('keeps queued writes visible offline and requires fresh sign-in for online sync', () => {
    expect(syncDescription({...base, connection: 'offline', pending: 3}).detail).toContain('3 changes saved');
    expect(syncDescription({...base, signedIn: false, pending: 3}).label).toBe('Sign in to sync');
  });
  it('never labels failed, conflicted, pending or active sync as fully synced', () => {
    const synced = {...base, lastSynced: '2026-10-19T06:00:00Z'};
    expect(syncDescription(synced).label).toBe('Synced');
    expect(syncDescription({...synced, pending: 1}).label).toBe('1 waiting to sync');
    expect(syncDescription({...synced, conflicts: 1}).label).toBe('Needs review');
    expect(syncDescription({...synced, error: 'Unavailable'}).label).toBe('Sync needs retry');
    expect(syncDescription({...synced, syncing: true}).label).toBe('Syncing…');
  });
  it('backs off transient failures with a five-minute maximum', () => {
    expect([0, 1, 2, 3, 10, 100].map(retryDelay)).toEqual([30000, 5000, 10000, 20000, 300000, 300000]);
  });
});
