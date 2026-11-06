import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tokens (
  token_id TEXT PRIMARY KEY,
  vault_id TEXT,
  owner_id TEXT,
  creator TEXT,
  title TEXT,
  category TEXT,
  bg TEXT,
  rarity TEXT,
  basket TEXT NOT NULL DEFAULT '[]',
  minted_at INTEGER
);
CREATE TABLE IF NOT EXISTS vault_balances (
  token_id TEXT NOT NULL,
  ft_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (token_id, ft_id)
);
CREATE TABLE IF NOT EXISTS listings (
  token_id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  price TEXT NOT NULL,
  listed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  token_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (token_id, buyer_id)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  block_height INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  tx_hash TEXT,
  receipt_id TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  contract_id TEXT NOT NULL,
  standard TEXT NOT NULL,
  event TEXT NOT NULL,
  token_id TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  UNIQUE (receipt_id, log_index, item_index, token_id)
);
CREATE INDEX IF NOT EXISTS events_token ON events (token_id, ts);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE TABLE IF NOT EXISTS pulls (
  token_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  rarity TEXT NOT NULL,
  pity_after INTEGER NOT NULL,
  price TEXT NOT NULL,
  ts INTEGER NOT NULL
);
-- USD price per token key (prices.ts); one snapshot writes every key with the same at.
CREATE TABLE IF NOT EXISTS price_snapshots (
  at INTEGER NOT NULL,
  key TEXT NOT NULL,
  usd REAL NOT NULL,
  PRIMARY KEY (at, key)
);
CREATE TABLE IF NOT EXISTS nav_snapshots (
  token_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  nav_usd REAL NOT NULL,
  PRIMARY KEY (token_id, at)
);
CREATE TABLE IF NOT EXISTS cursor (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  height INTEGER NOT NULL
);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;" + SCHEMA);
  return db;
}

export const all = <T>(db: Db, sql: string, ...p: SQLInputValue[]) => db.prepare(sql).all(...p) as T[];
export const get = <T>(db: Db, sql: string, ...p: SQLInputValue[]) => db.prepare(sql).get(...p) as T | undefined;
export const run = (db: Db, sql: string, ...p: SQLInputValue[]) => db.prepare(sql).run(...p);

export const getCursor = (db: Db) => get<{ height: number }>(db, "SELECT height FROM cursor WHERE id = 1")?.height ?? null;
export const setCursor = (db: Db, h: number) =>
  run(db, "INSERT INTO cursor (id, height) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET height = excluded.height", h);
