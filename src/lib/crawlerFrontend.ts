import * as cheerio from "cheerio";

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

function checkPlatform(hostname: string): boolean {
  const hostLower = hostname.toLowerCase();
  return BIG_PLATFORMS.some(platform =>
    hostLower === platform || hostLower.endsWith("." + platform)
  );
}

export interface CrawledLink {
  url: string;
  name: string;
  hostname: string;
  isInternal: boolean;
  isPlatform: boolean;
  isFriendLinkCandidate: boolean;
}

export interface CrawlResult {
  success: boolean;
  url: string;
  statusCode?: number;
  errorMessage?: string;
  title?: string;
  description?: string;
  feeds?: string[];
  links?: CrawledLink[];
}

// CORS proxy list - try multiple in order
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function fetchWithProxy(targetUrl: string, timeoutMs: number): Promise<Response> {
  // Try each proxy with its own timeout
  let lastError: Error | null = null;

  for (const proxyBuilder of CORS_PROXIES) {
    const proxyUrl = proxyBuilder(targetUrl);
    try {
      const response = await fetchWithTimeout(proxyUrl, timeoutMs);
      if (response.ok) {
        return response;
      }
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }

  // Fallback: try direct fetch (will fail on most sites due to CORS, but works for some)
  try {
    return await fetchWithTimeout(targetUrl, timeoutMs);
  } catch (err: any) {
    throw lastError || err;
  }
}

export async function crawlPageFrontend(targetUrl: string, timeoutMs: number = 15000): Promise<CrawlResult> {
  let formattedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = "http://" + formattedUrl;
  }

  try {
    const parsedTarget = new URL(formattedUrl);
    const targetHostname = parsedTarget.hostname;

    const response = await fetchWithProxy(formattedUrl, timeoutMs);

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        errorMessage: `HTTP ${response.status} ${response.statusText}`,
        url: formattedUrl
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return {
        success: false,
        statusCode: 200,
        errorMessage: `Not an HTML page (${contentType})`,
        url: formattedUrl
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const pageTitle = $("title").text().trim() || targetHostname;
    const description =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "";

    let feedUrls: string[] = [];
    $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, elem) => {
      const feedHref = $(elem).attr("href");
      if (feedHref) {
        try {
          const resolvedFeed = new URL(feedHref, formattedUrl).toString();
          feedUrls.push(resolvedFeed);
        } catch (e) { }
      }
    });

    const parsedLinks: CrawledLink[] = [];
    const seenLinks = new Set<string>();

    $("a[href]").each((_, elem) => {
      const rawHref = $(elem).attr("href")?.trim();
      if (!rawHref) return;

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
        resolvedUrlObj.hash = "";
        let resolvedUrl = resolvedUrlObj.toString();

        if (seenLinks.has(resolvedUrl)) return;
        seenLinks.add(resolvedUrl);

        const hrefHostname = resolvedUrlObj.hostname;
        const isInternal = hrefHostname === targetHostname || hrefHostname.endsWith("." + targetHostname);

        let linkText = $(elem).text().trim();
        if (!linkText) linkText = $(elem).attr("title")?.trim() || "";
        if (!linkText) {
          const imgAlt = $(elem).find("img").first().attr("alt")?.trim();
          if (imgAlt) linkText = `[Img: ${imgAlt}]`;
        }
        if (!linkText) {
          linkText = resolvedUrlObj.pathname !== "/" ? resolvedUrlObj.pathname : resolvedUrlObj.host;
        }
        if (linkText.length > 80) {
          linkText = linkText.substring(0, 77) + "...";
        }

        let isFriendLinkCandidate = false;
        let currentParent = $(elem).parent();
        let depthLimit = 4;
        while (currentParent.length && depthLimit > 0) {
          const parentClass = currentParent.attr("class") || "";
          const parentId = currentParent.attr("id") || "";
          const parentTagName = currentParent.prop("tagName")?.toLowerCase() || "";
          const combinedNames = (parentClass + " " + parentId + " " + parentTagName).toLowerCase();
          if (
            combinedNames.includes("friend") || combinedNames.includes("link") ||
            combinedNames.includes("blogroll") || combinedNames.includes("yqlj") ||
            combinedNames.includes("partnership") || combinedNames.includes("flink") ||
            combinedNames.includes("neighbor") || combinedNames.includes("cooperation") ||
            combinedNames.includes("friends") || combinedNames.includes("site-links") ||
            combinedNames.includes("links-list") || combinedNames.includes("link-card") ||
            combinedNames.includes("links-card") || combinedNames.includes("friends-list") ||
            combinedNames.includes("linkcard") || combinedNames.includes("link-grid") ||
            combinedNames.includes("buddy") || combinedNames.includes("favorites") ||
            combinedNames.includes("peers") || combinedNames.includes("links-url") ||
            combinedNames.includes("links-group")
          ) {
            isFriendLinkCandidate = true;
            break;
          }
          currentParent = currentParent.parent();
          depthLimit--;
        }

        const textLower = linkText.toLowerCase();
        const FRIEND_KEYWORDS = [
          "友情链接", "友情", "友链", "友情推荐", "独立博客", "圈子", "群落", "邻居", "我的朋友",
          "大佬", "朋友", "推荐", "收藏", "导航", "友情链接交换", "交换链接", "友链交换",
          "航标", "星轨", "友盟", "契约", "部落", "邻里", "同行", "往来", "致敬", "知己", "座标", "星图",
          "friends", "links", "blogroll", "neighbors", "partners", "buddies", "favorites", "contacts",
          "networks", "associated", "sites", "peers", "circle", "syndication", "roll", "friendship"
        ];
        const hasFriendKeyword = FRIEND_KEYWORDS.some(kw => textLower.includes(kw));

        const pathLower = resolvedUrlObj.pathname.toLowerCase();
        const URL_FRIEND_PATTERNS = [
          "/links", "/friends", "/blogroll", "/neighbor", "/yqlj", "links.html", "friends.html", "blogroll.html", "yqlj.html"
        ];
        const hasFriendPath = URL_FRIEND_PATTERNS.some(pat => pathLower.includes(pat));

        if (hasFriendKeyword || hasFriendPath) isFriendLinkCandidate = true;

        const isPlatform = checkPlatform(hrefHostname);

        parsedLinks.push({
          url: resolvedUrl,
          name: linkText,
          hostname: hrefHostname,
          isInternal,
          isPlatform,
          isFriendLinkCandidate: isFriendLinkCandidate && !isInternal && !isPlatform
        });
      } catch (err) { }
    });

    return {
      success: true,
      url: formattedUrl,
      title: pageTitle,
      description,
      feeds: feedUrls,
      links: parsedLinks
    };

  } catch (err: any) {
    if (err.name === "AbortError") {
      return {
        success: false,
        statusCode: 408,
        errorMessage: "请求超时（CORS代理服务响应慢，请重试或增加超时时间）",
        url: formattedUrl
      };
    }
    return {
      success: false,
      statusCode: 500,
      errorMessage: err.message || "爬取过程中发生未知错误",
      url: formattedUrl
    };
  }
}
