import dotenv from "dotenv";
import { z } from "zod";
import { db } from "../src/db/client";
import { ycCompanies, type NewYCCompany } from "../src/db/schemas";

dotenv.config();

const YC_API_URL = "https://yc-oss.github.io/api/companies/top.json";

const ycCompanyAPISchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  small_logo_thumb_url: z.string().optional(),
  website: z.string().optional(),
  one_liner: z.string().optional(),
  team_size: z.number().optional(),
  top_company: z.boolean().optional(),
  isHiring: z.boolean().optional(),
  batch: z.string().optional(),
  status: z.string().optional(),
  industries: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  url: z.string().optional(),
});

type YCCompanyAPI = z.infer<typeof ycCompanyAPISchema>;

function getRepoNameParts(url: string) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("github.com")) return null;
    const [owner, repo_name] = u.pathname.split("/").filter(Boolean);
    if (!owner || !repo_name) return null;
    return { owner, repo_name };
  } catch (error) {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("Fetching YC Data from:", YC_API_URL);
  const res = await fetch(YC_API_URL);
  if (!res.ok) throw new Error(`Failed to fetch YC data: ${res.statusText}`);

  const rawData = await res.json();
  const companies = z.array(ycCompanyAPISchema).parse(rawData);

  console.log(`Found ${companies.length} companies. Starting import...`);

  for (const company of companies) {
    try {
      await db
        .insert(ycCompanies)
        .values({
          ycId: company.id,
          name: company.name,
          slug: company.slug,
          smallLogoThumbUrl: company.small_logo_thumb_url ?? null,
          website: company.website ?? null,
          oneLiner: company.one_liner ?? null,
          teamSize: company.team_size ?? null,
          topCompany: company.top_company ?? false,
          isHiring: company.isHiring ?? false,
          batch: company.batch ?? null,
          status: company.status ?? null,
          industries: company.industries ?? [],
          regions: company.regions ?? [],
          url: company.url ?? null,
        })
        .onConflictDoUpdate({
          target: ycCompanies.slug,
          set: {
            ycId: company.id,
            name: company.name,
            smallLogoThumbUrl: company.small_logo_thumb_url ?? null,
            website: company.website ?? null,
            oneLiner: company.one_liner ?? null,
            teamSize: company.team_size ?? null,
            topCompany: company.top_company ?? false,
            isHiring: company.isHiring ?? false,
            batch: company.batch ?? null,
            status: company.status ?? null,
            industries: company.industries ?? [],
            regions: company.regions ?? [],
            url: company.url ?? null,
            updatedAt: new Date().toISOString(),
          },
        });

      console.log(`Synced: ${company.name} (${company.slug})`);
    } catch (err: any) {
      console.error(`Error saving ${company.name}:`, err);
    }
    await sleep(100);
  }
}

main()
  .then(() => {
    console.log("Script completed successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
