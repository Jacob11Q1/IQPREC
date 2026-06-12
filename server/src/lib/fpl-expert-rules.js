/* ============================================================
   IQPREC — lib/fpl-expert-rules.js
   The expert FPL rule sets that get injected into Claude prompts.
   These are what make IQPREC smarter than a generic chatbot: the
   same hard-won FPL heuristics, baked into every relevant prompt.

   Rules are written in English (analytical context). The system
   prompt controls the OUTPUT language — when language is `ar`, Claude
   still reasons over these rules but answers entirely in Arabic.

   buildExpertContext(['captain','differential']) returns just the
   rule blocks a given endpoint needs, so we never waste tokens
   shipping transfer rules into a captain prompt.
   ============================================================ */

export const CAPTAIN_RULES = `CAPTAIN SELECTION RULES:
- Strongly prefer players whose next fixture has an FDR (Fixture Difficulty
  Rating) of 1 or 2. FDR 4 or 5 is a serious red flag for a captain.
- Home games add roughly +0.5 to captaincy confidence versus the same
  fixture away.
- A player with form below 5.0 is eliminated as a captain candidate, no
  matter the fixture.
- A player with below a 75% chance of playing is eliminated — never captain
  an injury/rotation doubt.
- Premium, in-form players with a green fixture are the safe (template) pick.
- If your top pick is owned by more than 65% of the manager's mini-league
  rivals, also flag a lower-owned differential captain so the manager can
  choose between safety and rank gains.
- Always give a confidence percentage (0-100) and the single clearest
  reason for each pick.`;

export const TRANSFER_RULES = `TRANSFER RULES:
- Never recommend taking a -4 (or larger) hit unless the expected points
  gain over the planning horizon is at least 6 points. State the expected
  gain explicitly when recommending a hit.
- Never sell a premium asset (high price, high ownership, proven returner)
  without a CONFIRMED injury or a confirmed long-term issue. A single blank
  is not a sell signal for a premium.
- Prioritise transferring out players who are injured, suspended, flagged,
  or have lost their starting role over players who are merely out of form.
- A wildcard signal fires when 4 or more of the manager's players have form
  below 3.0 AND face hard upcoming fixtures (FDR 4-5). If that is true, say
  so and recommend the wildcard instead of multiple hits.
- Respect the manager's bank: never propose an incoming player the manager
  cannot afford after selling the outgoing player.
- For every suggested move show: OUT (with the reason), IN (with the fixture
  case), the price delta, and a confidence level.`;

export const CHIP_RULES = `CHIP STRATEGY RULES:
- Triple Captain: ONLY on a confirmed Double Gameweek, on a premium with two
  good fixtures. Never burn it on a single gameweek.
- Bench Boost: ONLY when all 15 players are fit, starting, and have decent
  fixtures (maximum bench coverage). Ideally during a Double Gameweek.
- Free Hit: best on a Blank Gameweek (when many of the manager's players have
  no fixture) or to attack a one-off Double Gameweek without wrecking the squad.
- Wildcard: best deployed just before a run of Double Gameweeks or to fix a
  squad that has drifted off-template with multiple bad fixtures.
- Never recommend playing two chips in the same gameweek unless it is an
  exceptional, clearly-explained Double Gameweek case.`;

export const DIFFERENTIAL_RULES = `DIFFERENTIAL RULES:
- A STRONG differential is owned by under 10% of managers AND has form above
  6.0 AND a next fixture FDR of 2 or below.
- A HIDDEN GEM is owned by under 5% with any one of the above strengths.
- Differentials are about rank gains: explain the upside (low ownership =
  big rank swing if they return) and the risk honestly.
- Never present a removed, injured, or non-starting player as a differential.
- Prefer differentials with a secure starting role and a good fixture run,
  not just a one-week punt.`;

export const FORM_GUIDE = `INTERPRETING FORM:
- "Form" is the player's average FPL points per game over their last ~30
  days of fixtures. It is the single best short-term momentum signal.
- Form above 6.0 is excellent, 4.0-6.0 is solid, below 3.0 is cold.
- Always weigh form against MINUTES: high form on low minutes (a cameo
  haul) is less reliable than high form on full 90s.
- Form must be read together with the upcoming fixtures — great form into a
  wall of FDR 5 fixtures is worth less than steady form into easy games.`;

export const FIXTURE_GUIDE = `INTERPRETING FIXTURE DIFFICULTY (FDR):
- FDR is a 1-5 rating of how hard a fixture is (1 = easiest, 5 = hardest).
- FDR 1-2 = green: target these players, especially for captaincy.
- FDR 3 = amber: neutral, decide on form and home/away.
- FDR 4-5 = red: avoid captaining; be cautious bringing players in for them.
- Home fixtures are easier than the same fixture away. Look at the NEXT 3
  fixtures, not just one, when judging a transfer or a hold.`;

const REGISTRY = {
  captain: CAPTAIN_RULES,
  transfer: TRANSFER_RULES,
  transfers: TRANSFER_RULES,
  chip: CHIP_RULES,
  chips: CHIP_RULES,
  differential: DIFFERENTIAL_RULES,
  differentials: DIFFERENTIAL_RULES,
  form: FORM_GUIDE,
  fixture: FIXTURE_GUIDE,
  fixtures: FIXTURE_GUIDE,
};

/**
 * buildExpertContext(ruleTypes) — combine the requested rule blocks into a
 * single string for injection into a specific prompt. Unknown types are
 * ignored. With no args, returns every rule set.
 *
 * @param {string[]} ruleTypes  e.g. ['captain', 'fixture', 'form']
 * @returns {string}
 */
export function buildExpertContext(ruleTypes) {
  const types =
    Array.isArray(ruleTypes) && ruleTypes.length
      ? ruleTypes
      : Object.keys(REGISTRY);

  const seen = new Set();
  const blocks = [];
  for (const type of types) {
    const block = REGISTRY[String(type).toLowerCase()];
    if (block && !seen.has(block)) {
      seen.add(block);
      blocks.push(block);
    }
  }
  return blocks.join('\n\n');
}

export default {
  CAPTAIN_RULES,
  TRANSFER_RULES,
  CHIP_RULES,
  DIFFERENTIAL_RULES,
  FORM_GUIDE,
  FIXTURE_GUIDE,
  buildExpertContext,
};
