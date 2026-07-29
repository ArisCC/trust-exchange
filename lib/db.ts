import 'server-only'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  BranchContact,
  ExchangeRequest,
  MatchProposal,
  TrustType as TrustTypeValue,
} from './types'

export type { TrustType, BranchContact, ExchangeRequest, MatchProposal } from './types'
export { TRUST_TYPE_LABELS } from './types'

const DB_PATH =
  process.env.TRUST_EXCHANGE_DB ?? '/Users/l.e.o./leo-data/trust-exchange/trust-exchange.db'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS exchange_requests (
  id              TEXT PRIMARY KEY,
  branch_code     TEXT NOT NULL,
  branch_name     TEXT NOT NULL,
  trust_type      TEXT NOT NULL DEFAULT 'disability',
  requested_count INTEGER NOT NULL,
  remaining_count INTEGER NOT NULL,
  -- 這些件數來自幾位不同客戶。同一客戶在同一分行只能計一件，所以這個數字就是
  -- 「跟任一家分行累計能交換的件數上限」。NULL = 尚未填寫，不做上限提醒。
  customer_count  INTEGER,
  status          TEXT NOT NULL DEFAULT 'waiting',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
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

-- 聯絡方式屬於分行，不屬於個別申請：一家分行登記多種信託類型時只填一次
CREATE TABLE IF NOT EXISTS branch_contacts (
  branch_code        TEXT PRIMARY KEY,
  contact_info       TEXT,
  notification_email TEXT,
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_req_branch  ON exchange_requests(branch_code);
CREATE INDEX IF NOT EXISTS idx_req_status  ON exchange_requests(status);
CREATE INDEX IF NOT EXISTS idx_prop_from   ON match_proposals(from_request_id);
CREATE INDEX IF NOT EXISTS idx_prop_to     ON match_proposals(to_request_id);
CREATE INDEX IF NOT EXISTS idx_prop_status ON match_proposals(status);
`

const hasColumn = (db: Database.Database, table: string, col: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(c => c.name === col)

/**
 * 依序套用的 schema 變更。索引 0 對應 user_version 1，以此類推。
 * 每個步驟都必須可以在「已經是新版」的資料庫上安全地跳過。
 */
const MIGRATIONS: ((db: Database.Database) => void)[] = [
  // v1：聯絡方式原本存在每一筆 exchange_requests 上，同一家分行登記多種信託類型
  // 時要重複填、也要逐筆改，實際資料裡因此出現同分行「#168」與「168」並存。
  // 搬到 branch_contacts 每家分行一筆，再移除舊欄位避免兩份來源打架。
  db => {
    if (!hasColumn(db, 'exchange_requests', 'contact_info')) return

    // 每家分行取「最新一筆非空」的值；contact_info 與 email 可能來自不同筆申請
    db.prepare(
      `INSERT OR IGNORE INTO branch_contacts (branch_code, contact_info, notification_email, updated_at)
       SELECT e.branch_code,
         (SELECT contact_info FROM exchange_requests x
           WHERE x.branch_code = e.branch_code AND TRIM(COALESCE(x.contact_info, '')) != ''
           ORDER BY x.created_at DESC LIMIT 1),
         (SELECT notification_email FROM exchange_requests x
           WHERE x.branch_code = e.branch_code AND TRIM(COALESCE(x.notification_email, '')) != ''
           ORDER BY x.created_at DESC LIMIT 1),
         ?
       FROM exchange_requests e GROUP BY e.branch_code`
    ).run(new Date().toISOString())

    db.exec('ALTER TABLE exchange_requests DROP COLUMN contact_info')
    db.exec('ALTER TABLE exchange_requests DROP COLUMN notification_email')

    const n = (db.prepare('SELECT COUNT(*) c FROM branch_contacts').get() as { c: number }).c
    console.log(`[db] 已將聯絡方式搬遷到 branch_contacts：${n} 家分行`)
  },

  // v2：新增 customer_count。既有資料一律留 NULL（未填）——
  // 預設成等於件數等於幫分行宣告一個可能不實的數字，寧可讓畫面提示他們補填。
  db => {
    if (hasColumn(db, 'exchange_requests', 'customer_count')) return
    db.exec('ALTER TABLE exchange_requests ADD COLUMN customer_count INTEGER')
    console.log('[db] exchange_requests 已新增 customer_count 欄位')
  },
]

const SCHEMA_VERSION = MIGRATIONS.length

function migrate(db: Database.Database) {
  // 整段包在 immediate 交易裡：多個行程同時啟動時只有一個拿到寫入鎖，
  // 其餘會等鎖釋放後看到 user_version 已更新而跳過。
  db.transaction(() => {
    const from = db.pragma('user_version', { simple: true }) as number
    if (from >= SCHEMA_VERSION) return
    for (let v = from; v < SCHEMA_VERSION; v++) MIGRATIONS[v](db)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
  }).immediate()
}

function open() {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // 等待鎖釋放而不是立刻丟 SQLITE_BUSY
  db.pragma('busy_timeout = 5000')
  db.exec(SCHEMA)
  migrate(db)
  return db
}

// dev 模式熱重載會重複執行模組，用 global 快取避免開出多個連線
const g = globalThis as unknown as { __trustExchangeDb?: Database.Database }

function getDb(): Database.Database {
  if (!g.__trustExchangeDb) g.__trustExchangeDb = open()
  return g.__trustExchangeDb
}

/**
 * 延遲開啟：`next build` 會 import 每個 route module 收集 metadata，
 * 若在模組載入時就連線，等於 build 一次就對正式資料庫跑一次 migration。
 * 用 Proxy 讓呼叫端寫法不變，但真正碰到 DB 時才初始化。
 */
export const db = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real, prop, receiver)
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export const nowISO = () => new Date().toISOString()
export const newId = () => randomUUID()

/** 產生 `?,?,?` 佔位字串，給 IN (...) 用 */
export const placeholders = (n: number) => Array(n).fill('?').join(',')

export const getRequest = (id: string) =>
  db.prepare('SELECT * FROM exchange_requests WHERE id = ?').get(id) as ExchangeRequest | undefined

export const getProposal = (id: string) =>
  db.prepare('SELECT * FROM match_proposals WHERE id = ?').get(id) as MatchProposal | undefined

export const getBranchContact = (branchCode: string) =>
  db.prepare('SELECT * FROM branch_contacts WHERE branch_code = ?').get(branchCode) as
    | BranchContact
    | undefined

/** 寫入分行聯絡方式；空字串一律存成 NULL */
export function setBranchContact(
  branchCode: string,
  contactInfo: string | null,
  notificationEmail: string | null
) {
  db.prepare(
    `INSERT INTO branch_contacts (branch_code, contact_info, notification_email, updated_at)
     VALUES (@code, @contact, @email, @now)
     ON CONFLICT(branch_code) DO UPDATE SET
       contact_info = @contact, notification_email = @email, updated_at = @now`
  ).run({
    code: branchCode,
    contact: contactInfo?.trim() || null,
    email: notificationEmail?.trim() || null,
    now: nowISO(),
  })
}

/**
 * 兩家分行之間、某一信託類型已經交換掉的件數（已確認 ＋ 待確認佔用中）。
 *
 * 用途是提醒「同一客戶在同一分行只能計一件」的上限：一筆登記能跟任一家分行
 * 累計交換的件數，不該超過它的 customer_count。取消掉的配對不算在內。
 */
export function exchangedBetween(
  branchA: string,
  branchB: string,
  trustType: TrustTypeValue
): { confirmed: number; pending: number } {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN p.status = 'confirmed' THEN p.proposed_count END), 0) AS confirmed,
         COALESCE(SUM(CASE WHEN p.status = 'pending'   THEN p.proposed_count END), 0) AS pending
       FROM match_proposals p
       JOIN exchange_requests r ON r.id = p.from_request_id
       WHERE p.status IN ('confirmed', 'pending')
         AND r.trust_type = @type
         AND ((p.from_branch_code = @a AND p.to_branch_code = @b)
           OR (p.from_branch_code = @b AND p.to_branch_code = @a))`
    )
    .get({ a: branchA, b: branchB, type: trustType }) as { confirmed: number; pending: number }
  return row
}

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
