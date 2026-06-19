import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Initialize Gemini if key exists
const getGenAI = (): GoogleGenAI | null => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Common platform domains to exclude or tag (non-blog platforms)
const BIG_PLATFORMS = [
  "google.com", "google.cn", "youtube.com", "facebook.com", "twitter.com", "x.com",
  "instagram.com", "linkedin.com", "amazon.com", "wikipedia.org", "w3.org", "apple.com",
  "microsoft.com", "bilibili.com", "weibo.com", "zhihu.com", "baidu.com", "qq.com",
  "taobao.com", "jd.com", "github.com", "gitpod.io", "npmtrends.com", "npmjs.com",
  "stackoverflow.com", "medium.com", "reddit.com", "quora.com", "pinterest.com",
  "tiktok.com", "douyin.com", "vimeo.com", "gitbook.com", "git-scm.com", "cloudflare.com",
  "gitee.com", "v2ex.com", "juejin.cn", "csdn.net", "cnblogs.com", "segmentfault.com",
  "jianshu.com", "oschina.net"
];

// Helper to determine if a URL belongs to a major non-blog platform
function checkPlatform(hostname: string): boolean {
  const hostLower = hostname.toLowerCase();
  return BIG_PLATFORMS.some(platform => 
    hostLower === platform || hostLower.endsWith("." + platform)
  );
}

