import 'server-only'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ExchangeRequest, MatchProposal } from './types'

export type { TrustType, ExchangeRequest, MatchProposal } from './types'
export { TRUST_TYPE_LABELS } from './types'

const DB_PATH =
  process.env.TRUST_EXCHANGE_DB ?? '/Users/l.e.o./leo-data/trust-exchange/trust-exchange.db'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS exchange_requests (
  id                 TEXT PRIMARY KEY,
  branch_code        TEXT NOT NULL,
  branch_name        TEXT NOT NULL,
  trust_type         TEXT NOT NULL DEFAULT 'disability',
  requested_count    INTEGER NOT NULL,
  remaining_count    INTEGER NOT NULL,
  contact_info       TEXT,
  notification_email TEXT,
  status             TEXT NOT NULL DEFAULT 'waiting',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS match_proposals (
  id                  TEXT PRIMARY KEY,
  from_request_id     TEXT NOT NULL REFERENCES exchange_requests(id),
  to_request_id       TEXT NOT NULL REFERENCES exchange_requests(id),
  from_branch_code    TEXT NOT NULL,
  from_branch_name    TEXT NOT NULL,
  to_branch_code      TEXT NOT NULL,
  to_branch_name      TEXT NOT NULL,
  proposed_count      INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  cancel_requested_by TEXT,
  cancel_status       TEXT NOT NULL DEFAULT 'none',
  created_at          TEXT NOT NULL,
  confirmed_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_req_branch  ON exchange_requests(branch_code);
CREATE INDEX IF NOT EXISTS idx_req_status  ON exchange_requests(status);
CREATE INDEX IF NOT EXISTS idx_prop_from   ON match_proposals(from_request_id);
CREATE INDEX IF NOT EXISTS idx_prop_to     ON match_proposals(to_request_id);
CREATE INDEX IF NOT EXISTS idx_prop_status ON match_proposals(status);
`

function open() {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // 等待鎖釋放而不是立刻丟 SQLITE_BUSY
  db.pragma('busy_timeout = 5000')
  db.exec(SCHEMA)
  return db
}

// dev 模式熱重載會重複執行模組，用 global 快取避免開出多個連線
const g = globalThis as unknown as { __trustExchangeDb?: Database.Database }
export const db = g.__trustExchangeDb ?? open()
if (process.env.NODE_ENV !== 'production') g.__trustExchangeDb = db

export const nowISO = () => new Date().toISOString()
export const newId = () => randomUUID()

/** 產生 `?,?,?` 佔位字串，給 IN (...) 用 */
export const placeholders = (n: number) => Array(n).fill('?').join(',')

export const getRequest = (id: string) =>
  db.prepare('SELECT * FROM exchange_requests WHERE id = ?').get(id) as ExchangeRequest | undefined

export const getProposal = (id: string) =>
  db.prepare('SELECT * FROM match_proposals WHERE id = ?').get(id) as MatchProposal | undefined

/** 這筆申請被 pending 提案佔用的件數（含正向與反向） */
export function pendingCommitted(requestId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(proposed_count), 0) AS n FROM match_proposals
       WHERE (from_request_id = ? OR to_request_id = ?) AND status = 'pending'`
    )
    .get(requestId, requestId) as { n: number }
  return row.n
}
