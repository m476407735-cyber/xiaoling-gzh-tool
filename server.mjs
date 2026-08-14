import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 4178);
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

const systemPrompt = `你是中文公众号编辑。把用户提供的口播稿改写为一篇可直接发布的公众号长文 Markdown。
要求：
1. 只保留原稿中的事实、案例和观点，不编造数据、产品能力、人物或经历。
2. 去掉口播腔、重复语气词、镜头提示和无关广告；保留第一人称经验时不要改成第三人称。
3. 把逻辑改成适合手机阅读的长文：开头提出困境或结论，正文使用 3 到 5 个二级标题，段落短，必要时用列表。
4. 用 # 写主标题、## 写章节、### 写小步骤。开头可用一段 > 金句。需要用户补图的位置必须写成 [[IMAGE: P01 | 说明]]，按 P01、P02 递增，说明不超过 28 个汉字。
5. 用 ==关键词== 标记每段最需要强调的一小段，全文不超过 8 处。中文标点。
6. 结尾保留自然的总结和互动引导；不要直接写作者名，系统会自动添加。
7. 只输出 Markdown，不要解释，不要使用 front matter。`;

const highlightPrompt = `你是中文公众号文章的编辑标注助手。用户会给出一篇 Markdown 正文。
只做“重点标记”，绝不改写、删减、补充任何事实、标点、段落、标题、图片占位或列表。
规则：
1. 对全文最多 8 个真正关键的短语添加标记。核心判断、结论、关键方法使用 ++短语++；需要轻量提示的概念使用 ==短语==。
2. 每段最多一个标记；短语应为 4 到 15 个汉字，不能标整句，不能凭空创造词。
3. 已有 **加粗**、++下划线++、==高亮== 的内容保持原样，不重复或替换。
4. 如果没有足够确定的重点，宁可少标或不标。
5. 只输出处理后的原 Markdown，不要解释，不要用代码块。`;

// Third-party gateways do not all accept the same form of base URL.
function chatEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v\d+(?:\.\d+)?$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function modelsEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, '/models');
  if (/\/v\d+(?:\.\d+)?$/i.test(trimmed)) return `${trimmed}/models`;
  return `${trimmed}/v1/models`;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_500_000) request.destroy();
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('请求格式不正确')); }
    });
    request.on('error', reject);
  });
}

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function rewrite(request, response) {
  try {
    const { source, title, author, intro, api = {} } = await readJson(request);
    if (!source?.trim()) return json(response, 400, { error: '请先粘贴口播稿。' });
    const apiKey = api.key || process.env.OPENAI_API_KEY;
    if (!apiKey) return json(response, 400, { error: '请在“模型设置”中填入 API Key，或使用“直接排版”先生成版式。' });

    const endpoint = api.endpoint || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = api.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const context = [
      title?.trim() ? `用户指定标题：${title.trim()}` : '',
      author?.trim() ? `作者署名（不要写入正文）：${author.trim()}` : '',
      intro?.trim() ? `作者简介（不要写入正文）：${intro.trim()}` : '',
      `口播稿：\n${source.trim()}`,
    ].filter(Boolean).join('\n\n');
    const upstream = await fetch(chatEndpoint(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: context }],
      }),
    });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      return json(response, 502, { error: `模型请求失败（${upstream.status}）：${detail || '请检查接口地址、模型名和密钥。'}` });
    }
    const payload = await upstream.json();
    const markdown = payload?.choices?.[0]?.message?.content?.trim();
    if (!markdown) return json(response, 502, { error: '模型没有返回可用的文章内容。' });
    json(response, 200, { markdown });
  } catch (error) {
    json(response, 500, { error: error.message || '生成失败，请稍后重试。' });
  }
}

async function testConnection(request, response) {
  try {
    const { api = {} } = await readJson(request);
    const apiKey = api.key || process.env.OPENAI_API_KEY;
    if (!apiKey) return json(response, 400, { error: '请先填写 API Key。' });
    const endpoint = api.endpoint || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const upstream = await fetch(modelsEndpoint(endpoint), { headers: { Authorization: `Bearer ${apiKey}` } });
    const detail = await upstream.text();
    if (!upstream.ok) return json(response, 502, { error: `连接失败（${upstream.status}）：${detail.slice(0, 360) || '请检查地址和密钥。'}` });
    let models = [];
    try { models = JSON.parse(detail)?.data?.map((item) => item.id).filter(Boolean).slice(0, 16) || []; } catch { /* Endpoint connected without a model list. */ }
    json(response, 200, { ok: true, models });
  } catch (error) {
    json(response, 500, { error: error.message || '连接测试失败。' });
  }
}

async function highlightArticle(request, response) {
  try {
    const { markdown, api = {} } = await readJson(request);
    if (!markdown?.trim()) return json(response, 400, { error: '请先生成或编辑文章正文。' });
    const apiKey = api.key || process.env.OPENAI_API_KEY;
    if (!apiKey) return json(response, 400, { error: '请先在模型设置中填写 API Key。' });
    const endpoint = api.endpoint || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = api.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const upstream = await fetch(chatEndpoint(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.1, messages: [{ role: 'system', content: highlightPrompt }, { role: 'user', content: markdown.trim() }] }),
    });
    if (!upstream.ok) return json(response, 502, { error: `重点识别失败（${upstream.status}）：${(await upstream.text()).slice(0, 500) || '请检查模型设置。'}` });
    const payload = await upstream.json();
    const marked = payload?.choices?.[0]?.message?.content?.trim();
    if (!marked) return json(response, 502, { error: '模型没有返回可用的标记结果。' });
    json(response, 200, { markdown: marked });
  } catch (error) {
    json(response, 500, { error: error.message || '重点识别失败。' });
  }
}

async function serveFile(request, response) {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = normalize(join(publicRoot, relative));
  if (!file.startsWith(publicRoot)) return json(response, 403, { error: '禁止访问。' });
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(content);
  } catch {
    json(response, 404, { error: '页面不存在。' });
  }
}

createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/rewrite') return rewrite(request, response);
  if (request.method === 'POST' && request.url === '/api/test-connection') return testConnection(request, response);
  if (request.method === 'POST' && request.url === '/api/highlight-article') return highlightArticle(request, response);
  if (request.method === 'GET') return serveFile(request, response);
  json(response, 405, { error: '不支持的请求。' });
}).listen(port, '127.0.0.1', () => {
  console.log(`公众号文章工作台已启动：http://127.0.0.1:${port}`);
});
