import { createRequestHandler } from "@react-router/node";
import express from "express";

declare module "react-router" {
  interface AppLoadContext {
    VALUE: string;
  }
}

export const app = express();

app.use(
  "/build",
  express.static("build/client", {
    immutable: true,
    maxAge: "1y",
  })
);

app.use(express.static("build/client"));

app.all("*", createRequestHandler({ build: () => import("../build/server/index.js") }));
