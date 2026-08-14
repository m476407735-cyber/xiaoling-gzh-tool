import { chatCompletion, json, readJson } from '../lib/openai.js';

const systemPrompt = `你是中文公众号文章的编辑标注助手。用户会给出一篇 Markdown 正文。
只做“重点标记”，绝不改写、删减、补充任何事实、标点、段落、标题、图片占位或列表。
规则：
1. 对全文最多 8 个真正关键的短语添加标记。核心判断、结论、关键方法使用 ++短语++；需要轻量提示的概念使用 ==短语==。
2. 每段最多一个标记；短语应为 4 到 15 个汉字，不能标整句，不能凭空创造词。
3. 已有 **加粗**、++下划线++、==高亮== 的内容保持原样，不重复或替换。
4. 如果没有足够确定的重点，宁可少标或不标。
5. 只输出处理后的原 Markdown，不要解释，不要用代码块。`;

export async function onRequestPost({ request, env }) {
  try {
    const { markdown, api = {} } = await readJson(request);
    if (!markdown?.trim()) return json({ error: '请先生成或编辑文章正文。' }, 400);
    const result = await chatCompletion({ api, env, system: systemPrompt, content: markdown.trim(), temperature: 0.1 });
    if (result.error) return json({ error: result.error }, result.status);
    return json({ markdown: result.text });
  } catch (error) {
    return json({ error: error.message || '重点识别失败。' }, 500);
  }
}
