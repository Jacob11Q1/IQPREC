/* ============================================================
   IQPREC — middleware/auth/check-subscription.js
   Gate for /api/v1/app/* (runs AFTER verifyToken).
   ============================================================ */

import { hasDb } from '../../db/client.js';
import { queryOne } from '../../db/query.js';

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

  if (!hasDb()) {
    return res.status(503).json({
      success: false,
      data: null,
      error: 'DB_UNAVAILABLE',
      message: 'Subscription service temporarily unavailable.',
    });
  }

  const user = await queryOne(
    'SELECT subscription_status, trial_ends_at FROM users WHERE id = $1',
    [userId]
  ).catch(() => null);

  if (!user) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'AUTH_1009',
      message: 'Account not found.',
    });
  }

  const status = user.subscription_status;
  const isActive      = status === 'active';
  const isTrialing    = status === 'trialing';
  const isPendingTrial = status === 'pending_trial'; // bypass: no card required yet
  const trialLive =
    status === 'trial' &&
    user.trial_ends_at &&
    new Date(user.trial_ends_at).getTime() > Date.now();

  if (isActive || isTrialing || isPendingTrial || trialLive) {
    req.subscription = {
      status,
      trialEndsAt: user.trial_ends_at,
    };
    return next();
  }

  if (status === 'pending_trial') {
    return res.status(402).json({
      success: false,
      data: null,
      error: 'CARD_REQUIRED',
      message: 'Add your card to activate your 7-day free trial.',
      setupUrl: '/start-trial',
      monthlyPrice: MONTHLY_PRICE,
      seasonPrice: SEASON_PRICE,
    });
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
