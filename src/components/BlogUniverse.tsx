import React, { useState, useMemo } from "react";
import { CrawledBlog } from "../types";
import { getHostname } from "../utils";
import { motion, AnimatePresence } from "motion/react";
import { Compass, Network, Globe, Radio, Star } from "lucide-react";

interface BlogUniverseProps {
  blogs: CrawledBlog[];
  seeds: string[];
  onSelectBlog: (blog: CrawledBlog) => void;
}

export default function BlogUniverse({ blogs, seeds, onSelectBlog }: BlogUniverseProps) {
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [selectedDepth, setSelectedDepth] = useState<number | null>(null);

  // Colors for each depth index (Depth 1, Depth 2, Depth 3, Depth 4, Depth 5+)
  const depthColors = [
    "#f43f5e", // Seed: depth 0 (Rose)
    "#6366f1", // Level 1 (Indigo)
    "#10b981", // Level 2 (Emerald)
    "#3b82f6", // Level 3 (Blue)
    "#a855f7", // Level 4 (Purple)
    "#ec4899", // Level 5 (Pink)
    "#f59e0b", // Level 6+ (Amber)
  ];

  // Helper to determine comfortable orbital radius
  const getRadiusForDepth = (d: number, maxD: number) => {
    if (d === 0) return 0;
    if (maxD <= 1) return 140;
    // Distribute orbits beautifully between r=70 and r=220
    const startR = 70;
    const endR = 210;
    return startR + (d - 1) * ((endR - startR) / (maxD - 1 || 1));
  };

  // Calculate statistics per depth (including percentage)
  const countByDepth = useMemo(() => {
    const counts: Record<number, number> = {};
    blogs.forEach(b => {
      const d = b.depth || 1;
      counts[d] = (counts[d] || 0) + 1;
    });
    counts[0] = seeds.length;
    return counts;
  }, [blogs, seeds]);

  const totalBlogsCount = useMemo(() => {
    return blogs.length + seeds.length;
  }, [blogs, seeds]);

  // Compute layout positions or filter nodes dynamically based on N level
  const universeData = useMemo(() => {
    const successBlogs = blogs.filter(b => b.status === "success");
    const otherBlogs = blogs.filter(b => b.status !== "success");
    
    // Determine the maximum depth in our dataset
    const maxBlogsDepth = Math.max(1, ...blogs.map(b => b.depth || 1));

    // Seed hostnames set
    const seedHosts = seeds.map(s => {
      try {
        return new URL(s).hostname;
      } catch {
        return s;
      }
    });

    const nodesMap = new Map<string, any>();

    // 1. Process Seeds at the Center (Depth 0)
    seeds.forEach((seed, i) => {
      let host = "";
      try { host = new URL(seed).hostname; } catch { host = seed; }
      
      const angle = (i / Math.max(1, seeds.length)) * Math.PI * 2;
      const radius = seeds.length > 1 ? 35 : 0;
      
      nodesMap.set(host, {
        id: host,
        url: seed,
        name: host,
        type: "seed",
        depth: 0,
        x: 250 + Math.cos(angle) * radius,
        y: 250 + Math.sin(angle) * radius,
        size: 14,
        color: depthColors[0], // Rose primary
        blogRef: blogs.find(b => getHostname(b.url) === host)
      });
    });

    // If there's exactly 1 seed, center it perfectly at 250, 250
    if (seeds.length === 1) {
      const firstSeed = seedHosts[0];
      const node = nodesMap.get(firstSeed);
      if (node) {
        node.x = 250;
        node.y = 250;
      }
    }

    // 2. Process all blogs by ascending depth level
    for (let d = 1; d <= maxBlogsDepth; d++) {
      const blogsAtDepth = blogs.filter(b => b.depth === d);
      if (blogsAtDepth.length === 0) continue;

      const successAtDepth = blogsAtDepth.filter(b => b.status === "success");
      const subRadius = getRadiusForDepth(d, maxBlogsDepth);
      const color = depthColors[d] || depthColors[depthColors.length - 1];

      // Distribute success nodes evenly on their orbit circles
      successAtDepth.forEach((blog, idx) => {
        const host = getHostname(blog.url);
        // stagger the starting phase slightly by depth to make it look spiral and natural
        const angle = (idx / Math.max(1, successAtDepth.length)) * Math.PI * 2 + (d * 0.35);
        
        nodesMap.set(host, {
          id: host,
          url: blog.url,
          name: blog.name || host,
          type: `depth_${d}`,
          depth: d,
          x: 250 + Math.cos(angle) * subRadius,
          y: 250 + Math.sin(angle) * subRadius,
          size: Math.max(5, 11 - d * 1.2),
          color: color,
          blogRef: blog
        });
      });

      // Distribute pending/failed nodes organically slightly offset
      const otherAtDepth = blogsAtDepth.filter(b => b.status !== "success");
      otherAtDepth.forEach((blog, idx) => {
        const host = getHostname(blog.url);
        const angle = ((idx + 0.5) / Math.max(1, otherAtDepth.length)) * Math.PI * 2 + (d * 0.35) + 1.1;
        const failedOffsetRadius = subRadius + (idx % 2 === 0 ? 12 : -12);

        nodesMap.set(host, {
          id: host,
          url: blog.url,
          name: blog.name || host,
          type: blog.status,
          depth: d,
          x: 250 + Math.cos(angle) * failedOffsetRadius,
          y: 250 + Math.sin(angle) * failedOffsetRadius,
          size: Math.max(3.5, 7 - d * 1.0),
          color: blog.status === "failed" ? "#ef4444" : "#94a3b8",
          blogRef: blog
        });
      });
    }

    // Build edges (Links between referring hosts and target hosts)
    const links: any[] = [];
    const seenLinks = new Set<string>();
    blogs.forEach(blog => {
      const targetHost = getHostname(blog.url);
      const targetNode = nodesMap.get(targetHost);
      
      if (targetNode && blog.referrers) {
        blog.referrers.forEach(ref => {
          const sourceHost = getHostname(ref.url);
          const sourceNode = nodesMap.get(sourceHost);
          if (sourceNode && sourceHost !== targetHost) {
            const linkId = `${sourceHost}-${targetHost}`;
            if (!seenLinks.has(linkId)) {
              seenLinks.add(linkId);
              links.push({
                id: linkId,
                source: sourceNode,
                target: targetNode,
                color: blog.status === "failed" ? "rgba(239, 68, 68, 0.12)" : "rgba(99, 102, 241, 0.22)"
              });
            }
          }
        });
      }
    });

    return {
      nodes: Array.from(nodesMap.values()),
      links,
      maxBlogsDepth
    };
  }, [blogs, seeds]);

  const activeBlogInfo = hoveredNode?.blogRef || null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden h-[630px] text-white flex flex-col justify-between">
      {/* Background stardust */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />

      {/* Header Info */}
      <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 mb-3 shrink-0">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2 text-slate-100">
            <Network className="w-4 h-4 text-indigo-400 animate-pulse" />
            独立博客星系图 · N级深层拓扑
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            中心为起点。点击以下层级星轨标签可动态高亮、过滤对应的推荐层级：
          </p>
        </div>
        
        {/* Interactive Deep-Level Filters and Percentage shares */}
        <div className="flex flex-wrap gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 max-w-full">
          <button
            onClick={() => setSelectedDepth(selectedDepth === 0 ? null : 0)}
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded-lg font-bold border transition-all cursor-pointer select-none ${
              selectedDepth === 0
                ? "bg-rose-600 text-white border-rose-500 font-extrabold shadow-md shadow-rose-600/30"
                : "bg-slate-900 border-slate-800/80 text-rose-400 hover:text-rose-300 hover:bg-slate-800/40"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>种子 ({countByDepth[0] || 0}站 · {totalBlogsCount > 0 ? Math.round(((countByDepth[0] || 0) / totalBlogsCount) * 100) : 0}%)</span>
          </button>

          {Array.from({ length: universeData.maxBlogsDepth }).map((_, idx) => {
            const d = idx + 1;
            const count = countByDepth[d] || 0;
            const pct = totalBlogsCount > 0 ? Math.round((count / totalBlogsCount) * 100) : 0;
            const color = depthColors[d] || depthColors[depthColors.length - 1];
            const isSel = selectedDepth === d;
            
            return (
              <button
                key={d}
                onClick={() => setSelectedDepth(isSel ? null : d)}
                className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded-lg font-bold border transition-all cursor-pointer select-none ${
                  isSel
                    ? "text-white font-extrabold shadow-md"
                    : "bg-slate-900 border-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800/40"
                }`}
                style={{
                  backgroundColor: isSel ? color : undefined,
                  borderColor: isSel ? "rgba(255,255,255,0.25)" : undefined,
                  boxShadow: isSel ? `0 4px 10px ${color}33` : undefined
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span>D{d}推荐 ({count}站 · {pct}%)</span>
              </button>
            );
          })}

          {selectedDepth !== null && (
            <button
              onClick={() => setSelectedDepth(null)}
              className="px-1.5 py-1 text-[9px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
            >
              清除高亮
            </button>
          )}
        </div>
      </div>

      {/* Outer SVG Canvas */}
      <div className="w-full flex-1 flex justify-center items-center select-none relative min-h-[385px]">
        <svg
          viewBox="0 0 500 500"
          className="w-full max-w-[450px] h-full max-h-[450px] absolute z-10"
        >
          {/* Defs for gradients, glowing filters */}
          <defs>
            <filter id="glow-indigo" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-rose" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Dynamic concentric orbits based on actual depth */}
          {Array.from({ length: universeData.maxBlogsDepth }).map((_, idx) => {
            const d = idx + 1;
            const radius = getRadiusForDepth(d, universeData.maxBlogsDepth);
            return (
              <circle
                key={d}
                cx="250"
                cy="250"
                r={radius}
                fill="none"
                stroke={`rgba(99, 102, 241, ${0.12 - (d * 0.015)})`}
                strokeWidth="1"
                strokeDasharray={d % 2 === 0 ? "4,4" : "none"}
              />
            );
          })}

          {/* Relationship Connection Lines - Styled as beautiful swirling cosmic gravity arcs */}
          {universeData.links.map((link, idx) => {
            const isHovered = hoveredNode && (hoveredNode.id === link.source.id || hoveredNode.id === link.target.id);
            const x1 = link.source.x;
            const y1 = link.source.y;
            const x2 = link.target.x;
            const y2 = link.target.y;
            
            // Calculate midpoint and perturbation for a slight swirling bulge
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            // Perpendicular vector for curved arc
            const px = len > 0 ? -dy / len : 0;
            const py = len > 0 ? dx / len : 0;
            
            // Arc curve coefficient
            const curveFactor = 0.12; 
            const cx = mx + px * (len * curveFactor);
            const cy = my + py * (len * curveFactor);
            
            const pathData = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;

            // Handle depth filtering dimmed effect for connection arcs
            let pathOpacity = 0.8;
            if (selectedDepth !== null) {
              const srcMatches = link.source.depth === selectedDepth;
              const tgtMatches = link.target.depth === selectedDepth;
              pathOpacity = (srcMatches && tgtMatches) ? 0.95 : (srcMatches || tgtMatches) ? 0.45 : 0.04;
            }

            return (
              <path
                key={`${link.id}-${idx}`}
                d={pathData}
                fill="none"
                stroke={isHovered ? "rgba(129, 140, 248, 0.85)" : link.color}
                strokeWidth={isHovered ? 2.0 : 0.75}
                className="transition-all duration-300 pointer-events-none"
                style={{ opacity: pathOpacity }}
              />
            );
          })}

          {/* Node Circles */}
          {universeData.nodes.map((node, idx) => {
            const isHovered = hoveredNode?.id === node.id;
            
            // Selected depth group dimming behavior
            let nodeOpacity = 1;
            if (selectedDepth !== null) {
              nodeOpacity = node.depth === selectedDepth ? 1.0 : 0.16;
            }

            return (
              <g
                key={`${node.id}-${idx}`}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer transition-all duration-300"
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ opacity: nodeOpacity }}
                onClick={() => {
                  if (node.blogRef) {
                    onSelectBlog(node.blogRef);
                  }
                }}
              >
                {/* Visual glow on hover */}
                {isHovered && (
                  <circle
                    r={node.size + 7}
                    fill={node.color}
                    opacity="0.25"
                    className="animate-ping"
                  />
                )}
                {/* Core node circle */}
                <circle
                  r={isHovered ? node.size + 2.5 : node.size}
                  fill={node.color}
                  stroke="#0f172a"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  filter={node.depth === 0 ? "url(#glow-rose)" : node.depth === 1 ? "url(#glow-indigo)" : undefined}
                  className="transition-all duration-300"
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip info on hover nodes */}
        <AnimatePresence>
          {hoveredNode && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-1.5 left-2 right-2 bg-slate-950/95 border border-indigo-500/30 rounded-xl p-3 z-30 shadow-2xl backdrop-blur-md flex gap-3 text-left"
            >
              <div className="p-2 h-max rounded-lg bg-indigo-500/10">
                {activeBlogInfo?.feeds && activeBlogInfo.feeds.length > 0 ? (
                  <Radio className="w-5 h-5 text-indigo-400 animate-pulse" />
                ) : (
                  <Globe className="w-5 h-5 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h4 className="text-sm font-bold text-slate-100 truncate pr-2">
                    {hoveredNode.name}
                  </h4>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                    {hoveredNode.depth === 0 ? "种子起点" : `${hoveredNode.depth}级友链推荐`}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                  {hoveredNode.url}
                </p>
                {activeBlogInfo ? (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400 border-t border-slate-900 pt-1.5">
                    {activeBlogInfo.title && (
                      <span className="truncate max-w-[200px] text-slate-300">🏷️ {activeBlogInfo.title}</span>
                    )}
                    {activeBlogInfo.feeds && activeBlogInfo.feeds.length > 0 && (
                      <span className="text-orange-400/90 font-mono">📡 RSS ✓</span>
                    )}
                    <span className="text-indigo-400">🔗 {activeBlogInfo.referrers?.length || 0} 处反向关联</span>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 mt-1">
                    未完全爬取，作为推荐索引缓存于节点
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty status message inside canvas */}
        {universeData.nodes.length <= seeds.length && (
          <div className="absolute inset-0 flex flex-col justify-center items-center z-0 text-slate-500 pointer-events-none p-6 select-text">
            <Compass className="w-9 h-9 mb-2 stroke-[1.2] text-indigo-500/50 animate-spin" style={{ animationDuration: "12s" }} />
            <p className="text-xs text-slate-300">星系中暂无推荐节点</p>
            <p className="text-[11px] text-slate-500 text-center max-w-[260px] mt-1 line-clamp-2">
              点击左侧“开始爬取”后，系统将自动发掘博客圈深处的友情推荐，并实时画出层级拓扑星轨。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
