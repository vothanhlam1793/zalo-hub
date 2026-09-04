import type { Route } from "./+types/root";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import appCss from "../src/app.css?url";

export function links(): Route.LinksFunction {
  return [{ rel: "stylesheet", href: appCss, crossOrigin: "" as const }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Zalo Hub</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
