import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeBlogs, type BlogItem, type AiAnalyzeConfig } from "../src/lib/aiAnalyzer";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const { blogs, customConfig } = req.body || {};

  const result = await analyzeBlogs(
    blogs as BlogItem[],
    customConfig as AiAnalyzeConfig | undefined,
    process.env.GEMINI_API_KEY
  );

  res.status(200).json(result);
}
