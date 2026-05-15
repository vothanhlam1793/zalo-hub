import knexLib from "knex";

const knex = knexLib({
  client: "pg",
  connection: process.env.DATABASE_URL || "postgresql://zalohub:zalohub@localhost:5433/zalohub",
});

async function main() {
  const { rows: accounts } = await knex.raw("SELECT account_id, display_name FROM accounts");
  console.log("Zalo accounts:", accounts);

  const { rows: users } = await knex.raw("SELECT id, email FROM system_users");
  console.log("System users:", users);

  const admin = users.find((r) => r.email === "admin@zalohub.local");
  if (!admin) { console.log("No admin user found"); process.exit(1); }

  for (const acc of accounts) {
    await knex.raw(
      "INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (:uid, :aid, :role) ON CONFLICT (user_id, account_id) DO UPDATE SET role = :role2",
      { uid: admin.id, aid: acc.account_id, role: "master", role2: "master" }
    );
    console.log("Assigned master:", acc.account_id, acc.display_name);
  }

  const { rows: memberships } = await knex.raw("SELECT * FROM zalo_account_memberships");
  console.log("\nMemberships:", memberships);

  await knex.destroy();
  console.log("Done");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
