const $ = (selector) => document.querySelector(selector);
const state = {
  images: {}, imageCaptions: {}, markdown: '', generated: false, generationMode: 'none', theme: 'graphite',
  titleFont: 'sans', bodySize: 'recommended', lastEditorSelection: null, renderMode: 'preview',
  skin: 'graphite', studioName: '公众号文章', studioTagline: '一键排版·复制', studioAvatar: '',
};
const STORAGE_KEY = 'wechat-article-studio-v6';
const MODEL_SETTINGS_KEY = 'wechat-model-settings';
const HISTORY_KEY = 'wechat-article-studio-history-v1';
const APPEARANCE_STORAGE_KEY = 'wechat-article-studio-appearance-v1';
const HISTORY_LIMIT = 30;

const themes = {
  graphite: { name: '石墨极简', description: '克制的灰阶编辑风，适合科技、方法论与专业观点。', primary: '#52525B', dark: '#27272A', body: '#52525B', line: '#E4E4E7', light: '#FAFAFA', mark: '#52525B' },
  moyuGreen: { name: '摸鱼绿', description: '绿色杂志风，信息密度高，适合教程、工具与清单。', primary: '#059669', dark: '#111827', body: '#374151', line: '#D1D5DB', light: '#ECFDF5', mark: '#A7F3D0' },
  redWhite: { name: '红白色系', description: '红白编辑风，观点鲜明，适合分析、表达与深度内容。', primary: '#DC2626', dark: '#1C1917', body: '#374151', line: '#E5E7EB', light: '#FEF2F2', mark: '#FECACA' },
  zen: { name: '留白禅意', description: '安静、留白、呼吸感强，适合随笔、生活与思考。', primary: '#4A5D52', dark: '#304037', body: '#526158', line: '#DDE5DE', light: '#F6F8F5', mark: '#B5C8BC' },
  moyuTicket: { name: '摸鱼票据', description: '票据和测评视觉，适合工具对比、测评与复盘。', primary: '#059669', dark: '#1A1A1A', body: '#555555', line: '#A7F3D0', light: '#F0FDF4', mark: '#A7F3D0' },
  olive: { name: '橄榄手记', description: '编辑部内刊感，适合案例复盘、系统说明与长文。', primary: '#ed7b2f', dark: '#1e1f23', body: '#4d4f46', line: '#bfc1b7', light: '#eeefe9', mark: '#ed7b2f' },
};

const sampleSource = `这是一个适合公众号发布的示例口播稿。

你可以把自己的口播稿粘贴到左侧，先由 AI 改写成结构完整的公众号长文，再选择喜欢的排版风格。

生成后可以继续修改标题、重点标记、图片占位和作者信息，最后复制到公众号编辑器。`;

function escapeHtml(value = '') {
  return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function initialOf(value) {
  return String(value || '文').trim().slice(0, 1) || '文';
}

function applyStudioIdentity() {
  const name = state.studioName || '公众号文章';
  const tagline = state.studioTagline || '一键排版·复制';
  const avatar = initialOf(name);
  $('#brandName').textContent = name;
  $('#brandTagline').textContent = tagline;
  $('#identityName').textContent = name;
  $('#identityLine').textContent = tagline;
  const avatarMarkup = state.studioAvatar ? `<img src="${state.studioAvatar}" alt="">` : avatar;
  $('#brandMark').innerHTML = avatarMarkup;
  $('#identityAvatar').innerHTML = avatarMarkup;
  $('#dialogAvatar').innerHTML = avatarMarkup;
  $('#dialogName').textContent = name;
  $('#dialogTagline').textContent = tagline;
  document.body.dataset.skin = state.skin;
  document.querySelectorAll('.skin-card').forEach((card) => {
    const active = card.dataset.skin === state.skin;
    card.classList.toggle('selected', active);
    card.setAttribute('aria-pressed', String(active));
  });
}

function persistAppearance() {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({
      skin: state.skin,
      studioName: state.studioName,
      studioTagline: state.studioTagline,
      studioAvatar: state.studioAvatar,
    }));
    return true;
  } catch {
    showToast('头像保存失败，请换一张较小的图片后重试。');
    return false;
  }
}

function restoreAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return false;
    state.skin = ['graphite', 'mint', 'atelier'].includes(saved.skin) ? saved.skin : state.skin;
    state.studioName = typeof saved.studioName === 'string' && saved.studioName.trim() ? saved.studioName : state.studioName;
    state.studioTagline = typeof saved.studioTagline === 'string' && saved.studioTagline.trim() ? saved.studioTagline : state.studioTagline;
    state.studioAvatar = typeof saved.studioAvatar === 'string' ? saved.studioAvatar : state.studioAvatar;
    return true;
  } catch {
    return false;
  }
}

async function compactAvatar(file) {
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = source;
  });
  const maxSide = 320;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

function leaf(value) {
  return `<span leaf="">${escapeHtml(value)}</span>`;
}

function renderInline(value, autoMark = false, theme = themes[state.theme]) {
  const text = String(value || '');
  const tokens = [];
  const stash = (html) => { const key = `\u0000${tokens.length}\u0000`; tokens.push(html); return key; };
  let source = text;
  source = escapeHtml(source);
  source = source.replace(/==(.+?)==/g, (_, match) => stash(`<span style="background:#FFE37A;color:${theme.dark};padding:1px 4px;"><span leaf="">${match}</span></span>`));
  source = source.replace(/\+\+(.+?)\+\+/g, (_, match) => stash(`<span style="border-bottom:2px solid ${theme.mark};font-weight:600;color:${theme.dark};"><span leaf="">${match}</span></span>`));
  source = source.replace(/\*\*(.+?)\*\*/g, (_, match) => stash(`<strong style="color:${theme.dark};"><span leaf="">${match}</span></strong>`));
  source = source.replace(/`([^`]+)`/g, (_, match) => stash(`<span style="background:#F3F4F6;color:${theme.dark};padding:2px 7px;border-radius:3px;font-weight:700;font-size:14px;"><span leaf="">${match}</span></span>`));
  const parts = source.split(/(\u0000\d+\u0000)/g);
  return parts.map((part) => {
    const token = part.match(/^\u0000(\d+)\u0000$/);
    return token ? tokens[Number(token[1])] : (part ? leaf(part) : '');
  }).join('');
}

function bodyFontSize() {
  return { small: '14px', recommended: '15px', large: '16px' }[state.bodySize] || '15px';
}

function titleFontFamily() {
  if (state.titleFont === 'serif') return "'Songti SC','STSong','SimSun',serif";
  if (state.titleFont === 'mono') return "ui-monospace,'SFMono-Regular','Menlo',monospace";
  return "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
}

function syncText(value = '') {
  return String(value).replace(/^(?:#{1,3}|>|[-*])\s*/, '').replace(/\*\*|\+\+|==|`/g, '').trim();
}

function syncKey(value = '') {
  return encodeURIComponent(syncText(value));
}

