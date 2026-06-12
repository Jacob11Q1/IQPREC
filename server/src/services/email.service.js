/* ============================================================
   IQPREC — services/email.service.js
   Transactional email via Resend, with full IQPREC branding:
   navy header (IQ green / PREC white), green accent line, professional
   layout, footer "All Rights Reserved © IQPREC".

   Bilingual: subject + body switch on `language` ('ar' → RTL Arabic).

   FAIL-SAFE: if RESEND_API_KEY is not set, every send() logs to the
   console instead of throwing — the server never crashes in dev, and
   callers (which fire-and-forget) never reject.

   NOTE on inline styles: CLAUDE.md's "no inline styles" rule governs the
   web frontend. HTML email is the one context where inline styles are
   mandatory — mail clients strip <style> blocks — so they are used here.
   ============================================================ */

import { Resend } from 'resend';
import { env, isDevelopment } from '../config/env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const FROM = env.RESEND_FROM || 'IQPREC <noreply@iqprec.com>';
const FRONTEND_URL = env.FRONTEND_URL || 'https://iqprec.com';

/* In development (or with a placeholder key like "will_add..."), never call
   the real Resend API — log the message + action URL to the console instead,
   so a missing/invalid key can't break registration and tokens can be
   verified manually. Production with a real key always sends for real. */
function isDevEmail() {
  return (
    isDevelopment ||
    (env.RESEND_API_KEY || '').startsWith('will_add') ||
    !resend
  );
}

/* Brand tokens (mirrors :root in the design system). */
const C = {
  navy: '#0B1929',
  card: '#132235',
  green: '#00D97E',
  white: '#FFFFFF',
  text: '#C7D2DE',
  muted: '#6B7F99',
  red: '#E8445A',
  border: '#1A3255',
};

/* ------------------------------------------------------------
   Low-level send — never throws.
   ------------------------------------------------------------ */
async function send({ to, subject, html, devUrl, devUrlLabel = 'Verification URL' }) {
  if (isDevEmail()) {
    console.log(`[DEV EMAIL] To: ${to}`);
    console.log(`[DEV EMAIL] Subject: ${subject}`);
    if (devUrl) console.log(`[DEV EMAIL] ${devUrlLabel}: ${devUrl}`);
    return { success: true, dev: true };
  }
  try {
    const result = await resend.emails.send({ from: FROM, to, subject, html });
    if (result?.error) {
      console.error('[email] Resend error:', result.error);
    }
    return result;
  } catch (err) {
    console.error('[email] send failed:', err?.message || err);
    return { error: err?.message || 'send_failed' };
  }
}

/* ------------------------------------------------------------
   Branded layout. `inner` is the message-specific HTML.
   ------------------------------------------------------------ */
function layout({ lang = 'ar', heading, inner }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.navy};font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.navy};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.card};border-radius:16px;overflow:hidden;border:1px solid ${C.border};">

        <!-- Header: IQ green / PREC white + green accent line -->
        <tr><td style="padding:28px 32px 20px;text-align:center;">
          <div style="font-size:30px;font-weight:800;letter-spacing:1px;">
            <span style="color:${C.green};">IQ</span><span style="color:${C.white};">PREC</span>
          </div>
          <div style="height:3px;width:64px;background:${C.green};margin:14px auto 0;border-radius:2px;"></div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:8px 32px 8px;text-align:${align};" dir="${dir}">
          ${heading ? `<h1 style="color:${C.white};font-size:21px;margin:12px 0 16px;text-align:${align};">${heading}</h1>` : ''}
          ${inner}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 32px 28px;text-align:center;border-top:1px solid ${C.border};">
          <div style="color:${C.muted};font-size:12px;line-height:1.6;">
            Intelligence. Precision. Every Gameweek.<br>
            All Rights Reserved © IQPREC ${year}
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:10px;background:${C.green};">
    <a href="${href}" style="display:inline-block;padding:14px 30px;color:${C.navy};font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

function p(text) {
  return `<p style="color:${C.text};font-size:15px;line-height:1.7;margin:0 0 16px;">${text}</p>`;
}

function fineprint(text) {
  return `<p style="color:${C.muted};font-size:13px;line-height:1.6;margin:8px 0 0;">${text}</p>`;
}

/* ------------------------------------------------------------
   1) Verification email
   ------------------------------------------------------------ */
export async function sendVerificationEmail(email, fullName, verificationToken, language = 'ar') {
  const link = `${FRONTEND_URL}/verify-email.html?token=${encodeURIComponent(verificationToken)}`;
  const name = fullName || (language === 'ar' ? 'صديقنا' : 'there');

  const subject =
    language === 'ar'
      ? 'فعّل حسابك في IQPREC'
      : 'Verify your IQPREC account';

  const inner =
    language === 'ar'
      ? p(`أهلاً ${name}، خطوة أخيرة لتفعيل حسابك في IQPREC.`) +
        button('تفعيل البريد الإلكتروني', link) +
        p('تبدأ تجربتك المجانية لمدة 7 أيام فور التفعيل — بدون بطاقة.') +
        fineprint('إذا لم تنشئ هذا الحساب، تجاهل هذه الرسالة.')
      : p(`Hi ${name}, one last step to activate your IQPREC account.`) +
        button('Verify Email', link) +
        p('Your free 7-day trial begins the moment you verify — no card required.') +
        fineprint("If you didn't create this account, you can safely ignore this email.");

  return send({
    to: email,
    subject,
    devUrl: link,
    devUrlLabel: 'Verification URL',
    html: layout({
      lang: language,
      heading: language === 'ar' ? 'مرحباً بك في IQPREC' : 'Welcome to IQPREC',
      inner,
    }),
  });
}

