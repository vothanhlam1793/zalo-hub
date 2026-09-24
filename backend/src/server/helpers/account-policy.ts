import type { Knex } from 'knex';

/** Read access follows HTTP: any membership, or the current DB super_admin role.
 * `visible` is a sidebar preference, NOT a permission. One statement gives a
 * consistent user/role/membership snapshot; never trust a role in the JWT.
 */
export async function readAccountPolicy(knex: Knex, userId: string): Promise<Set<string> | null> {
  const { rows } = await knex.raw(`
    SELECT u.role, a.account_id
    FROM system_users u
    LEFT JOIN accounts a ON (
      u.role = 'super_admin' OR EXISTS (
        SELECT 1 FROM zalo_account_memberships m
        WHERE m.user_id = u.id AND m.account_id = a.account_id
      )
    )
    WHERE u.id = ?
  `, [userId]);
  if (!rows.length) return null;
  return new Set<string>(rows.flatMap((row: { account_id: string | null }) =>
    typeof row.account_id === 'string' ? [row.account_id] : []));
}
