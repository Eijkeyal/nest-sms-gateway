// src/services/health.service.js
import { query } from "../db.js";

// Used as the full-capacity reference for the health score.
const BALANCE_BENCHMARK = 500;

export async function getRouteHealth() {
  const providersRes = await query(
    `SELECT id, name, priority, balance
     FROM providers
     ORDER BY priority ASC`,
  );

  const statsRes = await query(`
    SELECT
      provider_id,
      COUNT(*) FILTER (WHERE success = true) AS successes,
      COUNT(*) AS total_attempts
    FROM route_attempts
    WHERE attempted_at >= NOW() - INTERVAL '24 hours'
    GROUP BY provider_id
  `);

  const statsByProvider = new Map(
    statsRes.rows.map((s) => [String(s.provider_id), s]),
  );

  return providersRes.rows.map((provider) => {
    const stats = statsByProvider.get(String(provider.id));

    const successes = Number(stats?.successes ?? 0);
    const total = Number(stats?.total_attempts ?? 0);
    const balance = Number(provider.balance);

    // No recent attempts means there is no recorded evidence of failure.
    const successRate = total > 0 ? (successes / total) * 100 : 100;

    const balanceHeadroom = Math.min((balance / BALANCE_BENCHMARK) * 100, 100);

    // Weight reliability more heavily than remaining provider capacity.
    const healthScore = successRate * 0.7 + balanceHeadroom * 0.3;

    return {
      provider: provider.name,
      priority: provider.priority,
      balance,
      last24hAttempts: total,
      last24hSuccessRate: `${successRate.toFixed(1)}%`,
      healthScore: `${healthScore.toFixed(1)}%`,
    };
  });
}
