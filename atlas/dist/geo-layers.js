export const GEO_LAYERS = [
    { key: 'graticule', name: '经纬网', hint: '经纬线，每 10°（全集拉到 30°），边上标度数', color: '#9c8f78', on: true },
    { key: 'tropic', name: '北回归线', hint: '23°26′N 的回归线，棕色虚线', color: '#b0784a', on: true },
    { key: 'relief', name: '山川', hint: '全球山系、高原、盆地的淡底纹', color: '#b09468', on: true },
    { key: 'hydrology', name: '水系', hint: '全球主要河流与湖泊', color: '#8fb0c4', on: true },
    { key: 'cities', name: '城市', hint: '周边国家的城市，按当时国名标注（中国城市不在此列）', color: '#6b5a45', on: true },
    { key: 'wall', name: '长城', hint: '明长城（示意连线）', color: '#8a6a3a', on: true },
    { key: 'admin1', name: '现代省界', hint: '现代行政区划，非历史政区', color: '#7a7a7a', on: true },
    { key: 'polities', name: '国名', hint: '周边国家按当时国名标注（俄国→苏联）', color: '#8d8471', on: true },
    { key: 'spheres', name: '势力范围', hint: '列强实控区域：殖民地与在华租借地', color: '#b07a8a', on: true },
    {
        key: 'warlords',
        name: '军阀势力',
        hint: '1911–1930 省级控制近似：按军政长官的派系上色，斜线=争夺；不是控制线',
        color: '#7b6ba8',
        on: true,
        from: 1911,
        to: 1931,
    },
    { key: 'claims', name: '主张国境线', hint: '清朝（1840 年主张）/ 中华民国（1912、1946）的国境，虚线；与实控分开，可关', color: '#8a6a4a', on: true },
    {
        key: 'yellowriver',
        name: '黄河故道',
        hint: '1855 年前的夺淮入海河道、1938–1947 年的花园口南泛',
        color: '#7ea0b8',
        on: true,
    },
    {
        key: 'sealanes',
        name: '贸易航线',
        hint: '近代主要对外贸易航线（北洋、东洋、南洋、西洋、美洲、吕宋）',
        color: '#3f6d8a',
        on: true,
    },
    {
        key: 'cessions',
        name: '条约割地',
        hint: '不平等条约割让、租借的土地；未承认的割让=纸色+红虚线（保留到 1949），共管=斜线',
        color: '#a8382a',
        on: true,
        from: 1842,
        to: 1949,
    },
    {
        key: 'taiping',
        name: '太平天国',
        hint: '太平天国控制府州（1851–1864）',
        color: '#b23a3a',
        on: true,
        from: 1851,
        to: 1865,
    },
    {
        key: 'march',
        name: '行军箭头',
        hint: '太平天国战争的行军路线（1853–1868）',
        color: '#a8382a',
        on: true,
        from: 1853,
        to: 1869,
    },
];
const emptyGeo = () => ({
    land: [], landDetail: [], lakesDetail: [], riversDetail: [], polities: [], powers: {}, spheres: [], concessions: [], regions: [], railways: [],
    claims: [], cessions: [], cessionLines: [], sphereLines: [], leagues: [], sealanes: [], southSea: null, yellowriver: [], taiping: [],
    rivers: [], lakes: [], admin1: [], relief: [], wall: [], cities: [], warlordProvinces: [], warlordZones: null,
    loaded: new Set(),
});
/**
 * 辅助图层的文件清单，**顺序就是 Promise.all 的取值顺序**，改一处要改两处。
 * 导出是为了让测试对得上磁盘：拼错文件名时线上只会静默少画一层（get() 吞错），
 * 本地测不出来（`test/geo-files.test.mjs` 守着「清单 ↔ public/geo 目录」）。
 */
/**
 * 殖民地的判定面：单独一份、首屏不取（`loadGeo()` 之后由 `loadColonies()` 补上）。
 * 这些面从 2026-11-10 起就不画了（只标国名，§4.79），留在首屏纯属让读者多等
 * 1.6 MB 的不可见多边形（§4.336）。
 */
