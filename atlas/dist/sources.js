import { label } from './types.js';
/** 等级：原始 / 二手 / 三手（data 里写作 primary / secondary / tertiary） */
export const TIER_ZH = {
    primary: '原始',
    secondary: '二手',
    tertiary: '三手',
};
/** 出处类型 */
export const KIND_ZH = {
    book: '书',
    wiki: '维基',
    web: '网络',
    map: '地图',
    other: '资料',
};
/** 书名加《》，维基条目与网页用原名；没有标题就退回 id */
export function sourceTitle(s) {
    if (!s)
        return '';
    const t = label(s.title) || s.id.replace(/^source\./, '');
    if (s.kind === 'book' && !t.startsWith('《'))
        return `《${t}》`;
    return t;
}
/** 一行注记：作者 · 年份 · 等级 */
export function sourceNote(s) {
    if (!s)
        return '';
    const bits = [];
    const a = label(s.author);
    if (a)
        bits.push(a);
    if (s.date)
        bits.push(String(s.date));
    const tier = TIER_ZH[s.tier || ''];
    if (tier)
        bits.push(tier);
    return bits.join(' · ');
}
/** 出处类型的中文名，没有就空串 */
export function sourceKind(s) {
    return KIND_ZH[s?.kind || ''] || '';
}
/** 把一批 ref 解析成 source 实体（丢弃找不到的；解析不到的由 validate 报错，这里不抛） */
export function resolveSources(refs, bySource) {
    return (refs || []).map((r) => bySource.get(r.ref)).filter((s) => !!s);
}
