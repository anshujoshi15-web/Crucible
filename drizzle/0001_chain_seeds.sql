CREATE TABLE chain_seeds (
  workspace_id TEXT PRIMARY KEY REFERENCES seeds(id),
  chain_seed_id TEXT NOT NULL UNIQUE,
  transaction_hash TEXT NOT NULL UNIQUE,
  originator TEXT NOT NULL
);
