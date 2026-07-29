// 前後端共用的型別與常數。
// 這個檔案不能 import 任何 Node 模組 —— 它會被打包進 client bundle。

export type TrustType = 'disability' | 'general' | 'care'

export const TRUST_TYPE_LABELS: Record<TrustType, string> = {
  disability: '身心障礙預開式',
  general: '一般預開式',
  care: '安養信託(30萬)',
}

/** 分行層級的聯絡方式，一家分行一筆（不隨信託類型重複） */
export type BranchContact = {
  branch_code: string
  contact_info: string | null
  notification_email: string | null
  updated_at: string
}

export type ExchangeRequest = {
  id: string
  branch_code: string
  branch_name: string
  trust_type: TrustType
  requested_count: number
  remaining_count: number
  /** 這些件數來自幾位不同客戶；即與任一分行累計可交換的上限。null = 未填 */
  customer_count: number | null
  status: 'waiting' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
  /** 由 branch_contacts JOIN 進來，方便看板直接顯示 */
  contact_info?: string | null
}

export type MatchProposal = {
  id: string
  from_request_id: string
  to_request_id: string
  from_branch_code: string
  from_branch_name: string
  to_branch_code: string
  to_branch_name: string
  proposed_count: number
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'
  cancel_requested_by: string | null
  cancel_status: 'none' | 'pending' | 'rejected'
  created_at: string
  confirmed_at: string | null
}
