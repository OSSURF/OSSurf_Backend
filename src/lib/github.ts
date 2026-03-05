import { Octokit } from "@octokit/rest";

const githubToken = process.env.GITHUB_TOKEN?.trim();

export const octokit = new Octokit({
  ...(githubToken ? { auth: githubToken } : {}),
});

export const publicOctokit = new Octokit();