function paragraph(text, theme = themes[state.theme]) {
  return `<p data-sync-key="${syncKey(text)}" style="margin-bottom:22px;font-size:${bodyFontSize()};line-height:1.8;text-align:justify;color:${theme.body};letter-spacing:0.3px;">${renderInline(text, true, theme)}</p>`;
}

function imagePlaceholder(id, description) {
  const src = state.images[id];
  if (!src && state.renderMode === 'copy') return '';
  if (src) return `<section data-image-id="${id}" style="border:1px solid #E4E4E7;padding:4px;margin:0 10px 8px;"><section style="margin:0;overflow:hidden;"><span leaf=""><img src="${src}" style="max-width:100%;height:auto;display:block;margin:0 auto;" alt="${escapeHtml(description)}"></span></section></section>${state.renderMode === 'preview' || state.imageCaptions[id] ? `<p data-image-caption="${id}" style="font-size:12px;color:#A1A1AA;text-align:center;margin:0 10px 28px;letter-spacing:0.5px;">${leaf(`— ${description}`)}</p>` : ''}`;
  return `<section data-image-id="${id}" style="margin:0 10px 32px;padding:30px 20px;border:1px solid #E4E4E7;background:#FAFAFA;text-align:center;"><p style="margin:0 0 10px;font-size:21px;line-height:1;">${leaf('🖼')}</p><p style="margin:0;font-size:13px;font-weight:700;color:#52525B;letter-spacing:1px;">${leaf(`待补素材 ${id}`)}</p><p style="margin:8px 0 0;font-size:13px;color:#71717A;line-height:1.7;">${leaf(description)}</p></section>`;
}

function normalizeMarkdown(source) {
  let value = source.trim().replace(/\r\n/g, '\n');
  if (!value) return '';
  if (!/^#\s/m.test(value)) value = `# ${($('#titleInput').value.trim() || '未命名文章')}\n\n${value}`;
  return value;
}

function deriveTitle(markdown) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const first = markdown.split(/\n\s*\n/).find(Boolean)?.trim() || '未命名文章';
  return first.replace(/^>\s*/, '').slice(0, 30);
}

function parseMarkdown(markdown) {
  const normalized = normalizeMarkdown(markdown);
  const title = deriveTitle(normalized);
  const sections = [];
  const preface = [];
  const imageList = [];
  let current = null;
  let quote = '';
  let pendingList = [];
  const destination = () => current ? current.blocks : preface;
  const flushList = () => { if (pendingList.length) { destination().push({ type: 'list', items: pendingList }); pendingList = []; } };
  normalized.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushList(); return; }
    if (/^#\s+/.test(line)) return;
    const heading = line.match(/^##\s+(.+)$/); if (heading) { flushList(); current = { title: heading[1], blocks: [] }; sections.push(current); return; }
    const subheading = line.match(/^###\s+(.+)$/); if (subheading) { flushList(); destination().push({ type: 'subheading', text: subheading[1] }); return; }
    const image = line.match(/^\[\[IMAGE:\s*(P\d+)\s*\|\s*(.+?)\]\]$/i);
    if (image) { flushList(); const item = { id: image[1].toUpperCase(), description: image[2].trim() }; imageList.push(item); destination().push({ type: 'image', ...item }); return; }
    if (/^>\s?/.test(line)) { flushList(); quote = line.replace(/^>\s?/, '').replace(/^\*\*(.+)\*\*$/, '$1'); if (!current && !preface.length) return; destination().push({ type: 'quote', text: quote }); return; }
    const list = line.match(/^[-*]\s+(.+)$/); if (list) { pendingList.push(list[1]); return; }
    if (/^---+$/.test(line)) { flushList(); return; }
    flushList(); destination().push({ type: 'paragraph', text: line });
  });
  flushList();
  return { normalized, title, sections, preface, imageList, quote };
}

function englishTag(title, isLast) {
  if (isLast) return 'THE END';
  if (/收集|收藏|入口|素材/.test(title)) return 'COLLECT';
  if (/分析|拆解|转写|理解/.test(title)) return 'ANALYZE';
  if (/归档|整理|分类|管理/.test(title)) return 'ORGANIZE';
  if (/创作|选题|输出|写作/.test(title)) return 'CREATE';
  if (/步骤|方法|流程/.test(title)) return 'PROCESS';
  return 'INSIGHT';
}

function renderBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === 'paragraph') return paragraph(block.text);
    if (block.type === 'subheading') return `<p data-sync-key="${syncKey(block.text)}" style="font-size:15px;font-weight:800;color:#27272A;margin:28px 0 14px;padding-left:12px;border-left:3px solid #52525B;line-height:1.4;">${renderInline(block.text)}</p>`;
    if (block.type === 'quote') return `<section data-sync-key="${syncKey(block.text)}" style="border-left:3px solid #52525B;padding:16px 0 16px 24px;margin:0 10px 28px;"><p style="font-size:16px;font-weight:700;color:#27272A;margin:0;line-height:1.7;letter-spacing:0.5px;">${leaf(`「${block.text.replace(/[「」]/g, '')}」`)}</p></section>`;
    if (block.type === 'image') return imagePlaceholder(block.id, block.description);
    if (block.type === 'list') return `<section style="margin-bottom:24px;">${block.items.map((item, index) => `<section style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#27272A;color:#FFFFFF;font-size:12px;font-weight:700;border-radius:50%;flex-shrink:0;margin-top:2px;">${leaf(String(index + 1))}</span><p style="font-size:15px;color:#52525B;margin:0;line-height:1.8;flex:1;">${renderInline(item, true)}</p></section>`).join('')}</section>`;
    return '';
  }).join('');
}

