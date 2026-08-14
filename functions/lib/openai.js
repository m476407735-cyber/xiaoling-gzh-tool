export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function readJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 1_500_000) throw new Error('请求内容过大。');
  try {
    return await request.json();
  } catch {
    throw new Error('请求格式不正确。');
  }
}

export function chatEndpoint(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v\d+(?:\.\d+)?$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export function modelsEndpoint(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, '/models');
  if (/\/v\d+(?:\.\d+)?$/i.test(trimmed)) return `${trimmed}/models`;
  return `${trimmed}/v1/models`;
}

export function apiSettings(api = {}, env = {}) {
  return {
    key: api.key || env.OPENAI_API_KEY || '',
    endpoint: api.endpoint || env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: api.model || env.OPENAI_MODEL || 'gpt-4.1-mini',
  };
}

export async function chatCompletion({ api, env, system, content, temperature }) {
  const settings = apiSettings(api, env);
  if (!settings.key) return { error: '请先在“模型设置”中填写 API Key。', status: 400 };
  try {
    const upstream = await fetch(chatEndpoint(settings.endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.key}` },
      body: JSON.stringify({ model: settings.model, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
    });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      return { error: `模型请求失败（${upstream.status}）：${detail || '请检查接口地址、模型名和密钥。'}`, status: 502 };
    }
    const payload = await upstream.json();
    const text = payload?.choices?.[0]?.message?.content?.trim();
    if (!text) return { error: '模型没有返回可用内容。', status: 502 };
    return { text };
  } catch (error) {
    return { error: error.message || '模型请求失败，请稍后重试。', status: 502 };
  }
}
