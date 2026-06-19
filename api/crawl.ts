import type { VercelRequest, VercelResponse } from "@vercel/node";
import { crawlPage } from "../src/lib/crawler";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const { url: targetUrl, timeout } = req.body || {};

  if (!targetUrl) {
    res.status(400).json({ error: "URL parameter is required" });
    return;
  }

  const timeoutMs = typeof timeout === "number" ? timeout : 8000;
  const safeTimeout = Math.min(Math.max(timeoutMs, 3000), 25000);

  const result = await crawlPage(targetUrl, safeTimeout);
  res.status(200).json(result);
}
