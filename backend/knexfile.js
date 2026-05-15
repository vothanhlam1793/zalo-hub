export default {
  production: {
    client: "pg",
    connection: process.env.DATABASE_URL || "postgresql://zalohub:zalohub@localhost:5433/zalohub",
    pool: { min: 2, max: 20 },
    migrations: { directory: "./db/migrations" },
  },
  development: {
    client: "pg",
    connection: process.env.DATABASE_URL || "postgresql://zalohub:zalohub@localhost:5433/zalohub",
    pool: { min: 2, max: 10 },
    migrations: { directory: "./db/migrations" },
  },
};
