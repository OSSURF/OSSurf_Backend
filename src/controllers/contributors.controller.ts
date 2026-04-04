import { Request, Response } from "express";
import { getContributorRankings } from "../services/contributors.service";

export const getRankings = async (req: Request, res: Response) => {
  try {
    const rankings = await getContributorRankings();
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contributor rankings" });
  }
};
