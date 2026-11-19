import { toHans } from './hans.js';
import { label } from './types.js';
const TEXT_CACHE = new WeakMap();
/** 参与匹配的标签文字（各语言）；别名单独算，得分低一档 */
function textsOf(e) {
    const cached = TEXT_CACHE.get(e);
    if (cached)
        return cached;
    const out = [];
    for (const t of Object.values(e.labels || {}))
        if (t)
            out.push(String(t));
    TEXT_CACHE.set(e, out);
    return out;
}
/** 这些键不参与正文检索：名称/别名已单独处理，其余是分类与机器字段 */
const SKIP = new Set([
    'id', 'type', 'labels', 'aliases', 'sources', 'time', 'tags', 'category', 'placeType',
    'sector', 'medium', 'kind', 'role', 'order', 'scope', 'polity', 'src', 'rights',
    'geometry', 'coordinates', 'ref', 'width', 'height',
]);
/** 字段路径 → 中文名（只取认识的层，拼成「条约 · 条款」） */
const PATH_ZH = {
    summary: '摘要',
    hazard: '灾祸',
    treaty: '条约',
    port: '口岸',
    relations: '关系',
    points: '地名',
    sections: '章节',
    memberNote: '专题注记',
    metrics: '数据',
    caption: '图注',
    provenance: '来源',
    question: '导读',
    denomination: '面额',
    response: '赈济',
    deaths: '死亡估计',
    privileges: '条款',
    ceded: '割地',
    ports: '口岸',
    title: '标题',
    note: '注记',
    text: '正文',
};
const whereOf = (path) => {
    const parts = path.filter((p) => !/^\d+$/.test(p));
    const zh = parts.map((p) => PATH_ZH[p]).filter(Boolean);
    return zh.length ? zh.join(' · ') : '正文';
};
const isTextObject = (v) => {
    const o = v;
    return typeof o['zh-Hans'] === 'string' || typeof o['zh-Hant'] === 'string' || typeof o.en === 'string';
};
function walk(value, path, out) {
    if (value == null)
        return;
    if (typeof value === 'string') {
        if (value.trim())
            out.push({ summary: path.length === 1 && path[0] === 'summary', where: whereOf(path), text: value });
        return;
    }
    if (Array.isArray(value)) {
        for (const v of value)
            walk(v, path, out);
        return;
    }
    if (typeof value !== 'object')
        return;
    if (isTextObject(value)) {
        for (const v of Object.values(value)) {
            if (typeof v === 'string' && v.trim()) {
                out.push({ summary: path.length === 1 && path[0] === 'summary', where: whereOf(path), text: v });
            }
        }
        return;
    }
    for (const [k, v] of Object.entries(value)) {
        if (SKIP.has(k))
            continue;
        walk(v, [...path, k], out);
    }
}
const SEGMENT_CACHE = new WeakMap();
/** 实体里所有可搜的文字（不含名称/别名/id）：按需展开一次 */
function segmentsOf(e) {
    const cached = SEGMENT_CACHE.get(e);
    if (cached)
        return cached;
    const out = [];
    walk(e, [], out);
    SEGMENT_CACHE.set(e, out);
    return out;
}
/**
 * 忽略空白的匹配：用户搜「1933年黄河大水」时不该因为标题写成「1933 年」而落空。
 * 中文里数字与「年/月/日」之间通常不空格，库里却按排版规范加了空格——
 * 这一层把两边的空白都去掉再比，命中后仍要回到原文取下标（见 looseIndex）。
 */
