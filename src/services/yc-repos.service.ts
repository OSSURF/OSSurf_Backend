import { db } from "../db/client";
import { ycCompanies } from "../db/schemas";
import { desc, count } from "drizzle-orm";

export const YcRepoService = async (limit: number, offset: number) => {
  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(ycCompanies)
      .orderBy(desc(ycCompanies.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(ycCompanies),
  ]);

  return {
    data,
    total: totalResult[0].count,
  };
};
