import {describe, it, expect} from 'vitest';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {prepareWebOffline} from '../scripts/prepare-web-offline.js';

const origin = 'https://life.example';
type WorkerEvent = {request?: {url: string; method: string; mode: string; headers: Headers}; waitUntil: (promise: Promise<unknown>) => void; respondWith: (promise: Promise<Response>) => void};
function harness(source: string) {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  let online = true, claimed = false;
  const requested: string[] = [];
  class WorkerRequest extends Request {constructor(url: string, options?: RequestInit) {super(new URL(url, origin), options);}}
  const fetcher = async (input: string | Request) => {
    const url = typeof input === 'string' ? new URL(input, origin).href : input.url;
    requested.push(url);
    if (!online) throw new Error('Offline');
    return new Response(url.endsWith('/index.html') ? '<div id="root">App shell</div>' : 'static asset', {headers: {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp'}});
  };
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const rows = stores.get(name)!;
      return {
        async addAll(requests: Request[]) {
          const responses = await Promise.all(requests.map(request => fetcher(request)));
          requests.forEach((request, i) => rows.set(new URL(request.url).pathname, responses[i]!));
        },
        async match(path: string) {return rows.get(path)?.clone();},
        async put(path: string, response: Response) {rows.set(path, response.clone());},
      };
    },
    async keys() {return [...stores.keys()];},
    async delete(name: string) {return stores.delete(name);},
  };
  runInNewContext(source, {URL, Request: WorkerRequest, fetch: fetcher, caches, self: {location: {origin}, clients: {async claim() {claimed = true;}}, addEventListener: (name: string, fn: (event: WorkerEvent) => void) => handlers.set(name, fn)}});
  async function lifecycle(name: string) {
    let result: Promise<unknown> | undefined;
    handlers.get(name)!({waitUntil: promise => {result = promise;}, respondWith: () => {}});
    await result;
  }
  async function request(path: string, options: {method?: string; mode?: string; auth?: boolean} = {}) {
    let result: Promise<Response> | undefined;
    handlers.get('fetch')!({request: {url: new URL(path, origin).href, method: options.method ?? 'GET', mode: options.mode ?? 'cors', headers: new Headers(options.auth ? {authorization: 'Bearer private'} : {})}, waitUntil: () => {}, respondWith: promise => {result = promise;}});
    return result ? await result : undefined;
  }
  return {stores, requested, lifecycle, request, offline: () => {online = false;}, claimed: () => claimed};
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'bruce-offline-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<html><head></head><body><div id="root"></div></body></html>');
  await writeFile(join(directory, 'assets', 'app.js'), '/* app */');
  await writeFile(join(directory, 'assets', 'sqlite.wasm'), 'wasm fixture');
  await writeFile(join(directory, 'assets', 'worker.js'), '/* sqlite worker */');
  return directory;
}
describe('offline exported app', () => {
  it('creates a stable revision including all worker/WASM/assets, changing on rebuild', async () => {
    const root = await fixture();
    try {
      const first = await prepareWebOffline(root), second = await prepareWebOffline(root);
      expect(first.cache).toBe(second.cache);
      expect(first.files).toEqual(expect.arrayContaining(['/index.html', '/assets/sqlite.wasm', '/assets/worker.js', '/manifest.webmanifest']));
      expect(first.files).not.toContain('/sw.js');
      expect(await readFile(join(root, 'index.html'), 'utf8')).toContain('rel="manifest"');
      await writeFile(join(root, 'assets/app.js'), '/* new app */');
      expect((await prepareWebOffline(root)).cache).not.toBe(first.cache);
    } finally {await rm(root, {recursive: true, force: true});}
  });
  it('reopens a deep link offline with isolation headers and cached SQLite assets', async () => {
    const root = await fixture();
    try {
      await prepareWebOffline(root);
      const worker = harness(await readFile(join(root, 'sw.js'), 'utf8'));
      await worker.lifecycle('install'); await worker.lifecycle('activate');
      expect(worker.claimed()).toBe(true); worker.offline();
      const page = await worker.request('/loan/example', {mode: 'navigate'});
      expect(await page!.text()).toContain('App shell');
      expect(page!.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
      expect(await (await worker.request('/assets/sqlite.wasm'))!.text()).toBe('static asset');
      expect(await (await worker.request('/assets/worker.js'))!.text()).toBe('static asset');
    } finally {await rm(root, {recursive: true, force: true});}
  });
  it('never intercepts authentication, API requests, foreign URLs, exports or financial writes', async () => {
    const root = await fixture();
    try {
      await prepareWebOffline(root); const worker = harness(await readFile(join(root, 'sw.js'), 'utf8'));
      await worker.lifecycle('install'); worker.offline();
      expect(await worker.request('/sync/pull')).toBeUndefined();
      expect(await worker.request('/sync/push', {method: 'POST'})).toBeUndefined();
      expect(await worker.request('/dashboard', {mode: 'navigate'})).toBeUndefined();
      expect(await worker.request('/assets/app.js', {auth: true})).toBeUndefined();
      expect(await worker.request('https://auth.example/sign-in', {mode: 'navigate'})).toBeUndefined();
      expect(await worker.request('/private-export.csv')).toBeUndefined();
    } finally {await rm(root, {recursive: true, force: true});}
  });
  it('fails incomplete installs and cleans only this app’s old caches on activation', async () => {
    const root = await fixture();
    try {
      const {cache} = await prepareWebOffline(root), worker = harness(await readFile(join(root, 'sw.js'), 'utf8'));
      worker.offline(); await expect(worker.lifecycle('install')).rejects.toThrow('Offline');
      expect(worker.claimed()).toBe(false);
      worker.stores.set('bruces-life-shell-old', new Map()); worker.stores.set('other-app', new Map());
      // Activation is invoked only by the browser after successful installation.
      await worker.lifecycle('activate');
      expect(worker.stores.has(cache)).toBe(true); expect(worker.stores.has('bruces-life-shell-old')).toBe(false); expect(worker.stores.has('other-app')).toBe(true);
    } finally {await rm(root, {recursive: true, force: true});}
  });
});