/* ------------------------------------------------------------
   2) Security alert email (account locked after 5 failed attempts)
   ------------------------------------------------------------ */
export async function sendSecurityAlertEmail(email, fullName, ipAddress, language = 'ar') {
  const name = fullName || (language === 'ar' ? 'صديقنا' : 'there');
  const resetLink = `${FRONTEND_URL}/forgot-password.html`;
  const ip = ipAddress || (language === 'ar' ? 'غير معروف' : 'unknown');

  const subject = 'Security Alert — IQPREC';

  const inner =
    language === 'ar'
      ? p(`مرحباً ${name}، تم قفل حسابك مؤقتاً بعد 5 محاولات تسجيل دخول فاشلة.`) +
        p(`عنوان الـ IP: <span style="color:${C.white};font-family:monospace;">${ip}</span>`) +
        p('سيُفتح الحساب تلقائياً بعد 15 دقيقة. إذا لم تكن أنت، يرجى إعادة تعيين كلمة المرور فوراً.') +
        button('إعادة تعيين كلمة المرور', resetLink)
      : p(`Hi ${name}, your account was temporarily locked after 5 failed login attempts.`) +
        p(`IP address: <span style="color:${C.white};font-family:monospace;">${ip}</span>`) +
        p('It unlocks automatically in 15 minutes. If this wasn\'t you, reset your password right away.') +
        button('Reset Password', resetLink);

  return send({
    to: email,
    subject,
    html: layout({
      lang: language,
      heading: language === 'ar' ? '⚠ تنبيه أمني' : '⚠ Security Alert',
      inner,
    }),
  });
}

/* ------------------------------------------------------------
   3) Password reset email
   ------------------------------------------------------------ */
export async function sendPasswordResetEmail(email, fullName, resetToken, language = 'ar') {
  const link = `${FRONTEND_URL}/reset-password.html?token=${encodeURIComponent(resetToken)}`;
  const name = fullName || (language === 'ar' ? 'صديقنا' : 'there');

  const subject =
    language === 'ar' ? 'إعادة تعيين كلمة المرور — IQPREC' : 'Reset your IQPREC password';

  const inner =
    language === 'ar'
      ? p(`مرحباً ${name}، اطلبتَ إعادة تعيين كلمة المرور.`) +
        button('إعادة تعيين كلمة المرور', link) +
        p('هذا الرابط صالح لمدة ساعة واحدة فقط.') +
        fineprint('إذا لم تطلب ذلك، تجاهل هذه الرسالة — كلمة مرورك لم تتغير.')
      : p(`Hi ${name}, you requested a password reset.`) +
        button('Reset Password', link) +
        p('This link is valid for one hour only.') +
        fineprint("If you didn't request this, ignore this email — your password is unchanged.");

  return send({
    to: email,
    subject,
    devUrl: link,
    devUrlLabel: 'Reset URL',
    html: layout({
      lang: language,
      heading: language === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset your password',
      inner,
    }),
  });
}

/* ------------------------------------------------------------
   4) Welcome email (after verification)
   ------------------------------------------------------------ */
export async function sendWelcomeEmail(email, fullName, language = 'ar') {
  const link = `${FRONTEND_URL}/dashboard.html`;
  const name = fullName || (language === 'ar' ? 'صديقنا' : 'there');

  const subject =
    language === 'ar' ? 'أهلاً بك في IQPREC 🎯' : 'Welcome to IQPREC 🎯';

  const features =
    language === 'ar'
      ? `<ul style="color:${C.text};font-size:15px;line-height:1.9;padding-inline-start:20px;margin:0 0 16px;">
           <li>توصيات الكابتن بالذكاء الاصطناعي قبل كل جولة</li>
           <li>تحليل الانتقالات وأوراق البدل (Wildcard)</li>
           <li>اللاعبون المختلفون (Differentials) ونجوم العرب</li>
           <li>بيانات مجتمع IQPREC الحصرية</li>
         </ul>`
      : `<ul style="color:${C.text};font-size:15px;line-height:1.9;padding-inline-start:20px;margin:0 0 16px;">
           <li>AI captain picks before every gameweek</li>
           <li>Transfer analysis and chip timing (Wildcard, Bench Boost)</li>
           <li>Differentials and the Arab Stars Watch</li>
           <li>Exclusive IQPREC community data</li>
         </ul>`;

  const inner =
    language === 'ar'
      ? p(`أهلاً ${name}! تجربتك المجانية بدأت الآن — 7 أيام لاستكشاف كل شيء.`) +
        features +
        button('ابدأ الآن', link)
      : p(`Hi ${name}! Your free trial starts now — 7 days to explore everything.`) +
        features +
        button('Get Started', link);

  return send({
    to: email,
    subject,
    html: layout({
      lang: language,
      heading: language === 'ar' ? 'تجربتك بدأت الآن' : 'Your trial starts now',
      inner,
    }),
  });
}

export default {
  sendVerificationEmail,
  sendSecurityAlertEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
};