export const COLONY_FILE = 'colonies.json';
/**
 * 首屏就取的图层。**按年 / 按窗口裁的那几份不在这里**：
 * 主张线（claims-<年>.json）、割让面/界（1842 起）、太平天国（1851–1865）、
 * 东亚细节层（只在看得见东亚时才要）——见 `DETAIL_FILES` / `YEAR_FILES`（§4.337）。
 */
export const GEO_FILES = [
    'land.json',
    'polities.json',
    'spheres.json',
    'sealanes.json',
    'southsea.json',
    'yellowriver.json',
    'rivers.json',
    'lakes.json',
    'admin1.json',
    'relief.json',
    'wall.json',
    'cities.json',
    'warlord-provinces.json',
    'warlord-zones.json',
];
/**
 * 东亚细节层（10m 海岸线、小河、小湖）：**只在视野里看得到东亚时才取**。
 * 看世界的时候它们在 `clipOutsideDetail()` 里本来就整个被裁掉，取了也是白取（§4.337）。
 */
export const DETAIL_FILES = ['land-detail.json', 'rivers-detail.json', 'lakes-detail.json'];
/**
 * 主张线按「主张期」拆成几份，客户端按年份取当年的那一份（§4.337）。
 * 这张表要和 `claims.json` 的 `periods` 对得上——`test/first-paint.test.mjs` 守着。
 */
export const CLAIM_PERIODS = [
    { from: 1840, to: 1912 },
    { from: 1912, to: 1945 },
    { from: 1945, to: 1946 },
    { from: 1946, to: 1950 },
];
/** 这一年该取哪一份主张线 */
export function claimFileFor(year) {
    const p = CLAIM_PERIODS.find((x) => year >= x.from && year < x.to) || CLAIM_PERIODS[CLAIM_PERIODS.length - 1];
    return `claims-${p.from}.json`;
}
/** 按年份才需要的图层：文件 + 生效区间（`to` 缺省＝一直到头） */
export const YEAR_FILES = [
    { file: 'cessions.json', from: 1842 },
    { file: 'cession-lines.json', from: 1858 },
    { file: 'taiping.json', from: 1851, to: 1865 },
];
/** 某一年需要哪些按年图层（含主张线） */
export function yearFiles(year) {
    const files = [claimFileFor(year)];
    for (const f of YEAR_FILES)
        if (year >= f.from && (!('to' in f) || f.to === undefined || year <= f.to))
            files.push(f.file);
    return files;
}
async function getJson(base, name) {
    try {
        const res = await fetch(`${base}/${name}`);
        if (!res.ok)
            return null;
        return await res.json();
    }
    catch {
        return null;
    }
}
/**
 * 取某一年需要的按年图层。只取 `only` 里还没取过的（缺省＝这一年全部需要的）。
 * 失败的文件静默跳过：少一条主张线比整页打不开好。
 */
