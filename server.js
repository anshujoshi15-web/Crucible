import { createServer } from 'node:http';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from './dist/server/index.js';

const port = Number(process.env.PORT ?? process.env.CRUCIBLE_PORT ?? 8787);
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
const dataDir = process.env.CRUCIBLE_DATA_DIR ?? '.local';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid server port.');
await mkdir(dataDir, { recursive: true, mode: 0o700 });
const database = new DatabaseSync(join(dataDir, 'crucible.sqlite'));
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY);
`);

function transaction(work) {
  database.exec('BEGIN');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

for (const name of (await readdir('drizzle')).filter(name => name.endsWith('.sql')).sort()) {
  const applied = database.prepare('SELECT 1 FROM local_migrations WHERE name = ?').get(name);
  if (applied) continue;
  const migration = await readFile('drizzle/' + name, 'utf8');
  transaction(() => {
    database.exec(migration);
    database.prepare('INSERT INTO local_migrations VALUES (?)').run(name);
  });
}

const DB = {
  prepare(sql) {
    const statement = database.prepare(sql);
    return {
      bind(...args) {
        return {
          first: () => statement.get(...args) ?? null,
          all: () => ({results: statement.all(...args)}),
          run: () => ({success: true, meta: statement.run(...args)})
        };
      }
    };
  },
  batch(statements) {
    return transaction(() => statements.map(statement => statement.run()));
  }
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const method = incoming.method;
    const options = {method, headers: incoming.headers};
    if (method !== 'GET' && method !== 'HEAD') {
      options.body = Readable.toWeb(incoming);
      options.duplex = 'half';
    }
    const request = new Request(new URL(incoming.url, 'http://localhost:' + port), options);
    const response = await worker.fetch(request, {DB});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error);
    if (outgoing.headersSent) outgoing.destroy();
    else outgoing.writeHead(500).end('Local server error.');
  }
});
server.listen(port, host, () => console.log('Crucible is listening on ' + host + ':' + port));
