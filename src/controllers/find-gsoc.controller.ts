import { Request, Response } from "express";
import axios from "axios";
import { cached, cacheKeys, cacheTTL } from "../lib/cache";

const GSOC_YEARS = [2025, 2024, 2023, 2022, 2021];

interface GsocOrganization {
  name?: string;
  num_projects?: number;
  projects?: unknown[];
  [key: string]: unknown;
}

export const findGSOC = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 30;

    const result = await cached(
      cacheKeys.gsoc(page, perPage),
      cacheTTL.gsoc,
      async () => {
        const yearResponses = await Promise.all(
          GSOC_YEARS.map(async (year) => {
            const { data } = await axios.get(
              `https://api.gsocorganizations.dev/${year}.json`,
            );

            return {
              year,
              organizations: (data.organizations || []) as GsocOrganization[],
            };
          }),
        );

        const latestYearData = yearResponses[0];
        const byName = new Map<
          string,
          {
            years: number[];
            totalProjects: number;
          }
        >();

        yearResponses.forEach(({ year, organizations }) => {
          organizations.forEach((org) => {
            const name = org.name;
            if (!name) return;

            const existing = byName.get(name) || {
              years: [],
              totalProjects: 0,
            };
            if (!existing.years.includes(year)) {
              existing.years.push(year);
            }

            const projectsFromNum = Number(org.num_projects || 0);
            const projectsFromList = Array.isArray(org.projects)
              ? org.projects.length
              : 0;
            existing.totalProjects += Math.max(
              projectsFromNum,
              projectsFromList,
            );

            byName.set(name, existing);
          });
        });

        const organizaitons = latestYearData.organizations.map((org) => {
          const name = org.name;
          const aggregate = name ? byName.get(name) : undefined;
          const participationYears = (
            aggregate?.years || [latestYearData.year]
          ).sort((a, b) => b - a);

          return {
            ...org,
            participation_years: participationYears,
            years_participated: participationYears.length,
            total_projects:
              aggregate?.totalProjects || Number(org.num_projects || 0),
          };
        });

        const pageStart = (page - 1) * perPage;
        const end = pageStart + perPage;
        const paginatedOrgs = organizaitons.slice(pageStart, end);

        return {
          year: latestYearData.year,
          total: organizaitons.length,
          page,
          perPage,
          totalPages: Math.ceil(organizaitons.length / perPage),
          organizaitons: paginatedOrgs,
        };
      },
    );

    res.json(result);
  } catch (e) {
    console.error("Error fetching data: ", e);
    res.status(500).json({ message: "Failed to fetch GSOC" });
  }
};
