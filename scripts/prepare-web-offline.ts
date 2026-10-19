import {createHash} from 'node:crypto';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function prepareWebOffline(root = resolve(project, 'apps/mobile/dist')) {
  const index = join(root, 'index.html');
  let html = await readFile(index, 'utf8');
  if (!html.includes('rel="manifest"')) html = html.replace('</head>', '<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0C1424"></head>');
  await writeFile(index, html);
  await writeFile(join(root, 'app-icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0C1424"/><path d="M162 126h103c77 0 109 33 109 75 0 30-17 50-40 60 32 12 50 36 50 69 0 50-40 82-113 82H162zm63 55v59h39c29 0 46-10 46-30s-15-29-44-29zm0 111v65h46c32 0 49-11 49-33 0-21-16-32-49-32z" fill="#77E3B2"/></svg>');
  await writeFile(join(root, 'manifest.webmanifest'), JSON.stringify({id: '/', name: 'Bruce’s Life', short_name: 'Bruce’s Life', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', theme_color: '#0C1424', background_color: '#0C1424', icons: [{src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any'}]}, null, 2));
  async function walk(directory: string): Promise<string[]> {
    const paths: string[] = [];
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) paths.push(...await walk(path));
      else if (!entry.name.endsWith('.map') && entry.name !== 'sw.js' && entry.name !== 'metadata.json') paths.push(path);
    }
    return paths;
  }
  const files = (await walk(root)).sort(), hash = createHash('sha256');
  const template = await readFile(join(project, 'scripts/service-worker.template.js'), 'utf8');
  hash.update(template);
  for (const file of files) { hash.update(relative(root, file)); hash.update(await readFile(file)); }
  const cache = `bruces-life-shell-${hash.digest('hex').slice(0, 20)}`;
  const urls = files.map(path => '/' + relative(root, path).split('\\').join('/'));
  const worker = template.replace('__CACHE_NAME__', JSON.stringify(cache)).replace('__PRECACHE_FILES__', JSON.stringify(urls));
  await writeFile(join(root, 'sw.js'), worker);
  return {cache, files: urls};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await prepareWebOffline();
  console.log(`Offline app prepared: ${result.files.length} static files (${result.cache}).`);
}
