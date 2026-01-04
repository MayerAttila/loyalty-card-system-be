import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();

app.use(helmet());
app.use(express.json());

// For dev: allow your Next.js dev server
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

export default app;
