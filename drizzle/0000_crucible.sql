CREATE TABLE seeds (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  mechanism TEXT NOT NULL,
  roles TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  invite_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE branches (
  id TEXT PRIMARY KEY NOT NULL,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  kind TEXT NOT NULL,
  proposal TEXT NOT NULL,
  weight INTEGER CHECK (weight BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE INDEX branches_by_seed ON branches(seed_id);
