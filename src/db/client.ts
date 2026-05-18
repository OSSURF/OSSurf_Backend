import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import * as schema from "./schemas";
dotenv.config({ quiet: true } as any);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in .env");
}

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
console.log("Database connected");
