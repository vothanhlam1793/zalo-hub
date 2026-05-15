const k = require("knex")({client:"pg",connection:"postgresql://zalohub:zalohub@localhost:5433/zalohub"});
k.raw("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)").then(()=>{console.log("app_meta OK");return k.destroy()}).catch(e=>{console.error(e.message);process.exit(1)});