function renderGraphite(markdown) {
  const parsed = parseMarkdown(markdown);
  const { normalized, title, sections, preface, imageList, quote } = parsed;
  const author = $('#authorInput').value.trim();
  const bio = $('#bioInput').value.trim();
  const introText = quote || preface.find((block) => block.type === 'paragraph')?.text || '把经验整理成可被反复调用的内容。';
  const quoteSignature = author ? `<p style="text-align:right;font-size:12px;color:#A1A1AA;margin:16px 0 0;letter-spacing:1px;">${leaf(`—— ${author}`)}</p>` : '';
  const quoteCard = `<section style="margin:10px 10px 40px;padding:32px 24px 24px;border-top:1px solid #E4E4E7;border-bottom:1px solid #E4E4E7;background:#FFFFFF;"><p style="font-size:11px;color:#A1A1AA;letter-spacing:2px;margin:0 0 18px;font-weight:400;">${leaf('QUOTE')}</p><p style="font-size:18px;font-weight:700;color:#27272A;margin:0;line-height:1.7;letter-spacing:0.5px;">${renderInline(introText, true)}</p>${quoteSignature}</section>`;
  const titleBlock = `<section style="padding:34px 20px 22px;text-align:center;"><h1 style="font-family:${titleFontFamily()};font-size:24px;font-weight:800;color:#27272A;line-height:1.5;margin:0;letter-spacing:0.5px;">${leaf(title)}</h1></section>`;
  const prefaceWithoutQuote = preface.filter((block) => block.type !== 'quote');
  const directory = sections.length >= 3 ? `<section style="padding:0 10px 40px;"><p style="font-size:11px;color:#A1A1AA;margin:0 0 16px;letter-spacing:2px;">${leaf('本文看点')}</p><section style="display:flex;justify-content:space-between;">${sections.slice(0, 3).map((section, index) => `<section style="flex:1;background:#FAFAFA;border-top:1px solid #E4E4E7;padding:18px 12px 16px;${index < 2 ? 'margin-right:8px;' : ''}"><p style="font-size:11px;color:#A1A1AA;font-weight:500;margin:0 0 8px;letter-spacing:1px;">${leaf(String(index + 1).padStart(2, '0'))}</p><p style="font-size:13px;font-weight:700;color:#27272A;margin:0;line-height:1.5;">${leaf(section.title)}</p></section>`).join('')}</section></section>` : '';
  const sectionHtml = sections.map((section, index) => {
    const isLast = index === sections.length - 1 && /(结语|写在最后|最后|总结|结尾|后记)/.test(section.title);
    const number = isLast ? '∞' : String(index + 1).padStart(2, '0');
    const margin = index === 0 ? '16px' : '56px';
    const divider = index ? `<section style="padding:0 10px;"><section style="height:1px;background:#E4E4E7;margin:0;"><span leaf=""><br></span></section></section>` : '';
    const header = `<section style="margin-top:${margin};margin-bottom:32px;padding:0 10px;"><section style="position:relative;padding-bottom:20px;border-bottom:1px solid #E4E4E7;"><p style="font-size:48px;font-weight:900;color:#E4E4E7;margin:0;line-height:1;letter-spacing:-2px;">${leaf(number)}</p><section style="margin-top:-8px;"><p style="font-size:10px;color:#A1A1AA;font-weight:500;letter-spacing:3px;margin:0 0 6px;text-transform:uppercase;">${leaf(englishTag(section.title, isLast))}</p><h3 style="font-size:20px;font-weight:800;color:#27272A;margin:0;letter-spacing:0.5px;line-height:1.4;">${leaf(section.title)}</h3></section></section></section>`;
    return `${divider}${header}<section style="padding:0 10px;">${renderBlocks(section.blocks)}</section>`;
  }).join('');
  const end = `<section style="padding:0 10px;"><section style="text-align:center;margin:0 0 36px;"><section style="display:flex;align-items:center;justify-content:center;"><span style="height:1px;width:48px;background:#E4E4E7;margin-right:16px;"><span leaf=""><br></span></span><span style="font-size:10px;color:#A1A1AA;letter-spacing:4px;font-weight:500;">${leaf('END')}</span><span style="height:1px;width:48px;background:#E4E4E7;margin-left:16px;"><span leaf=""><br></span></span></section></section></section>`;
  const signatureIntro = author && bio ? `<p style="margin-bottom:16px;font-size:15px;line-height:1.8;color:#52525B;text-align:justify;">${leaf(`我是${author}，${bio}。`)}</p>` : '';
  const signature = `<section style="padding:0 10px 24px;"><section style="border-top:1px solid #E4E4E7;padding-top:28px;">${signatureIntro}<p style="margin-bottom:0;font-size:15px;line-height:1.8;color:#52525B;text-align:justify;">${leaf('如果你觉得今天这篇有收获，欢迎')}<strong style="color:#27272A;">${leaf('点赞、在看、转发')}</strong>${leaf('三连，我们下篇见。')}</p></section></section>`;
  const html = `<section style="max-width:677px;margin:0 auto;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#52525B;line-height:1.8;letter-spacing:0.3px;overflow-x:hidden;">${titleBlock}${quoteCard}<section style="padding:0 10px;">${renderBlocks(prefaceWithoutQuote)}</section>${directory}${sectionHtml}${end}${signature}</section>`;
  return { html, title, images: imageList, markdown: normalized };
}

