import { chatCompletion, json, readJson } from '../lib/openai.js';

const systemPrompt = `你是中文公众号编辑。把用户提供的口播稿改写为一篇可直接发布的公众号长文 Markdown。
要求：
1. 只保留原稿中的事实、案例和观点，不编造数据、产品能力、人物或经历。
2. 去掉口播腔、重复语气词、镜头提示和无关广告；保留第一人称经验时不要改成第三人称。
3. 把逻辑改成适合手机阅读的长文：开头提出困境或结论，正文使用 3 到 5 个二级标题，段落短，必要时用列表。
4. 用 # 写主标题、## 写章节、### 写小步骤。开头可用一段 > 金句。需要用户补图的位置必须写成 [[IMAGE: P01 | 说明]]，按 P01、P02 递增，说明不超过 28 个汉字。
5. 用 ==关键词== 标记每段最需要强调的一小段，全文不超过 8 处。中文标点。
6. 结尾保留自然的总结和互动引导；不要直接写作者名，系统会自动添加。
7. 只输出 Markdown，不要解释，不要使用 front matter。`;

export async function onRequestPost({ request, env }) {
  try {
    const { source, title, author, intro, api = {} } = await readJson(request);
    if (!source?.trim()) return json({ error: '请先粘贴口播稿。' }, 400);
    const content = [
      title?.trim() ? `用户指定标题：${title.trim()}` : '',
      author?.trim() ? `作者署名（不要写入正文）：${author.trim()}` : '',
      intro?.trim() ? `作者简介（不要写入正文）：${intro.trim()}` : '',
      `口播稿：\n${source.trim()}`,
    ].filter(Boolean).join('\n\n');
    const result = await chatCompletion({ api, env, system: systemPrompt, content, temperature: 0.55 });
    if (result.error) return json({ error: result.error }, result.status);
    return json({ markdown: result.text });
  } catch (error) {
    return json({ error: error.message || '生成失败，请稍后重试。' }, 500);
  }
}