// REST route to crawl a single page and extract information
app.post("/api/crawl", async (req: express.Request, res: express.Response): Promise<any> => {
  const { url: targetUrl, timeout = 8000 } = req.body;

  if (!targetUrl) {
    return res.status(400).json({ error: "URL parameter is required" });
  }

  let formattedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = "http://" + formattedUrl;
  }

  try {
    const parsedTarget = new URL(formattedUrl);
    const targetOrigin = parsedTarget.origin;
    const targetHostname = parsedTarget.hostname;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(formattedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5,zh-CN;q=0.9,zh;q=0.8",
      }
    });

    clearTimeout(id);

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        statusCode: response.status,
        errorMessage: `HTTP ${response.status} ${response.statusText}`,
        url: formattedUrl
      });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return res.status(200).json({
        success: false,
        statusCode: 200,
        errorMessage: `Not an HTML page (${contentType})`,
        url: formattedUrl
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract basic page info
    const pageTitle = $("title").text().trim() || targetHostname;
    
    // Extract description
    const description = 
      $('meta[name="description"]').attr("content")?.trim() || 
      $('meta[property="og:description"]').attr("content")?.trim() || 
      "";

    // Extract RSS/Atom feeds
    let feedUrls: string[] = [];
    $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, elem) => {
      const feedHref = $(elem).attr("href");
      if (feedHref) {
        try {
          const resolvedFeed = new URL(feedHref, formattedUrl).toString();
          feedUrls.push(resolvedFeed);
        } catch (e) {}
      }
    });

    // Extract all outbound links
    const parsedLinks: any[] = [];
    const seenLinks = new Set<string>();

    $("a[href]").each((_, elem) => {
      const rawHref = $(elem).attr("href")?.trim();
      if (!rawHref) return;

      // Filter out anchors, javascript, protocols like mailto/tel/etc.
      if (
        rawHref.startsWith("#") ||
        rawHref.startsWith("javascript:") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:") ||
        rawHref.startsWith("sms:") ||
        rawHref.startsWith("data:")
      ) {
        return;
      }

      try {
        const resolvedUrlObj = new URL(rawHref, formattedUrl);
        // Normalize URL: remove hash, lower-case protocol and hostname
        resolvedUrlObj.hash = "";
        let resolvedUrl = resolvedUrlObj.toString();
        
        // Skip duplicate identical links on the same page
        if (seenLinks.has(resolvedUrl)) {
          return;
        }
        seenLinks.add(resolvedUrl);

        const hrefHostname = resolvedUrlObj.hostname;
        const isInternal = hrefHostname === targetHostname || hrefHostname.endsWith("." + targetHostname);
        
        let linkText = $(elem).text().trim();
        // Fallback to title attrib, or image alt, or URL path
        if (!linkText) {
          linkText = $(elem).attr("title")?.trim() || "";
        }
        if (!linkText) {
          const imgAlt = $(elem).find("img").first().attr("alt")?.trim();
          if (imgAlt) linkText = `[Img: ${imgAlt}]`;
        }
        if (!linkText) {
          linkText = resolvedUrlObj.pathname !== "/" ? resolvedUrlObj.pathname : resolvedUrlObj.host;
        }

        // Limit link text length to avoid crazy large blocks
        if (linkText.length > 80) {
          linkText = linkText.substring(0, 77) + "...";
        }

        // Determine if it's placed in a container suggestive of friends
        // e.g. div with id="friend-links", ul class="links", etc.
        let isFriendLinkCandidate = false;
        
        // 1. Check parent container naming
        let currentParent = $(elem).parent();
        let depthLimit = 4;
        while (currentParent.length && depthLimit > 0) {
          const parentClass = currentParent.attr("class") || "";
          const parentId = currentParent.attr("id") || "";
          const parentTagName = currentParent.prop("tagName")?.toLowerCase() || "";
          
          const combinedNames = (parentClass + " " + parentId + " " + parentTagName).toLowerCase();
          
          if (
            combinedNames.includes("friend") || 
            combinedNames.includes("link") || 
            combinedNames.includes("blogroll") || 
            combinedNames.includes("yqlj") || // Chinese Pinyin for 友情链接
            combinedNames.includes("partnership") ||
            combinedNames.includes("flink") ||
            combinedNames.includes("neighbor") ||
            combinedNames.includes("cooperation") ||
            combinedNames.includes("friends") ||
            combinedNames.includes("site-links") ||
            combinedNames.includes("links-list") ||
            combinedNames.includes("link-card") ||
            combinedNames.includes("links-card") ||
            combinedNames.includes("friends-list") ||
            combinedNames.includes("linkcard") ||
            combinedNames.includes("link-grid") ||
            combinedNames.includes("buddy") ||
            combinedNames.includes("favorites") ||
            combinedNames.includes("peers") ||
            combinedNames.includes("links-url") ||
            combinedNames.includes("links-group")
          ) {
            isFriendLinkCandidate = true;
            break;
          }
          currentParent = currentParent.parent();
          depthLimit--;
        }

        // 2. Check if the link text itself matches classic blogroll or friend-link labels
        const textLower = linkText.toLowerCase();
        const FRIEND_KEYWORDS = [
          "友情链接", "友情", "友链", "友情推荐", "独立博客", "圈子", "群落", "邻居", "我的朋友", 
          "大佬", "朋友", "推荐", "收藏", "导航", "友情链接交换", "交换链接", "友链交换", 
          "航标", "星轨", "友盟", "契约", "部落", "邻里", "同行", "往来", "致敬", "知己", "座标", "星图",
          "friends", "links", "blogroll", "neighbors", "partners", "buddies", "favorites", "contacts", 
          "networks", "associated", "sites", "peers", "circle", "syndication", "roll", "friendship"
        ];
        
        const hasFriendKeyword = FRIEND_KEYWORDS.some(kw => textLower.includes(kw));
        
        // 3. Check if the URL path contains a friends/links pattern
        const pathLower = resolvedUrlObj.pathname.toLowerCase();
        const URL_FRIEND_PATTERNS = [
          "/links", "/friends", "/blogroll", "/neighbor", "/yqlj", "links.html", "friends.html", "blogroll.html", "yqlj.html"
        ];
        const hasFriendPath = URL_FRIEND_PATTERNS.some(pat => pathLower.includes(pat));

        if (hasFriendKeyword || hasFriendPath) {
          isFriendLinkCandidate = true;
        }

        // Also if link text itself contains typical blog words or matches certain criteria,
        // (E.g., if it's external, has a reasonable non-functional text, and isn't a massive platform)
        const isPlatform = checkPlatform(hrefHostname);
        
        parsedLinks.push({
          url: resolvedUrl,
          name: linkText,
          hostname: hrefHostname,
          isInternal,
          isPlatform,
          isFriendLinkCandidate: isFriendLinkCandidate && !isInternal && !isPlatform
        });
      } catch (err) {
        // Safe skip invalid resolved URLs
      }
    });

    return res.status(200).json({
      success: true,
      url: formattedUrl,
      title: pageTitle,
      description,
      feeds: feedUrls,
      links: parsedLinks
    });

  } catch (err: any) {
    return res.status(200).json({
      success: false,
      statusCode: 500,
      errorMessage: err.message || "Unknown error occurred on server during crawling",
      url: formattedUrl
    });
  }
});