function renderThemedMarkdown(markdown, themeId) {
  const theme = themes[themeId];
  const parsed = parseMarkdown(markdown);
  const { normalized, title, sections, preface, imageList, quote } = parsed;
  const author = $('#authorInput').value.trim();
  const bio = $('#bioInput').value.trim();
  const intro = quote || preface.find((block) => block.type === 'paragraph')?.text || '把经验整理成真正可被反复使用的内容。';
  const isTicket = themeId === 'moyuTicket';
  const isOlive = themeId === 'olive';
  const isZen = themeId === 'zen';
  const isRed = themeId === 'redWhite';
  const isGreen = themeId === 'moyuGreen';
  const themedAuthorLine = author ? `<p style="text-align:right;font-size:12px;color:#9CA3AF;margin:8px 0 0;letter-spacing:1px;">${leaf(`—— ${author}`)}</p>` : '';
  const wrap = (content) => `<section style="max-width:677px;margin:0 auto;${isOlive ? 'padding:8px;background:#FDFDF8;' : 'background:#FFFFFF;'}font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:${theme.body};line-height:1.8;letter-spacing:0.3px;overflow-x:hidden;">${content}</section>`;
  const image = (block) => imagePlaceholder(block.id, block.description);
  const blocks = (items) => items.map((block) => {
    if (block.type === 'paragraph') return paragraph(block.text, theme);
    if (block.type === 'image') return image(block);
    if (block.type === 'quote') return `<section data-sync-key="${syncKey(block.text)}" style="border-left:3px solid ${theme.primary};padding:15px 0 15px 20px;margin:0 10px 26px;"><p style="font-size:15px;font-weight:700;color:${theme.dark};margin:0;line-height:1.8;">${leaf(`「${block.text.replace(/[「」]/g, '')}」`)}</p></section>`;
    if (block.type === 'subheading') return `<p data-sync-key="${syncKey(block.text)}" style="font-size:15px;font-weight:800;color:${theme.dark};margin:26px 0 14px;padding-left:12px;border-left:3px solid ${theme.primary};line-height:1.4;">${renderInline(block.text, false, theme)}</p>`;
    if (block.type === 'list') return `<section style="margin-bottom:24px;">${block.items.map((item, index) => `<section style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:${theme.primary};color:#FFFFFF;font-size:12px;font-weight:700;${isTicket ? 'border-radius:0;' : 'border-radius:50%;'}flex-shrink:0;margin-top:2px;">${leaf(String(index + 1))}</span><p style="font-size:15px;color:${theme.body};margin:0;line-height:1.8;flex:1;">${renderInline(item, true, theme)}</p></section>`).join('')}</section>`;
    return '';
  }).join('');
  const titleWords = title.length > 18 ? [title.slice(0, Math.ceil(title.length / 2)), title.slice(Math.ceil(title.length / 2))] : [title, ''];
  const titleStyle = `font-family:${titleFontFamily()};`;
  const cover = isGreen ? `<section style="margin:0 20px 32px;background:#FFFFFF;border:1.5px solid rgba(5,150,105,0.15);border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);"><section style="padding:28px;"><section style="display:flex;align-items:center;gap:8px;margin-bottom:22px;"><span style="width:6px;height:6px;background:#059669;border-radius:50%;"><span leaf=""><br></span></span><span style="font-size:11px;font-weight:700;letter-spacing:3px;color:#059669;">${leaf('CONTENT NOTE')}</span><span style="flex:1;height:1px;background:linear-gradient(to right,rgba(5,150,105,0.12),transparent);"><span leaf=""><br></span></span></section><p style="${titleStyle}font-size:23px;font-weight:900;color:#111827;margin:0;line-height:1.12;">${leaf(titleWords[0])}</p><p style="${titleStyle}font-size:23px;font-weight:900;color:#059669;margin:0 0 14px;line-height:1.12;">${leaf(titleWords[1] || '从观点到行动')}</p><p style="font-size:13px;color:#6B7280;margin:0;line-height:1.7;">${leaf(intro)}</p></section><section style="background:linear-gradient(135deg,#059669,#10B981);padding:11px 28px;"><p style="font-size:12px;color:#FFFFFF;margin:0;font-weight:600;">${leaf('AI · 内容创作 · 实用方法')}</p></section></section>` : isRed ? `<section style="margin:10px 10px 32px;background:#FFFFFF;border-radius:12px;box-shadow:0 4px 24px -4px rgba(220,38,38,0.15);padding:28px 24px 22px;"><p style="font-size:42px;color:#DC2626;font-weight:900;margin:0;line-height:0.6;">${leaf('“')}</p><p style="font-size:17px;font-weight:800;color:#1C1917;margin:12px 0 8px;line-height:1.75;"><span style="background:#DC2626;color:#FFFFFF;padding:2px 8px;border-radius:4px;">${leaf('核心观点')}</span>${leaf('　')}${renderInline(intro, true, theme)}</p>${themedAuthorLine}</section>` : isZen ? `<section style="padding:52px 28px 40px;text-align:center;"><p style="font-size:10px;color:#8EA092;letter-spacing:4px;margin:0 0 22px;">${leaf('SLOW READING')}</p><h1 style="${titleStyle}font-size:23px;font-weight:600;color:#304037;line-height:1.7;margin:0;">${leaf(title)}</h1><section style="width:34px;height:1px;background:#B5C8BC;margin:24px auto;"><span leaf=""><br></span></section><p style="font-size:15px;color:#65786A;line-height:2;margin:0;">${renderInline(intro, true, theme)}</p>${author ? `<p style="font-size:12px;color:#9AAC9D;margin:24px 0 0;">${leaf(`—— ${author}`)}</p>` : ''}</section>` : isTicket ? `<section style="background:#FFFEF8;border:2px solid #1A1A1A;box-shadow:4px 4px 0 #1A1A1A;margin:0 12px 32px;"><section style="background:#059669;padding:11px 18px;display:flex;justify-content:space-between;"><span style="font-size:11px;color:#FFFFFF;letter-spacing:3px;font-weight:700;">${leaf('CONTENT TICKET')}</span><span style="font-size:11px;color:#FFFFFF;">${leaf('★★★★★')}</span></section><section style="padding:22px 18px;"><p style="${titleStyle}font-size:23px;font-weight:900;color:#1A1A1A;line-height:1.25;margin:0 0 12px;">${leaf(title)}</p><section style="border-top:1px dashed #A7F3D0;margin:0 0 14px;"><span leaf=""><br></span></section><p style="font-size:14px;color:#555;margin:0;line-height:1.8;">${renderInline(intro, true, theme)}</p></section><section style="padding:10px 18px;border-top:2px dashed #A7F3D0;"><span style="font-size:10px;color:#059669;letter-spacing:1px;">${leaf('VALID FOR ONE GOOD READ')}</span></section></section>` : `<section style="background:#FDFDF8;border:1px solid #BFC1B7;border-radius:6px;overflow:hidden;margin:0 0 30px;"><section style="padding:26px 22px 20px;"><section style="display:flex;align-items:center;gap:8px;margin-bottom:20px;"><span style="width:8px;height:8px;background:#1E1F23;border-radius:50%;"><span leaf=""><br></span></span><span style="font-size:10px;font-weight:700;letter-spacing:3px;color:#65675E;">${leaf('FIELD NOTES')}</span><span style="flex:1;height:1px;background:#BFC1B7;"><span leaf=""><br></span></span></section><p style="${titleStyle}font-size:23px;font-weight:800;color:#23251D;line-height:1.25;margin:0 0 12px;">${leaf(title)}</p><p style="font-size:13px;color:#65675E;margin:0;line-height:1.7;">${renderInline(intro, true, theme)}</p></section><section style="background:#1E1F23;padding:11px 22px;"><p style="font-size:12px;color:#FFFFFF;margin:0;font-weight:600;">${leaf('内容复盘 · 方法沉淀')}</p></section></section>`;
  const toc = sections.length >= 2 ? `<section style="margin:0 ${isGreen ? '20px' : '10px'} 30px;"><p style="font-size:11px;color:${theme.primary};letter-spacing:2px;margin:0 0 12px;font-weight:700;">${leaf(isTicket ? 'CONTENTS / 目录' : '本文看点')}</p><section style="display:flex;justify-content:space-between;">${sections.slice(0, 3).map((section, index) => `<section style="flex:1;background:${index === 0 ? theme.primary : theme.light};border:1px solid ${theme.line};${isTicket ? 'box-shadow:2px 2px 0 #1A1A1A;' : 'border-radius:6px;'}padding:12px 9px;${index < Math.min(2, sections.length - 1) ? 'margin-right:7px;' : ''}"><p style="font-size:10px;color:${index === 0 ? '#FFFFFF' : theme.primary};margin:0 0 6px;font-weight:800;">${leaf(`PART ${String(index + 1).padStart(2, '0')}`)}</p><p style="font-size:12px;color:${index === 0 ? '#FFFFFF' : theme.dark};margin:0;font-weight:800;line-height:1.45;">${leaf(section.title)}</p></section>`).join('')}</section></section>` : '';
  const chapter = sections.map((section, index) => {
    const last = index === sections.length - 1 && /(结语|写在最后|最后|总结|结尾|后记)/.test(section.title);
    const no = last ? '∞' : String(index + 1).padStart(2, '0');
    const divider = index ? `<section style="height:1px;background:${theme.line};margin:36px ${isGreen ? '20px' : '10px'} 0;"><span leaf=""><br></span></section>` : '';
    const header = isZen ? `<section style="margin:50px 24px 28px;text-align:center;"><p style="font-size:11px;color:#9AAC9D;letter-spacing:3px;margin:0 0 10px;">${leaf(`PART ${no}`)}</p><h3 style="font-size:20px;font-weight:600;color:#304037;line-height:1.5;margin:0;">${leaf(section.title)}</h3></section>` : isTicket ? `<section style="margin:32px 20px 22px;display:flex;align-items:center;gap:12px;border-bottom:2px solid #1A1A1A;padding-bottom:12px;"><span style="background:#059669;color:#FFFFFF;font-size:12px;font-weight:800;padding:6px 12px;letter-spacing:2px;">${leaf(no)}</span><span style="font-size:18px;font-weight:800;color:#1A1A1A;">${leaf(section.title)}</span></section>` : isOlive ? `<section style="margin:30px 12px 20px;display:flex;align-items:center;gap:14px;"><section style="text-align:center;"><p style="margin:0;font-size:24px;font-weight:800;color:#23251D;line-height:1;">${leaf(no)}</p><p style="margin:0;font-size:8px;font-weight:700;color:#9EA096;letter-spacing:2px;">${leaf('PART')}</p></section><span style="width:1px;height:36px;background:#BFC1B7;"><span leaf=""><br></span></span><section><p style="margin:0;font-size:17px;font-weight:800;color:#23251D;">${leaf(section.title)}</p><p style="margin:2px 0 0;font-size:10px;color:#65675E;letter-spacing:1.2px;">${leaf(englishTag(section.title, last))}</p></section></section>` : `<section style="margin:${index ? '46px' : '16px'} 10px 24px;padding-bottom:14px;border-bottom:${isRed ? '3px' : '2px'} solid ${theme.primary};display:flex;align-items:center;gap:12px;"><span style="display:inline-block;background:${theme.primary};color:#FFFFFF;font-size:17px;font-weight:900;padding:4px 12px;border-radius:${isGreen ? '8px' : '5px'};">${leaf(no)}</span><section><p style="font-size:10px;color:${theme.primary};font-weight:700;letter-spacing:3px;margin:0 0 3px;">${leaf(englishTag(section.title, last))}</p><h3 style="font-size:18px;font-weight:800;color:${theme.dark};margin:0;line-height:1.4;">${leaf(section.title)}</h3></section></section>`;
    return `${divider}${header}<section style="padding:0 ${isGreen ? '20px' : isZen ? '24px' : '10px'};">${blocks(section.blocks)}</section>`;
  }).join('');
  const themedSignatureIntro = author && bio ? `<p style="margin:0 0 14px;font-size:14px;color:${theme.body};line-height:1.8;">${leaf(`我是${author}，${bio}。`)}</p>` : '';
  const signature = `<section style="margin:40px ${isGreen ? '20px' : '10px'} 0;padding:24px 0;border-top:1px solid ${theme.line};">${themedSignatureIntro}<p style="margin:0;font-size:14px;color:${theme.body};line-height:1.8;">${leaf('如果你觉得今天这篇有收获，欢迎')}<strong style="color:${theme.dark};">${leaf('点赞、在看、转发')}</strong>${leaf('三连，我们下篇见。')}</p></section>`;
  const end = `<section style="text-align:center;margin:38px 0 32px;"><span style="font-size:10px;color:${theme.primary};letter-spacing:4px;font-weight:700;">${leaf(isTicket ? 'ADMIT ONE' : 'END')}</span></section>`;
  return { html: wrap(`${cover}<section style="padding:0 ${isOlive ? '12px' : '0'};">${blocks(preface.filter((item) => item.type !== 'quote'))}</section>${toc}${chapter}${end}${signature}`), title, images: imageList, markdown: normalized };
}