const compact = (s) => s.replace(/\s+/g, '').toLowerCase();
/** 在原文里定位「忽略空白」匹配的起始下标；找不到返回 -1 */
function looseIndex(text, q) {
    const cq = compact(q);
    if (!cq)
        return -1;
    const ci = compact(text).indexOf(cq);
    if (ci < 0)
        return -1;
    let seen = 0;
    for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i]))
            continue;
        if (seen === ci)
            return i;
        seen++;
    }
    return -1;
}
/** 文本是否包含查询（先按原样比，落空再忽略空白比一次） */
const contains = (text, q) => {
    if (!text)
        return false;
    if (text.toLowerCase().includes(q))
        return true;
    const cq = compact(q);
    return cq.length > 0 && compact(text).includes(cq);
};
const scoreField = (value, q) => {
    if (!value)
        return 0;
    const v = value.toLowerCase();
    if (v === q)
        return 100;
    if (v.startsWith(q))
        return 80;
    if (v.includes(q))
        return 55;
    // 忽略空白的近似命中：比「包含」低一档，免得把「1933年」和「1933 年」排到精确命中前面
    if (contains(value, q) && compact(v) === compact(q))
        return 90;
    if (contains(value, q))
        return 50;
    return 0;
};
const scoreAlias = (value, q) => {
    const s = scoreField(value, q);
    return s ? s * 0.85 : 0;
};
/** 截一段命中附近的文字，太长就省略两端 */
function snippet(text, q) {
    let i = text.toLowerCase().indexOf(q);
    if (i < 0)
        i = looseIndex(text, q);
    if (i < 0)
        return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    const start = Math.max(0, i - 16);
    const end = Math.min(text.length, i + q.length + 34);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
export function searchEntities(entities, query, filter = {}, limit = 40) {
    // 繁体输入先归一成简体（§4.382）：「南京條約」也能搜到「南京条约」
    const q = toHans(query.trim().toLowerCase());
    if (!q)
        return [];
    const types = filter.types && filter.types.length ? new Set(filter.types) : null;
    const cats = filter.categories && filter.categories.length ? new Set(filter.categories) : null;
    const hits = [];
    for (const e of entities) {
        if (types && !types.has(e.type))
            continue;
        if (cats && !(e.type === 'event' && cats.has(e.category || 'other')))
            continue;
        let best = { entity: e, score: 0, field: 'label', text: '' };
        for (const t of textsOf(e)) {
            const s = scoreField(t, q);
            if (s > best.score)
                best = { entity: e, score: s, field: 'label', text: t };
        }
        for (const a of e.aliases || []) {
            for (const t of Object.values(a || {})) {
                const s = scoreAlias(String(t), q);
                if (s > best.score)
                    best = { entity: e, score: s, field: 'alias', text: String(t) };
            }
        }
        // 名称/别名没有命中时才翻摘要与正文，省掉大部分字符串比较
        if (best.score < 45) {
            const segs = segmentsOf(e);
            const summary = segs.find((s) => s.summary && contains(s.text, q));
            if (summary) {
                best = { entity: e, score: 25, field: 'summary', text: summary.text };
            }
            else {
                const body = segs.find((s) => !s.summary && contains(s.text, q));
                if (body)
                    best = { entity: e, score: 12, field: 'body', text: snippet(body.text, q), where: body.where };
                else if (contains(e.id, q))
                    best = { entity: e, score: 15, field: 'id', text: e.id };
            }
        }
        if (best.score > 0)
            hits.push(best);
    }
    hits.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        const ya = a.entity.time ? Number(String(a.entity.time.at ?? a.entity.time.start).slice(0, 4)) : 9999;
        const yb = b.entity.time ? Number(String(b.entity.time.at ?? b.entity.time.start).slice(0, 4)) : 9999;
        if (ya !== yb)
            return ya - yb;
        const la = label(a.entity.labels).length;
        const lb = label(b.entity.labels).length;
        if (la !== lb)
            return la - lb;
        return a.entity.id.localeCompare(b.entity.id);
    });
    return hits.slice(0, limit);
}
export function countByType(hits) {
    const m = new Map();
    for (const h of hits)
        m.set(h.entity.type, (m.get(h.entity.type) || 0) + 1);
    return [...m.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}
/**
 * 搜不到时的「相近条目」：不靠编辑距离，靠**二字组重合**。
 * 中文没有词边界，把查询拆成相邻两字的片段，看条目的名称/别名/标签里能重合几个——
 * 「南京条约」搜不到时，能给出《南京条约》相关的事件与人物；「道光皇帝」能给出道光帝。
 * 只作兜底：条数少、门槛低（≥1 个片段），宁可给几条相关的，也别让读者对着一屏空白。
 */
export function suggestSimilar(entities, query, limit = 5) {
    const q = compact(toHans(query));
    if (q.length < 2)
        return [];
    const grams = [];
    for (let i = 0; i < q.length - 1; i++)
        grams.push(q.slice(i, i + 2));
    const seen = new Set(grams);
    const scored = [];
    for (const e of entities) {
        const hay = compact([label(e.labels), ...(e.aliases || []).map((a) => label(a)), ...(e.tags || [])].join(' '));
        let n = 0;
        for (const g of seen)
            if (hay.includes(g))
                n++;
        if (n)
            scored.push({ e, n });
    }
    scored.sort((a, b) => b.n - a.n || label(a.e.labels).length - label(b.e.labels).length);
    return scored.slice(0, limit).map((x) => x.e);
}
/** 把「类型/事件类别」下拉的值翻译成过滤条件。 */
export function parseFilter(value) {
    if (!value || value === 'all')
        return {};
    if (value.startsWith('type:'))
        return { types: [value.slice(5)] };
    if (value.startsWith('cat:'))
        return { types: ['event'], categories: [value.slice(4)] };
    return {};
}
