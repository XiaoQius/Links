import { CrawledBlog } from "./types";

export const DEFAULT_EXCLUDE_DOMAINS = [
  "google.com", "google.cn", "youtube.com", "facebook.com", "twitter.com", "x.com",
  "instagram.com", "linkedin.com", "amazon.com", "wikipedia.org", "w3.org", "apple.com",
  "microsoft.com", "bilibili.com", "weibo.com", "zhihu.com", "baidu.com", "qq.com",
  "taobao.com", "jd.com", "github.com", "github.io", "gitpod.io", "githubusercontent.com",
  "npmjs.com", "stackoverflow.com", "medium.com", "reddit.com", "quora.com", "pinterest.com",
  "tiktok.com", "douyin.com", "vimeo.com", "cloudflare.com", "gitee.com", "v2ex.com",
  "juejin.cn", "csdn.net", "cnblogs.com", "segmentfault.com", "jianshu.com", "oschina.net"
].join(", ");

export const DEFAULT_EXCLUDE_KEYWORDS = [
  "广告", "推广", "营销", "兼职", "贷款", "理财", "棋牌", "菠菜", "娱乐城", "代发",
  "优惠券", "发卡网", "赌场", "博彩", "下注", "捕鱼选手", "威尼斯人", "代扣", "灰产", 
  "货源", "专卖店", "微信群", "网校", "商城", "淘客", "寄生虫", "网赚", "代孕"
].join(", ");

// Clean URLs consistently for deduplication
export function normalizeUrl(urlStr: string): string {
  try {
    let clean = urlStr.trim();
    if (!/^https?:\/\//i.test(clean)) {
      clean = "http://" + clean;
    }
    const urlObj = new URL(clean);
    urlObj.hash = "";
    // Remove query params that are just marketing trackings
    const paramKeys = Array.from(urlObj.searchParams.keys());
    paramKeys.forEach(p => {
      if (p.startsWith("utm_") || p === "spm" || p === "ref") {
        urlObj.searchParams.delete(p);
      }
    });
    // Remove trailing slash for uniformity
    let finalUrl = urlObj.toString();
    if (finalUrl.endsWith("/")) {
      finalUrl = finalUrl.slice(0, -1);
    }
    return finalUrl;
  } catch (e) {
    return urlStr;
  }
}

// Extract hostname
export function getHostname(urlStr: string): string {
  try {
    const urlObj = new URL(urlStr);
    return urlObj.hostname;
  } catch (e) {
    return urlStr;
  }
}

// Extract primary domain platform / registrable domain
export function getPlatformOrDomain(urlStr: string): string {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    // Common multi-tenant developer/writer platforms
    const sharedPlatforms = [
      "github.io", "vercel.app", "gitbook.io", "blogspot.com", "gitee.io",
      "wordpress.com", "lofter.com", "cnblogs.com", "netlify.app", "github.com",
      "notion.site", "medium.com", "hexo.io", "pages.dev", "gitlab.io"
    ];
    for (const platform of sharedPlatforms) {
      if (host === platform || host.endsWith("." + platform)) {
        return platform;
      }
    }
    const parts = host.split('.');
    if (parts.length > 2) {
      // Check for three-level domain hosts like co.uk, com.cn, net.cn etc
      const secondLast = parts[parts.length - 2];
      if (["com", "net", "org", "gov", "edu", "co"].includes(secondLast) && parts.length > 3) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    return host;
  } catch (e) {
    return "其它自定义域名";
  }
}

// Extract TLD suffix (e.g. .com, .cn, .org, etc.)
export function getTLD(urlStr: string): string {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    const parts = host.split('.');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const second = parts[parts.length - 2];
      // Check for double extension like .com.cn or .net.cn
      if (["com", "co", "net", "org", "gov", "edu"].includes(second)) {
        return `.${second}.${last}`;
      }
      return `.${last}`;
    }
    return ".other";
  } catch (e) {
    return "其它后缀";
  }
}

// Convert a list of crawled blogs to a CSV string
export function exportToCSV(blogs: CrawledBlog[]): string {
  const headers = ["网站名字", "网站标题", "网站链接", "订阅源地址(RSS/Atom)", "抓取深度", "状态", "引用的页面", "抓取时间", "网站描述"];
  
  const rows = blogs.map(b => {
    const referrersStr = b.referrers.map(r => r.url).join(" | ");
    const feedsStr = b.feeds?.join(" | ") || "";
    
    return [
      b.name || "",
      b.title || "",
      b.url || "",
      feedsStr,
      b.depth.toString(),
      b.status,
      referrersStr,
      b.crawlTime,
      b.description || ""
    ].map(val => {
      // Escape dual quotes
      const cleaned = (val || "").replace(/"/g, '""');
      return `"${cleaned}"`;
    }).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

// Convert blogs containing feeds into OPML format for RSS readers
export function exportToOPML(blogs: CrawledBlog[]): string {
  const blogListWithFeeds = blogs.filter(b => b.feeds && b.feeds.length > 0 && b.status === "success");

  let opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>友情链接爬取器 订阅源导出</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
    <outline text="友情爬取的独立博客" title="友情爬取的独立博客">
`;

  blogListWithFeeds.forEach(b => {
    const siteName = (b.name || b.title || getHostname(b.url)).replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });

    const siteUrl = b.url.replace(/&/g, "&amp;");
    
    // Output each feed
    if (b.feeds && b.feeds.length > 0) {
      b.feeds.forEach(feed => {
        const feedUrl = feed.replace(/&/g, "&amp;");
        opml += `      <outline type="rss" xmlUrl="${feedUrl}" htmlUrl="${siteUrl}" title="${siteName}" text="${siteName}" />\n`;
      });
    }
  });

  opml += `    </outline>
  </body>
</opml>`;

  return opml;
}

// Download utility helper
export function triggerFileDownload(content: string, fileName: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