function renderMarkdown(markdown) {
  return state.theme === 'graphite' ? renderGraphite(markdown) : renderThemedMarkdown(markdown, state.theme);
}

function updateGenerationState() {
  const label = state.generationMode === 'ai'
    ? '已完成 AI 改写：当前正文已按公众号文章结构生成'
    : state.generationMode === 'direct'
      ? '当前为仅排版：正文未经过 AI 改写'
      : '当前未生成公众号文章';
  $('#generationState').textContent = label;
  $('#generationState').dataset.mode = state.generationMode;
}

function updateStats() { $('#articleStats').textContent = `${$('#markdownInput').value.replace(/\s/g, '').length} 字`; }

function updatePreview() {
  state.renderMode = 'preview';
  const result = renderMarkdown($('#markdownInput').value);
  const activeImageIds = new Set(result.images.map((image) => image.id));
  Object.keys(state.images).forEach((id) => { if (!activeImageIds.has(id)) delete state.images[id]; });
  state.current = result;
  $('#articlePreview').srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;">${result.html}</body></html>`;
  $('#previewThemeName').textContent = themes[state.theme].name;
  $('#railThemeName').textContent = themes[state.theme].name;
  $('#validationState').textContent = result.markdown ? '可复制' : '等待内容';
  $('#validationState').className = `validation${result.markdown ? ' good' : ''}`;
  renderImageSlots(result.images);
  updateStats();
  updateGenerationState();
  persist();
}

function renderImageSlots(images) {
  if (!images.length) { $('#imageSlots').innerHTML = '<div class="empty-inline">生成文章后，这里会出现对应的插图位置。</div>'; return; }
  $('#imageSlots').innerHTML = images.map(({ id, description }) => `<div class="image-slot"><div class="slot-thumb">${state.images[id] ? `<img src="${state.images[id]}" alt="">` : '占位'}</div><div class="slot-copy"><strong>${id}</strong><input class="image-description-input" type="text" data-description-id="${id}" value="${escapeHtml(description)}" aria-label="${id} 图片说明"><label class="caption-toggle"><input type="checkbox" data-caption-id="${id}" ${state.imageCaptions[id] ? 'checked' : ''}>复制说明</label></div><label class="upload-button">${state.images[id] ? '更换图片' : '上传图片'}<input type="file" accept="image/*" data-image-id="${id}"></label></div>`).join('');
  $('#imageSlots').querySelectorAll('input[type=file]').forEach((input) => input.addEventListener('change', (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    readImageFile(file, input.dataset.imageId, false);
  }));
  $('#imageSlots').querySelectorAll('.image-description-input').forEach((input) => input.addEventListener('change', () => updateImageDescription(input.dataset.descriptionId, input.value)));
  $('#imageSlots').querySelectorAll('[data-caption-id]').forEach((input) => input.addEventListener('change', () => { state.imageCaptions[input.dataset.captionId] = input.checked; updatePreview(); }));
}

