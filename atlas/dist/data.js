import { mapLimit } from './concurrency.js';
/** 取 JSON：4xx/5xx、网络错、坏 JSON 都当「没有」，交给调用方决定回退 */
async function fetchJson(url) {
    try {
        const res = await fetch(url);
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
}
export async function loadDataset() {
    // 这四份互不依赖，一起发出去。原来是 manifest → bundle → sources → climate 一条一条 await，
    // 每个都要一次往返；GEO 那几份也在启动时并发取（见 main.ts），首屏少了三四个 RTT（§4.335）。
    const [manifestDoc, bundle, sourceDoc, climateDoc] = await Promise.all([
        fetchJson('content/manifest.json'),
        fetchJson('content/bundle.json'),
        fetchJson('content/sources.json'),
        fetchJson('content/climate.json'),
    ]);
    const manifest = manifestDoc || { version: '', total: 0, counts: {}, shards: [] };
    const entities = [];
    // 发布时会把 136 个分片合并成 content/bundle.json（tools/bundle-content.mjs）：
    // 一次请求 vs 十几轮 RTT，线上首屏快一个数量级。开发时没有 bundle，回落到分片。
    if (bundle && Array.isArray(bundle.entities) && bundle.entities.length) {
        entities.push(...bundle.entities);
    }
    else {
        // 分片并发取（上限 12）：串行时 136 个 RTT 要 20 秒以上，并发后一两秒。
        // 单个分片取失败就跳过，与原行为一致——少一个分片比整页打不开好。
        const bodies = await mapLimit(manifest.shards, 12, async (shard) => {
            try {
                const res = await fetch(`content/shards/${shard.key}.json`);
                if (!res.ok)
                    return null;
                return (await res.json());
            }
            catch {
                return null;
            }
        });
        for (const body of bodies)
            if (body)
                entities.push(...body.entities);
    }
    const byId = new Map(entities.map((e) => [e.id, e]));
    // 出处取不到就空着（面板少一行参考，不影响其它）
    const sources = new Map((sourceDoc || []).map((s) => [s.id, s]));
    // 气象年表是可选数据：缺了也不该挡住整张图
    const climate = new Map();
    for (const [y, v] of Object.entries(climateDoc?.years || {}))
        climate.set(Number(y), v);
    return { manifest, entities, byId, sources, climate };
}
