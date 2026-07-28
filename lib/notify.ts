import { Resend } from 'resend'
import { getBranchContact } from './db'
import { TRUST_TYPE_LABELS, type ExchangeRequest, type MatchProposal } from './types'

const API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.NOTIFY_FROM ?? '信託案件交換平台 <noreply@aris7.me>'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://exchange.aris7.me'

const resend = API_KEY ? new Resend(API_KEY) : null

const typeLabel = (r: ExchangeRequest) => TRUST_TYPE_LABELS[r.trust_type] ?? r.trust_type

// 每一層都要明確指定背景色與文字色：信箱的深色模式只會反轉沒指定顏色的元素，
// 只設文字色不設背景色的話，深灰字會落在深色底上變成看不見。
function shell(title: string, lines: string[], branchCode: string) {
  const body = lines
    .map(l => `<p style="margin:0 0 8px;color:#1f2937">${l}</p>`)
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:#f3f4f6;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:520px;background-color:#ffffff;border-radius:12px;padding:28px">
      <tr><td style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">
        <h2 style="font-size:18px;margin:0 0 16px;color:#111827">${title}</h2>
        ${body}
        <p style="margin:24px 0 0">
          <a href="${BASE_URL}/branch/${branchCode}"
             style="background-color:#2563eb;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">
            前往處理
          </a>
        </p>
        <p style="margin:24px 0 0;font-size:12px;color:#6b7280">
          本信由信託案件交換平台自動發送，請勿直接回覆。
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`
}

/**
 * 寄出通知。沒設定 RESEND_API_KEY 或收件人沒填通知信箱時直接略過。
 * 一律不拋錯 —— 通知失敗不能影響配對主流程。
 */
async function send(to: string | null, subject: string, html: string) {
  if (!resend || !to) return
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) console.error('[notify] 寄送失敗:', error)
  } catch (err) {
    console.error('[notify] 寄送例外:', err)
  }
}

/** 有人對你的申請送出配對提案 → 通知被提案方 */
export function notifyProposal(
  proposal: MatchProposal,
  toRequest: ExchangeRequest,
  fromRequest: ExchangeRequest
) {
  const fromContact = getBranchContact(proposal.from_branch_code)?.contact_info
  const subject = `【配對提案】${proposal.from_branch_name} 想與您交換 ${proposal.proposed_count} 件`
  const html = shell(
    '您收到一筆新的配對提案',
    [
      `<b>${proposal.from_branch_name}</b>（${proposal.from_branch_code}）想與您交換 <b>${proposal.proposed_count} 件</b>。`,
      `信託類型：${typeLabel(toRequest)}`,
      fromContact ? `對方聯絡方式：${fromContact}` : '',
      '請進入平台確認或婉拒這筆提案。',
    ].filter(Boolean),
    proposal.to_branch_code
  )
  void send(getBranchContact(proposal.to_branch_code)?.notification_email ?? null, subject, html)
}

/** 提案被接受 → 通知提案方（被提案方是本人操作，不用寄） */
export function notifyConfirmed(
  proposal: MatchProposal,
  fromRequest: ExchangeRequest,
  toRequest: ExchangeRequest
) {
  const toContact = getBranchContact(proposal.to_branch_code)?.contact_info
  const subject = `【配對成功】${proposal.to_branch_name} 已接受您的 ${proposal.proposed_count} 件交換`
  const html = shell(
    '配對成功',
    [
      `<b>${proposal.to_branch_name}</b>（${proposal.to_branch_code}）已接受您的配對提案。`,
      `交換件數：<b>${proposal.proposed_count} 件</b>`,
      `信託類型：${typeLabel(fromRequest)}`,
      toContact ? `對方聯絡方式：${toContact}` : '',
    ].filter(Boolean),
    proposal.from_branch_code
  )
  void send(getBranchContact(proposal.from_branch_code)?.notification_email ?? null, subject, html)
}

/** 提案被婉拒 → 通知提案方 */
export function notifyRejected(proposal: MatchProposal, fromRequest: ExchangeRequest) {
  const subject = `【提案未成立】${proposal.to_branch_name} 婉拒了您的配對提案`
  const html = shell(
    '提案未成立',
    [
      `<b>${proposal.to_branch_name}</b>（${proposal.to_branch_code}）婉拒了您的 ${proposal.proposed_count} 件配對提案。`,
      '您的件數已保留，可以再找其他分行配對。',
    ],
    proposal.from_branch_code
  )
  void send(getBranchContact(proposal.from_branch_code)?.notification_email ?? null, subject, html)
}
