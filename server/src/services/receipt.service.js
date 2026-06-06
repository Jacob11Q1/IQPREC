/* ============================================================
   IQPREC — services/receipt.service.js
   Every successful payment triggers an official, professional receipt:
   a row in the receipts table + a branded invoice email (Resend),
   delivered immediately. Fail-safe: if RESEND_API_KEY is missing the
   email is logged instead of thrown, and a Resend/DB error never breaks
   the payment flow (receipts are best-effort after money is captured).
   ============================================================ */

import crypto from 'node:crypto';
import { Resend } from 'resend';

import { env } from '../config/env.js';
import { supabase, hasDb } from '../db/client.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const FROM = env.RESEND_FROM || 'IQPREC <receipts@iqprec.com>';

const C = {
  navy: '#0B1929', card: '#132235', green: '#00D97E', white: '#FFFFFF',
  text: '#C7D2DE', muted: '#6B7F99', border: '#1A3255',
};

/** Unique, human-readable receipt number: IQ-YYYYMMDD-XXXXXX. */
export function generateReceiptNumber() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `IQ-${ymd}-${rand}`;
}

function fmtMoney(amount, currency = 'usd') {
  const sym = currency.toLowerCase() === 'usd' ? '$' : '';
  return `${sym}${Number(amount).toFixed(2)} ${currency.toUpperCase()}`;
}

function fmtDate(d, lang) {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(date);
}

async function send({ to, subject, html }) {
  if (!resend) {
    console.log(`[receipt:dev] (RESEND_API_KEY unset) → to=${to} | subject="${subject}"`);
    return { dev: true };
  }
  try {
    const result = await resend.emails.send({ from: FROM, to, subject, html });
    if (result?.error) console.error('[receipt] Resend error:', result.error);
    return result;
  } catch (err) {
    console.error('[receipt] send failed:', err?.message || err);
    return { error: err?.message || 'send_failed' };
  }
}

/* ------------------------------------------------------------
   Branded invoice HTML
   ------------------------------------------------------------ */
