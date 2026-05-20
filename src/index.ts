import dotenv from "dotenv";
dotenv.config({ quiet: true } as any);

import express from "express";
import { Request, Response } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";

import trendingRoutes from "./routes/trending.route";
import discoverRoutes from "./routes/discover.route";
import findIssues from "./routes/find-issues.route";
import findGSOC from "./routes/gsoc.route";
import trackPrsRoutes from "./routes/track-prs.route";
import trackIssuesRoutes from "./routes/track-issues.route";
import dashboardRoutes from "./routes/dashboard.route";
import profileRoutes from "./routes/profile.route";
import ycRoutes from "./routes/yc.route";
import contributorsRoutes from "./routes/contributors.route";
import webhooksRoutes from "./routes/webhooks.route";
import adminRoutes from "./routes/admin.route";
import { registerSchedules } from "./jobs/scheduler";
import "./jobs/worker";

const app = express();
app.set("trust proxy", true);
const PORT = process.env.PORT ?? 3000;

app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        process.env.FRONTEND_URL,
        process.env.BETTER_AUTH_URL,
      ].filter(Boolean) as string[];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Better Auth handler (Express v4 syntax)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    // Override headers so that Better Auth perceives the request as coming from the frontend domain.
    // This is required because Vercel proxies/rewrites the frontend domain requests to the Render backend,
    // which normally causes Host / X-Forwarded-Host header mismatch errors.
    req.headers.host = "ossurf.vercel.app";
    req.headers["x-forwarded-host"] = "ossurf.vercel.app";
    req.headers["x-forwarded-proto"] = "https";
  }
  next();
});

app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());



app.use("/api/trending", trendingRoutes);
app.use("/api/discover", discoverRoutes);
app.use("/api/findIssues", findIssues);
app.use("/api/findGSOC", findGSOC);
app.use("/api/track-prs", trackPrsRoutes);
app.use("/api/track-issues", trackIssuesRoutes);
app.use("/api/dashboard/", dashboardRoutes);
app.use("/api/yc", ycRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/contributors", contributorsRoutes);
app.use("/api/webhooks", webhooksRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("SourceSurf API is running");
});
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await registerSchedules();
});