function nextImageId() {
  const used = [...$('#markdownInput').value.matchAll(/\[\[IMAGE:\s*P(\d+)/gi)].map((match) => Number(match[1]));
  return `P${String((used.length ? Math.max(...used) : 0) + 1).padStart(2, '0')}`;
}

function readImageFile(file, id, insertPlaceholder) {
  if (!file?.type?.startsWith('image/')) return showToast('只能插入图片文件。');
  const reader = new FileReader();
  reader.onload = () => {
    state.images[id] = reader.result;
    if (insertPlaceholder) insertAtCursor($('#markdownInput'), `\n\n[[IMAGE: ${id} | 待补图片说明]]\n\n`);
    updatePreview();
    showToast(`${id} 已插入文章。`);
  };
  reader.readAsDataURL(file);
}

function updateImageDescription(id, description) {
  const editor = $('#markdownInput');
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\[\\[IMAGE:\\s*${escapedId}\\s*\\|\\s*)[^\\]]*(\\]\\])`, 'i');
  if (!pattern.test(editor.value)) return;
  editor.value = editor.value.replace(pattern, `$1${description.trim() || '待补图片说明'}$2`);
  updatePreview();
}

function insertAtCursor(element, value) {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  element.setRangeText(value, start, end, 'end');
  element.focus();
}

function markSelection(prefix, suffix = prefix) {
  const editor = $('#markdownInput');
  const start = editor.selectionStart; const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  if (!selected.trim()) return showToast('请先在正文里选中需要标记的文字。');
  editor.setRangeText(`${prefix}${selected}${suffix}`, start, end, 'select');
  updatePreview();
}

function clearSelectionMarks() {
  const editor = $('#markdownInput'); const start = editor.selectionStart; const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  if (!selected.trim()) return showToast('请先选中需要清除标记的文字。');
  const plain = selected.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1').replace(/\+\+(.+?)\+\+/g, '$1');
  editor.setRangeText(plain, start, end, 'select');
  updatePreview();
}

function imageFileFromTransfer(dataTransfer) {
  return [...(dataTransfer?.items || [])].find((item) => item.type.startsWith('image/'))?.getAsFile() || null;
}

function insertPastedImage(file) {
  const editor = $('#markdownInput');
  if (document.activeElement !== editor && state.lastEditorSelection) {
    editor.focus();
    editor.setSelectionRange(state.lastEditorSelection.start, state.lastEditorSelection.end);
  }
  readImageFile(file, nextImageId(), true);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: $('#titleInput').value, author: $('#authorInput').value, bio: $('#bioInput').value, markdown: $('#markdownInput').value, images: state.images, imageCaptions: state.imageCaptions, generationMode: state.generationMode, theme: state.theme, titleFont: state.titleFont, bodySize: state.bodySize, skin: state.skin, studioName: state.studioName, studioTagline: state.studioTagline, studioAvatar: state.studioAvatar }));
  $('#saveState').textContent = '已自动保存';
}

function getModelSettings() {
  try { return JSON.parse(localStorage.getItem(MODEL_SETTINGS_KEY) || sessionStorage.getItem(MODEL_SETTINGS_KEY) || '{}'); } catch { return {}; }
}

function saveModelSettings(settings, remember) {
  sessionStorage.setItem(MODEL_SETTINGS_KEY, JSON.stringify(settings));
  if (remember) localStorage.setItem(MODEL_SETTINGS_KEY, JSON.stringify(settings));
  else localStorage.removeItem(MODEL_SETTINGS_KEY);
}

function getHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(history) ? history : [];
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

function createHistorySnapshot() {
  const markdown = $('#markdownInput').value.trim();
  if (!markdown || state.generationMode === 'none') return;
  const title = $('#titleInput').value.trim() || deriveTitle(markdown);
  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(), title, source: $('#sourceInput').value,
    author: $('#authorInput').value, bio: $('#bioInput').value, markdown, theme: state.theme,
    titleFont: state.titleFont, bodySize: state.bodySize, generationMode: state.generationMode,
  };
  const history = getHistory().filter((item) => item.markdown !== snapshot.markdown);
  history.unshift(snapshot);
  saveHistory(history);
}

function formatHistoryTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function renderHistory() {
  const history = getHistory();
  const list = $('#historyList');
  if (!history.length) {
    list.innerHTML = '<div class="history-empty">还没有历史文章。完成一次 AI 改写或仅排版后，会自动保存在这里。</div>';
    return;
  }
  list.innerHTML = history.map((item) => `<article class="history-item"><div class="history-item-main"><strong>${escapeHtml(item.title || '未命名文章')}</strong><span>${formatHistoryTime(item.createdAt)} · ${item.generationMode === 'ai' ? 'AI 改写' : '仅排版'} · ${escapeHtml(themes[item.theme]?.name || '石墨极简')}</span></div><div class="history-item-actions"><button class="button quiet" type="button" data-history-restore="${item.id}">恢复</button><button class="button quiet danger-button" type="button" data-history-delete="${item.id}">删除</button></div></article>`).join('');
}

function restoreHistory(id) {
  const item = getHistory().find((entry) => entry.id === id);
  if (!item) return showToast('这条历史记录已不存在。');
  $('#titleInput').value = item.title || '';
  $('#sourceInput').value = item.source || '';
  $('#authorInput').value = item.author || '';
  $('#bioInput').value = item.bio || '';
  $('#markdownInput').value = item.markdown || '';
  state.theme = themes[item.theme] ? item.theme : 'graphite';
  state.titleFont = item.titleFont || 'sans';
  state.bodySize = item.bodySize || 'recommended';
  state.generationMode = ['ai', 'direct'].includes(item.generationMode) ? item.generationMode : 'none';
  state.images = {}; state.imageCaptions = {};
  document.querySelectorAll('.theme-card').forEach((card) => {
    const active = card.dataset.theme === state.theme;
    card.classList.toggle('selected', active); card.setAttribute('aria-pressed', String(active));
  });
  setControlButtons('#titleFontControl', 'data-title-font', state.titleFont);
  setControlButtons('#bodySizeControl', 'data-body-size', state.bodySize);
  $('#themeDescription').textContent = themes[state.theme].description;
  updatePreview();
  $('#historyDialog').close();
  $('#article').scrollIntoView({ behavior: 'smooth' });
  showToast('已恢复历史文章，图片需重新上传。');
}

function deleteHistory(id) {
  saveHistory(getHistory().filter((item) => item.id !== id));
  renderHistory();
  showToast('历史记录已删除。');
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (!saved) return false;
    $('#titleInput').value = saved.title || ''; $('#authorInput').value = saved.author || ''; $('#bioInput').value = saved.bio || ''; $('#markdownInput').value = saved.markdown || ''; Object.assign(state.images, saved.images || {}); Object.assign(state.imageCaptions, saved.imageCaptions || {}); state.generationMode = ['ai', 'direct'].includes(saved.generationMode) ? saved.generationMode : 'none'; state.theme = themes[saved.theme] ? saved.theme : 'graphite'; state.titleFont = 'sans'; state.bodySize = 'recommended'; state.skin = ['graphite', 'mint', 'atelier'].includes(saved.skin) ? saved.skin : 'graphite'; state.studioName = saved.studioName === '你的创作工作台' ? '公众号文章' : (saved.studioName || '公众号文章'); state.studioTagline = saved.studioTagline === '把想法整理成作品' ? '一键排版·复制' : (saved.studioTagline || '一键排版·复制'); state.studioAvatar = saved.studioAvatar || ''; return Boolean(saved.markdown);
  } catch { return false; }
}

function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200); }

function setConnectionResult(message = '', type = '') {
  const result = $('#connectionResult');
  result.textContent = message;
  result.hidden = !message;
  result.dataset.state = type;
}

async function copyArticle() {
  state.renderMode = 'copy';
  const clean = renderMarkdown($('#markdownInput').value);
  const html = clean.html; const text = html.replace(/<[^>]+>/g, '');
  state.renderMode = 'preview';
  if (!html) return showToast('请先生成文章。');
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    else { await navigator.clipboard?.writeText(text); }
    showToast('已复制，打开公众号编辑器直接粘贴即可。');
  } catch { showToast('复制失败，请在预览区域右键全选复制。'); }
}

function download(filename, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }

async function generateAI() {
  const source = $('#sourceInput').value.trim(); if (!source) return showToast('请先粘贴口播稿。');
  const settings = getModelSettings();
  if (!settings.key || !settings.endpoint || !settings.model) {
    $('#settingsButton').click();
    return showToast('请先完成模型设置，再进行 AI 改写。');
  }
  $('#generateButton').disabled = true; $('#generateButton').textContent = '生成中…';
  try {
    const response = await fetch('/api/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, title: $('#titleInput').value, author: $('#authorInput').value, intro: $('#bioInput').value, api: settings }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '生成失败');
    $('#markdownInput').value = data.markdown; state.generated = true; state.generationMode = 'ai'; createHistorySnapshot(); updatePreview(); showToast('已完成 AI 改写并排版，可以继续编辑和上传插图。'); $('#article').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { showToast(error.message); } finally { $('#generateButton').disabled = false; $('#generateButton').textContent = 'AI 改写后排版'; }
}

function directFormat() { const source = $('#sourceInput').value.trim(); if (!source) return showToast('请先粘贴口播稿。'); const title = $('#titleInput').value.trim() || '从口播稿整理出的公众号文章'; const paragraphs = source.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean); $('#markdownInput').value = `# ${title}\n\n${paragraphs.map((item, index) => index === 0 ? `> ${item}` : item).join('\n\n')}`; state.generationMode = 'direct'; createHistorySnapshot(); updatePreview(); showToast('已完成原稿排版，正文未经过 AI 改写。'); }

function providerInfo(provider) {
  return provider === 'dadaapi'
    ? { endpoint: 'https://dadaapi.com/v1', model: 'gpt-5.6-terra', hint: '哒哒 API 使用：默认模型为 gpt-5.6-terra，鉴权方式为 Bearer API Key。' }
    : provider === 'custom'
      ? { endpoint: '', model: '', hint: '自定义 API：填写兼容 OpenAI Chat Completions 的接口根地址、模型名和 API Key。' }
      : { endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', hint: 'OpenAI API：填写接口根地址、模型名和 API Key。' };
}

function updateProviderPreset(overwrite = false) {
  const info = providerInfo($('#providerInput').value);
  if ($('#providerInput').value === 'custom') {
    if (overwrite) $('#endpointInput').value = '';
  } else if (overwrite || !$('#endpointInput').value.trim()) $('#endpointInput').value = info.endpoint;
  if (overwrite && info.model) $('#modelInput').value = info.model;
  $('#connectionHint').textContent = info.hint;
  setConnectionResult();
}

function getSettings() {
  return { provider: $('#providerInput').value, endpoint: $('#endpointInput').value.trim(), model: $('#modelInput').value.trim(), key: $('#keyInput').value.trim() };
}

$('#settingsButton').addEventListener('click', () => {
  const saved = getModelSettings();
  $('#providerInput').value = saved.provider || (String(saved.endpoint || '').includes('dadaapi.com') ? 'dadaapi' : 'openai');
  $('#endpointInput').value = saved.endpoint || providerInfo($('#providerInput').value).endpoint;
  $('#modelInput').value = saved.model || providerInfo($('#providerInput').value).model || ''; $('#keyInput').value = saved.key || '';
  $('#rememberSettingsInput').checked = Boolean(localStorage.getItem(MODEL_SETTINGS_KEY));
  setConnectionResult();
  updateProviderPreset(false); $('#settingsDialog').showModal();
});
function openHistory() { renderHistory(); $('#historyDialog').showModal(); }
$('#historyButton').addEventListener('click', openHistory);
$('#historyButtonInline').addEventListener('click', openHistory);
$('#historyList').addEventListener('click', (event) => {
  const restoreButton = event.target.closest('[data-history-restore]');
  const deleteButton = event.target.closest('[data-history-delete]');
  if (restoreButton) restoreHistory(restoreButton.dataset.historyRestore);
  if (deleteButton) deleteHistory(deleteButton.dataset.historyDelete);
});
$('#saveCurrentHistory').addEventListener('click', () => { createHistorySnapshot(); renderHistory(); showToast('当前版本已保存到历史记录。'); });
$('#clearHistory').addEventListener('click', () => {
  if (!window.confirm('确定清空全部历史记录吗？此操作无法恢复。')) return;
  localStorage.removeItem(HISTORY_KEY); renderHistory(); showToast('已清空全部历史记录。');
});
$('#appearanceButton').addEventListener('click', () => {
  $('#studioNameInput').value = state.studioName;
  $('#studioTaglineInput').value = state.studioTagline;
  applyStudioIdentity();
  $('#appearanceDialog').showModal();
});
$('#identityCard').addEventListener('click', () => $('#appearanceButton').click());
$('#skinGrid').addEventListener('click', (event) => {
  const card = event.target.closest('[data-skin]');
  if (!card) return;
  state.skin = card.dataset.skin;
  applyStudioIdentity();
  persistAppearance();
});
['studioNameInput', 'studioTaglineInput'].forEach((id) => $(`#${id}`).addEventListener('input', () => {
  if (id === 'studioNameInput') state.studioName = $(`#${id}`).value.trim() || '公众号文章';
  if (id === 'studioTaglineInput') state.studioTagline = $(`#${id}`).value.trim() || '一键排版·复制';
  applyStudioIdentity();
  persistAppearance();
}));
$('#studioAvatarInput').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file?.type?.startsWith('image/')) return;
  compactAvatar(file).then((avatar) => {
    state.studioAvatar = avatar;
    applyStudioIdentity();
    if (persistAppearance()) showToast('头像已保存，会在此浏览器中自动恢复。');
  }).catch(() => showToast('头像读取失败，请换一张图片后重试。'));
});
$('#saveAppearance').addEventListener('click', () => {
  if (persistAppearance()) showToast('工作台外观已保存。');
});
$('#providerInput').addEventListener('change', () => updateProviderPreset(true));
$('#saveSettings').addEventListener('click', () => {
  saveModelSettings(getSettings(), $('#rememberSettingsInput').checked);
  showToast($('#rememberSettingsInput').checked ? '模型设置已保存在当前设备。' : '模型设置仅保留在本次会话。');
});
$('#clearSettings').addEventListener('click', () => {
  localStorage.removeItem(MODEL_SETTINGS_KEY); sessionStorage.removeItem(MODEL_SETTINGS_KEY);
  $('#keyInput').value = ''; $('#rememberSettingsInput').checked = false;
  showToast('已删除本机保存的模型设置和密钥。');
});
$('#testConnection').addEventListener('click', async () => {
  const button = $('#testConnection'); const settings = getSettings();
  if (!settings.key) return setConnectionResult('请先填写 API Key，再测试连接。', 'error');
  button.disabled = true; button.textContent = '测试中…';
  setConnectionResult('正在测试连接，请稍候…', 'loading');
  try {
    const response = await fetch('/api/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api: settings }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '连接失败');
    const modelNote = data.models?.length ? `可用模型：${data.models.slice(0, 4).join('、')}` : '接口连接成功。';
    setConnectionResult(`连接成功。${modelNote}`, 'success');
  } catch (error) { setConnectionResult(error.message || '连接失败，请检查配置后重试。', 'error'); } finally { button.disabled = false; button.textContent = '测试连接'; }
});
$('#sampleButton').addEventListener('click', () => { $('#sourceInput').value = sampleSource; if (!$('#titleInput').value) $('#titleInput').value = '在这里开始你的公众号文章'; showToast('已加载通用示例口播稿。'); });
$('#formatButton').addEventListener('click', directFormat); $('#generateButton').addEventListener('click', generateAI); $('#applyButton').addEventListener('click', () => { updatePreview(); showToast('排版已更新。'); }); $('#copyButton').addEventListener('click', copyArticle); $('#copyButtonSecondary').addEventListener('click', copyArticle);
$('#downloadMarkdown').addEventListener('click', () => download('wechat-article.md', $('#markdownInput').value, 'text/markdown;charset=utf-8')); $('#downloadHtml').addEventListener('click', () => { if (!state.current) updatePreview(); download('wechat-article.html', state.current.html, 'text/html;charset=utf-8'); });
['titleInput', 'authorInput', 'bioInput', 'markdownInput'].forEach((id) => $(`#${id}`).addEventListener('input', () => updatePreview()));
$('#boldTool').addEventListener('click', () => markSelection('**'));
$('#underlineTool').addEventListener('click', () => markSelection('++'));
$('#highlightTool').addEventListener('click', () => markSelection('=='));
$('#clearMarkTool').addEventListener('click', clearSelectionMarks);
$('#markdownInput').addEventListener('paste', (event) => {
  const file = imageFileFromTransfer(event.clipboardData);
  if (!file) return;
  event.preventDefault();
  insertPastedImage(file);
});

$('#markdownInput').addEventListener('select', () => { state.lastEditorSelection = { start: $('#markdownInput').selectionStart, end: $('#markdownInput').selectionEnd }; });
$('#markdownInput').addEventListener('keyup', () => { state.lastEditorSelection = { start: $('#markdownInput').selectionStart, end: $('#markdownInput').selectionEnd }; });
$('#markdownInput').addEventListener('click', () => { state.lastEditorSelection = { start: $('#markdownInput').selectionStart, end: $('#markdownInput').selectionEnd }; });
$('#markdownInput').addEventListener('mouseup', syncPreviewToCursor);
$('#markdownInput').addEventListener('keyup', syncPreviewToCursor);
$('#markdownInput').addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); markSelection('**'); }
});

