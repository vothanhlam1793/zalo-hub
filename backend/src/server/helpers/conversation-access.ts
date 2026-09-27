import type { Knex } from 'knex';

export interface UserAccountRole {
  systemRole: string;
  accountRole?: string;
  isBypass: boolean;
}

/**
 * Returns role info for a user in the context of an account.
 * Master, Admin (account or system), and Super Admin have full bypass.
 */
export async function getUserRoleContext(
  knex: Knex,
  userId: string,
  accountId?: string,
): Promise<UserAccountRole> {
  try {
    const { rows: userRows } = await knex.raw(
      'SELECT role FROM system_users WHERE id = ?',
      [userId],
    );
    const systemRole = userRows[0]?.role || 'user';

    if (systemRole === 'super_admin') {
      return { systemRole, accountRole: 'master', isBypass: true };
    }

    if (!accountId) {
      return {
        systemRole,
        isBypass: systemRole === 'admin' || systemRole === 'super_admin',
      };
    }

    const { rows: memberRows } = await knex.raw(
      'SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?',
      [userId, accountId],
    );
    const accountRole = memberRows[0]?.role;

    const isBypass =
      systemRole === 'admin' ||
      accountRole === 'master' ||
      accountRole === 'admin';

    return { systemRole, accountRole, isBypass };
  } catch {
    return { systemRole: 'user', isBypass: false };
  }
}

/**
 * Check if a user can access a specific conversation.
 */
export async function canUserAccessConversation(
  knex: Knex,
  userId: string,
  accountId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const roleContext = await getUserRoleContext(knex, userId, accountId);
    if (roleContext.isBypass) return true;

    // Editor/Viewer must have membership
    if (!roleContext.accountRole) return false;

    // Check if conversation is restricted
    const { rows: convRows } = await knex.raw(
      'SELECT is_restricted FROM conversations WHERE account_id = ? AND id = ?',
      [accountId, conversationId],
    );
    const isRestricted = Boolean(convRows[0]?.is_restricted);
    if (isRestricted) {
      // Restricted conversations are only visible to Bypass roles (Master / Admin)
      return false;
    }

    // Check tag permissions for this user on this account
    const { rows: userTagRows } = await knex.raw(
      'SELECT tag_id FROM user_tag_permissions WHERE user_id = ? AND account_id = ?',
      [userId, accountId],
    );

    // If user has no specific tag assignments configured, they can access all non-restricted conversations
    if (!userTagRows || userTagRows.length === 0) {
      return true;
    }

    const allowedTagIds = userTagRows.map((r: any) => String(r.tag_id));

    // If user has tag assignments, conversation MUST have at least one of those tags
    const { rows: convTagRows } = await knex.raw(
      'SELECT tag_id FROM conversation_tags WHERE conversation_id = ?',
      [conversationId],
    );

    const convTagIds = (convTagRows || []).map((r: any) => String(r.tag_id));
    return convTagIds.some((id: string) => allowedTagIds.includes(id));
  } catch {
    return false;
  }
}

/**
 * Filter a list of conversation summaries according to user's permissions.
 */
export async function filterConversationsForUser<T extends { id: string; isRestricted?: boolean; labels?: Array<{ id: string }> }>(
  knex: Knex,
  userId: string,
  accountId: string,
  conversations: T[],
): Promise<T[]> {
  try {
    const roleContext = await getUserRoleContext(knex, userId, accountId);
    if (roleContext.isBypass) {
      return conversations;
    }

    if (!roleContext.accountRole) {
      return [];
    }

    // Fetch restricted IDs and tag permissions in parallel
    const [restrictedRows, userTagRows] = await Promise.all([
      knex.raw('SELECT id FROM conversations WHERE account_id = ? AND is_restricted = true', [accountId]),
      knex.raw('SELECT tag_id FROM user_tag_permissions WHERE user_id = ? AND account_id = ?', [userId, accountId]),
    ]);

    const restrictedSet = new Set<string>((restrictedRows.rows || []).map((r: any) => r.id));
    const userTagIds: string[] = (userTagRows.rows || []).map((r: any) => String(r.tag_id));
    const hasTagRestrictions = userTagIds.length > 0;
    const userTagSet = new Set<string>(userTagIds);

    // If tag restrictions exist, we also need conversation_tags mapping
    let convToTagsMap: Map<string, Set<string>> | null = null;
    if (hasTagRestrictions) {
      const { rows: allConvTags } = await knex.raw(`
        SELECT ct.conversation_id, ct.tag_id
        FROM conversation_tags ct
        JOIN conversations c ON c.id = ct.conversation_id
        WHERE c.account_id = ?
      `, [accountId]);

      convToTagsMap = new Map();
      for (const r of (allConvTags || [])) {
        if (!convToTagsMap.has(r.conversation_id)) {
          convToTagsMap.set(r.conversation_id, new Set());
        }
        convToTagsMap.get(r.conversation_id)!.add(String(r.tag_id));
      }
    }

    return conversations.filter((conv) => {
      // 1. Check restricted
      if (conv.isRestricted || restrictedSet.has(conv.id)) {
        return false;
      }

      // 2. Check tag restrictions
      if (!hasTagRestrictions) {
        return true;
      }

      // If conversation labels are in-memory
      if (conv.labels && Array.isArray(conv.labels)) {
        return conv.labels.some((lbl) => userTagSet.has(String(lbl.id)));
      }

      // Check from DB map
      const tagsForConv = convToTagsMap?.get(conv.id);
      if (!tagsForConv || tagsForConv.size === 0) return false;

      for (const tid of tagsForConv) {
        if (userTagSet.has(tid)) return true;
      }

      return false;
    });
  } catch {
    return [];
  }
}
