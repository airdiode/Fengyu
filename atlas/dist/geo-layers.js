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
    rivers: [], lakes: [], admin1: [], relief: [], wall: [], cities: [],
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
export const GEO_FILES = [
    'land.json',
    'land-detail.json',
    'lakes-detail.json',
    'rivers-detail.json',
    'polities.json',
    'spheres.json',
    'claims.json',
    'taiping.json',
    'cessions.json',
    'cession-lines.json',
    'sealanes.json',
    'southsea.json',
    'yellowriver.json',
    'rivers.json',
    'lakes.json',
    'admin1.json',
    'relief.json',
    'wall.json',
    'cities.json',
];
export async function loadGeo(base = 'public/geo') {
    const geo = emptyGeo();
    const get = async (name) => {
        try {
            const res = await fetch(`${base}/${name}`);
            if (!res.ok)
                return null;
            return await res.json();
        }
        catch {
            return null;
        }
    };
    const [land, landDetail, lakesDetail, riversDetail, polities, spheres, claims, taiping, cessions, cessionLines, sealanes, southSea, yellowDoc, rivers, lakes, admin1, relief, wall, cities] = await Promise.all(GEO_FILES.map((name) => get(name)));
    // spheres.json 里已经没有殖民地那 22 块（搬去 colonies.json），这里保持空数组
    if (Array.isArray(land))
        geo.land = land;
    if (Array.isArray(landDetail))
        geo.landDetail = landDetail;
    if (Array.isArray(lakesDetail))
        geo.lakesDetail = lakesDetail;
    if (Array.isArray(riversDetail))
        geo.riversDetail = riversDetail;
    const polityDoc = polities;
    if (polityDoc?.polities)
        geo.polities = polityDoc.polities;
    const taipingDoc = taiping;
    if (taipingDoc?.periods)
        geo.taiping = taipingDoc.periods;
    const cessionDoc = cessions;
    if (cessionDoc?.cessions)
        geo.cessions = cessionDoc.cessions;
    const cessionLineDoc = cessionLines;
    if (cessionLineDoc?.lines)
        geo.cessionLines = cessionLineDoc.lines;
    const laneDoc = sealanes;
    if (laneDoc?.lanes)
        geo.sealanes = laneDoc.lanes;
    const southSeaDoc = southSea;
    if (southSeaDoc?.line)
        geo.southSea = southSeaDoc.line;
    const yellowRiverDoc = yellowDoc;
    if (yellowRiverDoc?.phases)
        geo.yellowriver = yellowRiverDoc.phases;
    const claimDoc = claims;
    if (claimDoc?.claims)
        geo.claims = claimDoc.claims;
    const sphereDoc = spheres;
    if (sphereDoc) {
        geo.powers = sphereDoc.powers || {};
        geo.spheres = [];
        geo.spheres = sphereDoc.spheres || [];
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
