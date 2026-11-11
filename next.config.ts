import type { NextConfig } from "next";

/*
 * GitHub Pages serves plain files from a folder named after the repository
 * (/voice-orb). The Pages workflow sets PAGES_BASE_PATH to that folder, and the
 * build then exports static HTML with every link and asset under it. Locally
 * it's unset, and the page runs at the root as usual.
 */
const pagesBasePath = process.env.PAGES_BASE_PATH;

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  ...(pagesBasePath !== undefined && { output: "export", basePath: pagesBasePath }),
  // Next prefixes its own links and assets; files read by path, like the sample, need it too.
  env: { NEXT_PUBLIC_BASE_PATH: pagesBasePath ?? "" },
};

export default nextConfig;