function invoiceHtml({ lang, fullName, receiptNumber, planLabel, amount, currency, paidAt, nextLine }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const year = new Date().getFullYear();
  const name = fullName || (lang === 'ar' ? 'صديقنا' : 'there');

  const L =
    lang === 'ar'
      ? {
          heading: 'إيصال الدفع',
          hi: `شكراً لك ${name}! تم استلام دفعتك بنجاح.`,
          receipt: 'رقم الإيصال', date: 'التاريخ', plan: 'الخطة',
          amount: 'المبلغ المدفوع', paid: 'مدفوع',
        }
      : {
          heading: 'Payment Receipt',
          hi: `Thank you, ${name}! Your payment was received successfully.`,
          receipt: 'Receipt No.', date: 'Date', plan: 'Plan',
          amount: 'Amount paid', paid: 'PAID',
        };

  const row = (label, value, mono = false) => `
    <tr>
      <td style="padding:10px 0;color:${C.muted};font-size:14px;">${label}</td>
      <td style="padding:10px 0;color:${C.white};font-size:14px;text-align:${lang === 'ar' ? 'left' : 'right'};${mono ? "font-family:'Courier New',monospace;" : ''}">${value}</td>
    </tr>`;

  return `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:${C.navy};font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.navy};padding:32px 16px;"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.card};border-radius:16px;overflow:hidden;border:1px solid ${C.border};">
        <tr><td style="padding:28px 32px 18px;text-align:center;">
          <div style="font-size:30px;font-weight:800;letter-spacing:1px;"><span style="color:${C.green};">IQ</span><span style="color:${C.white};">PREC</span></div>
          <div style="height:3px;width:64px;background:${C.green};margin:14px auto 0;border-radius:2px;"></div>
        </td></tr>
        <tr><td style="padding:8px 32px;text-align:${align};" dir="${dir}">
          <h1 style="color:${C.white};font-size:21px;margin:8px 0 6px;">${L.heading}</h1>
          <span style="display:inline-block;background:rgba(0,217,126,0.15);color:${C.green};font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;">${L.paid}</span>
          <p style="color:${C.text};font-size:15px;line-height:1.7;margin:16px 0;">${L.hi}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border};border-bottom:1px solid ${C.border};margin:8px 0;">
            ${row(L.receipt, receiptNumber, true)}
            ${row(L.date, fmtDate(paidAt, lang))}
            ${row(L.plan, planLabel)}
            ${row(L.amount, `<strong style="color:${C.green};">${fmtMoney(amount, currency)}</strong>`)}
          </table>
          ${nextLine ? `<p style="color:${C.muted};font-size:13px;margin:12px 0 0;">${nextLine}</p>` : ''}
        </td></tr>
        <tr><td style="padding:24px 32px 28px;text-align:center;border-top:1px solid ${C.border};">
          <div style="color:${C.muted};font-size:12px;line-height:1.6;">Intelligence. Precision. Every Gameweek.<br>All Rights Reserved © IQPREC ${year}</div>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

/* ------------------------------------------------------------
   sendReceiptEmail — persist a receipt row + email the invoice.
   ------------------------------------------------------------ */
export async function sendReceiptEmail({
  userId, email, fullName, language = 'ar',
  plan, billingCycle, amount, currency = 'usd', periodEnd = null,
}) {
  const receiptNumber = generateReceiptNumber();
  const paidAt = new Date();

  // 1) Persist the receipt record (best-effort).
  if (hasDb()) {
    const { error } = await supabase.from('receipts').insert({
      user_id: userId,
      receipt_number: receiptNumber,
      amount,
      currency,
      plan,
      billing_cycle: billingCycle,
      payment_provider: 'stripe',
      paid_at: paidAt.toISOString(),
    });
    if (error) console.error('[receipt] insert failed:', error.message);
  }

  // 2) Build + send the branded invoice email.
  const planLabel =
    plan === 'season'
      ? (language === 'ar' ? 'باقة الموسم' : 'Season Pass')
      : (language === 'ar' ? 'اشتراك شهري' : 'Monthly Subscription');

  let nextLine = null;
  if (plan === 'season' && periodEnd) {
    nextLine =
      language === 'ar'
        ? `وصولك مفعّل حتى ${fmtDate(periodEnd, language)}.`
        : `Your access is active until ${fmtDate(periodEnd, language)}.`;
  } else if (plan === 'monthly') {
    nextLine =
      language === 'ar'
        ? 'يتجدّد اشتراكك تلقائياً كل شهر. يمكنك الإلغاء في أي وقت.'
        : 'Your subscription renews automatically each month. Cancel anytime.';
  }

  const subject =
    language === 'ar'
      ? `إيصال الدفع ${receiptNumber} — IQPREC`
      : `Payment Receipt ${receiptNumber} — IQPREC`;

  await send({
    to: email,
    subject,
    html: invoiceHtml({
      lang: language, fullName, receiptNumber, planLabel,
      amount, currency, paidAt, nextLine,
    }),
  });

  return receiptNumber;
}

/* ------------------------------------------------------------
   sendSeasonRenewalEmail — warm renewal nudge when a season pass
   expires (sent by the daily expiry cron).
   ------------------------------------------------------------ */
export async function sendSeasonRenewalEmail({ email, fullName, language = 'ar' }) {
  const name = fullName || (language === 'ar' ? 'صديقنا' : 'there');
  const link = `${env.FRONTEND_URL || 'https://iqprec.com'}/billing.html`;
  const year = new Date().getFullYear();

  const inner =
    language === 'ar'
      ? `<h1 style="color:${C.white};font-size:21px;margin:8px 0 12px;text-align:right;">انتهت باقة موسمك</h1>
         <p style="color:${C.text};font-size:15px;line-height:1.7;margin:0 0 16px;text-align:right;">أهلاً ${name}، انتهت باقة موسمك في IQPREC. جدّدها الآن لتبقى في الصدارة كل جولة.</p>`
      : `<h1 style="color:${C.white};font-size:21px;margin:8px 0 12px;">Your season pass has ended</h1>
         <p style="color:${C.text};font-size:15px;line-height:1.7;margin:0 0 16px;">Hi ${name}, your IQPREC season pass has ended. Renew now to keep your edge every gameweek.</p>`;

  const html = `<!DOCTYPE html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"></head>
  <body style="margin:0;background:${C.navy};font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
    <table role="presentation" width="100%" style="background:${C.navy};padding:32px 16px;"><tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:${C.card};border-radius:16px;border:1px solid ${C.border};">
        <tr><td style="padding:28px 32px 8px;text-align:center;"><div style="font-size:30px;font-weight:800;"><span style="color:${C.green};">IQ</span><span style="color:${C.white};">PREC</span></div><div style="height:3px;width:64px;background:${C.green};margin:14px auto 0;border-radius:2px;"></div></td></tr>
        <tr><td style="padding:8px 32px;">${inner}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td style="border-radius:10px;background:${C.green};"><a href="${link}" style="display:inline-block;padding:14px 30px;color:${C.navy};font-weight:700;text-decoration:none;border-radius:10px;">${language === 'ar' ? 'جدّد الآن' : 'Renew now'}</a></td></tr></table>
        </td></tr>
        <tr><td style="padding:24px 32px 28px;text-align:center;border-top:1px solid ${C.border};"><div style="color:${C.muted};font-size:12px;">All Rights Reserved © IQPREC ${year}</div></td></tr>
      </table>
    </td></tr></table>
  </body></html>`;

  const subject = language === 'ar' ? 'جدّد باقة موسمك — IQPREC' : 'Renew your season pass — IQPREC';
  return send({ to: email, subject, html });
}

export default { generateReceiptNumber, sendReceiptEmail, sendSeasonRenewalEmail };