['paste', 'drop'].forEach((eventName) => $('#imagePasteTarget').addEventListener(eventName, (event) => {
  if (eventName === 'drop') event.preventDefault();
  const file = imageFileFromTransfer(eventName === 'paste' ? event.clipboardData : event.dataTransfer);
  if (!file) return;
  if (eventName === 'paste') event.preventDefault();
  insertPastedImage(file);
}));
$('#imagePasteTarget').addEventListener('dragover', (event) => { event.preventDefault(); $('#imagePasteTarget').classList.add('dragging'); });
$('#imagePasteTarget').addEventListener('dragleave', () => $('#imagePasteTarget').classList.remove('dragging'));
$('#imagePasteTarget').addEventListener('drop', () => $('#imagePasteTarget').classList.remove('dragging'));
$('#imagePasteTarget').addEventListener('click', () => { $('#markdownInput').focus(); showToast('把光标放到正文位置后，直接粘贴截图即可。'); });

function setControlButtons(containerSelector, dataName, value) {
  document.querySelectorAll(`${containerSelector} [${dataName}]`).forEach((button) => {
    const active = button.getAttribute(dataName) === value;
    button.setAttribute('aria-pressed', String(active));
  });
}

$('#titleFontControl').addEventListener('click', (event) => {
  const button = event.target.closest('[data-title-font]'); if (!button) return;
  state.titleFont = button.dataset.titleFont; setControlButtons('#titleFontControl', 'data-title-font', state.titleFont); updatePreview();
});
$('#bodySizeControl').addEventListener('click', (event) => {
  const button = event.target.closest('[data-body-size]'); if (!button) return;
  state.bodySize = button.dataset.bodySize; setControlButtons('#bodySizeControl', 'data-body-size', state.bodySize); updatePreview();
});

