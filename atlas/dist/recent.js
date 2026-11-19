/**
 * 最近的检索词（2026-11-19，§4.380）。
 *
 * 目的很小：搜过「南京条约」之后再想搜同一件事，不用从头敲。
 * 这里只放**纯函数**（解析、去重、截断），存不存得下去由调用方管——
 * 浏览器的 localStorage 在无痕模式/禁用时可能直接抛异常，所以读写都要能失败而不炸。
 */
/** localStorage 的键名；改它等于让所有人丢掉历史，别轻易动 */
export const RECENT_KEY = 'fengyu.recent-searches';
/** 最多记 5 条：再多就成了「检索面板」，不是「顺手一下」 */
export const RECENT_MAX = 5;
/** 太短的词（单字）不进历史：搜索过程里每敲一个字都会产生一条噪音 */
export const RECENT_MIN = 2;
/** 从 localStorage 读到的字符串 → 干净的列表；坏数据一律当空 */
export function parseRecent(raw) {
    if (!raw)
        return [];
    try {
        const v = JSON.parse(raw);
        if (!Array.isArray(v))
            return [];
        const seen = new Set();
        const out = [];
        for (const x of v) {
            if (typeof x !== 'string')
                continue;
            const q = x.trim();
            if (q.length < RECENT_MIN || seen.has(q))
                continue;
            seen.add(q);
            out.push(q);
            if (out.length >= RECENT_MAX)
                break;
        }
        return out;
    }
    catch {
        return [];
    }
}
/**
 * 把一次查询推进历史：去掉首尾空白、短词忽略、重复的提到最前，超出 5 条砍尾。
 * 返回新数组（不改入参），方便直接写回。
 */
export function pushRecent(list, query) {
    const q = query.trim();
    if (q.length < RECENT_MIN)
        return list.slice(0, RECENT_MAX);
    const rest = list.filter((x) => x !== q).map((x) => x.trim()).filter((x) => x.length >= RECENT_MIN);
    return [q, ...rest].slice(0, RECENT_MAX);
}
/** 序列化（写回 localStorage 用） */
export const serializeRecent = (list) => JSON.stringify(list.slice(0, RECENT_MAX));
