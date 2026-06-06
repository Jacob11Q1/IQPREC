/* ============================================================
   IQPREC — middleware/auth/check-subscription.js
   Gate for /api/v1/app/* (runs AFTER verifyToken).
     • ALLOW if subscription_status = 'active'.
     • ALLOW if 'trial' AND trial_ends_at is in the future.
     • BLOCK 402 TRIAL_EXPIRED otherwise, with a warm upgrade payload.
   Pricing per CLAUDE.md: monthly $15, season $110.
   ============================================================ */

import { supabase } from '../../db/client.js';

const MONTHLY_PRICE = 15;
const SEASON_PRICE = 110;

export async function checkSubscription(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'AUTH_1001',
      message: 'Authentication required.',
    });
  }

  // If the DB isn't wired yet (dev), don't hard-fail protected routes.
  if (!supabase) {
    return res.status(503).json({
      success: false,
      data: null,
      error: 'DB_UNAVAILABLE',
      message: 'Subscription service temporarily unavailable.',
    });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('subscription_status, trial_ends_at')
    .eq('id', userId)
    .single();

  if (error || !user) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'AUTH_1009',
      message: 'Account not found.',
    });
  }

  const isActive = user.subscription_status === 'active';
  const trialLive =
    user.subscription_status === 'trial' &&
    user.trial_ends_at &&
    new Date(user.trial_ends_at).getTime() > Date.now();

  if (isActive || trialLive) {
    req.subscription = {
      status: user.subscription_status,
      trialEndsAt: user.trial_ends_at,
    };
    return next();
  }

  return res.status(402).json({
    success: false,
    data: null,
    error: 'TRIAL_EXPIRED',
    message: 'Your free trial has ended. Upgrade to keep your edge.',
    upgradeUrl: '/billing.html',
    monthlyPrice: MONTHLY_PRICE,
    seasonPrice: SEASON_PRICE,
  });
}

export default checkSubscription;
