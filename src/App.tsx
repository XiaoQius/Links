import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Play, Pause, RotateCcw, Search, Download, Database, Cpu, 
  Terminal, ArrowRight, HelpCircle, Radio, FileSpreadsheet, 
  Compass, Share2, Network, Sparkles, Filter, Globe, AlertTriangle, 
  CheckCircle2, ChevronRight, Copy, Save, History, Trash2, HelpCircle as HelpIcon,
  TrendingUp, Layers, Settings2, BarChart2, ShieldCheck, Heart, Clock, ExternalLink, Plus,
  Sliders, X, Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";

import { CrawledBlog, QueueItem, LogEntry, CrawlerSettings, HistoricalCrawl } from "./types";
import {
  DEFAULT_EXCLUDE_DOMAINS, DEFAULT_EXCLUDE_KEYWORDS, normalizeUrl, getHostname,
  exportToCSV, exportToOPML, triggerFileDownload, getPlatformOrDomain, getTLD
} from "./utils";
import { crawlPageFrontend } from "./lib/crawlerFrontend";
import { analyzeBlogs } from "./lib/aiAnalyzer";
import BlogUniverse from "./components/BlogUniverse";
import BlogDetailModal from "./components/BlogDetailModal";

export default function App() {
  // --- Persistent Storage State ---
  const [seedsInput, setSeedsInput] = useState<string>(() => {
    const saved = localStorage.getItem("crawler_seeds_input");
    return saved || "https://meta.appinn.net\nhttps://tualatrix.github.io";
  });

  const [settings, setSettings] = useState<CrawlerSettings>(() => {
    const saved = localStorage.getItem("crawler_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          excludeKeywords: parsed.excludeKeywords ?? DEFAULT_EXCLUDE_KEYWORDS
        };
      } catch (e) {}
    }
    return {
      maxDepth: 3,
      maxSites: 80,
      concurrency: 2,
      timeout: 8000,
      excludeDomains: DEFAULT_EXCLUDE_DOMAINS,
      excludeKeywords: DEFAULT_EXCLUDE_KEYWORDS,
      onlyFriendCandidates: true
    };
  });

  const [blogs, setBlogs] = useState<CrawledBlog[]>(() => {
    const saved = localStorage.getItem("crawler_blogs_data");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });

  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const saved = localStorage.getItem("crawler_logs_data");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      {
        id: "init",
        time: new Date().toLocaleTimeString(),
        text: "友情链接探针宇宙初始化完毕。请输入种子链接，并配置递进规则开始深度抓取。",
        type: "info"
      }
    ];
  });

  const [historySessions, setHistorySessions] = useState<HistoricalCrawl[]>(() => {
    const saved = localStorage.getItem("crawler_history_sessions");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });

  const [sessionSaveName, setSessionSaveName] = useState("");

  // --- Crawler Control & Queue State ---
  const [crawlStatus, setCrawlStatus] = useState<'idle' | 'running' | 'paused' | 'completed' | 'stopped'>('idle');
  const [activeCount, setActiveCount] = useState<number>(0);
  const [queueDisplayCount, setQueueDisplayCount] = useState<number>(0);
  
  // --- Refs for crawler scheduler (avoids stale closures & race conditions) ---
  const queueRef = useRef<QueueItem[]>([]);
  const visitedRef = useRef<Set<string>>(new Set());
  const blogsRef = useRef<Record<string, CrawledBlog>>({});
  const activeWorkersRef = useRef<number>(0);
  const statusRef = useRef<'idle' | 'running' | 'paused' | 'completed' | 'stopped'>('idle');

  // --- Active Interactive State ---
  const [selectedBlog, setSelectedBlog] = useState<CrawledBlog | null>(null);
  const [activeTab, setActiveTab] = useState<'table' | 'galaxy' | 'ai' | 'history' | 'logs'>('table');
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRss, setFilterRss] = useState<string>("all");
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- New Aggregation and Comparison States ---
  const [aggregationType, setAggregationType] = useState<'none' | 'tld' | 'platform'>('none');
  const [isCustomAiSettingsOpen, setIsCustomAiSettingsOpen] = useState(false);
  const [showCompareDrawer, setShowCompareDrawer] = useState(false);
  const [compareSessionId, setCompareSessionId] = useState<string>("");

  // Customized AI API Credentials and configurations
  const [aiApiConfig, setAiApiConfig] = useState(() => {
    const saved = localStorage.getItem("crawler_ai_api_config");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      apiType: 'gemini' as 'gemini' | 'openai',
      apiKey: '',
      baseUrl: 'https://api.google.com/v1',
      modelName: 'gemini-3.5-flash',
      customPromptPreset: ''
    };
  });

  useEffect(() => {
    localStorage.setItem("crawler_ai_api_config", JSON.stringify(aiApiConfig));
  }, [aiApiConfig]);

  // --- Custom Moals States for iframe safety ---
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [customAlert, setCustomAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);
  
  // --- AI Report State ---
  const [aiReport, setAiReport] = useState<string>(() => {
    return localStorage.getItem("crawler_ai_report") || "";
  });
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiError, setAiError] = useState("");

  const logsEndRef = useRef<HTMLDivElement>(null);

  // --- Sync persistence effects ---
  useEffect(() => {
    localStorage.setItem("crawler_seeds_input", seedsInput);
  }, [seedsInput]);

  useEffect(() => {
    localStorage.setItem("crawler_settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("crawler_blogs_data", JSON.stringify(blogs));
  }, [blogs]);

  useEffect(() => {
    localStorage.setItem("crawler_logs_data", JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem("crawler_history_sessions", JSON.stringify(historySessions));
  }, [historySessions]);

  useEffect(() => {
    statusRef.current = crawlStatus;
  }, [crawlStatus]);

  // Handle auto-scroll to logs console bottom
  useEffect(() => {
    if (activeTab === "logs") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, activeTab]);

  // Logging utility
  const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substring(7),
      time: new Date().toLocaleTimeString(),
      text,
      type
    };
    setLogs(prev => [...prev.slice(-300), newEntry]); // limit to 300 logs for memory performance
  };

  // Helper matching Domain blacklist
  const isDomainExcluded = (urlStr: string): boolean => {
    try {
      const hostname = new URL(urlStr).hostname.toLowerCase();
      const list = settings.excludeDomains
        .split(/[\s,;\n]+/)
        .map(d => d.trim().toLowerCase())
        .filter(Boolean);
      
      return list.some(domain => 
        hostname === domain || hostname.endsWith("." + domain)
      );
    } catch {
      return true; // Exclude invalid URLs
    }
  };

  // --- Core Crawler Loop Worker ---
  const runWorker = async (item: QueueItem) => {
    if (statusRef.current !== 'running') {
      // Put item back if crawler paused or stopped
      queueRef.current.unshift(item);
      return;
    }

    activeWorkersRef.current++;
    setActiveCount(activeWorkersRef.current);
    setQueueDisplayCount(queueRef.current.length);

    const targetUrl = item.url;
    const cleanUrl = normalizeUrl(targetUrl);
    const hostKey = getHostname(targetUrl);

    try {
      // 1. If already visited, just link referrer structure
      if (visitedRef.current.has(cleanUrl)) {
        const existing = blogsRef.current[hostKey];
        if (existing) {
          existing.occurrences = (existing.occurrences || 1) + 1;
          if (item.referrerUrl) {
            const referrerSeen = existing.referrers.some(r => normalizeUrl(r.url) === normalizeUrl(item.referrerUrl));
            if (!referrerSeen) {
              existing.referrers.push({ url: item.referrerUrl, text: item.referrerText });
            }
          }
          blogsRef.current[hostKey] = { ...existing };
          setBlogs(Object.values(blogsRef.current));
        }
        activeWorkersRef.current--;
        setActiveCount(activeWorkersRef.current);
        triggerScheduler();
        return;
      }

      // Mark visited
      visitedRef.current.add(cleanUrl);

      // Create or update active blogging record under hostname
      const existing = blogsRef.current[hostKey];
      if (!existing) {
        blogsRef.current[hostKey] = {
          id: hostKey,
          url: targetUrl,
          name: item.referrerText || hostKey,
          status: 'crawling',
          depth: item.depth,
          crawlTime: new Date().toISOString(),
          referrers: item.referrerUrl ? [{ url: item.referrerUrl, text: item.referrerText }] : [],
          occurrences: 1,
          crawledPages: [{
            url: targetUrl,
            status: 'crawling',
            crawlTime: new Date().toISOString()
          }]
        };
      } else {
        existing.occurrences = (existing.occurrences || 1) + 1;
        if (item.referrerUrl) {
          const referrerSeen = existing.referrers.some(r => normalizeUrl(r.url) === normalizeUrl(item.referrerUrl));
          if (!referrerSeen) {
            existing.referrers.push({ url: item.referrerUrl, text: item.referrerText });
          }
        }
        if (!existing.crawledPages) existing.crawledPages = [];
        const pageIdx = existing.crawledPages.findIndex(p => normalizeUrl(p.url) === cleanUrl);
        if (pageIdx === -1) {
          existing.crawledPages.push({
            url: targetUrl,
            status: 'crawling',
            crawlTime: new Date().toISOString()
          });
        } else {
          existing.crawledPages[pageIdx].status = 'crawling';
        }
        existing.status = 'crawling';
        blogsRef.current[hostKey] = { ...existing };
      }
      setBlogs(Object.values(blogsRef.current));
      addLog(`📡 [第 ${item.depth} 层级递进] 正在分析友情链接: ${targetUrl}`, "info");

      // 2. Fire request directly in frontend (cross-platform compatible)
      const result = await crawlPageFrontend(targetUrl, settings.timeout);

      if ((statusRef.current as string) === 'stopped') {
        // Abandon result if terminated mid-request
        activeWorkersRef.current--;
        setActiveCount(activeWorkersRef.current);
        return;
      }

      if (result.success) {
        // Evaluate keyword filter matching
        const pageTitle = result.title || "";
        const pageDesc = result.description || "";
        const combinedText = `${pageTitle} ${pageDesc}`.toLowerCase();
        
        const blockKeywords = settings.excludeKeywords
          .split(/[,，\s]+/)
          .map(k => k.trim())
          .filter(k => k.length > 0);
          
        const matchedKeyword = blockKeywords.find(keyword => 
          combinedText.includes(keyword.toLowerCase())
        );

        if (matchedKeyword) {
          addLog(`🚫 拦截匹配过滤: "${pageTitle || targetUrl}" 标题/内容包含屏蔽关键字 「${matchedKeyword}」，已自动截断深度抓取并标记。`, "warn");
          // Upgrade state as failed with block reason
          const existingNode = blogsRef.current[hostKey];
          if (existingNode) {
            if (!existingNode.crawledPages) existingNode.crawledPages = [];
            const pageIdx = existingNode.crawledPages.findIndex(p => normalizeUrl(p.url) === cleanUrl);
            const pageObj = {
              url: targetUrl,
              title: result.title,
              status: 'failed' as const,
              crawlTime: new Date().toISOString()
            };
            if (pageIdx !== -1) {
              existingNode.crawledPages[pageIdx] = pageObj;
            } else {
              existingNode.crawledPages.push(pageObj);
            }
            existingNode.status = 'failed';
            existingNode.errorMessage = `此站在标题/信息中包含屏蔽词: 「${matchedKeyword}」`;
            blogsRef.current[hostKey] = { ...existingNode };
          }
          setBlogs(Object.values(blogsRef.current));
          activeWorkersRef.current--;
          setActiveCount(activeWorkersRef.current);
          triggerScheduler();
          return;
        }

        addLog(`✅ 成功解析: "${result.title || targetUrl}"，提取到 ${result.links.length} 个链接`, "success");

        const feedsFound = result.feeds || [];
        if (feedsFound.length > 0) {
          addLog(`📡 发现 RSS / Atom 订阅源: ${feedsFound.join(", ")}`, "success");
        }

        // Apply Outbound links & count friend link candidates
        const totalOutlinks = result.links.length;
        const outlinksFriends = result.links.filter((l: any) => l.isFriendLinkCandidate).length;

        // Upgrade site state success
        const existingNode = blogsRef.current[hostKey];
        if (existingNode) {
          const currentFeeds = existingNode.feeds || [];
          const mergedFeeds = Array.from(new Set([...currentFeeds, ...feedsFound]));

          if (!existingNode.crawledPages) existingNode.crawledPages = [];
          const pageIdx = existingNode.crawledPages.findIndex(p => normalizeUrl(p.url) === cleanUrl);
          const pageObj = {
            url: targetUrl,
            title: result.title || hostKey,
            status: 'success' as const,
            feeds: feedsFound,
            crawlTime: new Date().toISOString()
          };
          if (pageIdx !== -1) {
            existingNode.crawledPages[pageIdx] = pageObj;
          } else {
            existingNode.crawledPages.push(pageObj);
          }

          const isHome = normalizeUrl(targetUrl) === normalizeUrl(`https://${hostKey}`) || 
                         normalizeUrl(targetUrl) === normalizeUrl(`http://${hostKey}`) || 
                         !existingNode.title;

          existingNode.status = 'success';
          if (isHome || !existingNode.title) {
            existingNode.title = result.title;
            existingNode.description = result.description;
            if (item.referrerText && item.referrerText !== hostKey) {
              existingNode.name = item.referrerText;
            }
          }
          existingNode.feeds = mergedFeeds;
          existingNode.outLinksTotal = totalOutlinks;
          existingNode.outLinksFriendCount = outlinksFriends;
          blogsRef.current[hostKey] = { ...existingNode };
        }

        // 3. Queue Child Links recursively down to N levels or internal pages
        const isInfinite = settings.maxDepth === -1;
        
        let addedCount = 0;
        let foundInternalPagesCount = 0;

        result.links.forEach((childLink: any) => {
          const childClean = normalizeUrl(childLink.url);

          // A. SPECIAL INTERNAL LINK SEARCH PATHS RULE
          if (childLink.isInternal) {
            try {
              const urlObj = new URL(childLink.url);
              const pathLower = urlObj.pathname.toLowerCase();
              const isLinksPage = [
                "/links", "/friends", "/blogroll", "/neighbor", "/yqlj", 
                "links.html", "friends.html", "blogroll.html", "yqlj.html", 
                "neighbor.html", "link.html", "friend.html", "links.php", "about"
              ].some(pat => pathLower.includes(pat));

              if (isLinksPage && !visitedRef.current.has(childClean)) {
                const alreadyQueued = queueRef.current.some(q => normalizeUrl(q.url) === childClean);
                if (!alreadyQueued) {
                  queueRef.current.push({
                    url: childLink.url,
                    depth: item.depth, // Crawl at current level so it doesn't count against Max Depth!
                    referrerUrl: targetUrl,
                    referrerText: childLink.name || `${item.referrerText} 友情链接页面`
                  });
                  foundInternalPagesCount++;
                }
              }
            } catch (err) {}
            return; // Skip normal internal link queuing
          }

          // B. EXTERNAL FRIEND LINK PROCESSING
          const passesFriendRule = !settings.onlyFriendCandidates || childLink.isFriendLinkCandidate;
          const isExcl = isDomainExcluded(childLink.url);
          const childHost = getHostname(childLink.url);

          if (passesFriendRule && !isExcl) {
            // Increment its global occurrence tracking if it exists anywhere in current list
            if (blogsRef.current[childHost]) {
              blogsRef.current[childHost].occurrences = (blogsRef.current[childHost].occurrences || 1) + 1;
              const hasRef = blogsRef.current[childHost].referrers.some(r => normalizeUrl(r.url) === cleanUrl);
              if (!hasRef) {
                blogsRef.current[childHost].referrers.push({ url: targetUrl, text: childLink.name || childLink.url });
              }

              if (!blogsRef.current[childHost].crawledPages) {
                blogsRef.current[childHost].crawledPages = [];
              }
              const hasPage = blogsRef.current[childHost].crawledPages.some(p => normalizeUrl(p.url) === childClean);
              if (!hasPage) {
                blogsRef.current[childHost].crawledPages.push({
                  url: childLink.url,
                  status: 'pending',
                  crawlTime: new Date().toISOString()
                });
              }
            }

            if (isInfinite || item.depth < settings.maxDepth) {
              // Avoid duplicates already in visited loop OR already registered under the same hostname OR already queued under the same hostname
              const hostAlreadyRegistered = !!blogsRef.current[childHost];
              const hostAlreadyQueued = queueRef.current.some(q => getHostname(q.url) === childHost);

              if (!visitedRef.current.has(childClean) && !hostAlreadyRegistered && !hostAlreadyQueued) {
                const alreadyQueued = queueRef.current.some(q => normalizeUrl(q.url) === childClean);
                
                if (!alreadyQueued) {
                  queueRef.current.push({
                    url: childLink.url,
                    depth: item.depth + 1,
                    referrerUrl: targetUrl,
                    referrerText: childLink.name || childLink.url
                  });

                  // Add placeholder as pending under hostname
                  if (!blogsRef.current[childHost]) {
                    blogsRef.current[childHost] = {
                      id: childHost,
                      url: childLink.url,
                      name: childLink.name || childHost,
                      status: 'pending',
                      depth: item.depth + 1,
                      crawlTime: new Date().toISOString(),
                      referrers: [{ url: targetUrl, text: childLink.name || childLink.url }],
                      occurrences: 1,
                      crawledPages: [{
                        url: childLink.url,
                        status: 'pending',
                        crawlTime: new Date().toISOString()
                      }]
                    };
                  }
                  
                  addedCount++;
                }
              }
            }
          }
        });

        if (foundInternalPagesCount > 0) {
          addLog(`🔍 [探测] 探听到 ${foundInternalPagesCount} 个站内专项友链子路径页，一并推入检测中以完整解析。`, "info");
        }

        if (addedCount > 0) {
          addLog(`🔗 [发现] 由该站扩展出 ${addedCount} 个 N级候选链推入计划队列`, "info");
        }

      } else {
        // Handled server error parsing code (like 404, DNS error)
        const existingNode = blogsRef.current[hostKey];
        if (existingNode) {
          if (!existingNode.crawledPages) existingNode.crawledPages = [];
          const pageIdx = existingNode.crawledPages.findIndex(p => normalizeUrl(p.url) === cleanUrl);
          const pageObj = {
            url: targetUrl,
            status: 'failed' as const,
            crawlTime: new Date().toISOString()
          };
          if (pageIdx !== -1) {
            existingNode.crawledPages[pageIdx] = pageObj;
          } else {
            existingNode.crawledPages.push(pageObj);
          }
          existingNode.status = 'failed';
          existingNode.statusCode = result.statusCode;
          existingNode.errorMessage = result.errorMessage || "未爬取成功或页面不是标准 HTML";
          blogsRef.current[hostKey] = { ...existingNode };
        }
        addLog(`⚠️ 抓取受限: ${targetUrl} (原因: ${result.errorMessage || "无反馈/拦截"})`, "warn");
      }

    } catch (err: any) {
      const existingNode = blogsRef.current[hostKey];
      if (existingNode) {
        if (!existingNode.crawledPages) existingNode.crawledPages = [];
        const pageIdx = existingNode.crawledPages.findIndex(p => normalizeUrl(p.url) === cleanUrl);
        const pageObj = {
          url: targetUrl,
          status: 'failed' as const,
          crawlTime: new Date().toISOString()
        };
        if (pageIdx !== -1) {
          existingNode.crawledPages[pageIdx] = pageObj;
        } else {
          existingNode.crawledPages.push(pageObj);
        }
        existingNode.status = 'failed';
        existingNode.errorMessage = err.message || "请求服务器网关异常";
        blogsRef.current[hostKey] = { ...existingNode };
      }
      addLog(`❌ 发生网络层异常: ${targetUrl} (原因: ${err.message || "未知原因"})`, "error");
    } finally {
      activeWorkersRef.current--;
      setActiveCount(activeWorkersRef.current);
      setQueueDisplayCount(queueRef.current.length);
      setBlogs(Object.values(blogsRef.current));

      // Go next loop
      triggerScheduler();
    }
  };

  // Coordinator triggering the queue next steps
  const triggerScheduler = () => {
    if (statusRef.current !== 'running') return;

    // Determine currently crawled / fetched sites count
    const crawledOrActiveCount = Object.values(blogsRef.current).filter(
      b => b.status === "success" || b.status === "failed" || b.status === "crawling"
    ).length;

    // Check if we hit user's custom Max Crawl count limit!
    if (crawledOrActiveCount >= settings.maxSites) {
      setCrawlStatus("completed");
      addLog(`🏁 抓取已达到最大自定义限制站数 (${settings.maxSites} 个)，引擎顺利休眠。`, "success");
      return;
    }

    if (queueRef.current.length === 0 && activeWorkersRef.current === 0) {
      setCrawlStatus("completed");
      addLog(`🏁 抓取已全部顺利结束！总共产出及记录站点: ${Object.keys(blogsRef.current).length} 个`, "success");
      return;
    }

    // Spawn up to concurrency limits
    while (activeWorkersRef.current < settings.concurrency && queueRef.current.length > 0) {
      // Re-evaluate limits before grabbing the next node
      const currentFetchedCount = Object.values(blogsRef.current).filter(
        b => b.status === "success" || b.status === "failed" || b.status === "crawling"
      ).length;

      if (currentFetchedCount >= settings.maxSites) {
        break;
      }

      const next = queueRef.current.shift();
      if (next) {
        runWorker(next);
      }
    }
    setQueueDisplayCount(queueRef.current.length);
  };

  // Launch crawl workflow
  const startCrawl = () => {
    // Parse seeds
    const lines = seedsInput
      .split(/[\n,;]+/)
      .map(url => url.trim())
      .filter(url => {
        if (!url) return false;
        try {
          let test = url;
          if (!/^https?:\/\//i.test(test)) test = "http://" + test;
          new URL(test);
          return true;
        } catch {
          return false;
        }
      });

    if (lines.length === 0) {
      addLog("❌ 请输入至少一个有效的博客种子 URL 网址！", "error");
      return;
    }

    addLog(`🚀 启动 N级递进探索！正在装载种子: ${lines.join(", ")}`, "info");
    
    // Clear dynamic states
    queueRef.current = [];
    visitedRef.current = new Set();
    blogsRef.current = {};
    activeWorkersRef.current = 0;

    // Load custom inputs as initial queue depth 0
    lines.forEach(url => {
      let testUrl = url;
      if (!/^https?:\/\//i.test(testUrl)) testUrl = "http://" + testUrl;

      queueRef.current.push({
        url: testUrl,
        depth: 0,
        referrerUrl: "",
        referrerText: "起始种子"
      });
    });

    setCrawlStatus("running");
    
    // Quick delay trigger next tick
    setTimeout(() => {
      triggerScheduler();
    }, 10);
  };

  // Control modifiers
  const pauseCrawl = () => {
    setCrawlStatus("paused");
    addLog("⏸️ 爬取程序已人工暂停。您可以恢复继续执行。", "warn");
  };

  const resumeCrawl = () => {
    setCrawlStatus("running");
    addLog("▶️ 爬虫已重新恢复执行！", "info");
    setTimeout(() => {
      triggerScheduler();
    }, 10);
  };

  const stopCrawl = () => {
    setCrawlStatus("stopped");
    queueRef.current = [];
    activeWorkersRef.current = 0;
    setActiveCount(0);
    setQueueDisplayCount(0);
    addLog("⏹️ 爬行已人工终止运行，已停止新队列加载。", "error");
  };

  const resetAllData = () => {
    setConfirmModal({
      title: "清空主看板确认",
      message: "此操作会彻底抹除当前面板中抓取到的所有博客节点、控制台星系、运行日志以及 AI 诊断报告，已固化的历史快照不会受影响。您确定要清空吗？",
      onConfirm: () => {
        setBlogs([]);
        queueRef.current = [];
        visitedRef.current = new Set();
        blogsRef.current = {};
        setCrawlStatus("idle");
        setLogs([
          {
            id: "init",
            time: new Date().toLocaleTimeString(),
            text: "已重置。等待重新爬取新的博客友链。",
            type: "info"
          }
        ]);
        setAiReport("");
        setQueueDisplayCount(0);
        setActiveCount(0);
        localStorage.removeItem("crawler_blogs_data");
        localStorage.removeItem("crawler_logs_data");
        localStorage.removeItem("crawler_ai_report");
        addLog("🧹 当前工作看板数据已全盘清理完毕。", "info");
      }
    });
  };

  // --- Historical Sessions System ---
  const saveToHistory = (nameInput: string) => {
    const trimmed = nameInput.trim();
    if (blogs.length === 0) {
      setCustomAlert({
        title: "无法保存快照",
        message: "当前面板中没有任何抓取到的博客数据！请先启动爬取，并提取到节点后再试。"
      });
      return;
    }
    const sessionName = trimmed || `未命名探索 - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    
    const newSession: HistoricalCrawl = {
      id: Math.random().toString(36).substring(7),
      name: sessionName,
      timestamp: new Date().toLocaleString(),
      seeds: seedsInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean),
      blogs: [...blogs],
      logs: [...logs],
      aiReport: aiReport,
      settings: { ...settings }
    };

    setHistorySessions(prev => [newSession, ...prev]);
    setSessionSaveName("");
    addLog(`💾 成功保存了当前爬取会话到历史快照: "${sessionName}"`, "success");
    setCustomAlert({
      title: "快照转存成功",
      message: `当前探索会话「${sessionName}」已安全持久化至您的浏览器本地存储中！随时可以在 “会话快照与汇总” 中重新装入该数据集。`
    });
  };

  const restoreHistory = (session: HistoricalCrawl) => {
    setConfirmModal({
      title: "读取历史快照",
      message: `您确定要瞬间装入历史数据包「${session.name}」吗？这会覆盖您当前看板中正在显示的数据，请确保当前重要数据已存盘。`,
      onConfirm: () => {
        setBlogs(session.blogs);
        setLogs(session.logs);
        setAiReport(session.aiReport || "");
        setSeedsInput(session.seeds.join("\n"));
        if (session.settings) {
          setSettings(session.settings);
        }
        setCrawlStatus("idle");
        setQueueDisplayCount(0);
        setActiveCount(0);
        setActiveTab("table");
        addLog(`📂 成功读取并装载历史会话: "${session.name}"`, "success");
        setShowHistoryPanel(false);
      }
    });
  };

  const deleteHistory = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      title: "物理销毁快照",
      message: `您确定要永久抹除归档「${name}」吗？过往关联拓扑及历史数据将不复存在。`,
      onConfirm: () => {
        setHistorySessions(prev => prev.filter(s => s.id !== id));
        addLog(`🗑️ 已从本地存储物理移除历史快照: "${name}"`, "warn");
      }
    });
  };

  // --- AI Report call ---
  const generateAiReport = async (customConfigOverride?: typeof aiApiConfig) => {
    const successBlogs = blogs.filter(b => b.status === "success");
    if (successBlogs.length === 0) {
      setAiError("请先开始爬取，并且至少获得几个抓取成功的博客后，再点击 AI 分析！");
      return;
    }

    setIsLoadingAi(true);
    setAiError("");
    setAiReport("");

    const payloadConfig = customConfigOverride || (isCustomAiSettingsOpen ? aiApiConfig : undefined);

    try {
      const data = await analyzeBlogs(
        successBlogs,
        payloadConfig,
        undefined
      );
      if (data.success && data.analysis) {
        setAiReport(data.analysis);
        localStorage.setItem("crawler_ai_report", data.analysis);
        addLog(`🤖 成功生成了博客圈群落智能分析诊断报告！`, "success");
      } else {
        setAiError(data.message || "生成失败，请确认您的 AI 接口地址和 API 密钥。");
      }
    } catch (e: any) {
      setAiError(e.message || "请求 AI 接口异常，请稍后重试。");
    } finally {
      setIsLoadingAi(false);
    }
  };

  // --- Compare active blogs relative to a selected historical snapshot ---
  const comparisonResult = useMemo(() => {
    if (!compareSessionId) {
      return { added: [], lost: [], prevTotal: 0, currTotal: 0 };
    }
    const histSession = historySessions.find(s => s.id === compareSessionId);
    if (!histSession) {
      return { added: [], lost: [], prevTotal: 0, currTotal: 0 };
    }
    
    const currentSuccess = blogs.filter(b => b.status === "success");
    const historySuccess = (histSession.blogs || []).filter(b => b.status === "success");
    
    const currentUrls = new Set(currentSuccess.map(b => normalizeUrl(b.url)));
    const historyUrls = new Set(historySuccess.map(b => normalizeUrl(b.url)));
    
    const added = currentSuccess.filter(b => !historyUrls.has(normalizeUrl(b.url)));
    const lost = historySuccess.filter(b => !currentUrls.has(normalizeUrl(b.url)));
    
    return {
      added,
      lost,
      prevTotal: historySuccess.length,
      currTotal: currentSuccess.length
    };
  }, [blogs, historySessions, compareSessionId]);

  // --- Export Markdown comparison report ---
  const handleExportComparisonReport = () => {
    const targetSession = historySessions.find(s => s.id === compareSessionId);
    if (!targetSession) return;
    
    const { added, lost, prevTotal, currTotal } = comparisonResult;
    
    let md = `# 独立博客星系宇宙 - 网络对比与分析报告\n\n`;
    md += `## 基础对比数据信息\n`;
    md += `- **对比基准快照**: ${targetSession.name} (${new Date(targetSession.timestamp).toLocaleString()})\n`;
    md += `- **现行活跃快照**: 当前实时抓取数据 (${new Date().toLocaleString()})\n`;
    md += `- **原历史成功站**: ${prevTotal} 个\n`;
    md += `- **现实时成功站**: ${currTotal} 个\n`;
    md += `- **发现新增博站**: ${added.length} 个\n`;
    md += `- **遗失/失效博客**: ${lost.length} 个\n\n`;
    
    md += `## ✨ 新增独立博客站点（共 ${added.length} 个）\n`;
    if (added.length === 0) {
      md += `暂无新增站点。\n`;
    } else {
      added.forEach((b, idx) => {
        md += `${idx + 1}. **${b.name || '未知'}**\n`;
        md += `   - 链接: ${b.url}\n`;
        md += `   - 标题: ${b.title || '（暂无Title）'}\n`;
        if (b.description) md += `   - 简介: ${b.description}\n`;
      });
    }
    md += `\n`;
    
    md += `## 🥀 遗失/失效独立博客站点（共 ${lost.length} 个）\n`;
    if (lost.length === 0) {
      md += `暂无失效站点。\n`;
    } else {
      lost.forEach((b, idx) => {
        md += `${idx + 1}. **${b.name || '未知'}**\n`;
        md += `   - 链接: ${b.url}\n`;
        md += `   - 标题: ${b.title || '（暂无Title）'}\n`;
        if (b.description) md += `   - 简介: ${b.description}\n`;
      });
    }
    
    md += `\n\n---\n*报告生成时间：${new Date().toLocaleString()} | 友情链接星系探针宇宙*`;
    
    triggerFileDownload(md, `blog_network_comparison_report_${Date.now()}.md`, "text/markdown");
    addLog(`📄 已成功导出并下载本地对比Markdown报告主体！`, "success");
  };

  // --- Data Statistics Computations with Domain Breakdown ---
  const stats = useMemo(() => {
    const total = blogs.length;
    const success = blogs.filter(b => b.status === 'success');
    const failed = blogs.filter(b => b.status === 'failed');
    const pending = blogs.filter(b => b.status === 'pending');
    
    // Find all uniques counts
    const uniqueDomains = new Set(blogs.map(b => getHostname(b.url)));
    
    // total RSS fields
    let feedsCount = 0;
    success.forEach(b => {
      if (b.feeds && b.feeds.length > 0) {
        feedsCount += b.feeds.length;
      }
    });

    // Success Rate
    const totalProcessed = success.length + failed.length;
    const successRate = totalProcessed > 0 ? ((success.length / totalProcessed) * 100).toFixed(1) : "0";

    // RSS Coverage percentage
    const successWithRss = success.filter(b => b.feeds && b.feeds.length > 0).length;
    const rssCoverage = success.length > 0 ? ((successWithRss / success.length) * 100).toFixed(1) : "0";

    // Top Level Domain Suffix breakdown for 汇总
    const tldMap: Record<string, number> = {};
    success.forEach(b => {
      try {
        const host = getHostname(b.url);
        const parts = host.split('.');
        if (parts.length >= 2) {
          const last = parts[parts.length - 1]?.toLowerCase();
          const secondLast = parts[parts.length - 2]?.toLowerCase();
          let suffix = last;
          if (["com", "edu", "gov", "org", "net", "co"].includes(secondLast) && last.length <= 3) {
            suffix = `${secondLast}.${last}`;
          }
          if (suffix && suffix.length < 12 && !/^\d+$/.test(suffix)) {
            tldMap[suffix] = (tldMap[suffix] || 0) + 1;
          }
        }
      } catch (err) {}
    });

    const allTlds = Object.entries(tldMap)
      .map(([suffix, count]) => ({ suffix: "." + suffix, count }))
      .sort((a, b) => b.count - a.count);

    const topTlds = allTlds.slice(0, 5);

    return {
      total,
      successCount: success.length,
      failedCount: failed.length,
      pendingCount: pending.length,
      uniqueDomainsCount: uniqueDomains.size,
      feedsCount,
      successRate,
      rssCoverage,
      topTlds,
      allTlds
    };
  }, [blogs]);

  // --- Search keyword highlight ---
  const filteredBlogs = useMemo(() => {
    return blogs.filter(b => {
      const term = searchQuery.toLowerCase().trim();
      
      const matchesKeyword = !term ||
        b.url.toLowerCase().includes(term) ||
        (b.name && b.name.toLowerCase().includes(term)) ||
        (b.title && b.title.toLowerCase().includes(term)) ||
        (b.description && b.description.toLowerCase().includes(term));
      
      const matchesStatus = filterStatus === "all" || b.status === filterStatus;
      
      const matchesRss = filterRss === "all" ||
        (filterRss === "has_rss" && b.feeds && b.feeds.length > 0) ||
        (filterRss === "no_rss" && (!b.feeds || b.feeds.length === 0));

      return matchesKeyword && matchesStatus && matchesRss;
    });
  }, [blogs, searchQuery, filterStatus, filterRss]);

  // --- Aggregation computations for main domain (platform) or TLD suffix ---
  const aggregatedData = useMemo(() => {
    if (aggregationType === 'none') return [];
    
    const groups: Record<string, { key: string; name: string; blogs: CrawledBlog[]; count: number; activeCount: number; feedsCount: number }> = {};
    
    // Aggregate over currently visible/filtered blogs so sorting/search applies automatically
    filteredBlogs.forEach(blog => {
      const key = aggregationType === 'platform' ? getPlatformOrDomain(blog.url) : getTLD(blog.url);
      const isSuccess = blog.status === 'success';
      const hasRss = blog.feeds && blog.feeds.length > 0;
      
      if (!groups[key]) {
        groups[key] = {
          key,
          name: key,
          blogs: [],
          count: 0,
          activeCount: 0,
          feedsCount: 0
        };
      }
      groups[key].blogs.push(blog);
      groups[key].count++;
      if (isSuccess) groups[key].activeCount++;
      if (hasRss) groups[key].feedsCount++;
    });
    
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [filteredBlogs, aggregationType]);

  // Export handlers
  const handleExportCSV = () => {
    if (blogs.length === 0) return;
    const csvContent = exportToCSV(blogs);
    triggerFileDownload(csvContent, `independent_blogs_export_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8;");
    addLog("📁 成功导出 CSV 数据报表！", "success");
  };

  const handleExportJSON = () => {
    if (blogs.length === 0) return;
    const jsonStr = JSON.stringify(blogs, null, 2);
    triggerFileDownload(jsonStr, `independent_blogs_export_${new Date().toISOString().slice(0, 10)}.json`, "application/json;charset=utf-8;");
    addLog("📁 成功导出 JSON 格式数据文件！", "success");
  };

  const handleExportOPML = () => {
    const successFeedsCount = blogs.filter(b => b.feeds && b.feeds.length > 0 && b.status === "success").length;
    if (successFeedsCount === 0) {
      setCustomAlert({
        title: "无法导出 OPML",
        message: "当前导出的数据中没有抓取到任何包含 Rss 订阅源的独立博客！抓取成功并且发现 RSS 的网站才可以导出 OPML 格式。"
      });
      return;
    }
    const opmlContent = exportToOPML(blogs);
    triggerFileDownload(opmlContent, `blogs_feeds_subscriptions_${new Date().toISOString().slice(0, 10)}.opml`, "text/xml;charset=utf-8;");
    addLog(`📁 成功导出 ${successFeedsCount} 个博客的 RSS 订阅源 OPML 列表！`, "success");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-200 pb-16">
      
      {/* HEADER NAVBAR WITH REFINED SLIM DESIGN */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl shadow-sm transition-transform hover:rotate-6">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-1.5">
                友情链接多级拓扑分析仪
                <span className="text-[9px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-bold font-mono">v2.0 PRO</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Slide drawer settings toggle button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/10 cursor-pointer transition-all"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>配置规则面板</span>
            </button>
            
            <button
              onClick={() => {
                setCustomAlert({
                  title: "多级拓扑仪说明",
                  message: "友情链接代表着独立博客间的信任契约。本探测仪能够通过种子站点网页，自动发现友情链接、友情链接的友情链接，向上向下持续拓扑发掘，并提供自动化 RSS 探析及一键导出订阅功能。支持配置无限层级，直到触及最大深度额度为止。"
                });
              }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="关于程序说明"
            >
              <HelpIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6 space-y-6 animate-fadeIn">

        {/* TOP COMPACT STATUS CONTROL BOARD */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-colors flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
          <div className="space-y-1.5 flex-1 w-full">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                探析引擎运行监控：
              </span>
              <div className="inline-flex">
                {crawlStatus === 'running' && (
                  <span className="text-[10px] bg-indigo-500/15 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-full font-bold animate-pulse flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-indigo-500 animate-ping" />
                    正在全力探索中 ({activeCount} 工作线程)
                  </span>
                )}
                {crawlStatus === 'paused' && (
                  <span className="text-[10px] bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    引擎暂停
                  </span>
                )}
                {crawlStatus === 'completed' && (
                  <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    探索圆满结束
                  </span>
                )}
                {crawlStatus === 'stopped' && (
                  <span className="text-[10px] bg-rose-500/15 border border-rose-500/20 text-rose-600 dark:text-rose-400 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    探索异常终止
                  </span>
                )}
                {crawlStatus === 'idle' && (
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-0.5 rounded-full font-bold">
                    保持就绪挂起
                  </span>
                )}
              </div>
            </div>
            
            {/* Quick Micro Progress */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                <span>任务执行上限: {blogs.filter(b => b.status === "success" || b.status === "failed").length} / {settings.maxSites} 站点</span>
                <span>深度模式: {settings.maxDepth === -1 ? "无尽层级" : `${settings.maxDepth}级递归`} &middot; 队列残留: {queueDisplayCount} 节点</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-850 h-2 rounded-full overflow-hidden border border-slate-200/40 dark:border-slate-800">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min(100, (blogs.filter(b => b.status === "success" || b.status === "failed").length / settings.maxSites) * 100)}%` 
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto shrink-0 border-t md:border-t-0 border-slate-100 dark:border-slate-850 pt-3 md:pt-0">
            {/* Control Actions buttons */}
            {crawlStatus === 'idle' || crawlStatus === 'completed' || crawlStatus === 'stopped' ? (
              <button
                onClick={startCrawl}
                className="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 hover:opacity-90 cursor-pointer shadow transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                启动爬行探索
              </button>
            ) : crawlStatus === 'running' ? (
              <button
                onClick={pauseCrawl}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow transition-all"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                暂停引擎
              </button>
            ) : (
              <button
                onClick={resumeCrawl}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                恢复爬行
              </button>
            )}

            {crawlStatus !== 'idle' && (
              <button
                onClick={stopCrawl}
                disabled={crawlStatus === 'completed' || crawlStatus === 'stopped'}
                className="px-3.5 py-2 border border-slate-200 dark:border-slate-800 hover:border-red-500/20 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-500/5 disabled:opacity-30 disabled:pointer-events-none font-bold text-xs rounded-xl flex items-center gap-1 transition-all"
              >
                停止
              </button>
            )}

            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block mx-1" />

            <button
              onClick={resetAllData}
              className="px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              整盘重置
            </button>
          </div>
        </div>

        {/* COLLAPSIBLE SETTINGS SIDEBAR DRAWER PANEL */}
        <AnimatePresence>
          {isSettingsOpen && (
            <>
              {/* Overlay Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSettingsOpen(false)}
                className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs cursor-pointer"
              />
              
              {/* Drawer Container */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[460px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden"
              >
                {/* Header block */}
                <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-600 dark:text-slate-350">
                      分析仪参数及规则配置
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer outline-none"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Main Scrollable form */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5 text-slate-700 dark:text-slate-200 text-xs animate-none">
                  
                  {/* TextArea Seeds */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">
                        📌 探测入口种子网址 (Seed Entry URLs)
                      </label>
                      <span className="text-[9.5px] text-slate-400">支持多行输入</span>
                    </div>
                    <textarea
                      value={seedsInput}
                      onChange={(e) => setSeedsInput(e.target.value)}
                      placeholder="每行一个有效 URL (例如: https://tualatrix.github.io)"
                      disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                      className="w-full h-24 px-3 py-2 text-xs font-mono border border-slate-205 dark:border-slate-850 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 text-slate-800 dark:text-slate-100 leading-relaxed placeholder-slate-400"
                    />

                    {/* Preconfigured Preset Seed button array */}
                    <div className="space-y-1 bg-slate-50 dark:bg-slate-950/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-850/80 mt-1">
                      <span className="text-[8.5px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                        ⚡ 一键载入预设主题种子包 (Quick Preset Seeds)
                      </span>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => {
                            if (crawlStatus === 'running' || crawlStatus === 'paused') return;
                            const presets = [
                              "https://tualatrix.github.io",
                              "https://yinwang.org",
                              "https://blog.didispace.com",
                              "https://coolshell.cn"
                            ].join("\n");
                            setSeedsInput(presets);
                            addLog("⚡ 已成功加载 【中文技术博客圈】 优质种子站点组合。", "success");
                          }}
                          disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                          className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200/40 dark:border-indigo-900/30 text-[9.5px] rounded-lg hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-500 cursor-pointer transition-colors disabled:opacity-40"
                        >
                          🌐 极客技术圈
                        </button>
                        <button
                          onClick={() => {
                            if (crawlStatus === 'running' || crawlStatus === 'paused') return;
                            const presets = [
                              "https://diygod.me",
                              "https://www.idealclover.cn",
                              "https://wzyboy.im",
                              "https://macplay.github.io"
                            ].join("\n");
                            setSeedsInput(presets);
                            addLog("⚡ 已成功加载 【人文及摄影漫游记】 优质个人空间种子组合。", "success");
                          }}
                          disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                          className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/45 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200/40 dark:border-emerald-900/30 text-[9.5px] rounded-lg hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 cursor-pointer transition-colors disabled:opacity-40"
                        >
                          🌸 生活记录
                        </button>
                        <button
                          onClick={() => {
                            if (crawlStatus === 'running' || crawlStatus === 'paused') return;
                            const presets = [
                              "https://pockethub.home.blog",
                              "https://laike.net",
                              "https://yueliang.org"
                            ].join("\n");
                            setSeedsInput(presets);
                            addLog("⚡ 已成功加载 【独立博客自办论坛 / 信息枢纽】 种子列表。", "success");
                          }}
                          disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                          className="px-2 py-1 bg-amber-50 dark:bg-amber-950/45 text-amber-600 dark:text-amber-400 font-bold border border-amber-200/40 dark:border-amber-900/30 text-[9.5px] rounded-lg hover:bg-amber-500 hover:text-white dark:hover:bg-amber-400 cursor-pointer transition-colors disabled:opacity-40"
                        >
                          🏛️ 社群与论坛
                        </button>
                      </div>
                    </div>

                    <span className="text-[10px] text-slate-400 block leading-tight">
                      若要改变分析起跑线，请直接在此处粘贴或修改。
                    </span>
                  </div>

                  {/* Range Slider for custom Depth N with Infinite option */}
                  <div className="space-y-2.5 p-4 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        递进爬取层级 (N级关系)
                      </label>
                      <span className="text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-mono">
                        {settings.maxDepth === -1 ? "∞ 无限级深度递进" : `最高第 ${settings.maxDepth} 层级`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="6"
                        value={settings.maxDepth === -1 ? 6 : settings.maxDepth}
                        onChange={(e) => setSettings({ ...settings, maxDepth: parseInt(e.target.value) })}
                        disabled={settings.maxDepth === -1 || crawlStatus === 'running' || crawlStatus === 'paused'}
                        className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-40"
                      />
                      <label className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-lg text-[10.5px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          checked={settings.maxDepth === -1}
                          disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              maxDepth: e.target.checked ? -1 : 3
                            });
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-500"
                        />
                        <span>无限级深度</span>
                      </label>
                    </div>
                    <span className="text-[9.5px] text-slate-400 block leading-tight">
                      {settings.maxDepth === -1 
                        ? "启用无限深度递进方式，只要有新固化的友链推荐主机即向后无限级扩散，直至耗尽额度。"
                        : settings.maxDepth === 1 
                        ? "仅抓取种子自身，不延伸。" 
                        : `由第 1 阶连续衍生、跨级扩展解析至最大第 ${settings.maxDepth} 阶友情推荐网络。`}
                    </span>
                  </div>

                  {/* Numerical site limit setting */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">
                      最大采集站点上限 (Max Sites)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="5"
                        max="500"
                        value={settings.maxSites}
                        onChange={(e) => setSettings({ ...settings, maxSites: Math.max(5, parseInt(e.target.value) || 5) })}
                        disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                        className="w-full p-2.5 pr-10 border border-slate-200 dark:border-slate-850 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none"
                      />
                      <span className="absolute right-3 top-3 text-[10px] text-slate-400 select-none font-bold">个站</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      限制探测得到的最大去重独立主机记录总数。
                    </span>
                  </div>

                  {/* Concurrency and timeout */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">
                        并发工作线程数
                      </label>
                      <select
                        value={settings.concurrency}
                        onChange={(e) => setSettings({ ...settings, concurrency: parseInt(e.target.value) })}
                        disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                        className="w-full p-2.5 border border-slate-200 dark:border-slate-850 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none"
                      >
                        <option value="1">1 (温和排查)</option>
                        <option value="2">2 (默认兼顾)</option>
                        <option value="3">3 (极速流排查)</option>
                        <option value="5">5 (高并发冲刺)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">
                        请求超时熔断限时
                      </label>
                      <select
                        value={settings.timeout}
                        onChange={(e) => setSettings({ ...settings, timeout: parseInt(e.target.value) })}
                        disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                        className="w-full p-2.5 border border-slate-200 dark:border-slate-850 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none"
                      >
                        <option value="5000">5 秒 (极速过滤)</option>
                        <option value="8500">8.5 秒 (业界推荐)</option>
                        <option value="12000">12 秒 (延迟容忍)</option>
                        <option value="20000">20 秒 (漫长等待)</option>
                      </select>
                    </div>
                  </div>

                  {/* Blacklist editor */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center text-[11px]">
                      <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        🚫 域名过滤排除名单 (Comma/Space Seperated)
                      </label>
                      <button
                        onClick={() => {
                          setSettings({ ...settings, excludeDomains: DEFAULT_EXCLUDE_DOMAINS });
                          addLog("🛡️ 域名排除名单已重新还原为出厂内置基准。", "info");
                        }}
                        className="text-[10px] text-slate-400 hover:text-indigo-500 cursor-pointer underline transition-colors"
                        title="还原屏蔽大型门户、社交、枢纽网站的默认标准"
                      >
                        重置默认屏蔽名单
                      </button>
                    </div>
                    <textarea
                      value={settings.excludeDomains}
                      onChange={(e) => setSettings({ ...settings, excludeDomains: e.target.value })}
                      placeholder="用逗号或空格隔开。例如: google.com, weibo.com, github.com"
                      rows={4}
                      className="w-full px-3 py-2 text-[10.5px] font-mono border border-slate-200 dark:border-slate-850 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 text-slate-800 dark:text-slate-100"
                    />
                    <span className="text-[9.5px] text-slate-400 block leading-tight">
                      排除大型公共枢纽、高暴露商业平台和社交平台，使得漫游拓扑图纯净化、只锁定独立博客好友生态。
                    </span>
                  </div>

                  {/* Keyword block-list editor */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center text-[11px]">
                      <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        🛡️ 网站标题/内容关键词屏蔽名单 (Comma/Space Seperated)
                      </label>
                      <button
                        onClick={() => {
                          setSettings({ ...settings, excludeKeywords: DEFAULT_EXCLUDE_KEYWORDS });
                          addLog("🛡️ 标题屏蔽词库已重新还原为内置出厂默认词库。", "info");
                        }}
                        className="text-[10px] text-slate-400 hover:text-indigo-500 cursor-pointer underline transition-colors"
                        title="还原屏蔽广告、垃圾和商业词汇的初厂基准"
                      >
                        重置默认屏蔽词
                      </button>
                    </div>
                    <textarea
                      value={settings.excludeKeywords}
                      onChange={(e) => setSettings({ ...settings, excludeKeywords: e.target.value })}
                      placeholder="用逗号或空格隔开。例如: 推广, 网赚, 兼职, 广告, 菠菜"
                      rows={3}
                      className="w-full px-3 py-2 text-[10.5px] font-mono border border-slate-200 dark:border-slate-850 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 text-slate-800 dark:text-slate-100"
                    />
                    <span className="text-[9.5px] text-slate-400 block leading-tight">
                      若探查出的独立博客网站标题（或Meta描述）中含有以上屏蔽字，将被一并排除、终止其深度演化生成，防止被广告或商业推广垃圾反噬。
                    </span>
                  </div>

                  {/* Friend candidate limit check toggle */}
                  <div className="pt-2">
                    <label className="flex items-start gap-2 font-semibold text-slate-650 dark:text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.onlyFriendCandidates}
                        onChange={(e) => setSettings({ ...settings, onlyFriendCandidates: e.target.checked })}
                        disabled={crawlStatus === 'running' || crawlStatus === 'paused'}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-500 mt-0.5 shrink-0"
                      />
                      <span>🔍 智能友情链接候选算法：只匹配锚文本在友链板、友情列表或 neighbor 容器内的候选（忽略文章段落外链）</span>
                    </label>
                  </div>

                </div>

                {/* Footer bar */}
                <div className="p-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 flex justify-end shrink-0">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    保存规则并关闭
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ACTIVE UPPER DASHBOARD PANELS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Snap Save snapshot block */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-colors flex flex-col justify-between animate-fadeIn">
            <div className="space-y-1.5 pb-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-500 dark:text-indigo-400 flex items-center gap-1.5 leading-none select-none">
                <History className="w-3.5 h-3.5 text-indigo-400" />
                会话快照与汇总备份
              </span>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed mt-1">
                您可以随时将当前的探索记录、抓取到的好友名单、完整运行控制台日志以及 AI 诊断整盘归档转存为固化快照封箱。
              </p>
            </div>

            {blogs.length > 0 ? (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={sessionSaveName}
                  onChange={(e) => setSessionSaveName(e.target.value)}
                  placeholder="快照名字 (如: 独立科技圈星图)"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none"
                />
                <button
                  onClick={() => saveToHistory(sessionSaveName)}
                  className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1 outline-none"
                >
                  <Save className="w-3.5 h-3.5 animate-pulse" />
                  保存并转存快照
                </button>
              </div>
            ) : (
              <div className="mt-2 p-3.5 bg-slate-100/50 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-850 rounded-xl text-center">
                <span className="text-[10.5px] text-slate-400 dark:text-slate-550 font-medium leading-relaxed block">
                  收集到博客节点后即可解锁一键持久化归档功能
                </span>
              </div>
            )}
          </div>
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white flex flex-col justify-between shadow-lg relative overflow-hidden transition-colors">
            
            {/* Ambient background decoration */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            
            {/* Header state */}
            <div className="flex justify-between items-center z-10 border-b border-slate-800 pb-3">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1">
                <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                探针工作实时汇总与统计
              </span>
              <div className="flex items-center gap-1.5">
                {crawlStatus === 'running' && (
                  <div className="flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                    <span className="text-[9px] text-indigo-400 font-bold font-mono">EXPLORING</span>
                  </div>
                )}
                {crawlStatus === 'paused' && (
                  <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="text-[9px] text-amber-500 font-bold font-mono">PAUSED</span>
                  </div>
                )}
                {crawlStatus === 'completed' && (
                  <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[9px] text-emerald-500 font-bold font-mono">COMPLETED</span>
                  </div>
                )}
                {crawlStatus === 'stopped' && (
                  <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span className="text-[9px] text-red-500 font-bold font-mono">STOPPED</span>
                  </div>
                )}
                {crawlStatus === 'idle' && (
                  <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span className="text-[9px] text-slate-400 font-bold font-mono">STANDBY</span>
                  </div>
                )}
              </div>
            </div>

            {/* Metrics grid - 汇总 */}
            <div className="grid grid-cols-2 gap-3.5 my-4 z-10">
              <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/85">
                <span className="text-[10px] text-slate-400 block font-medium">✨ 探测节点总数</span>
                <span className="text-xl font-bold font-mono text-slate-100 block mt-1">
                  {stats.total} <span className="text-[9px] text-slate-500 font-normal">个</span>
                </span>
                <div className="flex items-center gap-1 text-[9px] text-slate-400 mt-1">
                  成功: <span className="text-emerald-400 font-bold">{stats.successCount}</span> / 失败: {stats.failedCount}
                </div>
              </div>

              <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/85">
                <span className="text-[10px] text-slate-400 block font-medium">📡 发现 RSS 订阅通道</span>
                <span className="text-xl font-bold font-mono text-orange-400 block mt-1">
                  {stats.feedsCount} <span className="text-[9px] text-slate-500 font-normal">个</span>
                </span>
                <div className="text-[9px] text-slate-400 mt-1 flex justify-between">
                  <span>订阅率 Coverage:</span>
                  <span className="text-orange-400 font-bold font-mono">{stats.rssCoverage}%</span>
                </div>
              </div>

              <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/85">
                <span className="text-[10px] text-slate-400 block font-medium">⏳ 计划队列 (Queue)</span>
                <span className="text-xl font-bold font-mono text-indigo-400 block mt-1">
                  {queueDisplayCount} <span className="text-[9px] text-slate-500 font-normal">个</span>
                </span>
                <div className="text-[9px] text-slate-500 mt-1">
                  活跃探测线程: <span className="text-indigo-400 font-bold">{activeCount}</span>
                </div>
              </div>

              <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/85">
                <span className="text-[10px] text-slate-400 block font-medium">🤝 独立博客分析率</span>
                <span className="text-xl font-bold font-mono text-emerald-400 block mt-1">
                  {stats.successRate}%
                </span>
                <div className="text-[9px] text-slate-500 mt-1">
                  去重独立域名数: <span className="text-emerald-400 font-bold">{stats.uniqueDomainsCount}</span>
                </div>
              </div>
            </div>

            {/* Visual breakdown for Domain/TLD distribution (汇总) */}
            <div className="bg-slate-950/75 p-3 rounded-xl border border-slate-800/80 z-10 space-y-2">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                <span className="text-[9.5px] text-slate-400 uppercase font-mono">
                  🌐 域名后缀全记录 ({stats.allTlds.length} 种)
                </span>
                {stats.allTlds.length > 5 && (
                  <span className="text-[8px] bg-slate-900 border border-slate-800 text-indigo-400 font-mono font-bold px-1 rounded animate-pulse">
                    纵向滚动阅览 ↓
                  </span>
                )}
              </div>
              {stats.allTlds.length === 0 ? (
                <span className="text-[10px] text-slate-500 italic block py-1">等待抓取数据生成分布图...</span>
              ) : (
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                  {stats.allTlds.map((tld, idx) => {
                    const maxCount = Math.max(...stats.allTlds.map(t => t.count), 1);
                    const percent = (tld.count / maxCount) * 100;
                    return (
                      <div key={idx} className="flex items-center gap-2 text-[10px]">
                        <span className="w-12 font-mono font-bold text-indigo-300 truncate" title={tld.suffix}>{tld.suffix}</span>
                        <div className="flex-1 bg-slate-900 border border-slate-800 h-2 rounded overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-full rounded transition-all duration-500" 
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-mono text-slate-400">{tld.count}站</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* BOTTOM ACTIVE TAB VIEWS CONTROL */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden min-h-[400px] transition-colors">
          
          {/* Tab buttons header bar */}
          <div className="border-b border-slate-200 dark:border-slate-850 px-5 bg-slate-50 dark:bg-slate-950/40 flex flex-wrap justify-between items-center gap-4 transition-colors">
            <div className="flex gap-1 overflow-x-auto py-3 shrink-0">
              <button
                onClick={() => setActiveTab("table")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                  activeTab === "table"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                    : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/60"
                }`}
              >
                <Database className="w-4 h-4" />
                爬取数据明细 ({filteredBlogs.length})
              </button>
              
              <button
                onClick={() => setActiveTab("galaxy")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                  activeTab === "galaxy"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                    : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/60"
                }`}
              >
                <Network className="w-4 h-4" />
                星系宇宙网络 (Galaxy Network)
              </button>

              <button
                onClick={() => setActiveTab("ai")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                  activeTab === "ai"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                    : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/60"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Gemini 智识分析报告
              </button>

              <button
                onClick={() => setActiveTab("logs")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                  activeTab === "logs"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                    : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/60"
                }`}
              >
                <Terminal className="w-4 h-4" />
                中控台控制终端 ({logs.length})
              </button>

              <button
                onClick={() => setActiveTab("history")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                  activeTab === "history"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                    : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/60"
                }`}
              >
                <History className="w-4 h-4" />
                历史备份快照 ({historySessions.length})
              </button>
            </div>

            {/* Quick Export toolbar when blogs present */}
            {blogs.length > 0 && activeTab === "table" && (
              <div className="flex flex-wrap gap-2 text-xs py-2 shrink-0">
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="导出 CSV 文件报表"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  导出 CSV 报表
                </button>
                <button
                  onClick={handleExportOPML}
                  className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-1.5 cursor-pointer shadow-md shadow-orange-500/10 font-medium transition-all"
                  title="导出 RSS Feed 聚合 OPML"
                >
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  一键导出 RSS OPML (订阅)
                </button>
                <button
                  onClick={() => {
                    if (!compareSessionId && historySessions.length > 0) {
                      setCompareSessionId(historySessions[0].id);
                    }
                    setShowCompareDrawer(true);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="与历史快照数据进行对比分析（查看新增与失效博客）"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                  导出分析对比报告
                </button>
                <button
                  onClick={handleExportJSON}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 transition-colors"
                  title="导出 JSON 原始树结构"
                >
                  JSON
                </button>
              </div>
            )}
          </div>

          <div className="p-6">
            
            {/* TAB 1: DATA DETAILED TABLE VIEW */}
            {activeTab === "table" && (
              <div className="space-y-4">
                {/* Search & Filter tools row */}
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4.5 h-4.5 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="探索或过滤关键词 (网站名字, 网页原生标题, 网页描述, URL)..."
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 focus:outline-none text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/15 transition-colors"
                    />
                  </div>

                  <div className="flex gap-2.5 flex-wrap items-center">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 select-none">
                      <Filter className="w-3.5 h-3.5" />
                      <span>过滤段</span>
                    </div>
                    
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer transition-colors"
                    >
                      <option value="all">全状态列表 ({blogs.length})</option>
                      <option value="success">抓取成功站 ({blogs.filter(b => b.status === "success").length})</option>
                      <option value="pending">计划等待中 ({blogs.filter(b => b.status === "pending").length})</option>
                      <option value="failed">阻碍失败站 ({blogs.filter(b => b.status === "failed").length})</option>
                    </select>

                    <select
                      value={filterRss}
                      onChange={(e) => setFilterRss(e.target.value)}
                      className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer transition-colors"
                    >
                      <option value="all">全 RSS 订阅状况</option>
                      <option value="has_rss">有 RSS 源 (RSS✓) ({blogs.filter(b => b.feeds && b.feeds.length > 0).length})</option>
                      <option value="no_rss">目前无 RSS 源</option>
                    </select>

                    {/* Highly active/interactive Domain aggregation switch */}
                    <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl shrink-0 select-none border border-slate-200 dark:border-slate-800 transition-colors">
                      <button
                        type="button"
                        onClick={() => setAggregationType("none")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          aggregationType === "none"
                            ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm"
                            : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        明细名录
                      </button>
                      <button
                        type="button"
                        onClick={() => setAggregationType("platform")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          aggregationType === "platform"
                            ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm"
                            : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        聚合主域名
                      </button>
                      <button
                        type="button"
                        onClick={() => setAggregationType("tld")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          aggregationType === "tld"
                            ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm"
                            : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        归类域名后缀
                      </button>
                    </div>
                  </div>
                </div>

                {/* Conditional Tables: Standard Details List vs. Grouped Aggregation list */}
                {aggregationType === "none" ? (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 transition-colors">
                  <div className="overflow-x-auto max-h-[640px] overflow-y-auto relative scrollbar-thin">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10 shadow-xs">
                        <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold select-none">
                          <th className="p-3 w-12 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10">序列</th>
                          <th className="p-3 sticky top-0 bg-slate-50 dark:bg-slate-950 z-10">主客站点名称 (推荐文案 / 域名)</th>
                          <th className="p-3 sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 max-w-[240px]">网页原生标签 Title / 描述</th>
                          <th className="p-3 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-24">递归级</th>
                          <th className="p-3 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-28">当前状态</th>
                          <th className="p-3 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-28 text-slate-500 dark:text-slate-400">反向推荐源</th>
                          <th className="p-3 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-28 text-indigo-500 dark:text-indigo-400">曝光频次</th>
                          <th className="p-3 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-24">订阅 RSS</th>
                          <th className="p-3 text-right sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-24">探索</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBlogs.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-12 text-center text-slate-400 bg-slate-50/50 dark:bg-slate-950/20">
                              <Database className="w-8 h-8 mx-auto mb-2 opacity-35 text-indigo-500" />
                              <p className="text-xs font-semibold">没有符合过滤条件的数据项</p>
                              <p className="text-[11px] text-slate-500 mt-1">请载入种子后，点击“开始爬取”解锁博客圈网络。</p>
                            </td>
                          </tr>
                        ) : (
                          filteredBlogs.map((blog, idx) => {
                            const isSuccess = blog.status === "success";
                            const isPending = blog.status === "pending";
                            const isFailed = blog.status === "failed";
                            const hasRss = blog.feeds && blog.feeds.length > 0;

                            return (
                              <tr 
                                key={blog.id} 
                                className="border-b last:border-0 border-slate-100 dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors"
                              >
                                <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                                <td className="p-3 max-w-[200px]">
                                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                    {blog.name || getHostname(blog.url)}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono truncate" title={blog.url}>
                                    {blog.url}
                                  </div>
                                  
                                  {/* Summarized multi-entrances */}
                                  {blog.crawledPages && blog.crawledPages.length > 1 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-dashed border-slate-100 dark:border-slate-800">
                                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold flex items-center gap-0.5 select-none hover:text-indigo-500">
                                        🔗 多入口 ({blog.crawledPages.length}页):
                                      </span>
                                      {blog.crawledPages.map((page, pIdx) => {
                                        const isPageSuccess = page.status === "success";
                                        const isPageFailed = page.status === "failed";
                                        let displayPath = "";
                                        try {
                                          const parsed = new URL(page.url);
                                          displayPath = parsed.pathname === "/" ? "[主]" : parsed.pathname;
                                          if (displayPath.length > 15) {
                                            displayPath = displayPath.substring(0, 12) + "...";
                                          }
                                        } catch (e) {
                                          displayPath = page.url;
                                        }
                                        return (
                                          <a
                                            key={pIdx}
                                            href={page.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={`${page.title || page.url} (${page.status === 'success' ? '爬取成功' : page.status === 'failed' ? '爬取阻碍' : '计划队列中'})`}
                                            className={`inline-flex items-center px-1 py-0.5 rounded text-[8.5px] font-mono leading-none border transition-colors ${
                                              isPageSuccess
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10 hover:bg-emerald-500/20"
                                                : isPageFailed
                                                ? "bg-rose-500/10 text-rose-500 border-rose-500/15 hover:bg-rose-500/20"
                                                : "bg-slate-500/5 text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-500/10"
                                            }`}
                                          >
                                            {displayPath}
                                          </a>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 max-w-[240px]">
                                  <div className="truncate text-slate-600 dark:text-slate-300 font-medium" title={blog.title}>
                                    {blog.title || <span className="text-slate-400 italic">（分析队列中暂无 Title）</span>}
                                  </div>
                                  {blog.description && (
                                    <div className="text-[10px] text-slate-400 truncate mt-0.5" title={blog.description}>
                                      {blog.description}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="font-mono bg-indigo-50 dark:bg-indigo-950/25 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-bold text-[10.5px]">
                                    阶层 D{blog.depth}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  {isSuccess ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                                      抓取完成
                                    </span>
                                  ) : isPending ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 animate-pulse">
                                      计划排队
                                    </span>
                                  ) : blog.status === "crawling" ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 animate-pulse">
                                      正在请求
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-bold" title={blog.errorMessage}>
                                      阻碍/异常
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-mono text-slate-500">
                                  {blog.referrers ? blog.referrers.length : 0} 处链接
                                </td>
                                <td className="p-3 text-center font-mono">
                                  <span className="text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded text-[11px]">
                                    被提 {blog.occurrences || 1} 次
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  {hasRss ? (
                                    <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 font-bold text-[10px] tracking-wider" title={blog.feeds?.join("\n")}>
                                      RSS✓
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    onClick={() => setSelectedBlog(blog)}
                                    className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-500 font-bold text-[11px] transition-colors"
                                  >
                                    探查详情
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* GORGEOUS AGGREGATED VIEW TABLE */
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 transition-colors">
                  <div className="overflow-x-auto max-h-[640px] overflow-y-auto relative scrollbar-thin">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10 shadow-xs">
                        <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold select-none">
                          <th className="p-3 w-12 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 font-bold">排行</th>
                          <th className="p-3 sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 font-bold">
                            {aggregationType === "platform" ? "宿主平台 / 主域名名录" : "顶级域名 / 后缀归化"}
                          </th>
                          <th className="p-3 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-32 font-bold">节点总数</th>
                          <th className="p-3 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-36 font-bold">抓取成功量</th>
                          <th className="p-3 sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-52 font-bold">活跃频次/占比占比条</th>
                          <th className="p-3 text-center sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-28 font-bold">内含 RSS 源</th>
                          <th className="p-3 text-right sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 w-32 font-bold font-sans">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregatedData.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-12 text-center text-slate-400 bg-slate-50/50 dark:bg-slate-950/20">
                              <Database className="w-8 h-8 mx-auto mb-2 opacity-35 text-indigo-500" />
                              <p className="text-xs font-semibold">没有符合过滤条件的分类聚合</p>
                            </td>
                          </tr>
                        ) : (
                          aggregatedData.map((group, idx) => {
                            const pct = Math.round((group.count / (filteredBlogs.length || 1)) * 105) / 1.05;
                            const successRate = Math.round((group.activeCount / (group.count || 1)) * 100);
                            const displaysPct = Math.min(100, Math.round((group.count / (filteredBlogs.length || 1)) * 100));
                            
                            return (
                              <tr 
                                key={group.key}
                                className="border-b last:border-0 border-slate-100 dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors"
                              >
                                <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                                      {group.name}
                                    </span>
                                    {aggregationType === "platform" && group.name.includes(".") && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                                        托管平台
                                      </span>
                                    )}
                                    {aggregationType === "tld" && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 dark:bg-amber-955/30 text-amber-600 dark:text-amber-400 font-mono font-bold">
                                        后缀拓扑
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 text-center font-mono text-slate-700 dark:text-slate-300 font-bold">
                                  {group.count} 个博站
                                </td>
                                <td className="p-3 text-center font-mono">
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    {group.activeCount}
                                  </span>
                                  <span className="text-slate-400 text-[10px] ml-1">({successRate}%)</span>
                                </td>
                                <td className="p-3">
                                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex animate-pulse" title={`全站占比: ${displaysPct}%`}>
                                    <div 
                                      className="bg-indigo-500 h-full rounded-full transition-all"
                                      style={{ width: `${displaysPct}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                                    <span>全站占比 {displaysPct}%</span>
                                    <span>成功率 {successRate}%</span>
                                  </div>
                                </td>
                                <td className="p-3 text-center font-mono">
                                  <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 font-bold text-[10px]">
                                    {group.feedsCount} 源
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    onClick={() => {
                                      setSearchQuery(group.name);
                                      setAggregationType("none");
                                      addLog(`🔍 自适应探索筛选：已定位到 ${group.name} 的对应子集`, "info");
                                    }}
                                    className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-850 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-500 font-bold text-[10.5px] transition-colors cursor-pointer border border-transparent"
                                  >
                                    透视下属域名 →
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </div>
            )}

            {/* TAB 2: ASTRO GALAXY VISUALIZER FOR DYNAMIC DEPTH N */}
            {activeTab === "galaxy" && (
              <div className="space-y-4">
                <BlogUniverse
                  blogs={blogs}
                  seeds={seedsInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)}
                  onSelectBlog={(b) => setSelectedBlog(b)}
                />
              </div>
            )}

            {/* TAB 3: GEMINI AI BLOG COMMUNITY COGNITIVE REPORT */}
            {activeTab === "ai" && (
              <div className="space-y-5">
                <div className="bg-gradient-to-r from-indigo-505/10 via-purple-505/5 to-pink-505/10 rounded-2xl p-6 border border-indigo-500/20 flex flex-wrap justify-between items-center gap-4 transition-colors">
                  <div className="max-w-xl">
                    <h3 className="text-sm font-bold text-slate-950 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-500" />
                      智能独立博客圈群落分析诊断工具
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      基于当前爬虫成功回收到的独立博客推荐网络、网页 TDK 元数据，AI 会智能解构并分析其内容方向、技术交融轨迹及主笔心路圈子。
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3.5 flex-wrap">
                    <button
                      onClick={() => setIsCustomAiSettingsOpen(!isCustomAiSettingsOpen)}
                      className={`px-4 py-2.5 rounded-xl border text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer ${
                        isCustomAiSettingsOpen 
                          ? "bg-indigo-500 border-indigo-500 text-white shadow-md shadow-indigo-500/10"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <Settings className="w-4 h-4" />
                      {isCustomAiSettingsOpen ? "收起自定义接口" : "自定义 AI 接口"}
                    </button>

                    <button
                      onClick={() => generateAiReport()}
                      disabled={isLoadingAi || blogs.filter(b => b.status === "success").length === 0}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white font-bold text-xs rounded-xl flex items-center gap-2.5 shadow-md shadow-slate-950/15 cursor-pointer disabled:cursor-not-allowed transition-all"
                    >
                      {isLoadingAi ? (
                        <>
                          <Compass className="w-4 h-4 animate-spin text-indigo-500" />
                          AI 智能诊断中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                          一键生成人工智能报告
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* GORGEOUS BENTO CUSTOM AI INTERFACE CONFIGURATION FORM */}
                {isCustomAiSettingsOpen && (
                  <div className="p-6 bg-slate-50/50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800/80 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-5 transition-colors">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Settings className="w-3.5 h-3.5 text-indigo-500" />
                        AI 接口对接参数设置
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 block mb-1">接口供应商类型</label>
                          <select
                            value={aiApiConfig.apiType}
                            onChange={(e) => setAiApiConfig({ ...aiApiConfig, apiType: e.target.value as any })}
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all cursor-pointer"
                          >
                            <option value="gemini">Google Gemini 接口</option>
                            <option value="openai">OpenAI / 兼容格式接口</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 block mb-1">AI 预置模型名称</label>
                          <input
                            type="text"
                            value={aiApiConfig.modelName}
                            onChange={(e) => setAiApiConfig({ ...aiApiConfig, modelName: e.target.value })}
                            placeholder={aiApiConfig.apiType === 'gemini' ? 'gemini-3.5-flash' : 'gpt-4o-mini'}
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 block mb-1">接口 Base API URL 地址</label>
                          <input
                            type="text"
                            value={aiApiConfig.baseUrl}
                            disabled={aiApiConfig.apiType === 'gemini'}
                            onChange={(e) => setAiApiConfig({ ...aiApiConfig, baseUrl: e.target.value })}
                            placeholder="https://api.openai.com/v1"
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all font-mono disabled:opacity-50"
                          />
                          {aiApiConfig.apiType === 'gemini' && (
                            <span className="text-[10px] text-slate-400 mt-0.5 block">Gemini 默认使用 Google AI SDK 直接对接，无需配置 API 端点。</span>
                          )}
                        </div>

                        <div>
                          <label className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 block mb-1">自定义 API 授权密钥 (API Key)</label>
                          <input
                            type="password"
                            value={aiApiConfig.apiKey}
                            onChange={(e) => setAiApiConfig({ ...aiApiConfig, apiKey: e.target.value })}
                            placeholder="填入您的授权 Token 或密钥 (服务器端代理请求，保障安全)"
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-150 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-pink-500 animate-pulse" />
                        AI 分析时内置自定义提示词模板 (Prompt Setup)
                      </h4>
                      <div>
                        <label className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 block mb-1">定制化博群剖析指示词</label>
                        <textarea
                          rows={6}
                          value={aiApiConfig.customPromptPreset}
                          onChange={(e) => setAiApiConfig({ ...aiApiConfig, customPromptPreset: e.target.value })}
                          placeholder="例如：请作为一名资深的博客老兵研究者，专注于分析这份名单中的博客是否含有开源精神、技术品位。重点标记其中有关于技术思考与原创开发的文章分类，并对国内个人博客生态给出建设性评论..."
                          className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none transition-all leading-normal resize-none"
                        />
                      </div>
                      <div className="text-[10px] text-slate-400/80 leading-normal">
                        💡 <strong>小提示：</strong> 您的 AI 接口配置已自动持久化存储于本地浏览器的 <code>localStorage</code> 中。在点击右上角一键生成时，将实时透传发送此套定制化网卡设定。
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Error display */}
                {aiError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}

                {/* AI Output markdown board */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950/65 overflow-hidden transition-colors">
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center transition-colors">
                    <span className="text-[11px] font-mono uppercase text-slate-400 font-bold block">
                      GEMINI DEEP DIAGNOSING GRAPH
                    </span>
                    {aiReport && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(aiReport);
                          alert("AI 诊断报告已全文本成功拷贝！");
                        }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold"
                      >
                        复制全文报告
                      </button>
                    )}
                  </div>
                  <div className="p-6 md:p-8 text-sm leading-relaxed text-slate-700 dark:text-slate-200 min-h-[250px] relative">
                    {aiReport ? (
                      <div className="markdown-body prose dark:prose-invert max-w-none space-y-4">
                        <Markdown>{aiReport}</Markdown>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col justify-center items-center text-slate-400 pointer-events-none p-10 select-text">
                        <Sparkles className="w-10 h-10 mb-3 stroke-[1.2] text-slate-400 dark:text-slate-600 animate-pulse" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">构建独立个人博客圈智识模型</p>
                        <p className="text-[11px] text-slate-500 text-center max-w-[280px] mt-1 line-clamp-2">
                          在左侧解析出足够成功的博客数据后，点击上方一键生成，AI 会解剖网站文化、提取博主友情网络并产出内容质量报告。
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: WORK LOG REAL-TIME TERMINAL MONOSPACE READER */}
            {activeTab === "logs" && (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-400 flex items-center gap-1.5 select-none">
                    <Terminal className="w-4 h-4 text-indigo-500" />
                    安全反垃圾过滤: 拦截已配置 {settings.excludeDomains.split(/[,，\s]+/).filter(Boolean).length} 个域外名录 & {settings.excludeKeywords.split(/[,，\s]+/).filter(Boolean).length} 组敏感词库
                  </span>
                  <button
                    onClick={() => {
                      setLogs([]);
                      addLog("终端输出控制台已执行人工清屏。", "info");
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 transition-colors font-bold"
                  >
                    清空输出日志
                  </button>
                </div>

                <div className="h-[420px] rounded-2xl bg-slate-950 border border-slate-900 p-5 font-mono text-[11px] overflow-y-auto space-y-1.5 relative shadow-inner">
                  {logs.map((log) => {
                    const isSuccess = log.type === "success";
                    const isWarn = log.type === "warn";
                    const isError = log.type === "error";

                    return (
                      <div 
                        key={log.id} 
                        className={`flex gap-3 leading-normal border-b border-slate-950/20 pb-0.5 last:border-0 ${
                          isSuccess
                            ? "text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded"
                            : isWarn
                            ? "text-amber-400 bg-amber-500/5 px-2 py-0.5 rounded"
                            : isError
                            ? "text-rose-400 bg-rose-500/5 px-2 py-0.5 rounded"
                            : "text-slate-300"
                        }`}
                      >
                        <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                        <span className="break-all flex-1">{log.text}</span>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}

            {/* TAB 5: ARCHIVED HISTORY SESSIONS Snapshots View */}
            {activeTab === "history" && (
              <div className="space-y-5">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <History className="w-4 h-4 text-indigo-500" />
                      已存盘历史探索会话快照 (Archived Snapshots)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      快照将所有已发现站点列表、RSS 提取、层级关系及运行日志打包封箱，您可以随时一键加载复原。
                    </p>
                  </div>
                  <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-slate-500 dark:text-slate-450 font-bold rounded-lg font-mono">
                    总快照数量: {historySessions.length}
                  </span>
                </div>

                {historySessions.length === 0 ? (
                  <div className="py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-2">
                    <History className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">暂无会话快照记录</p>
                    <p className="text-[10px] text-slate-400 max-w-sm mx-auto">
                      当您输入种子网址进行深度衍生爬行后，可在上方的「会话快照与汇总备份」中输入快照名称，将其永久固化转存到此处。
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {historySessions.map((session) => (
                      <div
                        key={session.id}
                        className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 shadow-xs hover:shadow-md hover:border-indigo-500/20 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
                              {session.name}
                            </h4>
                            <button
                              onClick={(e) => deleteHistory(session.id, session.name, e)}
                              className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-500 transition-colors shrink-0 cursor-pointer"
                              title="删除该条历史快照记录"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          <div className="mt-2.5 space-y-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 select-none">快照创建:</span>
                              <span className="font-mono text-[10px]">{session.timestamp}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 select-none">种子起点:</span>
                              <span className="truncate max-w-[170px] font-mono text-[9.5px]" title={session.seeds.join(", ")}>
                                {session.seeds.length} 个 ({session.seeds[0]})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 select-none">采集状态:</span>
                              <div className="flex gap-1">
                                <span className="bg-emerald-500/10 text-emerald-500 text-[9px] px-1.5 py-0.5 rounded font-bold font-mono">
                                  {session.blogs.length} 站点已抓
                                </span>
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-[9px] px-1.5 py-0.5 rounded font-bold font-mono">
                                  D{session.settings?.maxDepth === -1 ? "∞" : session.settings?.maxDepth || "?"} 深度限制
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-850">
                          <button
                            onClick={() => restoreHistory(session)}
                            className="w-full py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 dark:hover:bg-indigo-600 hover:text-white dark:hover:text-white text-slate-700 dark:text-slate-350 text-xs font-bold rounded-lg transition-all cursor-pointer text-center outline-none"
                          >
                            📂 读取并恢复此快照 (装载数据)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </main>

      {/* FOOTER BAR */}
      <footer className="border-t border-slate-200 dark:border-slate-850 mt-12 py-8 bg-white dark:bg-slate-900 text-center text-xs text-slate-400 transition-colors">
        <p className="font-bold text-slate-600 dark:text-slate-400">独立友情宇宙 · 递进链接星轨探测程序</p>
        <p className="mt-1.5 text-[11px] text-slate-400 font-mono">
          Powered by Express + React with Cheerio RSS pipeline, analyzed by Gemini AI model.
        </p>
      </footer>

      {/* ACTIVE DETAIL DRAWER MODAL & COGNITIVE CONTRAST DRAWER */}
      <AnimatePresence>
        {selectedBlog && (
          <BlogDetailModal
            blog={selectedBlog}
            onClose={() => setSelectedBlog(null)}
          />
        )}

        {showCompareDrawer && (
          <div className="fixed inset-0 z-50 overflow-hidden font-sans">
            {/* Backdrop cover */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCompareDrawer(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs cursor-pointer"
            />
            
            {/* Drawer body container sliding in from the right */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="absolute top-0 right-0 h-full w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col focus:outline-none"
            >
              {/* Header section */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center shrink-0">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-955 dark:text-white flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-indigo-500 animate-pulse" />
                    现行活跃节点 vs 历史存档对比诊断报告
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    对比分析新增、失效的博客关系节点，提供独立博圈生态跃迁走势。
                  </p>
                </div>
                <button
                  onClick={() => setShowCompareDrawer(false)}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer inner content scroll */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
                {/* Snapshot Selection and Selector dropdown */}
                <div className="bg-slate-100/60 dark:bg-slate-955/20 p-4 rounded-xl border border-slate-200/50 dark:border-slate-850/60 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-700 dark:text-slate-300">请选择用于比对的历史快照：</span>
                    {historySessions.length === 0 && (
                      <span className="text-[10px] text-rose-500 font-bold">暂无历史快照备份。</span>
                    )}
                  </div>
                  {historySessions.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        value={compareSessionId}
                        onChange={(e) => setCompareSessionId(e.target.value)}
                        className="flex-1 p-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100"
                      >
                        <option value="" disabled>--- 点击选择一个历史备份集 ---</option>
                        {historySessions.map(session => (
                          <option key={session.id} value={session.id}>
                            {session.name} ({new Date(session.timestamp).toLocaleString("zh-CN")}) - 【{session.blogs.length}站】
                          </option>
                        ))}
                      </select>
                      {compareSessionId && (
                        <button
                          onClick={handleExportComparisonReport}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10 shrink-0 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          导出对比文本 (.MD)
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 leading-relaxed py-1.5 border border-dashed border-red-500/20 p-3 rounded-lg bg-red-500/5 text-center">
                      🥀 没有找到任何历史备份记录。<br/>
                      请切换至<b>『历史备份快照 ({historySessions.length})』</b>栏，输入当前配置名并备份一个快照存档后进行精准对比。
                    </div>
                  )}
                </div>

                {compareSessionId ? (
                  <div className="space-y-5 animate-fadeIn">
                    {/* Visual Comparison metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-850/60 rounded-xl p-3 text-center">
                        <span className="text-[10px] text-slate-400 font-medium block">历史成功站</span>
                        <span className="text-base font-bold font-mono text-slate-800 dark:text-slate-200 mt-1 block">
                          {comparisonResult.prevTotal}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-850/60 rounded-xl p-3 text-center">
                        <span className="text-[10px] text-slate-400 font-medium block">当前成功站</span>
                        <span className="text-base font-bold font-mono text-slate-800 dark:text-slate-200 mt-1 block">
                          {comparisonResult.currTotal}
                        </span>
                      </div>
                      <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 rounded-xl p-3 text-center">
                        <span className="text-[10px] text-emerald-500 font-medium block">新增活跃站</span>
                        <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
                          +{comparisonResult.added.length}
                        </span>
                      </div>
                      <div className="bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/15 rounded-xl p-3 text-center">
                        <span className="text-[10px] text-rose-500 font-medium block">断联失效站</span>
                        <span className="text-base font-bold font-mono text-rose-600 dark:text-rose-450 mt-1 block">
                          -{comparisonResult.lost.length}
                        </span>
                      </div>
                    </div>

                    {/* Detailed list split */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Added Blogs */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          新增活跃节点 ({comparisonResult.added.length})
                        </h4>
                        <div className="max-h-[300px] overflow-y-auto border border-emerald-500/10 rounded-xl bg-emerald-500/[0.01] overflow-x-hidden p-2 space-y-2 scrollbar-thin">
                          {comparisonResult.added.length === 0 ? (
                            <div className="py-8 text-center text-slate-400 text-[11px]">暂无新增</div>
                          ) : (
                            comparisonResult.added.map(b => (
                              <div key={b.id} className="p-2 border border-slate-100 dark:border-slate-850 bg-white dark:bg-slate-950/70 rounded-lg text-[10.5px] leading-tight space-y-1">
                                <div className="font-bold text-slate-800 dark:text-slate-100 truncate" title={b.name}>
                                  {b.name || "（未注册）"}
                                </div>
                                <div className="text-[9.5px] text-slate-400 truncate">
                                  {b.title || b.url}
                                </div>
                                <a 
                                  href={b.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-[9px] text-indigo-500 hover:underline flex items-center gap-0.5"
                                >
                                  浏览地址 <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Lost/Failed Blogs */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          断联失效节点 ({comparisonResult.lost.length})
                        </h4>
                        <div className="max-h-[300px] overflow-y-auto border border-rose-500/10 rounded-xl bg-rose-500/[0.01] overflow-x-hidden p-2 space-y-2 scrollbar-thin">
                          {comparisonResult.lost.length === 0 ? (
                            <div className="py-8 text-center text-slate-400 text-[11px]">暂无失效</div>
                          ) : (
                            comparisonResult.lost.map(b => (
                              <div key={b.id} className="p-2 border border-slate-100 dark:border-slate-850 bg-white dark:bg-slate-950/70 rounded-lg text-[10.5px] leading-tight space-y-1">
                                <div className="font-bold text-slate-700 dark:text-slate-300 truncate" title={b.name}>
                                  {b.name || "（未注册）"}
                                </div>
                                <div className="text-[9.5px] text-slate-400 truncate">
                                  {b.title || b.url}
                                </div>
                                <a 
                                  href={b.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-[9px] text-rose-500 hover:underline flex items-center gap-0.5"
                                >
                                  查看曾用地址 <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400 select-none">
                    <BarChart2 className="w-12 h-12 mx-auto stroke-[1.2] opacity-35 text-indigo-500 animate-pulse mb-3" />
                    <p className="text-xs font-bold">请选择上方备份快照解锁对比报告</p>
                    <p className="text-[10px] text-slate-500 max-w-sm mx-auto mt-1 leading-normal">
                      系统将智能扫描当前实时爬取的博客网络中的成功域名，并与选定的特定时间备份点包含的成功种子列表进行物理检测，实时比对生成。
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
