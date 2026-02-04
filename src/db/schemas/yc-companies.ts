import {
  serial,
  varchar,
  text,
  timestamp,
  pgTable,
  unique,
  integer,
  json,
  boolean,
} from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const ycCompanies = pgTable(
  "yc_companies",
  {
    id: serial().primaryKey().notNull(),
    ycId: integer("yc_id").notNull().unique(),
    name: varchar({ length: 256 }).notNull(),
    slug: varchar({ length: 256 }).notNull(),
    smallLogoThumbUrl: varchar("small_logo_thumb_url", { length: 512 }),
    website: varchar({ length: 512 }),
    oneLiner: text("one_liner"),
    teamSize: integer("team_size"),
    batch: varchar({ length: 100 }),
    status: varchar({ length: 100 }),
    industries: json("industries").$type<string[]>().default([]),
    regions: json("regions").$type<string[]>().default([]),
    url: varchar({ length: 512 }),
    isHiring: boolean("is_hiring").default(false),
    topCompany: boolean("top_company").default(false),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique("yc_companies_slug_unique").on(table.slug)],
);

export type YCCompany = InferSelectModel<typeof ycCompanies>;
export type NewYCCompany = InferInsertModel<typeof ycCompanies>;
