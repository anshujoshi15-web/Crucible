import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const assets = {};
for (const file of ['index.html', 'about.html', 'help.html', 'contact.html', 'app.js', 'shared.js', 'admin.html', 'admin.js', 'wallet.js']) {
  assets[file] = await readFile('web/' + file, 'utf8');
}
const server = await readFile('worker/index.mjs', 'utf8');
await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await writeFile('dist/server/index.js', 'const assets = ' + JSON.stringify(assets) + ';\n' + server);