export async function fetchYearLayers(year, base = 'public/geo', only) {
    const files = (only && only.length ? only : yearFiles(year)).slice();
    const docs = await Promise.all(files.map((f) => getJson(base, f)));
    const out = { files: [], claims: [], cessions: [], cessionLines: [], taiping: [] };
    files.forEach((f, i) => {
        const doc = docs[i];
        if (!doc)
            return;
        out.files.push(f);
        if (f.startsWith('claims-')) {
            const c = doc.claim;
            if (c)
                out.claims.push(c);
        }
        else if (f === 'cessions.json') {
            out.cessions = doc.cessions || [];
        }
        else if (f === 'cession-lines.json') {
            out.cessionLines = doc.lines || [];
        }
        else if (f === 'taiping.json') {
            out.taiping = doc.periods || [];
        }
    });
    return out;
}
/** 把取回来的按年图层挂到 geo 上；返回有没有真的新增数据 */
export function applyYearLayers(geo, data) {
    const loaded = (geo.loaded ||= new Set());
    let changed = false;
    for (const f of data.files) {
        if (loaded.has(f))
            continue;
        loaded.add(f);
        changed = true;
    }
    for (const c of data.claims)
        if (!geo.claims.some((x) => x.id === c.id))
            geo.claims.push(c);
    if (data.cessions.length)
        geo.cessions = data.cessions;
    if (data.cessionLines.length)
        geo.cessionLines = data.cessionLines;
    if (data.taiping.length)
        geo.taiping = data.taiping;
    return changed;
}
/** 切年时调用：这一年缺的图层补上；返回 true 表示有新数据，调用方重画一次 */
export async function ensureYearLayers(geo, year, base = 'public/geo') {
    const loaded = (geo.loaded ||= new Set());
    const need = yearFiles(year).filter((f) => !loaded.has(f));
    if (!need.length)
        return false;
    const data = await fetchYearLayers(year, base, need);
    return applyYearLayers(geo, data);
}
/** 取东亚细节层（世界视野不取） */
export async function fetchDetailLayers(base = 'public/geo') {
    // 按文件名取，别按 Promise.all 的下标对——DETAIL_FILES 的顺序改一次就是一条河画成湖
    const [land, rivers, lakes] = await Promise.all(['land-detail.json', 'rivers-detail.json', 'lakes-detail.json'].map((f) => getJson(base, f)));
    if (!Array.isArray(land) && !Array.isArray(rivers))
        return null;
    return {
        landDetail: Array.isArray(land) ? land : [],
        lakesDetail: Array.isArray(lakes) ? lakes : [],
        riversDetail: Array.isArray(rivers) ? rivers : [],
    };
}
export function applyDetail(geo, d) {
    const loaded = (geo.loaded ||= new Set());
    if (loaded.has(DETAIL_FILES[0]))
        return false;
    for (const f of DETAIL_FILES)
        loaded.add(f);
    geo.landDetail = d.landDetail;
    geo.lakesDetail = d.lakesDetail;
    geo.riversDetail = d.riversDetail;
    return true;
}
export async function loadGeo(base = 'public/geo') {
    const geo = emptyGeo();
    const [land, polities, spheres, sealanes, southSea, yellowDoc, rivers, lakes, admin1, relief, wall, cities, warlordProvinces, warlordZones] = await Promise.all(GEO_FILES.map((name) => getJson(base, name)));
    if (Array.isArray(land))
        geo.land = land;
    const polityDoc = polities;
    if (polityDoc?.polities)
        geo.polities = polityDoc.polities;
    const laneDoc = sealanes;
    if (laneDoc?.lanes)
        geo.sealanes = laneDoc.lanes;
    const southSeaDoc = southSea;
    if (southSeaDoc?.line)
        geo.southSea = southSeaDoc.line;
    const yellowRiverDoc = yellowDoc;
    if (yellowRiverDoc?.phases)
        geo.yellowriver = yellowRiverDoc.phases;
    const sphereDoc = spheres;
    if (sphereDoc) {
        geo.powers = sphereDoc.powers || {};
        geo.concessions = sphereDoc.concessions || [];
        geo.regions = sphereDoc.regions || [];
        geo.railways = sphereDoc.railways || [];
        geo.sphereLines = sphereDoc.sphereLines || [];
        geo.leagues = sphereDoc.leagues || [];
    }
    if (Array.isArray(rivers))
        geo.rivers = rivers;
    if (Array.isArray(lakes))
        geo.lakes = lakes;
    if (Array.isArray(admin1))
        geo.admin1 = admin1;
    if (Array.isArray(relief))
        geo.relief = relief;
    if (Array.isArray(cities))
        geo.cities = cities;
    const wallDoc = wall;
    if (wallDoc?.lines)
        geo.wall = wallDoc.lines;
    const wp = warlordProvinces;
    if (wp?.units)
        geo.warlordProvinces = wp.units;
    const wz = warlordZones;
    if (wz?.provinces)
        geo.warlordZones = wz;
    return geo;
}
/**
 * 补取殖民地的判定面（悬停用，不画）。失败就返回空数组——悬停少报一种归属，
 * 不该影响别的。调用方在首屏画完之后再调（main.ts 的 `done` 之后）。
 */
export async function loadColonies(base = 'public/geo') {
    try {
        const res = await fetch(`${base}/${COLONY_FILE}`);
        if (!res.ok)
            return [];
        const doc = (await res.json());
        return Array.isArray(doc.colonies) ? doc.colonies : [];
    }
    catch {
        return [];
    }
}
/** 某一年该用哪个国名；没有对应年份就返回 null */
export function polityName(p, year) {
    for (const n of p.names)
        if (year >= n.from && year < n.to)
            return n.zh;
    return null;
}
/**
 * 城市在某一年的国名：先看城市自己的存在区间，再取 polity 的分段（与「国名」图层一致），
 * 没有 polity 的用自带的 nation 分段。返回 null = 这一年不该标（未建城 / 没有对得上的国名）。
 */
