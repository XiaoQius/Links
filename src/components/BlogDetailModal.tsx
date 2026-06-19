import React from "react";
import { CrawledBlog } from "../types";
import { getHostname } from "../utils";
import { motion } from "framer-motion";
import { X, ExternalLink, Copy, Calendar, ShieldCheck, Heart, Radio, Link as LinkIcon, FileText } from "lucide-react";

interface BlogDetailModalProps {
  blog: CrawledBlog | null;
  onClose: () => void;
}

export default function BlogDetailModal({ blog, onClose }: BlogDetailModalProps) {
  if (!blog) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Standard silent copy action
  };

  const hostname = getHostname(blog.url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden text-slate-800 dark:text-slate-100"
      >
        {/* Header bar */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-start bg-slate-50 dark:bg-slate-950/40">
          <div className="min-w-0 pr-3">
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold">
              爬取深度: {blog.depth} 层
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate mt-1.5 flex items-center gap-1.5">
              {blog.name || hostname}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
              {blog.url}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* content body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh] text-sm">
          
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
              <span className="text-xs text-slate-400 block">站点状态</span>
              <div className="flex items-center gap-1.5 mt-1">
                {blog.status === "success" ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">抓取成功 (200)</span>
                  </>
                ) : blog.status === "crawling" ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="font-semibold text-indigo-500">正在解析...</span>
                  </>
                ) : (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="font-semibold text-red-500">爬取失败 {blog.statusCode ? `(${blog.statusCode})` : ""}</span>
                  </>
                )}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
              <span className="text-xs text-slate-400 block flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> 爬取时间
              </span>
              <span className="text-xs text-slate-700 dark:text-slate-300 font-mono block mt-1">
                {new Date(blog.crawlTime).toLocaleString()}
              </span>
            </div>
          </div>

          {/* HTML Title & description */}
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                页面原生 HTML 标题
              </h4>
              <p className="mt-1 bg-slate-50 dark:bg-slate-950/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 font-medium text-slate-800 dark:text-slate-200">
                {blog.title || <span className="text-slate-400 italic">（无）</span>}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                网页 Meta 描述
              </h4>
              <p className="mt-1 bg-slate-50 dark:bg-slate-950/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 leading-relaxed">
                {blog.description || <span className="text-slate-400 italic">（未配置网页 Description 描述描述）</span>}
              </p>
            </div>
          </div>

          {/* RSS Feed Address */}
          {blog.feeds && blog.feeds.length > 0 && (
            <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-4 h-4 animate-pulse" />
                发现 RSS / Atom 订阅源地址
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                可以直接将此地址复制配置到 Feedbin、NetNewsWire 等阅读器中订阅：
              </p>
              <div className="space-y-1.5">
                {blog.feeds.map((feed, i) => (
                  <div key={i} className="flex gap-2 items-center bg-white dark:bg-slate-950 border border-orange-500/10 rounded-lg px-2 py-1.5 text-xs">
                    <span className="font-mono text-slate-600 dark:text-slate-300 truncate flex-1">{feed}</span>
                    <button
                      onClick={() => copyToClipboard(feed)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-900 rounded text-orange-500 transition-colors"
                      title="复制订阅源地址"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Referrers */}
          {blog.referrers && blog.referrers.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-2">
                <Heart className="w-4 h-4 text-rose-400" />
                推荐该博客的关联页面 ({blog.referrers.length})
              </h4>
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                {blog.referrers.map((ref, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-lg p-2 flex justify-between items-center text-xs">
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                        锚文本: <span className="text-indigo-500 font-bold">“{ref.text}”</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{ref.url}</div>
                    </div>
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-amber-500 transition-colors"
                      title="打开来源引用网页"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links details */}
          {blog.status === "success" && (
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-indigo-400" />
                <span>页面外链数数量：<strong className="text-indigo-500">{blog.outLinksTotal ?? 0}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-emerald-400" />
                <span>潜在友链数：<strong className="text-emerald-500">{blog.outLinksFriendCount ?? 0}</strong></span>
              </div>
            </div>
          )}

          {/* Subpages Details */}
          {blog.crawledPages && blog.crawledPages.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                已爬取的站内页面详情 ({blog.crawledPages.length})
              </h4>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                {blog.crawledPages.map((page, idx) => {
                  const isPageSuccess = page.status === "success";
                  const isPageFailed = page.status === "failed";
                  return (
                    <div 
                      key={idx} 
                      className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-lg p-2.5 flex justify-between items-center text-xs"
                    >
                      <div className="min-w-0 pr-2 space-y-0.5">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={page.title || page.url}>
                          {page.title || getHostname(page.url)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate" title={page.url}>
                          {page.url}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isPageSuccess ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                            成功
                          </span>
                        ) : isPageFailed ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] bg-red-500/10 text-red-500 font-bold">
                            失败
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] bg-blue-500/10 text-blue-500 animate-pulse">
                            排队中
                          </span>
                        )}
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600 dark:hover:text-indigo-400 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error Message */}
          {blog.status === "failed" && blog.errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-500">
              <span className="font-semibold block mb-0.5">错误原因:</span>
              <p className="font-mono break-all">{blog.errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/50 flex justify-end gap-2.5">
          <button
            onClick={() => copyToClipboard(blog.url)}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/60 font-medium text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            复制链接
          </button>
          <a
            href={blog.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/10 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            访问站点
          </a>
        </div>
      </motion.div>
    </div>
  );
}
