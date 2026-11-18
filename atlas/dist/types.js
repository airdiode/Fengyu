/** 新架构 v1.1 的运行期类型（与 新架构/schema.ts 保持同构，只保留 MVP 用到的部分）。 */
export const label = (t, lang = 'zh-Hans') => (t && (t[lang] || t['zh-Hans'] || t.en)) || '';
/** 实体起止年（浮点），用于时间过滤。 */
/**
 * 逐段行程：某一段在当年是否算「在用」。
 * 带 time 的段只在自己的区间内画/标，不带的一直算（普通铁路、战线都走这条）。
 * 达赖出走库伦那种一到五年的行程，靠它一年只露一段。
 */
export function lineActiveAt(line, year) {
    const t = line.time;
    if (!t)
        return true;
    const y = (s) => {
        const m = /^(-?\d+)/.exec(s || '');
        return m ? Number(m[1]) : NaN;
    };
    const a = y(t.at ?? t.start);
    if (!Number.isFinite(a))
        return true;
    const b = t.at ? a : y(t.end ?? t.start);
    return year >= a - 0.5 && year <= (Number.isFinite(b) ? b : a) + 0.5;
}
export function spanOf(e) {
    const t = e.time;
    if (!t)
        return null;
    const parse = (s) => {
        if (!s)
            return NaN;
        const m = /^(-?\d+)(?:-(\d+))?/.exec(s);
        if (!m)
            return NaN;
        const y = Number(m[1]);
        const mo = m[2] ? (Number(m[2]) - 1) / 12 : 0;
        return y + mo;
    };
    if (t.kind === 'instant') {
        const v = parse(t.at);
        return Number.isFinite(v) ? [v, v] : null;
    }
    const a = parse(t.start);
    const b = parse(t.end);
    if (!Number.isFinite(a) || !Number.isFinite(b))
        return null;
    return [Math.min(a, b), Math.max(a, b)];
}
