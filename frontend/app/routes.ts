import type { RouteConfig } from "@react-router/dev/routes";
import { index, route } from "@react-router/dev/routes";

export default [
  index("./routes/_index.tsx"),
  route("login", "./routes/login.tsx"),
  route("m", "./routes/m.tsx"),
  route("admin", "./routes/admin.tsx"),
] satisfies RouteConfig;
