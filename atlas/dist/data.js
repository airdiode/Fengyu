export async function loadDataset() {
    const manifest = await (await fetch('content/manifest.json')).json();
    const entities = [];
    for (const shard of manifest.shards) {
        const res = await fetch(`content/shards/${shard.key}.json`);
        if (!res.ok)
            continue;
        const body = (await res.json());
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
