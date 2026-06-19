export interface CrawledPage {
  url: string;
  title?: string;
  status: 'pending' | 'crawling' | 'success' | 'failed';
  feeds?: string[];
  crawlTime: string;
}

export interface CrawledBlog {
  id: string; // Typically host to avoid duplicates
  url: string;
  name: string; // The link title or site name (from anchor text of referrer)
  title?: string; // The parsed target browser page title
  description?: string; // Target page meta description
  crawlTime: string; // ISO format
  status: 'pending' | 'crawling' | 'success' | 'failed';
  statusCode?: number;
  errorMessage?: string;
  depth: number;
  referrers: { url: string; text: string }[]; // Sites that link here
  feeds?: string[]; // RSS/Atom feeds detected
  outLinksTotal?: number; // Total external links discovered on this site
  outLinksFriendCount?: number; // Friends discovered count
  occurrences?: number; // Discovery count (number of times linked physically)
  crawledPages?: CrawledPage[]; // Additional subpages crawled under the same host
  connectivity?: {
    status: 'unchecked' | 'checking' | 'ok' | 'failed';
    statusCode?: number;
    error?: string;
    checkedTime?: string;
  };
}

export interface QueueItem {
  url: string;
  depth: number;
  referrerUrl: string;
  referrerText: string;
}

export interface LogEntry {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export interface CrawlerSettings {
  maxDepth: number;
  maxSites: number;
  concurrency: number;
  timeout: number;
  excludeDomains: string;
  excludeKeywords: string; // Comma-separated title/description keywords to filter out ads/commercial sites
  onlyFriendCandidates: boolean; // limit traversal only to links detected as friend rolls
  respectRobots?: boolean;
}

export interface NetworkNode {
  id: string;
  label: string;
  val: number; // size relative to referrers count
  group: 'seed' | 'blog' | 'external' | 'failed' | 'neutral';
  url: string;
}

export interface NetworkLink {
  source: string;
  target: string;
}

export interface HistoricalCrawl {
  id: string;
  name: string;
  timestamp: string;
  seeds: string[];
  blogs: CrawledBlog[];
  logs: LogEntry[];
  aiReport: string;
  settings: CrawlerSettings;
}
