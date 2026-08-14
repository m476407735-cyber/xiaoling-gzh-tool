import { apiSettings, json, modelsEndpoint, readJson } from '../lib/openai.js';

export async function onRequestPost({ request, env }) {
  try {
    const { api = {} } = await readJson(request);
    const settings = apiSettings(api, env);
    if (!settings.key) return json({ error: '请先填写 API Key。' }, 400);
    const upstream = await fetch(modelsEndpoint(settings.endpoint), { headers: { Authorization: `Bearer ${settings.key}` } });
    const detail = await upstream.text();
    if (!upstream.ok) return json({ error: `连接失败（${upstream.status}）：${detail.slice(0, 360) || '请检查地址和密钥。'}` }, 502);
    let models = [];
    try { models = JSON.parse(detail)?.data?.map((item) => item.id).filter(Boolean).slice(0, 16) || []; } catch { /* Some gateways do not expose a models list. */ }
    return json({ ok: true, models });
  } catch (error) {
    return json({ error: error.message || '连接测试失败。' }, 500);
  }
}