export function cityNation(city, year, polities) {
    if (year < (city.from ?? 1840) || year >= (city.to ?? 1950))
        return null;
    if (city.nation) {
        for (const [zh, from, to] of city.nation)
            if (year >= from && year < to)
                return zh;
        return null;
    }
    if (!city.p)
        return null;
    const polity = polities.find((p) => p.id === city.p);
    return polity ? polityName(polity, year) : null;
}
/** 点在多边形内（射线法，经纬度直接当平面用：这个尺度上够准） */
export function pointInRings(lng, lat, rings) {
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
                inside = !inside;
        }
    }
    return inside;
}
/** 某一年图层面板里应当出现哪些图层（太平天国这类只在特定年代有意义） */
export function layersAt(year) {
    return GEO_LAYERS.filter((l) => (l.from == null || year >= l.from) && (l.to == null || year < l.to));
}
/** 某一年的黄河河道：1855–1938、1947 之后走现行河道，其余年份走历史故道 */
export function yellowAt(geo, year) {
    for (const p of geo.yellowriver || [])
        if (year >= p.from && year < p.to)
            return p;
    return null;
}
/** 现行的黄河（山东入海）在哪些年份才算「当时」的河道 */
export function modernYellowActive(year) {
    return year >= 1855 && year < 1938 ? true : year >= 1947;
}
/** 某一年在运营的航线 */
export function lanesAt(geo, year) {
    return (geo.sealanes || []).filter((l) => year >= l.from && year < l.to);
}
/** 某一年已经生效的割让/租借地 */
export function cessionsAt(geo, year) {
    return (geo.cessions || []).filter((c) => year >= c.from && year < c.to);
}
/** 某一年太平天国的控制范围 */
export function taipingAt(geo, year) {
    for (const p of geo.taiping || [])
        if (year >= p.from && year <= p.to)
            return p;
    return null;
}
/** 某一年适用的主张国境 */
export function claimAt(geo, year) {
    for (const c of geo.claims || [])
        if (year >= c.from && year < c.to)
            return c;
    return null;
}
/**
 * 列强的时代名称：俄国按年份取 沙俄 / 苏俄 / 苏联（与「国名」层同一套分段），
 * 其余国家沿用 POWER_STYLE 的简称。图例和悬停标题都用它，
 * 免得 1945 年的旅大（苏军）在图例里写成「俄国」。
 */
export function powerName(geo, key, year) {
    if (key === 'ru') {
        const polity = (geo.polities || []).find((p) => p.id === 'ru');
        const name = polity ? polityName(polity, year) : null;
        if (name)
            return name;
    }
    return geo.powers[key]?.zh || key;
}
/** 某一年实际存在的势力范围（用于图例） */
export function activePowers(geo, year) {
    const keys = new Set();
    for (const s of geo.spheres || [])
        if (year >= s.from && year < s.to)
            keys.add(s.power);
    for (const c of geo.concessions || [])
        if (year >= c.from && year < c.to)
            keys.add(c.power);
    for (const r of geo.regions || [])
        if (year >= r.from && year < r.to)
            keys.add(r.power);
    for (const w of geo.railways || [])
        if (year >= w.from && year < w.to)
            keys.add(w.power);
    return [...keys]
        .filter((k) => k !== 'qing' && k !== 'tibet') // 清是本体、西藏是地方政权，都不当列强列进图例
        .map((k) => ({ power: k, zh: powerName(geo, k, year), color: geo.powers[k]?.color || '#999' }))
        .sort((a, b) => a.zh.localeCompare(b.zh, 'zh-Hans-CN'));
}
/** 干旱区/高原的淡底纹配色 */
export const RELIEF_STYLE = {
    range: { fill: 'rgba(176,148,104,.16)', stroke: 'rgba(150,120,80,.22)' },
    plateau: { fill: 'rgba(176,160,128,.1)', stroke: 'rgba(150,130,100,.16)' },
    basin: { fill: 'rgba(140,170,150,.08)', stroke: 'rgba(120,150,130,.14)' },
};
