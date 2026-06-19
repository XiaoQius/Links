export interface AiAnalyzeConfig {
  apiType?: "gemini" | "openai";
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  customPromptPreset?: string;
}

export interface BlogItem {
  name?: string;
  url: string;
  title?: string;
  description?: string;
  depth?: number;
  feeds?: string[];
}

export interface AiAnalyzeResult {
  success: boolean;
  analysis?: string;
  message?: string;
}

function buildDefaultPrompt(sampleBlogs: any[]): string {
  return `你是一个互联网博客探索专家。这里有一个我们通过友情链接爬虫程序抓取到的独立博客列表：
${JSON.stringify(sampleBlogs, null, 2)}

请对这些博客进行深度分析：
1. 提取出最具价值、最有趣或最高质量的 5-8 个博客，并简要写出推荐理由（包括他们可能偏向哪个领域，比如技术、生活、理财、摄影等）。
2. 将这批博客分析并分为 3-5 个技术/人文等兴趣主题分类，并说明分类。
3. 给出这个博客圈子的主要文化特征或共同关注的技术/生活主题（如 Hexo 独立博客文化、前端开发、极简生活、AI探索等）。

请以直观、精美、条理清晰的 Markdown 格式输出分析报告，使用吸引人的排版。`;
}

export async function analyzeBlogs(
  blogs: BlogItem[],
  customConfig: AiAnalyzeConfig | undefined,
  serverGeminiKey?: string
): Promise<AiAnalyzeResult> {
  if (!blogs || !Array.isArray(blogs) || blogs.length === 0) {
    return { success: false, message: "Missing blogs list" };
  }

  const sampleBlogs = blogs.slice(0, 48).map(b => ({
    name: b.name || "Unknown",
    url: b.url,
    title: b.title || "",
    description: b.description || "",
    depth: b.depth || 1,
    rss: b.feeds && b.feeds.length > 0 ? "Yes" : "No"
  }));

  let prompt = buildDefaultPrompt(sampleBlogs);

  if (customConfig?.customPromptPreset?.trim()) {
    prompt = `${customConfig.customPromptPreset}\n\n以下是待分析的独立博客数据列表：\n${JSON.stringify(sampleBlogs, null, 2)}`;
  }

  try {
    const apiType = customConfig?.apiType || "gemini";
    const customKey = customConfig?.apiKey?.trim();

    if (apiType === "openai") {
      const baseUrl = (customConfig?.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      const model = customConfig?.modelName || "gpt-4o-mini";

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

      return { success: true, analysis: content };
    } else {
      const apiKeyToUse = customKey || serverGeminiKey || "";
      if (!apiKeyToUse) {
        return {
          success: false,
          message: "请在 AI 接口设置中配置 Gemini API Key 以启用智能分析。"
        };
      }

      const model = customConfig?.modelName || "gemini-1.5-flash";
      const baseUrl = customConfig?.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
      const cleanBaseUrl = baseUrl.replace(/\/$/, "");

      const response = await fetch(
        `${cleanBaseUrl}/models/${model}:generateContent?key=${apiKeyToUse}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }]
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (HTTP ${response.status}): ${errText}`);
      }

      const resJson: any = await response.json();
      const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error("Gemini API returned empty content.");
      }

      return { success: true, analysis: text };
    }
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to generate AI analysis report." };
  }
}
