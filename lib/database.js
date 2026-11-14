import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let db;

export function getDatabase() {
  db ??= openDatabase();
  return db;
}

function openDatabase() {
  const dataDir = process.env.CRUCIBLE_DATA_DIR ?? '.local';
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(join(dataDir, 'crucible.sqlite'));
  database.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY);
  `);

  function transaction(work) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  for (const name of (readdirSync('drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    const migration = readFileSync('drizzle/' + name, 'utf8');
    transaction(() => {
      if (database.prepare('SELECT 1 FROM local_migrations WHERE name = ?').get(name)) return;
      database.exec(migration);
      database.prepare('INSERT INTO local_migrations VALUES (?)').run(name);
    });
  }

  return {
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
}
