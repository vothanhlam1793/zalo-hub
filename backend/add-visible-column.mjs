import knexLib from "knex";

const knex = knexLib({
  client: "pg",
  connection: process.env.DATABASE_URL || "postgresql://zalohub:zalohub@localhost:5433/zalohub",
});

async function main() {
  await knex.raw("ALTER TABLE zalo_account_memberships ADD COLUMN IF NOT EXISTS visible INTEGER NOT NULL DEFAULT 1");
  console.log("Added visible column to zalo_account_memberships");
  await knex.destroy();
}

main().catch((err) => { console.error("Migration failed:", err.message); process.exit(1); });
