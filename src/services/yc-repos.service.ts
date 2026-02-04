import { db } from "../db/client";
import { ycCompanies } from "../db/schemas";
import { desc } from "drizzle-orm";

export const YcRepoService = async (limit: number, offset: number) => {
  return await db
    .select()
    .from(ycCompanies)
    .orderBy(desc(ycCompanies.updatedAt))
    .limit(limit)
    .offset(offset);
};