function syncPreviewToCursor() {
  const editor = $('#markdownInput');
  const before = editor.value.slice(0, editor.selectionStart || 0);
  const currentLine = before.split(/\n/).pop()?.trim() || '';
  const key = syncKey(currentLine);
  if (!key) return;
  const frame = $('#articlePreview');
  const doc = frame.contentDocument;
  const target = doc?.querySelector(`[data-sync-key="${CSS.escape(key)}"]`);
  if (!target) return;
  doc.querySelectorAll('[data-sync-active]').forEach((node) => { node.removeAttribute('data-sync-active'); node.style.outline = ''; node.style.outlineOffset = ''; });
  target.setAttribute('data-sync-active', 'true');
  target.style.outline = '2px solid #FFE37A';
  target.style.outlineOffset = '5px';
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

$('#themeGrid').addEventListener('click', (event) => {
  const card = event.target.closest('[data-theme]');
  if (!card) return;
  state.theme = card.dataset.theme;
  document.querySelectorAll('.theme-card').forEach((item) => { const active = item === card; item.classList.toggle('selected', active); item.setAttribute('aria-pressed', String(active)); });
  $('#themeDescription').textContent = themes[state.theme].description;
  updatePreview();
  showToast(`已切换为${themes[state.theme].name}。`);
});

const hasSaved = restore();
const hasDedicatedAppearance = restoreAppearance();
if (!hasDedicatedAppearance) persistAppearance();
applyStudioIdentity();
document.querySelectorAll('.theme-card').forEach((item) => { const active = item.dataset.theme === state.theme; item.classList.toggle('selected', active); item.setAttribute('aria-pressed', String(active)); });
setControlButtons('#titleFontControl', 'data-title-font', state.titleFont);
setControlButtons('#bodySizeControl', 'data-body-size', state.bodySize);
$('#themeDescription').textContent = themes[state.theme].description;
if (!hasSaved) {
  $('#titleInput').value = '在这里开始你的公众号文章';
  $('#markdownInput').value = '# 在这里开始你的公众号文章\n\n> 这是一篇公众号文章示例。\n\n把口播稿粘贴到左侧，开始生成你的公众号文章。';
}
updatePreview();