// Gemini helper to analyze links list and categorize them
app.post("/api/ai-analyze-blogs", async (req: express.Request, res: express.Response): Promise<any> => {
  const { blogs, customConfig } = req.body;

  if (!blogs || !Array.isArray(blogs) || blogs.length === 0) {
    return res.status(400).json({ error: "Missing blogs list" });
  }

  // Format the list for the model to digest, up to 40 items to avoid token overload
  const sampleBlogs = blogs.slice(0, 48).map(b => ({
    name: b.name || "Unknown",
    url: b.url,
    title: b.title || "",
    description: b.description || "",
    depth: b.depth || 1,
    rss: b.feeds && b.feeds.length > 0 ? "Yes" : "No"
  }));

  let prompt = `你是一个互联网博客探索专家。这里有一个我们通过友情链接爬虫程序抓取到的独立博客列表：
${JSON.stringify(sampleBlogs, null, 2)}

请对这些博客进行深度分析：
1. 提取出最具价值、最有趣或最高质量的 5-8 个博客，并简要写出推荐理由（包括他们可能偏向哪个领域，比如技术、生活、理财、摄影等）。
2. 将这批博客分析并分为 3-5 个技术/人文等兴趣主题分类，并说明分类。
3. 给出这个博客圈子的主要文化特征或共同关注的技术/生活主题（如 Hexo 独立博客文化、前端开发、极简生活、AI探索等）。

请以直观、精美、条理清晰的 Markdown 格式输出分析报告，使用吸引人的排版。`;

  // Custom prompt override if supplied
  if (customConfig && customConfig.customPromptPreset?.trim()) {
    prompt = `${customConfig.customPromptPreset}\n\n以下是待分析的独立博客数据列表：\n${JSON.stringify(sampleBlogs, null, 2)}`;
  }

  try {
    const apiType = customConfig?.apiType || "gemini";
    const customKey = customConfig?.apiKey?.trim();

    if (apiType === "openai") {
      // Proxying request to custom OpenAI-compatible gateway (e.g., DeepSeek, OpenAI)
      const baseUrl = (customConfig.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      const model = customConfig.modelName || "gpt-4o-mini";
      
      const payload = {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI-compatible host error (HTTP ${response.status}): ${errText}`);
      }

      const resJson: any = await response.json();
      const content = resJson.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("API base returned empty or invalid choices content structured response.");
      }

      return res.status(200).json({
        success: true,
        analysis: content
      });

    } else {
      // Defaulting or custom Gemini flow
      const apiKeyToUse = customKey || process.env.GEMINI_API_KEY;
      if (!apiKeyToUse || apiKeyToUse === "MY_GEMINI_API_KEY") {
        return res.status(200).json({
          success: false,
          message: "服务器内置 Gemini API 密钥未配置。请在左下角 AI 接口设置中开启并在自定义 AI 接口面板中填入您自己的 API Key 进行智能分析。"
        });
      }

      const model = customConfig?.modelName || "gemini-3.5-flash";
      const customAi = new GoogleGenAI({ apiKey: apiKeyToUse });
      
      const response = await customAi.models.generateContent({
        model: model,
        contents: prompt,
      });

      return res.status(200).json({
        success: true,
        analysis: response.text
      });
    }

  } catch (err: any) {
    return res.status(200).json({
      success: false,
      message: err.message || "Failed to generate AI analysis report."
    });
  }
});

// Vite & Static Asset Handling
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server starting on port ${PORT}`);
  });
}

startServer();
