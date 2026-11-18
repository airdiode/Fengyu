import { mapLimit } from './concurrency.js';
export async function loadDataset() {
    const manifest = await (await fetch('content/manifest.json')).json();
    const entities = [];
    // 发布时会把 136 个分片合并成 content/bundle.json（tools/bundle-content.mjs）：
    // 一次请求 vs 十几轮 RTT，线上首屏快一个数量级。开发时没有 bundle，回落到分片。
    const bundled = await fetch('content/bundle.json')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
    if (bundled && Array.isArray(bundled.entities) && bundled.entities.length) {
        entities.push(...bundled.entities);
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
    // 出处单独一个文件；取不到就空着（面板少一行参考，不影响其它）
    let sourceList = [];
    try {
        const res = await fetch('content/sources.json');
        if (res.ok)
            sourceList = (await res.json());
    }
    catch {
        sourceList = [];
    }
    const sources = new Map(sourceList.map((s) => [s.id, s]));
    // 气象年表是可选数据：缺了也不该挡住整张图
    const climate = new Map();
    try {
        const res = await fetch('content/climate.json');
        if (res.ok) {
            const body = (await res.json());
            for (const [y, v] of Object.entries(body.years || {}))
                climate.set(Number(y), v);
        }
    }
    catch {
        /* 没有气象数据时，时间轴不画灾荒条、卡片不显示 */
    }
    return { manifest, entities, byId, sources, climate };
}
