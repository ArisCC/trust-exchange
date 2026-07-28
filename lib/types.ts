// 前後端共用的型別與常數。
// 這個檔案不能 import 任何 Node 模組 —— 它會被打包進 client bundle。

export type TrustType = 'disability' | 'general' | 'care'

export const TRUST_TYPE_LABELS: Record<TrustType, string> = {
  disability: '身心障礙預開式',
  general: '一般預開式',
  care: '安養信託(30萬)',
}

export type ExchangeRequest = {
  id: string
  branch_code: string
  branch_name: string
  trust_type: TrustType
  requested_count: number
  remaining_count: number
  contact_info: string | null
  notification_email: string | null
  status: 'waiting' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
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
