import { app } from "./server.js";

const PORT = parseInt(process.env.FE_PORT || "3400", 10);

app.listen(PORT, () => {
  console.log(`[zalohub-frontend] SSR server listening on :${PORT}`);
});
