import { GoldStore } from '../src/core/store.js';

async function main() {
  const accountId = process.argv[2]?.trim();
  const threadId = process.argv[3]?.trim();

  if (!accountId || !threadId) {
    throw new Error('Usage: npx tsx scripts/repair-conversation-type.ts <accountId> <threadId>');
  }

  const store = new GoldStore();
  await store.init();

  const knex = store.getKnex();
  const groupRows = (await knex.raw(`
    SELECT 1
    FROM groups
    WHERE account_id = ? AND group_id = ?
    LIMIT 1
  `, [accountId, threadId])).rows as Array<{ '?column?': number }>;
  if (!groupRows[0]) {
    throw new Error(`Thread ${threadId} is not a known group for account ${accountId}`);
  }

  await knex.transaction(async (trx) => {
    await trx.raw(`
      UPDATE messages
      SET conversation_id = ?,
          conversation_type = 'group',
          friend_id = ''
      WHERE account_id = ?
        AND thread_id = ?
        AND conversation_type = 'direct'
    `, [`group:${threadId}`, accountId, threadId]);

    await trx.raw(`
      DELETE FROM conversations
      WHERE account_id = ?
        AND id = ?
    `, [accountId, `direct:${threadId}`]);
  });

  await store.canonicalizeConversationDataForAccount(accountId);
  await knex.destroy();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
