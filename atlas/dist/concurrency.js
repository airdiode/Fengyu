/**
 * 有上限的并发 map。
 *
 * 为什么要有：内容按 136 个分片存，2026-11-18 上线后实测——串行取一轮要 20 秒以上才出图，
 * 因为每个分片都要一次 RTT。并发发出去后同样的字节数只要一两秒。
 * 上限别开太大：GitHub Pages 走 HTTP/2 可以多路复用，但浏览器与对端都有连接预算。
 */
export async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        for (;;) {
            const i = next++;
            if (i >= items.length)
                return;
            out[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return out;
}
