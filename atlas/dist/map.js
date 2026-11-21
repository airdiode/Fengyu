import { lineActiveAt, spanOf } from './types.js';
import { boundsOf, distToSegment, fitCamera, fitCameraInRect, mercX, mercY, screenOf, unmercY, worldLng, worldOf, worldShift, zoomAt, WORLD_SEAM, } from './geo.js';
import { formatLat, formatLon, graticuleStep, TROPIC_LAT } from './graticule.js';
import { kmPerPxAt, niceScaleBar } from './scalebar.js';
import { solveLabels } from './labels.js';
import { collectLabels } from './label-source.js';
import { provenanceFor } from './provenance.js';
import { eraAt } from './eras.js';
import { reignAt } from './reigns.js';
import { categoryStyle, pathOf } from './event-category.js';
import { RELIEF_STYLE, cessionsAt, claimAt, lanesAt, modernYellowActive, pointInRings, polityName, powerName, taipingAt, yellowAt, cityNation, } from './geo-layers.js';
import { catmullRom, pathLength, pointAlong, simplifyPath } from './arrow.js';
/** 区域（regions）的悬停种类文案 */
const REGION_KIND_LABEL = {
    occupation: '军事占领',
    returned: '归还',
    vassal: '清朝藩部（羁縻）',
    claim: '清朝主张（未实控）',
    selfrule: '地方政权（自行治理）',
    protectorate: '受保护国（苏联控制）',
    annexed: '并入苏联',
    autonomy: '自治（中国宗主权）',
    recognized: '独立（已承认）',
    puppet: '傀儡政权',
    satellite: '卫星国',
};
const FONT_CSS = (px) => `${px}px "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif`;
const COLORS = {
    event: '#a8382a',
    person: '#8a5a2b',
    organization: '#7a4b8a',
    place: '#33556f',
    route: '#26455c',
    front: '#b5402c',
    institution: '#4a6b3f',
    work: '#6b5a3a',
    practice: '#5f6b3a',
    technology: '#3a6b6b',
    group: '#7a6a4a',
};
export class MapView {
    canvas;
    ctx;
    cam = { x: 0, y: 0, w: 0, h: 0 };
    home = { x: 0, y: 0, w: 0, h: 0 };
    entities = [];
    base = [];
    territories = [];
    baseRings = [];
    hits = [];
    labelHits = [];
    /** 本年"实显"的要素类型与事件类别，图例据此派生 */
    currentTypes = new Set();
    currentCategories = new Set();
    /** 这一帧画出来的线（屏幕坐标），传给标注求解器避让 */
    segments = [];
    /** 画出来的线（屏幕坐标），用于悬停命中 */
    lineHits = [];
    cessionHatch = null;
    /** 悬停回调：带上鼠标在画布里的坐标，主程序据此在鼠标旁边放小标签 */
    onHover = () => { };
    lastHoverKey = '';
    /** 悬停高亮：点 / 线 / 区域三种 */
    hover = null;
    /** 双击循环的档位：0 全景 → 1 放大 → 2 再放大 → 3 回全景 */
    dblStep = 0;
    hatchCache = new Map();
    /** 行军虚线流动的相位 */
    animPhase = 0;
    animHandle = 0;
    animStarted = 0;
    /** 辅助图层数据（山川/水系/长城/省界）与开关 */
    geo = null;
    overlay = null;
    /** 1840 实控基线的世界坐标包围盒：悬停时先挡掉远离边界的位置 */
    baseBox = null;
    /** 1840 基线的治理分档与说明（base-1840.json 的 tiers / note） */
    baseTiers = [];
    baseNote = '';
    /** 被用户关掉的实体类型（目前只有人物），不上图、不出标签、不进图例 */
    hiddenTypes = new Set();
    layers = {
        graticule: true,
        tropic: true,
        relief: true,
        hydrology: true,
        cities: true,
        wall: true,
        admin1: true,
        polities: true,
        spheres: true,
        claims: true,
        cessions: true,
        sealanes: true,
        yellowriver: true,
        taiping: true,
        march: true,
        warlords: true,
    };
    /** 检索结果高亮：其余要素压暗，标签只画命中的 */
    highlight = null;
    selectedId = null;
    year = 1840;
    onPick = () => { };
    /** 点在地图空白处（没命中点、也没命中标签、也没命中地理要素）时回调：关掉详情卡 */
    onEmpty = () => { };
    /** 点中"不是实体"的地理要素（国境线、割让面、势力范围…）时回调，给它们开详情卡 */
    onPickTarget = () => { };
    /** hoverAt 最近一次算出来的目标：点选非实体要素时直接拿它，免得把命中逻辑抄第二遍 */
    lastTarget = null;
    /** 本年报灾县点：由主程序按年算好塞进来（县名 → 坐标已在构建时对好） */
    climateDots = [];
    /** 报灾县点的屏幕命中框（县名 + 当年条数），画的时候顺手记下来 */
    climateHits = [];
    /** 点中县点：打开该县 1840–1911 的全部报灾记录 */
    onClimatePick = () => { };
    dragging = false;
    /** 按下的指针（触摸可能两根）：pointerId → 屏幕坐标 */
    pointers = new Map();
    /** 双指缩放的状态：上一次的两指距离与中点 */
    pinch = null;
    /** 本次按下累计移动的像素：超过阈值就当作「拖过」，松手不选中 */
    moved = 0;
    /** 细节层缺失时的一次性回调（视野转进东亚） */
    onDetailNeeded = null;
    last = [0, 0];
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.bind();
    }
    setBase(polys) {
        this.base = polys;
        const all = [];
        for (const ring of polys)
            all.push(...ring);
        const vp = this.viewport();
        this.home = fitCamera(boundsOf(all), vp.w || 900, vp.h || 600);
        this.cam = { ...this.home };
        this.resize();
    }
    setGeo(data) {
        this.geo = data;
        this.draw();
    }
    /** 1934 年校准图层（半透明底图），参数变化或加载完成时调用 */
    setOverlay(overlay) {
        this.overlay = overlay;
        this.draw();
    }
    redraw() {
        this.draw();
    }
    setLayer(key, on) {
        if (!(key in this.layers))
            return;
        this.layers[key] = on;
        this.draw();
    }
    /** 内容开关：目前只用于「人物」；关掉后点、活动地、人物名一起隐藏 */
    setTypeVisible(type, on) {
        if (on)
            this.hiddenTypes.delete(type);
        else
            this.hiddenTypes.add(type);
        this.draw();
    }
    /** 图层面板用：当前开关状态 */
    layerState() {
        return { ...this.layers };
    }
    setTerritories(list) {
        this.territories = list;
        this.draw();
    }
    /**
     * 1840 年清朝实控基线：之后年份**不再切换**疆域快照。
     * 1858 以后的占领、割让、租借、独立等变化一律由叠加层表达，
     * 免得「到某个条约年就自动变成他国领土」。
     */
    activeBase() {
        if (this.baseRings.length)
            return this.baseRings;
        if (!this.territories.length)
            return this.base;
        let hit = this.territories[0];
        for (const t of this.territories)
            if (t.year <= 1840)
                hit = t;
        return hit.rings;
    }
    /** 1840 实控基线（已裁到旧常驻卡伦线）；`meta` 带治理分档与说明 */
    setTerritoryBase(rings, meta) {
        this.baseRings = rings;
        this.baseBox = rings.length ? boundsOf(rings.flat()) : null;
        if (meta?.note)
            this.baseNote = meta.note;
        if (meta?.tiers?.length)
            this.baseTiers = meta.tiers;
        this.draw();
    }
    /** 这一点落在哪一档治理形态里（直辖返回 null） */
    tierAt(lng, lat) {
        const g = this.geo;
        if (!g)
            return null;
        for (const tier of this.baseTiers) {
            if (tier.key === 'direct')
                continue;
            for (const id of tier.regions) {
                const r = g.regions.find((x) => x.id === id);
                if (!r || this.year < r.from || this.year >= r.to)
                    continue;
                if (pointInRings(lng, lat, r.rings))
                    return { tier, region: r };
            }
        }
        return null;
    }
    /**
     * 1840 实控基线是否「贴着」鼠标（只认边界线，不认面）。
     * 先拿世界坐标包围盒挡掉远离边界的位置，再逐段算屏幕距离。
     */
    nearBaseBoundary(sx, sy, vw, vh, tol = 5) {
        const rings = this.activeBase();
        if (!rings.length)
            return false;
        if (this.baseBox) {
            const [wx, wy] = worldOf(this.cam, vw, vh, sx, sy);
            const padX = (this.cam.w / vw) * tol;
            const padY = (this.cam.h / vh) * tol;
            const b = this.baseBox;
            if (wx < b.minX - padX || wx > b.maxX + padX || wy < b.minY - padY || wy > b.maxY + padY) {
                return false;
            }
        }
        for (const ring of rings) {
            for (let i = 1; i < ring.length; i++) {
                const [x1, y1] = screenOf(this.cam, vw, vh, mercX(ring[i - 1][0]), mercY(ring[i - 1][1]));
                const [x2, y2] = screenOf(this.cam, vw, vh, mercX(ring[i][0]), mercY(ring[i][1]));
                if (distToSegment(sx, sy, { x: x1, y: y1 }, { x: x2, y: y2 }) <= tol)
                    return true;
            }
        }
        return false;
    }
    /**
     * 殖民地的判定面后到（首屏不加载它，§4.336）：到了挂上去，悬停就能报归属。
     * 图层关掉时 `geo.spheres` 也不参与判定，所以这里只负责替换数组。
     */
    setSpheres(list) {
        if (!this.geo)
            return;
        this.geo.spheres = list;
        this.draw();
    }
    setEntities(list) {
        this.entities = list;
        this.draw();
    }
    setYear(year) {
        this.year = year;
        this.draw();
    }
    setPickHandler(fn) {
        this.onPick = fn;
    }
    setEmptyClickHandler(fn) {
        this.onEmpty = fn;
    }
    setPickTargetHandler(fn) {
        this.onPickTarget = fn;
    }
    /** 本年报灾县点（空数组＝不画） */
    setClimateDots(dots) {
        this.climateDots = dots;
        this.redraw();
    }
    setClimatePickHandler(fn) {
        this.onClimatePick = fn;
    }
    setHoverHandler(fn) {
        this.onHover = fn;
    }
    /** 检索时把其它要素压暗，让命中的几条跳出来 */
    setHighlight(ids) {
        this.highlight = ids ? new Set(ids) : null;
        this.draw();
    }
    /** 检索命中后把镜头对准它：只看一个要素时不必留整幅地图的比例 */
    /** 直接定位：经度、纬度、横向跨度（度）。调参/截图用。 */
    setView(lon, lat, spanDeg) {
        const { w: vw, h: vh } = this.viewport();
        if (!vw || !vh)
            return;
        this.cam.w = spanDeg;
        this.cam.h = spanDeg / (vw / vh);
        this.cam.x = lon - this.cam.w / 2;
        this.cam.y = mercY(lat) - this.cam.h / 2;
        this.draw();
    }
    focusEntity(e) {
        const { w: vw, h: vh } = this.viewport();
        if (!vw || !vh)
            return;
        const aspect = vw / vh;
        const allPoints = e.space?.points || [];
        const activeActivity = allPoints
            .filter((p) => p.role === 'activity' && this.pointActiveAt(p))
            .sort((a, b) => {
            const y = (p) => Number(/^(-?\d+)/.exec(p.time?.at ?? p.time?.start ?? '')?.[1] || 0);
            return y(b) - y(a);
        });
        const primaries = allPoints.filter((p) => p.role !== 'activity');
        // 人物选中时对准「今年他在哪」；两段活动地重叠的年份取最近开始的那段；
        // 没有活动地就对准籍贯/出生点
        const points = activeActivity.length ? [activeActivity[0]] : primaries;
        const lineCoords = e.type === 'route' || e.type === 'front'
            ? (e.space?.lines || []).flatMap((l) => (l.geometry.coordinates || []))
            : [];
        let wx;
        let wy;
        let targetW;
        if (lineCoords.length >= 2) {
            // 线要素按整条线的范围取景：一条环球路线取"重心"会落到半路上，
            // 而且跨接缝后各段屏幕坐标一平均就没有意义了
            const b = boundsOf(lineCoords);
            wx = (b.minX + b.maxX) / 2;
            wy = (b.minY + b.maxY) / 2;
            const spanW = Math.max(1e-6, b.maxX - b.minX) * 1.2;
            const spanH = Math.max(1e-6, b.maxY - b.minY) * 1.2;
            // 环球路线要比「中国视域」拉得更远：世界宽度 360°，但右侧有面板，
            // 所以最多拉到 360/0.78 ≈ 462，让整个世界落在左侧可见区里（多出来的是海）
            targetW = Math.min(360 / 0.78, Math.max(spanW, spanH * aspect));
        }
        else {
            if (!points.length)
                return;
            // 点要素：取锚点重心（世界坐标直接算，别经过屏幕坐标）。
            // 美洲在接缝以东，要加 360——否则 -122° 会被下面的横向钳位压到 -20°（大西洋），
            // 旧金山出生的人会定位到欧洲（2026-11-10 发现）。
            wx = points.reduce((sum, p) => sum + mercX(worldLng(p.coord[0])), 0) / points.length;
            wy = points.reduce((sum, p) => sum + mercY(p.coord[1]), 0) / points.length;
            targetW = Math.min(this.cam.w, this.home.w / 2.4);
        }
        const targetH = targetW / aspect;
        // 右侧有内容时才让出右栏；面板收起时直接居中（2026-11-09 起默认不显示右栏）
        const side = document.getElementById('side');
        const panelOpen = !!side && !side.hidden && side.getBoundingClientRect().width > 1;
        const focusX = vw * (panelOpen ? 0.39 : 0.5);
        let x = wx - (focusX / vw) * targetW;
        let y = wy - targetH / 2;
        // 别把相机推出世界（横向只有 360°）；纵向在东半球范围内就贴住 home，
        // 超出时按内容居中（环球路线会落到赤道附近）
        const worldRight = WORLD_SEAM + 360;
        if (targetW <= 360) {
            x = Math.max(WORLD_SEAM, Math.min(worldRight - targetW, x));
        }
        else {
            // 比世界还宽：允许两侧留白，按内容居中，别把世界推到面板底下
            x = wx - (focusX / vw) * targetW;
        }
        if (targetH <= this.home.h) {
            y = Math.max(this.home.y, Math.min(this.home.y + this.home.h - targetH, y));
        }
        this.cam = { x, y, w: targetW, h: targetH };
        this.draw();
    }
    /** 以屏幕上的某点为中心缩放（双第 2、3 步用） */
    zoomAtPoint(sx, sy, factor) {
        const { w: vw, h: vh } = this.viewport();
        if (!vw || !vh)
            return;
        const [wx, wy] = worldOf(this.cam, vw, vh, sx, sy);
        const w = this.cam.w * factor;
        const h = this.cam.h * factor;
        this.cam = { x: wx - (sx / vw) * w, y: wy - (sy / vh) * h, w, h };
        this.draw();
    }
    /** 点自带的时间窗（人物活动地）：没有 time 的点一直显示 */
    pointActiveAt(p) {
        const t = p.time;
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
        return this.year >= a - 0.5 && this.year <= (Number.isFinite(b) ? b : a) + 0.5;
    }
    /**
     * 选中的点：留一圈红环。点开详情后鼠标通常已经移开，悬停环会消失，
     * 这圈不消失的环用来回答「我刚才点的是哪个点」。
     */
    drawSelected() {
        const id = this.selectedId;
        if (!id)
            return;
        const hits = this.hits.filter((h) => h.id === id);
        if (!hits.length)
            return;
        const ctx = this.ctx;
        ctx.save();
        for (const hit of hits) {
            ctx.beginPath();
            ctx.arc(hit.x, hit.y, hit.r + 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,253,247,.9)';
            ctx.lineWidth = 4.5;
            ctx.stroke();
            ctx.strokeStyle = '#c8452e';
            ctx.lineWidth = 1.8;
            ctx.stroke();
        }
        ctx.restore();
    }
    /** 悬停高亮：被悬停的点加光环、线加投影、区域加描边 */
    drawHover(vw, vh) {
        const h = this.hover;
        if (!h)
            return;
        const ctx = this.ctx;
        const ACCENT = '#c8452e';
        const ring = (pts, close = false) => {
            ctx.beginPath();
            pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            if (close)
                ctx.closePath();
        };
        if (h.kind === 'point') {
            const hit = this.hits.find((x) => x.id === h.id);
            if (!hit)
                return;
            ctx.beginPath();
            ctx.arc(hit.x, hit.y, hit.r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,253,247,.9)';
            ctx.lineWidth = 4.5;
            ctx.stroke();
            ctx.strokeStyle = ACCENT;
            ctx.lineWidth = 1.8;
            ctx.stroke();
            return;
        }
        if (h.id === 'claim:main') {
            const claim = this.geo ? claimAt(this.geo, this.year) : null;
            if (!claim)
                return;
            ctx.setLineDash([6, 4]);
            for (const ring of claim.rings) {
                ctx.beginPath();
                ring.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.strokeStyle = 'rgba(255,253,247,.9)';
                ctx.lineWidth = 5;
                ctx.stroke();
                ctx.strokeStyle = '#8a6a4a';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.setLineDash([]);
            return;
        }
        if (h.id.startsWith('sphereline:')) {
            const line = this.geo?.sphereLines?.find((x) => `sphereline:${x.id}` === h.id);
            if (!line)
                return;
            ctx.beginPath();
            line.path.forEach(([lng, lat], i) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            });
            ctx.setLineDash([9, 4, 2, 4]);
            ctx.strokeStyle = 'rgba(255,253,247,.95)';
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.strokeStyle = '#5c3c78';
            ctx.lineWidth = 2.4;
            ctx.stroke();
            ctx.setLineDash([]);
            return;
        }
        if (h.kind === 'line') {
            // 一条路线可能由多条折线拼成（跨洋、往返都拆成几段），
            // 必须全部高亮——只 find 第一条的话，被悬停的只是其中一段
            const legs = this.lineHits.filter((l) => l.id === h.id);
            if (!legs.length)
                return;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // 先铺一圈纸色光晕，再用它本来的颜色加粗——不要用强调色，
            // 否则清军的蓝线被高亮成红色，看起来像换了一方
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = 'rgba(255,253,247,.95)';
            ctx.lineWidth = 9;
            for (const leg of legs) {
                ring(leg.pts);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = legs[0].color;
            ctx.lineWidth = 3;
            for (const leg of legs) {
                ring(leg.pts);
                ctx.stroke();
            }
            return;
        }
        // 区域
        const g = this.geo;
        let rings = [];
        if (h.id === 'taiping' && g) {
            const p = taipingAt(g, this.year);
            rings = p ? p.rings : [];
        }
        else if (h.id.startsWith('sphere:') && g) {
            rings = g.spheres.find((x) => `sphere:${x.id}` === h.id)?.rings || [];
        }
        else if (h.id.startsWith('concession:') && g) {
            const c = g.concessions.find((x) => `concession:${x.id}` === h.id);
            rings = c ? c.rings || [c.ring] : [];
        }
        else if (h.id.startsWith('region:') && g) {
            rings = g.regions.find((x) => `region:${x.id}` === h.id)?.rings || [];
        }
        else if (h.id.startsWith('claim:') && g) {
            const claim = claimAt(g, this.year);
            rings = claim?.extra.find((b) => `claim:${b.name}` === h.id)?.rings?.[0] ? claim.extra.find((b) => `claim:${b.name}` === h.id).rings : [];
        }
        else if (h.id.startsWith('cession:') && g) {
            rings = g.cessions.find((x) => `cession:${x.id}` === h.id)?.rings || [];
        }
        else if (h.id === 'territory') {
            rings = this.activeBase();
        }
        if (!rings.length)
            return;
        // 殖民地不着色也不描边了，悬停时只给面板信息，不再画红虚线
        if (h.id.startsWith('sphere:'))
            return;
        const clipIt = h.id.startsWith('cession:') || h.id.startsWith('concession:');
        ctx.save();
        if (clipIt)
            this.clipOutsideChina(this.ctx, this.viewport().w, this.viewport().h);
        ctx.setLineDash([6, 4]);
        for (const r of rings) {
            const pts = r.map(([lng, lat]) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                return { x, y };
            });
            ring(pts, true);
            ctx.strokeStyle = 'rgba(255,253,247,.85)';
            ctx.lineWidth = 4.5;
            ctx.stroke();
            ctx.strokeStyle = ACCENT;
            ctx.lineWidth = 1.8;
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }
    /** 悬停命中：点 → 标签 → 线 → 区域，逐级退让 */
    hoverAt(sx, sy) {
        const { w: vw, h: vh } = this.viewport();
        if (!vw || !vh)
            return;
        const emit = (t, h = null) => {
            this.lastTarget = t;
            const key = t ? `${t.id || ''}|${t.title || ''}|${t.meta || ''}` : '';
            if (key === this.lastHoverKey)
                return;
            this.lastHoverKey = key;
            this.hover = h;
            this.onHover(t, { x: sx, y: sy });
            this.draw(); // 重画一次，让高亮跟着走
        };
        // 1. 点
        let best = null;
        for (const hit of this.hits) {
            const d = Math.hypot(hit.x - sx, hit.y - sy);
            if (d <= hit.r && (!best || d < Math.hypot(best.x - sx, best.y - sy)))
                best = hit;
        }
        if (best) {
            emit({ id: best.id }, { kind: 'point', id: best.id });
            return;
        }
        // 2. 标签
        const lb = this.labelHits.find((l) => sx >= l.box.x && sx <= l.box.x + l.box.w && sy >= l.box.y && sy <= l.box.y + l.box.h);
        if (lb) {
            // 地理注记（河名、山名、主张区名）没有实体，直接给文字
            if (!lb.id) {
                emit({ title: lb.text, kind: lb.kind, provenance: provenanceFor(`geo:${lb.text}`) }, { kind: 'area', id: `geo:${lb.text}` });
                return;
            }
            emit({ id: lb.id }, { kind: 'point', id: lb.id });
            return;
        }
        // 2.2 本年报灾县点：在实体点与标签下面一层，点开看该县全部年份
        const cd = this.climateHitAt(sx, sy);
        if (cd) {
            emit({ title: `${cd.c} · 本年 ${cd.n} 条`, kind: '报灾县', summary: '点击查看该县 1840–1911 的全部报灾记录' });
            return;
        }
        // 2.5 势力范围分界线（1907 日俄密约）：在普通路线之前判，免得被铁路线抢走
        if (this.geo && this.layers.spheres) {
            for (const line of this.geo.sphereLines || []) {
                if (this.year < line.from || this.year >= line.to)
                    continue;
                let hit = false;
                for (let i = 1; i < line.path.length && !hit; i++) {
                    const [x1, y1] = screenOf(this.cam, vw, vh, mercX(line.path[i - 1][0]), mercY(line.path[i - 1][1]));
                    const [x2, y2] = screenOf(this.cam, vw, vh, mercX(line.path[i][0]), mercY(line.path[i][1]));
                    if (distToSegment(sx, sy, { x: x1, y: y1 }, { x: x2, y: y2 }) <= 6)
                        hit = true;
                }
                if (hit) {
                    emit({
                        title: line.name,
                        kind: '势力范围分界',
                        meta: `${line.from}–${line.to} 年`,
                        summary: line.note,
                        provenance: provenanceFor(`sphereline:${line.id}`),
                    }, { kind: 'line', id: `sphereline:${line.id}` });
                    return;
                }
            }
        }
        // 2.6 主张国境线：贴着实控边界走，常与疆域边重合，单独判一次
        if (this.geo && this.layers.claims) {
            const claim = claimAt(this.geo, this.year);
            if (claim) {
                for (const ring of claim.rings) {
                    for (let i = 1; i < ring.length; i++) {
                        const [x1, y1] = screenOf(this.cam, vw, vh, mercX(ring[i - 1][0]), mercY(ring[i - 1][1]));
                        const [x2, y2] = screenOf(this.cam, vw, vh, mercX(ring[i][0]), mercY(ring[i][1]));
                        if (distToSegment(sx, sy, { x: x1, y: y1 }, { x: x2, y: y2 }) <= 6) {
                            emit({
                                title: claim.label,
                                kind: '主张国境线',
                                meta: `${claim.from}–${claim.to} 年`,
                                summary: claim.note,
                                provenance: provenanceFor('claim:main'),
                            }, { kind: 'line', id: 'claim:main' });
                            return;
                        }
                    }
                }
            }
        }
        // 3. 线（路线、战线）：取**最近**的那条，而不是数组里第一条。
        // 北京、南京这些枢纽上铁路与出访路线叠在一起，按顺序取第一条会永远命中铁路
        let bestLine = null;
        for (const line of this.lineHits) {
            for (let i = 1; i < line.pts.length; i++) {
                const d = distToSegment(sx, sy, line.pts[i - 1], line.pts[i]);
                if (d <= 8 && (!bestLine || d < bestLine.d))
                    bestLine = { id: line.id, d };
            }
        }
        if (bestLine) {
            emit({ id: bestLine.id }, { kind: 'line', id: bestLine.id });
            return;
        }
        // 4. 区域：太平天国 → 势力范围 → 傀儡/占领 → 疆域
        const [mx, my] = worldOf(this.cam, vw, vh, sx, sy);
        const lng = mx;
        const lat = unmercY(my);
        const g = this.geo;
        if (g && this.layers.taiping) {
            const period = taipingAt(g, this.year);
            if (period && pointInRings(lng, lat, period.rings)) {
                emit({
                    title: '太平天国',
                    kind: '控制区',
                    meta: `${period.from} 年 · ${period.label}`,
                    summary: period.detail,
                    provenance: provenanceFor('taiping'),
                }, { kind: 'area', id: 'taiping' });
                return;
            }
        }
        if (g && this.layers.claims) {
            const claim = claimAt(g, this.year);
            // 小块优先：唐努乌梁海整个压在外蒙古的多边形里，按面积从小到大判才不会总命中外蒙
            const blocks = [...(claim?.extra || [])].sort((a, b) => blockArea(a) - blockArea(b));
            for (const block of blocks) {
                if (!pointInRings(lng, lat, block.rings))
                    continue;
                emit({
                    title: block.name,
                    kind: '主张范围（未实控）',
                    meta: `${this.year} 年 · 中华民国主张`,
                    summary: block.note,
                    provenance: provenanceFor(`claim:${block.name}`),
                }, { kind: 'area', id: `claim:${block.name}` });
                return;
            }
        }
        if (g && this.layers.spheres) {
            // 小的先判：租借地 → 割让/共管 → 占领区，最后才是列强的大块势力范围。
            // 否则旅大、瑷珲、伊犁这些都会被「沙俄/苏联」的大绿块盖住，悬停只能看到「沙俄」。
            for (const c of g.concessions) {
                if (this.year < c.from || this.year >= c.to)
                    continue;
                if (pointInRings(lng, lat, c.rings || [c.ring])) {
                    emit({
                        title: `${powerName(g, c.power, this.year)} · ${c.label}`,
                        kind: '租借地',
                        meta: `${c.from}–${c.to} 年`,
                        summary: c.note,
                        provenance: provenanceFor(`concession:${c.id}`),
                    }, { kind: 'area', id: `concession:${c.id}` });
                    return;
                }
            }
            if (this.layers.cessions) {
                for (const c of cessionsAt(g, this.year)) {
                    if (c.id === 'cede.taiwan')
                        continue; // 悬停交给 region「日据台湾」
                    if (!pointInRings(lng, lat, c.rings))
                        continue;
                    const treaty = this.entities.find((e) => e.treaty?.ceded?.includes(c.name));
                    emit({
                        title: c.name,
                        kind: c.status === 'joint' ? '中俄共管' : '条约割地',
                        meta: `${c.from} 年 · ${c.approximate ? '范围示意 · ' : ''}${c.note || ''}`,
                        provenance: provenanceFor(`cession:${c.id}`),
                        summary: treaty
                            ? `《${treaty.treaty?.name}》${treaty.treaty?.signed} 年签订，割让 ${(treaty.treaty?.ceded || []).join('、')}`
                            : undefined,
                    }, { kind: 'area', id: `cession:${c.id}` });
                    return;
                }
            }
            for (const r of g.regions) {
                if (this.year < r.from || this.year >= r.to)
                    continue;
                if (r.clipRects && !r.clipRects.some(([x1, y1, x2, y2]) => lng >= x1 && lng <= x2 && lat >= y1 && lat <= y2)) {
                    continue;
                }
                if (pointInRings(lng, lat, r.rings)) {
                    emit({
                        title: r.label,
                        kind: r.kindLabel || REGION_KIND_LABEL[r.kind],
                        meta: `${r.from}–${r.to} 年`,
                        summary: r.note,
                        provenance: provenanceFor(`region:${r.id}`),
                    }, { kind: 'area', id: `region:${r.id}` });
                    return;
                }
            }
            for (const sph of g.spheres) {
                if (this.year < sph.from || this.year >= sph.to)
                    continue;
                if (pointInRings(lng, lat, sph.rings)) {
                    emit({
                        title: `${powerName(g, sph.power, this.year)} · ${sph.label}`,
                        kind: '势力范围',
                        meta: `${sph.from}–${sph.to} 年`,
                        summary: sph.note,
                        provenance: provenanceFor(`sphere:${sph.id}`),
                    }, { kind: 'area', id: `sphere:${sph.id}` });
                    return;
                }
            }
        }
        // 2.7 军阀势力：放在列强/租界/傀儡政权之后，外国的面先命中；中国境内的省再按这个判定
        if (g && this.layers.warlords && g.warlordZones) {
            const period = this.warlordPeriod();
            if (period) {
                for (const prov of g.warlordZones.provinces) {
                    const zone = prov.periods[period.id];
                    if (!zone)
                        continue;
                    const shape = g.warlordProvinces.find((p) => p.id === prov.id);
                    if (!shape || !pointInRings(lng, lat, shape.rings))
                        continue;
                    emit({
                        title: `${prov.name} · ${zone.clique}`,
                        kind: '军阀势力',
                        meta: `${period.label} · ${period.from}–${period.to} 年${zone.contested ? ' · 争夺中' : ''}`,
                        summary: `军政长官：${zone.leader}${zone.note ? `。${zone.note}` : ''}`,
                        provenance: provenanceFor(`warlord:${prov.id}`),
                    }, { kind: 'area', id: `warlord:${prov.id}` });
                    return;
                }
            }
        }
        // 1840 基线只认「线」：以前整块填色都算命中，鼠标在中国境内任何地方都会
        // 弹出「1840 实控基线」，把点选和空白点击都吃掉了。现在只在贴着边界线时才算。
        if (this.nearBaseBoundary(sx, sy, vw, vh)) {
            // 贴着藩部 / 主张块的那一段边界，按治理形态说；其余按直辖说
            const t = this.tierAt(lng, lat);
            if (t) {
                emit({
                    title: t.region.label,
                    kind: t.tier.label,
                    meta: `${t.region.from}–${t.region.to} 年`,
                    summary: t.region.note || t.tier.note,
                    provenance: provenanceFor(`region:${t.region.id}`),
                }, { kind: 'area', id: `region:${t.region.id}` });
                return;
            }
            const direct = this.baseTiers.find((x) => x.key === 'direct');
            emit({
                // 这块填色永远是 1840 快照（叠加层另画变化），所以标题不分年份，
                // 免得后来的年份被读成「中华民国疆域」——它只是拿来做对比的基准。
                title: '清朝 1840 年实控基线（快照）',
                kind: direct?.label || '直辖',
                meta: '1840 年实控基线 · 行省 / 将军辖区 / 办事大臣辖区',
                summary: direct?.note || this.baseNote,
                provenance: provenanceFor('territory'),
            }, { kind: 'area', id: 'territory' });
            return;
        }
        emit(null);
    }
    /** 图例用：当前这一年真正画成实显的东西 */
    visibleTypes() {
        return [...this.currentTypes];
    }
    visibleEventCategories() {
        return [...this.currentCategories];
    }
    /** 选中的实体：标签永远参与求解（优先级最高），不会被挤掉。 */
    setSelected(id) {
        this.selectedId = id;
        this.draw();
    }
    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height)
            return;
        const w = Math.round(rect.width * dpr);
        const h = Math.round(rect.height * dpr);
        if (this.canvas.width !== w)
            this.canvas.width = w;
        if (this.canvas.height !== h)
            this.canvas.height = h;
        // 位图尺寸必须是 CSS 尺寸的 dpr 整数倍：只要不是，浏览器合成时会把整张位图
        // 按一个非整数比例缩放，偏差随 x/y 累积——细线只有贴着原点那一根还是 1px，
        // 越远越粗、粗细不匀（2026-11-09 用户反馈的现象）。把 CSS 尺寸设成 位图/dpr 即可。
        this.canvas.style.width = `${w / dpr}px`;
        this.canvas.style.height = `${h / dpr}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!this.cam.w)
            this.cam = { ...this.home };
        this.draw();
    }
    /** 画布的 CSS 视口尺寸（与位图严格对应，别用 clientWidth——它是取整过的） */
    viewport() {
        const dpr = window.devicePixelRatio || 1;
        return {
            w: this.canvas.width ? this.canvas.width / dpr : this.canvas.clientWidth,
            h: this.canvas.height ? this.canvas.height / dpr : this.canvas.clientHeight,
        };
    }
    reset() {
        this.cam = { ...this.home };
        this.draw();
    }
    /**
     * 双击：把当年中央政府实际控制的疆域铺满视口。
     *
     * 注意要避开右侧详情栏——按整个画布居中会让疆域压在面板底下。
     * 算法：取疆域的世界坐标 bbox，算出可用区（扣掉面板）的像素尺寸与中心，
     * 由 bbox 推相机宽高，再反推左上角。
     */
    fitToControl(pad = 0.08) {
        const { w: vw, h: vh } = this.viewport();
        if (!vw || !vh)
            return;
        const rings = this.activeBase();
        const all = [];
        for (const ring of rings)
            all.push(...ring);
        if (!all.length)
            return;
        // 可用区域：画布减去右侧详情栏
        // 可用区域 = 画布减去右侧详情栏
        let availW = vw;
        const panel = document.getElementById('panel');
        if (panel) {
            const pr = panel.getBoundingClientRect();
            const cr = this.canvas.getBoundingClientRect();
            const panelLeft = pr.left - cr.left;
            if (pr.width > 1 && panelLeft > vw * 0.4)
                availW = Math.max(vw * 0.4, panelLeft - 12);
        }
        this.cam = fitCameraInRect(boundsOf(all), { x: 0, y: 0, w: availW, h: vh }, { w: vw, h: vh }, pad);
        this.draw();
    }
    bind() {
        // 双击循环：全景 → 在点击处放大 → 再放大 → 回全景
        this.canvas.addEventListener('dblclick', (ev) => {
            ev.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const sx = ev.clientX - rect.left;
            const sy = ev.clientY - rect.top;
            if (this.dblStep === 0) {
                this.fitToControl();
                this.dblStep = 1;
            }
            else if (this.dblStep === 1 || this.dblStep === 2) {
                this.zoomAtPoint(sx, sy, 1 / 2.2);
                this.dblStep += 1;
                if (this.dblStep > 2)
                    this.dblStep = 3;
            }
            else {
                this.fitToControl();
                this.dblStep = 0;
            }
        });
        this.canvas.addEventListener('mousemove', (ev) => {
            if (this.dragging)
                return;
            const rect = this.canvas.getBoundingClientRect();
            this.hoverAt(ev.clientX - rect.left, ev.clientY - rect.top);
        });
        this.canvas.addEventListener('mouseleave', () => {
            this.lastHoverKey = '';
            this.onHover(null);
        });
        this.canvas.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            this.dblStep = 0;
            const rect = this.canvas.getBoundingClientRect();
            const factor = ev.deltaY > 0 ? 1.15 : 1 / 1.15;
            this.cam = zoomAt(this.cam, rect.width, rect.height, ev.clientX - rect.left, ev.clientY - rect.top, factor);
            this.draw();
        }, { passive: false });
        this.canvas.addEventListener('pointerdown', (ev) => {
            this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
            this.canvas.setPointerCapture(ev.pointerId);
            // 第二根手指落下：从「拖动」切成「双指缩放」，这一下松手不该选中任何东西
            if (this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];
                this.pinch = {
                    dist: Math.hypot(a.x - b.x, a.y - b.y),
                    mx: (a.x + b.x) / 2,
                    my: (a.y + b.y) / 2,
                };
                this.dragging = false;
                this.moved = 99;
                this.canvas.classList.remove('dragging');
                return;
            }
            // 拖动会改变视图，双击循环从头开始
            this.dragging = true;
            this.moved = 0;
            this.last = [ev.clientX, ev.clientY];
            this.canvas.classList.add('dragging');
        });
        this.canvas.addEventListener('pointermove', (ev) => {
            const tracked = this.pointers.get(ev.pointerId);
            if (tracked) {
                tracked.x = ev.clientX;
                tracked.y = ev.clientY;
            }
            // 双指缩放：按两指距离的比例缩、按中点平移（触摸屏没有滚轮）
            if (this.pinch && this.pointers.size >= 2) {
                const [a, b] = [...this.pointers.values()];
                const rect = this.canvas.getBoundingClientRect();
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                if (this.pinch.dist > 0 && dist > 0 && rect.width && rect.height) {
                    this.zoomAtPoint(mx - rect.left, my - rect.top, this.pinch.dist / dist);
                    const dx = ((mx - this.pinch.mx) / rect.width) * this.cam.w;
                    const dy = ((my - this.pinch.my) / rect.height) * this.cam.h;
                    this.cam.x -= dx;
                    this.cam.y -= dy;
                    this.draw();
                }
                this.pinch = { dist, mx, my };
                return;
            }
            if (!this.dragging)
                return;
            this.moved += Math.hypot(ev.clientX - this.last[0], ev.clientY - this.last[1]);
            if (Math.hypot(ev.clientX - this.last[0], ev.clientY - this.last[1]) > 3)
                this.dblStep = 0;
            const rect = this.canvas.getBoundingClientRect();
            const dx = ((ev.clientX - this.last[0]) / rect.width) * this.cam.w;
            const dy = ((ev.clientY - this.last[1]) / rect.height) * this.cam.h;
            this.cam.x -= dx;
            this.cam.y -= dy;
            this.last = [ev.clientX, ev.clientY];
            this.draw();
        });
        this.canvas.addEventListener('pointercancel', (ev) => {
            this.pointers.delete(ev.pointerId);
            if (this.pointers.size < 2)
                this.pinch = null;
            this.dragging = false;
            this.canvas.classList.remove('dragging');
        });
        this.canvas.addEventListener('pointerup', (ev) => {
            this.pointers.delete(ev.pointerId);
            if (this.pointers.size < 2)
                this.pinch = null;
            const dragged = this.moved > 6;
            this.dragging = false;
            this.canvas.classList.remove('dragging');
            // 拖着看地图的时候松手，不该顺手打开「刚好路过的那一点」（触摸屏上尤其明显）
            if (dragged)
                return;
            const rect = this.canvas.getBoundingClientRect();
            const sx = ev.clientX - rect.left;
            const sy = ev.clientY - rect.top;
            let best = null;
            for (const hit of this.hits) {
                const d = Math.hypot(hit.x - sx, hit.y - sy);
                if (d <= hit.r && (!best || d < Math.hypot(best.x - sx, best.y - sy)))
                    best = hit;
            }
            // 点优先；点在标签框里也算命中（标签比点大，好点）
            if (!best) {
                const lb = this.labelHits.find((l) => sx >= l.box.x && sx <= l.box.x + l.box.w && sy >= l.box.y && sy <= l.box.y + l.box.h);
                if (lb && lb.id) {
                    this.onPick(lb.id);
                    return;
                }
            }
            if (best) {
                this.onPick(best.id);
                return;
            }
            // 报灾县点在实体点下面一层：点到它就看该县 1840–1911 的全部记录
            const cd = this.climateHitAt(sx, sy);
            if (cd) {
                this.onClimatePick(cd.c);
                return;
            }
            // 没点到实体：先按悬停那套判一次地理要素（国境线、割让面、势力范围、注记…），
            // 命中就给它开详情卡，否则才算点在空白处
            this.hoverAt(sx, sy);
            const target = this.lastTarget;
            if (target) {
                this.onPickTarget(target);
                return;
            }
            this.onEmpty();
        });
    }
    /**
     * 本年报灾县点：小方点，颜色按灾种；只画有坐标的县（构建时对过现代县名，约覆盖 88% 记录）。
     * 画在实体点下面一层，免得盖住事件与人物。
     */
    drawClimateDots(vw, vh) {
        this.climateHits = [];
        const dots = this.climateDots;
        if (!dots.length)
            return;
        const { ctx } = this;
        const COLORS = {
            旱: 'rgba(150,88,38,.95)', 水: 'rgba(45,88,120,.95)', 蝗: 'rgba(104,104,30,.95)',
            饥: 'rgba(122,40,30,.95)', 风: 'rgba(66,100,84,.95)', 雪: 'rgba(96,120,146,.95)',
            疫: 'rgba(92,58,92,.95)', 雹: 'rgba(120,108,90,.95)', 霜: 'rgba(120,108,90,.95)',
            震: 'rgba(120,108,90,.95)',
        };
        ctx.save();
        ctx.lineWidth = 0.6;
        for (const d of dots) {
            const [x, y] = screenOf(this.cam, vw, vh, mercX(d.lon), mercY(d.lat));
            if (x < -10 || y < -10 || x > vw + 10 || y > vh + 10)
                continue;
            ctx.fillStyle = COLORS[d.kind] || 'rgba(138,128,112,.85)';
            ctx.strokeStyle = 'rgba(255,253,247,.7)';
            ctx.beginPath();
            ctx.rect(x - 2.5, y - 2.5, 5, 5);
            ctx.fill();
            ctx.stroke();
            // 命中框比点大一圈：5px 的点直接点很难点中，县城密度又高
            this.climateHits.push({ c: d.c, n: d.n, x, y, r: 7 });
        }
        ctx.restore();
    }
    /** 屏幕坐标上的报灾县点（取最近的一个） */
    climateHitAt(sx, sy) {
        let best = null;
        for (const h of this.climateHits) {
            const d = Math.hypot(h.x - sx, h.y - sy);
            if (d <= h.r && (!best || d < Math.hypot(best.x - sx, best.y - sy)))
                best = h;
        }
        return best ? { c: best.c, n: best.n } : null;
    }
    draw() {
        const { ctx } = this;
        const { w: vw, h: vh } = this.viewport();
        if (!vw || !vh)
            return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
        // 水色
        ctx.fillStyle = '#e2eaee';
        ctx.fillRect(0, 0, vw, vh);
        const g0 = this.geo;
        // 细节层按窗口裁：世界视野起步时根本没取，转进东亚再补一次（只通知一次）
        if (g0 && !g0.landDetail.length && this.onDetailNeeded && this.wantsDetail()) {
            const fn = this.onDetailNeeded;
            this.onDetailNeeded = null;
            fn();
        }
        // 大陆垫底：只画一整块陆地，不画国界（邻国版图在变，画现代国界反而是错的）
        if (g0?.land.length) {
            ctx.fillStyle = '#e7e2d6';
            ctx.strokeStyle = 'rgba(165,155,135,.5)';
            ctx.lineWidth = 0.8;
            // 东亚窗口内改用 10m 细节层画，粗层在这里先让开——
            // 否则 110m 的海岸线会从细节海岸外冒出一条灰边
            ctx.save();
            const clipped = this.clipOutsideDetail(vw, vh);
            if (clipped) {
                for (const ring of g0.land)
                    this.strokeRing(ring, vw, vh);
            }
            else {
                for (const ring of g0.land) {
                    const pts = this.worldRing(ring, vw, vh, this.worldShift(ring));
                    if (!pts)
                        continue;
                    ctx.beginPath();
                    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
            }
            ctx.restore();
            // 东亚细节层：10m 海岸线叠在 110m 之上，放大后才不显折角
            for (const ring of g0.landDetail || []) {
                const pts = this.worldRing(ring, vw, vh, this.worldShift(ring));
                if (!pts)
                    continue;
                ctx.beginPath();
                pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.closePath();
                ctx.fill('evenodd');
                ctx.stroke();
            }
            // 把陆地轮廓收进一个 Path2D：疆域填充要按它裁剪，免得库页、海岛边缘露出灰边
        }
        // 列强殖民地：不再着色、不再画边界线（2026-11-10）。
        // 英属印度/缅甸、法属印支、日属朝鲜这些，边界又长又敏感（藏南、印巴分治…），
        // 画出来反而要解释；改成只在外围放一个国名标注（polities.json），由地图按年份挑。
        // 主张国境线：先画虚线，再画疆域填充——与实控重合的段会被实线盖住，
        // 只有「主张了但没控住」的地方（外蒙、唐努乌梁海）才会露在外面
        const claim = g0 && this.layers.claims ? claimAt(g0, this.year) : null;
        if (claim) {
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = 'rgba(138,106,74,.75)';
            ctx.lineWidth = 1.3;
            for (const ring of claim.rings) {
                ctx.beginPath();
                ring.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }
        // 疆域：填色与描边
        for (const ring of this.activeBase()) {
            ctx.save();
            ctx.beginPath();
            ring.forEach(([lng, lat], i) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fillStyle = '#f2e8d3';
            ctx.fill();
            ctx.strokeStyle = '#b8a88c';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }
        // 1934 校准图垫在「我们的线」下面：这样边界、标签、事件点都压在图上，方便逐处比对
        this.overlay?.paint(this.ctx, this.cam, vw, vh);
        this.drawGraticule(vw, vh);
        this.drawGeo(vw, vh);
        this.drawTaiping(vw, vh);
        this.drawRegions(vw, vh);
        this.drawWarlords(vw, vh);
        this.drawLeagues(vw, vh);
        this.drawClaimExtra(vw, vh);
        this.drawCessions(vw, vh);
        this.drawSphereLines(vw, vh);
        this.drawSealanes(vw, vh);
        this.drawSouthSea(vw, vh);
        this.drawRailways(vw, vh);
        this.drawConcessions(vw, vh);
        this.drawClimateDots(vw, vh);
        this.hits = [];
        this.lineHits = [];
        this.segments = [];
        this.currentTypes.clear();
        this.currentCategories.clear();
        // 检索高亮：只有当命中项真的落在这一年时才压暗其它，否则整幅图会变成一片灰
        const highlight = this.highlight;
        const dimOthers = highlight !== null &&
            this.entities.some((e) => {
                if (!highlight.has(e.id))
                    return false;
                const sp = spanOf(e);
                return !!sp && sp[0] <= this.year + 0.5 && sp[1] >= this.year - 1.5;
            });
        // 线：路线与战线
        for (const e of this.entities) {
            if (e.type !== 'route' && e.type !== 'front')
                continue;
            if (this.hiddenTypes.has(e.type))
                continue;
            // 行军路线由 drawMarch 单独画（弧线 + 箭头），这里再画一遍就成了两条线
            if (e.type === 'route' && e.tags?.includes('行军'))
                continue;
            const sp = spanOf(e);
            if (sp && (this.year < sp[0] - 0.5 || this.year > sp[1] + 0.5))
                continue;
            // 多段行程（出逃、出洋这类）：每段可以带自己的时间，只画当年该走的那一段。
            // 否则 1904–1909 的「达赖出走库伦」会把四段行程叠在一起画五年，
            // 库伦到塔尔寺、塔尔寺到北京全在图上，看着像一张网。
            const lines = (e.space?.lines || []).filter((line) => lineActiveAt(line, this.year));
            if (!lines.length)
                continue;
            const isRail = !!e.tags?.includes('铁路');
            // 出访路线走弧线（抽稀到转折点 + Catmull–Rom）；铁路不这么画：
            // 铁路本来就沿着河谷、山麓走，样条会在每两站之间鼓出一个不存在的弯。
            // 铁路的正确做法是把沿线站点/中间站画全，用折线连起来（见 data/railway-vias.json）。
            const smooth = lines.map((line) => {
                const pts = (line.geometry.coordinates || []).map(([lng, lat]) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                    return { x, y };
                });
                return isRail ? simplifyPath(pts, 1) : smoothLine(pts, 12);
            });
            ctx.beginPath();
            for (const pts of smooth) {
                pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            }
            ctx.globalAlpha = dimOthers && highlight && !highlight.has(e.id) ? 0.15 : 1;
            // 命中表与避让段用平滑后的线，和画出来的一致
            for (const pts of smooth) {
                if (pts.length >= 2) {
                    this.lineHits.push({
                        id: e.id,
                        pts,
                        color: e.type === 'front' ? '#b03626' : '#4c3e30',
                    });
                }
            }
            for (const pts of smooth) {
                for (let i = 1; i < pts.length; i++) {
                    this.segments.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y, owner: e.id });
                }
            }
            // 铁路用暖墨色，跟水系（蓝）拉开；战线仍是红虚线
            // 西逃这类单条出逃路线给个更重的赭红，和铁路、战线区分开
            const flight = e.tags?.includes('西逃') || e.tags?.includes('回銮');
            const isReturn = e.tags?.includes('回銮');
            const march = e.tags?.includes('西征');
            const tour = e.tags?.includes('游历');
            const study = e.tags?.includes('考察');
            const lama = e.tags?.includes('出行');
            ctx.strokeStyle = lama
                ? 'rgba(140,96,56,.7)'
                : study
                    ? 'rgba(108,80,128,.7)'
                    : tour
                        ? 'rgba(74,104,84,.7)'
                        : march
                            ? 'rgba(64,92,120,.7)'
                            : flight
                                ? 'rgba(146,62,44,.68)'
                                : e.type === 'front'
                                    ? 'rgba(176,54,38,.8)'
                                    : isRail
                                        ? 'rgba(64,50,38,.6)'
                                        : 'rgba(76,62,48,.5)';
            // 线宽整体收一档（2026-11-13）：出访/行军路线以前 2.2，和铁路、省界抢视觉重量，
            // 一条达赖出逃线压过整片疆域；现在细线仍然认得出，但不再主导画面。
            ctx.lineWidth = isRail
                ? 1.4
                : march || flight || study || lama
                    ? 1.5
                    : e.type === 'front'
                        ? 2
                        : 1.1;
            // 回銮走的是原路，用虚线区分，免得和西逃线叠在一起看不清
            ctx.setLineDash(e.type === 'front' ? [7, 5] : isReturn ? [6, 5] : []);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            this.currentTypes.add(e.type);
        }
        // 点：事件 / 组织 / 地点
        for (const e of this.entities) {
            if (e.type === 'route' || e.type === 'front')
                continue;
            if (this.hiddenTypes.has(e.type))
                continue;
            const sp = spanOf(e);
            if (!sp)
                continue;
            // 未来不画；过去淡显；当年 ±1 实显
            if (sp[0] > this.year + 0.5)
                continue;
            const pts = e.space?.points || [];
            // 没有坐标的（货币、疆域、主题等）不落点，也不该进图例
            if (!pts.length)
                continue;
            const isCurrent = sp[1] >= this.year - 1.5;
            if (isCurrent) {
                this.currentTypes.add(e.type);
                if (e.type === 'event')
                    this.currentCategories.add(e.category || 'other');
            }
            for (const p of pts) {
                const isActivity = p.role === 'activity';
                // 活动地只在它自己的年份窗里出现；出生/籍贯点没有 time，一直显示
                if (isActivity && !this.pointActiveAt(p))
                    continue;
                const [x, y] = screenOf(this.cam, vw, vh, mercX(worldLng(p.coord[0])), mercY(p.coord[1]));
                if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20)
                    continue;
                const dimmed = dimOthers && highlight !== null && !highlight.has(e.id);
                ctx.globalAlpha = dimmed ? 0.12 : isCurrent ? 0.9 : 0.18;
                if (isActivity) {
                    // 空心圈：和实心的籍贯/出生点分开，一眼看出这是「那一年他在哪」
                    ctx.beginPath();
                    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,253,247,.92)';
                    ctx.fill();
                    ctx.strokeStyle = COLORS[e.type] || '#6b5a3a';
                    ctx.lineWidth = 1.3;
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                    if (isCurrent)
                        this.hits.push({ id: e.id, x, y, r: 5.5 });
                    continue;
                }
                let r;
                if (e.type === 'event') {
                    // 事件按类别给图标：形状 + 颜色，图例同一份数据
                    const style = categoryStyle(e.category);
                    r = style.r;
                    this.drawGlyph(style, x, y, r);
                    if (isCurrent)
                        this.hits.push({ id: e.id, x, y, r: Math.max(6.5, r + 3) });
                    ctx.globalAlpha = 1;
                    continue;
                }
                r = e.type === 'organization' ? 3.6 : 2.6;
                ctx.beginPath();
                if (e.type === 'organization') {
                    ctx.moveTo(x, y - r);
                    ctx.lineTo(x + r, y);
                    ctx.lineTo(x, y + r);
                    ctx.lineTo(x - r, y);
                    ctx.closePath();
                }
                else {
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                }
                ctx.fillStyle = COLORS[e.type] || '#6b5a3a';
                ctx.fill();
                ctx.globalAlpha = 1;
                if (isCurrent)
                    this.hits.push({ id: e.id, x, y, r: Math.max(6, r + 3) });
            }
        }
        const marching = this.drawMarch(vw, vh);
        this.drawSelected();
        this.drawHover(vw, vh);
        this.drawLabels(vw, vh);
        // 有行军箭头就持续走虚线，没有就停（不空转）
        if (marching && this.layers.march)
            this.startMarchAnimation();
        else
            this.stopMarchAnimation();
        // 比例尺 + 年份行（都压在地图左下角：比例尺在上，年份在下）
        this.drawScaleBar(vw, vh);
        ctx.fillStyle = '#8a8070';
        ctx.font = '11px system-ui, sans-serif';
        const reign = reignAt(this.year);
        ctx.fillText(`公元 ${this.year} 年 · ${eraAt(this.year).label}${reign ? ' · ' + reign.name : ''}`, 12, vh - 12);
    }
    /**
     * 比例尺：左下角一根横杠 + 两个端刻 + 「N 公里」。
     * 比例按**视图中心纬度**算——墨卡托高纬放大，一张跨 36° 纬度的全国图上下本来差 15%，
     * 取中心是通行做法；近景（城市级）时上下差别可以忽略。文字带白描边，压在任何底色上都读得出。
     */
    drawScaleBar(vw, vh) {
        const { ctx } = this;
        const x = 12;
        const y = vh - 36;
        const latMid = unmercY(this.cam.y + this.cam.h / 2);
        const kmPerPx = kmPerPxAt(this.cam, vw, latMid);
        if (!(kmPerPx > 0))
            return;
        const bar = niceScaleBar(1 / kmPerPx);
        if (!(bar.px > 2))
            return;
        ctx.save();
        ctx.strokeStyle = 'rgba(90, 74, 51, .85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, Math.round(y) + 0.5);
        ctx.lineTo(x + bar.px, Math.round(y) + 0.5);
        ctx.moveTo(x + 0.5, Math.round(y) + 0.5);
        ctx.lineTo(x + 0.5, Math.round(y) - 4.5);
        ctx.moveTo(x + bar.px - 0.5, Math.round(y) + 0.5);
        ctx.lineTo(x + bar.px - 0.5, Math.round(y) - 4.5);
        ctx.stroke();
        ctx.font = '11px system-ui, sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(250, 246, 238, .92)';
        ctx.strokeText(bar.label, x, y - 7);
        ctx.fillStyle = '#5b4a33';
        ctx.fillText(bar.label, x, y - 7);
        ctx.restore();
    }
    /** 底图辅助图层：先山川底纹，再湖泊、河流、长城、现代省界。 */
    /**
     * 经纬网与北回归线。经线是竖线、纬线是横线，直接按相机换算屏幕坐标；
     * 世界在太平洋处接缝，经线在 ±360° 的副本上再画一遍。
     */
    drawGraticule(vw, vh) {
        const g = this.layers;
        if (!g.graticule && !g.tropic)
            return;
        const { ctx } = this;
        const x0 = this.cam.x;
        const x1 = x0 + this.cam.w;
        const y0 = this.cam.y;
        const y1 = y0 + this.cam.h;
        const sx = (wx) => ((wx - x0) / this.cam.w) * vw;
        const sy = (wy) => ((wy - y0) / this.cam.h) * vh;
        // 画布按 devicePixelRatio 放大过（见 resize），线宽要除以 dpr 才是**一个物理像素**；
        // 再对齐到像素中心，否则 1px 线会被抗锯齿摊成两像素、看起来发粗。
        const dpr = window.devicePixelRatio || 1;
        const crisp = (v) => Math.round(v * dpr) / dpr + 0.5 / dpr;
        // 左上的图层面板会盖住左边缘：被它压住的纬度标签挪到面板右侧
        const box = this.layerBoxRect();
        const latLabelX = (y) => box && y > box.y - 2 && y < box.y + box.h + 2 ? box.x + box.w + 6 : 5;
        ctx.save();
        if (g.graticule) {
            const step = graticuleStep(this.cam.w);
            ctx.strokeStyle = 'rgba(122,110,92,.18)';
            ctx.lineWidth = 1 / dpr;
            ctx.setLineDash([]);
            for (let lon = -180; lon < 180; lon += step) {
                for (let k = -1; k <= 2; k += 1) {
                    const wx = lon + k * 360;
                    if (wx < x0 || wx > x1)
                        continue;
                    const x = crisp(sx(wx));
                    ctx.strokeStyle = 'rgba(122,110,92,.18)';
                    ctx.lineWidth = 1 / dpr;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, vh);
                    ctx.stroke();
                    this.edgeText(formatLon(lon), x + 3, 11);
                }
            }
            for (let lat = -80; lat <= 80; lat += step) {
                const wy = mercY(lat);
                if (wy < y0 || wy > y1)
                    continue;
                const y = crisp(sy(wy));
                ctx.strokeStyle = 'rgba(122,110,92,.18)';
                ctx.lineWidth = 1 / dpr;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(vw, y);
                ctx.stroke();
                this.edgeText(formatLat(lat), latLabelX(y), y - 4);
            }
        }
        if (g.tropic) {
            const wy = mercY(TROPIC_LAT);
            if (wy >= y0 && wy <= y1) {
                const y = crisp(sy(wy));
                ctx.setLineDash([9, 6]);
                ctx.strokeStyle = 'rgba(176,120,74,.55)';
                ctx.lineWidth = 1.5 / dpr;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(vw, y);
                ctx.stroke();
                ctx.setLineDash([]);
                this.edgeText('北回归线 23°26′N', 5, y - 4, 'rgba(150,96,52,.85)');
            }
        }
        ctx.restore();
    }
    /** 图层面板的矩形（canvas 坐标）；没面板时返回 null */
    layerBoxRect() {
        const el = document.getElementById('layer-box');
        if (!el)
            return null;
        const r = el.getBoundingClientRect();
        const c = this.canvas.getBoundingClientRect();
        if (r.width < 1 || r.height < 1)
            return null;
        return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
    }
    /**
     * 边缘上的小字：纸色描边当底，压在图上也能看清。
     * save/restore 是必须的——它会把 lineWidth/strokeStyle 改成描边用的值，
     * 泄漏到调用方就会把下一根经纬线画成 3px 的纸色带（2026-11-09 踩过）。
     */
    edgeText(text, x, y, color = 'rgba(96,86,70,.6)') {
        const { ctx } = this;
        ctx.save();
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(246,241,230,.85)';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.restore();
    }
    drawGeo(vw, vh) {
        const g = this.geo;
        if (!g)
            return;
        const ctx = this.ctx;
        const [ox, oy] = [this.cam.x, this.cam.y];
        const sx = (lng) => ((mercX(lng) - ox) / this.cam.w) * vw;
        const sy = (lat) => ((mercY(lat) - oy) / this.cam.h) * vh;
        const path = (pts, close = false) => {
            ctx.beginPath();
            for (let i = 0; i < pts.length; i++) {
                const x = sx(pts[i][0]);
                const y = sy(pts[i][1]);
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            }
            if (close)
                ctx.closePath();
        };
        // 山川与湖泊裁剪在陆地轮廓内：山系不认国界，但底图认——画到海上就成污渍了。
        // 2026-11-10 起换成**全球 110m 陆地**：原来裁在 1840 疆域里，中国以外什么都画不出来，
        // 图上的山川只有中国一块。源数据（NE 50m 地理区划、10m 湖泊）本来就顺着海岸走，
        // 这一层裁剪只是兜底，免得放大后有一两处压到海面上。
        const clipToLand = () => {
            const land = g.land?.length ? g.land : this.activeBase();
            const clip = new Path2D();
            for (const ring of land) {
                const shift = this.worldShift(ring);
                ring.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                    if (i === 0)
                        clip.moveTo(x, y);
                    else
                        clip.lineTo(x, y);
                });
                clip.closePath();
            }
            ctx.clip(clip);
        };
        ctx.save();
        clipToLand();
        // 山川：山系/高原/盆地各一层淡底纹（2026-11-10 起全球）
        if (this.layers.relief) {
            for (const kind of ['plateau', 'basin', 'range']) {
                const style = RELIEF_STYLE[kind];
                // 只铺淡底纹、不描边：一描边就成了「色块」，铺一层反而像高程
                ctx.fillStyle = style.fill;
                for (const r of g.relief) {
                    if (r.k !== kind)
                        continue;
                    // 美洲的山系在东移 360° 的那一格里，不按环的平均经度平移会画到接缝左边
                    const shift = this.worldShift(r.c);
                    ctx.beginPath();
                    r.c.forEach(([lng, lat], i) => {
                        const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                        if (i === 0)
                            ctx.moveTo(x, y);
                        else
                            ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }
        // 湖泊（2026-11-10 起全球：只收有中文名的大湖，里海由陆地的洞补出来）
        if (this.layers.hydrology) {
            ctx.fillStyle = 'rgba(186,208,216,.85)';
            ctx.strokeStyle = 'rgba(130,160,175,.5)';
            ctx.lineWidth = 0.5;
            for (const l of g.lakes) {
                // 美洲的湖在东移 360° 那一格里，和陆地、山川一样要平移
                const shift = this.worldShift(l.c);
                ctx.beginPath();
                l.c.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            // 细节湖泊：洞庭、鄱阳、太湖这些小湖在 50m 数据里只剩几个折角
            for (const l of g.lakesDetail || []) {
                path(l, true);
                ctx.fill();
                ctx.stroke();
            }
        }
        ctx.restore();
        // 周边城市（2026-11-10）：只在中国周边的国家标；世界视野（cam.w 太大）收起来，免得挤成一片
        if (this.layers.cities && this.cam.w < 220) {
            ctx.fillStyle = '#6b5a45';
            for (const city of g.cities) {
                if (!cityNation(city, this.year, g.polities))
                    continue;
                const shift = this.worldShift([city.c]);
                const [x, y] = screenOf(this.cam, vw, vh, mercX(city.c[0] + shift), mercY(city.c[1]));
                if (x < -10 || y < -10 || x > vw + 10 || y > vh + 10)
                    continue;
                ctx.beginPath();
                ctx.arc(x, y, 2.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(247,242,230,.9)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
        // 河流：干流粗、支流细（不裁，跨境河流本来就是越界的）
        // 窗口内用 10m 细节层，粗层在窗口内让开，避免两条线错位叠在一起
        if (this.layers.hydrology) {
            ctx.save();
            this.clipOutsideDetail(vw, vh);
            const yellowNow = modernYellowActive(this.year);
            for (const r of g.rivers) {
                // 1855 年前黄河走淮河入海、1938–1947 年南泛：那时山东段还不存在，
                // 但上游（兰考以西）一直是同一条河，必须留着——只掐掉下游那一段
                if (r.n === '黄河' && !yellowNow && downstreamOnly(r.c))
                    continue;
                const shift = this.worldShift(r.c);
                ctx.beginPath();
                for (let i = 0; i < r.c.length; i++) {
                    const x = sx(r.c[i][0] + shift);
                    const y = sy(r.c[i][1]);
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                }
                ctx.strokeStyle = this.riverColor(r.r);
                ctx.lineWidth = this.riverWidth(r.r);
                ctx.lineCap = 'round';
                ctx.stroke();
            }
            ctx.restore();
            for (const r of g.riversDetail || []) {
                if (r.n === '黄河' && !yellowNow && downstreamOnly(r.c))
                    continue;
                ctx.beginPath();
                for (let i = 0; i < r.c.length; i++) {
                    const x = sx(r.c[i][0]);
                    const y = sy(r.c[i][1]);
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                }
                ctx.strokeStyle = this.riverColor(r.r);
                ctx.lineWidth = this.riverWidth(r.r);
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }
        // 黄河历史故道：1855 年前的夺淮入海、1938–1947 年的花园口南泛
        if (this.layers.yellowriver) {
            const phase = yellowAt(g, this.year);
            if (phase) {
                ctx.beginPath();
                phase.path.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.strokeStyle = 'rgba(108,150,178,.9)';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
        }
        // 长城：一条实线 + 沿线的城垛短齿
        if (this.layers.wall) {
            for (const line of g.wall) {
                ctx.beginPath();
                for (let i = 0; i < line.length; i++) {
                    const x = sx(line[i][0]);
                    const y = sy(line[i][1]);
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                }
                ctx.strokeStyle = 'rgba(138,106,58,.85)';
                ctx.lineWidth = 1.6;
                ctx.lineJoin = 'round';
                ctx.stroke();
                // 城垛：沿线每隔一段画一小段垂直短线
                let acc = 0;
                const step = 9;
                for (let i = 1; i < line.length; i++) {
                    const x1 = sx(line[i - 1][0]);
                    const y1 = sy(line[i - 1][1]);
                    const x2 = sx(line[i][0]);
                    const y2 = sy(line[i][1]);
                    const len = Math.hypot(x2 - x1, y2 - y1);
                    if (!len)
                        continue;
                    const nx = -(y2 - y1) / len;
                    const ny = (x2 - x1) / len;
                    let d = step - acc;
                    while (d < len) {
                        const t = d / len;
                        const px = x1 + (x2 - x1) * t;
                        const py = y1 + (y2 - y1) * t;
                        ctx.beginPath();
                        ctx.moveTo(px - nx * 1.1, py - ny * 1.1);
                        ctx.lineTo(px + nx * 1.1, py + ny * 1.1);
                        ctx.strokeStyle = 'rgba(138,106,58,.7)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        d += step;
                    }
                    acc = (acc + len) % step;
                }
            }
        }
        // 现代省界：虚线、低对比，必须一眼看出是「现代」
        if (this.layers.admin1) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(90,90,90,.3)';
            ctx.lineWidth = 0.8;
            for (const line of g.admin1) {
                path(line);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }
    }
    /** 把一个类别图标画在 (x, y)：单位框路径 × r，描边与填充二选一。 */
    drawGlyph(style, x, y, r) {
        const ctx = this.ctx;
        const path = pathOf(style);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(r, r);
        if (style.filled) {
            ctx.fillStyle = style.color;
            ctx.fill(path);
        }
        else {
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 0.42;
            ctx.lineJoin = 'round';
            ctx.stroke(path);
        }
        ctx.restore();
    }
    /** 虚影斜线：用来表示「名义上属于中国、实际由某国控制」 */
    /** 竖纹：地方政权自行治理（西藏 1913–1951）用，和藩部的斜线、主张的交叉纹都分开 */
    hatchVertical(color) {
        const key = `v:${color}`;
        const cached = this.hatchCache.get(key);
        if (cached)
            return cached;
        const tile = document.createElement('canvas');
        tile.width = 9;
        tile.height = 9;
        const g = tile.getContext('2d');
        if (!g)
            return null;
        g.strokeStyle = color;
        g.globalAlpha = 0.6;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(4.5, -1);
        g.lineTo(4.5, 10);
        g.stroke();
        const pattern = this.ctx.createPattern(tile, 'repeat');
        if (pattern)
            this.hatchCache.set(key, pattern);
        return pattern;
    }
    /** 交叉纹：用来和藩部的单斜线分开（主张未实控用这个） */
    hatchCross(color) {
        const key = `x:${color}`;
        const cached = this.hatchCache.get(key);
        if (cached)
            return cached;
        const tile = document.createElement('canvas');
        tile.width = 9;
        tile.height = 9;
        const g = tile.getContext('2d');
        if (!g)
            return null;
        g.strokeStyle = color;
        g.globalAlpha = 0.6;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(-1, 10);
        g.lineTo(10, -1);
        g.moveTo(-1, -1);
        g.lineTo(10, 10);
        g.stroke();
        const pattern = this.ctx.createPattern(tile, 'repeat');
        if (pattern)
            this.hatchCache.set(key, pattern);
        return pattern;
    }
    hatch(color) {
        const cached = this.hatchCache.get(color);
        if (cached)
            return cached;
        const tile = document.createElement('canvas');
        tile.width = 7;
        tile.height = 7;
        const g = tile.getContext('2d');
        if (!g)
            return null;
        g.strokeStyle = color;
        g.globalAlpha = 0.6;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(-1, 8);
        g.lineTo(8, -1);
        g.stroke();
        const pattern = this.ctx.createPattern(tile, 'repeat');
        if (pattern)
            this.hatchCache.set(color, pattern);
        return pattern;
    }
    /**
     * 投影一个环，`shift` 是经度平移量。
     *
     * 为什么要有 shift：地图以中国为中心，太平洋在右边是空的。把全球图层再画一份
     * 往东平移 360°，美洲就接到太平洋东侧了（标准的世界地图做法）。
     * 只画视口附近的那一份，所以不会出现两个美洲。
     */
    worldRing(ring, vw, vh, shift) {
        const out = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const [lng, lat] of ring) {
            const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
            out.push({ x, y });
            if (x < minX)
                minX = x;
            if (x > maxX)
                maxX = x;
            if (y < minY)
                minY = y;
            if (y > maxY)
                maxY = y;
        }
        const pad = 40;
        if (maxX < -pad || minX > vw + pad || maxY < -pad || minY > vh + pad)
            return null;
        return out;
    }
    worldShift(ring) {
        return worldShift(ring);
    }
    /** 太平天国：按年取控制府州，红褐色填充，府界不描边（相邻府不能出现网格线） */
    drawTaiping(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.taiping)
            return;
        const period = taipingAt(g, this.year);
        if (!period)
            return;
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(178,58,58,.32)';
        for (const ring of period.rings) {
            ctx.beginPath();
            ring.forEach(([lng, lat], i) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fill();
        }
    }
    /** 行军箭头：走廊 + 主线 + 终点一个总方向箭头；返回是否画了（需要继续流动） */
    drawMarch(vw, vh) {
        if (!this.layers.march)
            return false;
        const ctx = this.ctx;
        const routes = this.entities.filter((e) => {
            if (e.type !== 'route' || !e.tags?.includes('行军'))
                return false;
            const sp = spanOf(e);
            return !!sp && this.year >= sp[0] - 0.5 && this.year <= sp[1] + 0.5;
        });
        if (!routes.length)
            return false;
        for (const e of routes) {
            const taiping = e.tags?.includes('太平军');
            const color = taiping ? '#a8382a' : '#26455c';
            // 取最长的一条线
            let best = [];
            let bestLen = 0;
            for (const line of e.space?.lines || []) {
                const coords = line.geometry.coordinates || [];
                const pts = coords.map(([lng, lat]) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                    return { x, y };
                });
                const len = pathLength(pts);
                if (len > bestLen) {
                    bestLen = len;
                    best = pts;
                }
            }
            if (best.length < 2 || bestLen < 40)
                continue;
            // 先把途经点抽稀到只剩转折点，再用 Catmull–Rom 连成弧线：
            // 点太密的话曲线会贴着折线走，看起来还是折的
            best = catmullRom(simplifyPath(best, 14), 0.5, 4);
            // 行军路线不走普通线图层，命中表要在这里补上（否则鼠标悬停不到）
            this.lineHits.push({ id: e.id, pts: best, color: taiping ? '#a8382a' : '#26455c' });
            const trace = () => {
                ctx.beginPath();
                best.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            };
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // 1. 走廊：宽而淡，像指挥图上的箭头底
            trace();
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.1;
            ctx.lineWidth = 7;
            ctx.stroke();
            // 2. 主线
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 3. 走廊上流动的浅色虚线：表示"在推进"，速度很慢，不抢主线的形
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,253,247,.9)';
            ctx.setLineDash([8, 30]);
            ctx.lineDashOffset = -this.animPhase * 0.9;
            trace();
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
            // 4. 总的方向箭头：一条线只需要一个，画大一点
            const end = pointAlong(best, bestLen);
            const head = 15;
            ctx.beginPath();
            ctx.moveTo(end.point.x + Math.cos(end.angle) * head, end.point.y + Math.sin(end.angle) * head);
            ctx.lineTo(end.point.x + Math.cos(end.angle + 2.5) * head * 0.75, end.point.y + Math.sin(end.angle + 2.5) * head * 0.75);
            ctx.lineTo(end.point.x + Math.cos(end.angle - 2.5) * head * 0.75, end.point.y + Math.sin(end.angle - 2.5) * head * 0.75);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        return true;
    }
    startMarchAnimation() {
        if (this.animHandle)
            return;
        this.animStarted = performance.now();
        let last = 0;
        const tick = (now) => {
            this.animHandle = requestAnimationFrame(tick);
            if (now - last < 32)
                return; // 30fps 足够
            last = now;
            this.animPhase = ((now - this.animStarted) / 1000) * 26;
            this.draw();
        };
        this.animHandle = requestAnimationFrame(tick);
    }
    stopMarchAnimation() {
        if (!this.animHandle)
            return;
        cancelAnimationFrame(this.animHandle);
        this.animHandle = 0;
        this.animPhase = 0;
    }
    /** 主张了但没控住的地方：盖在势力范围之上，虚线 + 极淡暖色 */
    drawClaimExtra(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.claims)
            return;
        const claim = claimAt(g, this.year);
        if (!claim?.extra?.length)
            return;
        const ctx = this.ctx;
        for (const block of claim.extra) {
            for (const ring of block.rings) {
                ctx.beginPath();
                ring.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.fillStyle = 'rgba(138,106,74,.035)';
                ctx.fill();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = 'rgba(138,106,74,.85)';
                ctx.lineWidth = 1.4;
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
    /** 按中国疆域（实控 + 主张）裁掉画布内侧：殖民地底色、悬停高亮都要用，
     *  否则英属印度/缅甸的线会画进藏南，图上像是「英属印度伸进中国」。 */
    clipOutsideChina(ctx, vw, vh) {
        const g0 = this.geo;
        if (!g0)
            return;
        const clipClaim = this.layers.claims ? claimAt(g0, this.year) : null;
        const layers = [
            this.activeBase(),
            (clipClaim?.rings || []).map((r) => r.map((p) => [p[0], p[1]])),
        ];
        for (const rings of layers) {
            if (!rings.length)
                continue;
            const clip = new Path2D();
            clip.rect(0, 0, vw, vh);
            for (const shift of [-360, 0, 360]) {
                for (const ring of rings) {
                    const pts = this.worldRing(ring, vw, vh, shift);
                    if (!pts)
                        continue;
                    pts.forEach((p, i) => (i === 0 ? clip.moveTo(p.x, p.y) : clip.lineTo(p.x, p.y)));
                    clip.closePath();
                }
            }
            ctx.clip(clip, 'evenodd');
        }
    }
    /** 当前年份落在哪一期（1916–20 / 20–22 / 22–24 / 24–26 / 26–28） */
    warlordPeriod() {
        const z = this.geo?.warlordZones;
        if (!z)
            return null;
        return z.periods.find((p) => this.year >= p.from && this.year < p.to) || null;
    }
    /**
     * 军阀势力：按省级近似环上色，bloc 决定颜色；contested 的省用斜线压一层。
     * 画在疆域之上、条约割让面/租界之下——外国的面比军阀的省更该先被看见。
     */
    drawWarlords(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.warlords || !g.warlordZones)
            return;
        const period = this.warlordPeriod();
        if (!period)
            return;
        const ctx = this.ctx;
        const byId = new Map(g.warlordProvinces.map((p) => [p.id, p]));
        for (const prov of g.warlordZones.provinces) {
            const zone = prov.periods[period.id];
            if (!zone)
                continue;
            const shape = byId.get(prov.id);
            if (!shape || shape.outside)
                continue;
            const color = g.warlordZones.blocs[zone.bloc]?.color || '#999';
            // 多环的省（浙江、广东）只要有一环在视野里就画，不能只看第一环
            const visible = shape.rings.some((r) => this.worldRing(r, vw, vh, this.worldShift(r)));
            if (!visible)
                continue;
            ctx.save();
            ctx.beginPath();
            for (const ring of shape.rings) {
                const s = this.worldShift(ring);
                ring.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + s), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.closePath();
            }
            ctx.globalAlpha = zone.contested ? 0.16 : 0.28;
            ctx.fillStyle = color;
            ctx.fill('evenodd');
            if (zone.contested) {
                const pattern = this.hatch(color);
                if (pattern) {
                    ctx.globalAlpha = 0.20;
                    ctx.fillStyle = pattern;
                    ctx.fill('evenodd');
                }
            }
            ctx.globalAlpha = 0.55;
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.9;
            ctx.stroke();
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }
    /** 傀儡政权（满洲国）与卫星国（蒙古）：画在疆域之上，斜线表示实控 */
    drawRegions(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.spheres)
            return;
        const ctx = this.ctx;
        for (const r of g.regions) {
            if (this.year < r.from || this.year >= r.to)
                continue;
            const color = g.powers[r.power]?.color || '#999';
            const pattern = this.hatch(color);
            // 清朝主张但未实控（1858 年前的外东北）：纸色更淡 + 稀疏斜线 + 虚线边，
            // 盖在俄国绿色底色上，避免把 claim 读成俄国领土
            if (r.kind === 'claim') {
                const shift = this.worldShift(r.rings[0]);
                if (!this.worldRing(r.rings[0], vw, vh, shift))
                    continue;
                ctx.save();
                ctx.beginPath();
                for (const ring of r.rings) {
                    ring.forEach(([lng, lat], i) => {
                        const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                        if (i === 0)
                            ctx.moveTo(x, y);
                        else
                            ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                }
                ctx.fillStyle = 'rgba(247,242,229,.55)';
                ctx.fill();
                // 交叉纹：与藩部的单斜线区分开（「有主张、没设治」）
                const pattern = this.hatchCross('#8a7a5a');
                if (pattern) {
                    ctx.globalAlpha = 0.13;
                    ctx.fillStyle = pattern;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.setLineDash([7, 4]);
                ctx.strokeStyle = 'rgba(122,104,74,.7)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                continue;
            }
            // 藩部 / 自治：纸色 + 斜线（单斜线，与主张的交叉纹分开）+ 点线边。
            // 1915–1919 的外蒙古用同一画法：宗主权在中国、但自行治理。
            if (r.kind === 'vassal' || r.kind === 'autonomy') {
                const shift = this.worldShift(r.rings[0]);
                if (!this.worldRing(r.rings[0], vw, vh, shift))
                    continue;
                ctx.save();
                ctx.beginPath();
                for (const ring of r.rings) {
                    ring.forEach(([lng, lat], i) => {
                        const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                        if (i === 0)
                            ctx.moveTo(x, y);
                        else
                            ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                }
                ctx.fillStyle = 'rgba(247,242,229,.5)';
                ctx.fill();
                const pattern = this.hatch('#8a7a5a');
                if (pattern) {
                    ctx.globalAlpha = 0.22;
                    ctx.fillStyle = pattern;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.setLineDash([2, 3]);
                ctx.strokeStyle = 'rgba(122,104,74,.85)';
                ctx.lineWidth = 1.1;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                continue;
            }
            // 地方政权自行治理（1913–1951 年的西藏噶厦）：纸色 + 竖纹 + 实线边。
            // 实线表示「这块地方有人在管」，不是虚线（虚线留给「主张没控住」和占领）。
            if (r.kind === 'selfrule') {
                const shift = this.worldShift(r.rings[0]);
                if (!this.worldRing(r.rings[0], vw, vh, shift))
                    continue;
                ctx.save();
                ctx.beginPath();
                for (const ring of r.rings) {
                    ring.forEach(([lng, lat], i) => {
                        const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                        if (i === 0)
                            ctx.moveTo(x, y);
                        else
                            ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                }
                ctx.fillStyle = 'rgba(247,242,229,.5)';
                ctx.fill();
                ctx.globalAlpha = 0.1;
                ctx.fillStyle = color;
                ctx.fill();
                const pattern = this.hatchVertical(color);
                if (pattern) {
                    ctx.globalAlpha = 0.16;
                    ctx.fillStyle = pattern;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.75;
                ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.restore();
                continue;
            }
            // 归还区：rings[0] 是原占领区、rings[1] 是仍然割让的那块，evenodd 只给归还部分上色
            if (r.kind === 'returned') {
                const shift = this.worldShift(r.rings[0]);
                if (!this.worldRing(r.rings[0], vw, vh, shift))
                    continue;
                ctx.save();
                ctx.beginPath();
                for (const ring of r.rings) {
                    ring.forEach(([lng, lat], i) => {
                        const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                        if (i === 0)
                            ctx.moveTo(x, y);
                        else
                            ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                }
                ctx.fillStyle = 'rgba(88,128,94,.16)';
                ctx.fill('evenodd');
                ctx.setLineDash([3, 3]);
                ctx.strokeStyle = 'rgba(78,116,84,.8)';
                ctx.lineWidth = 1.1;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                continue;
            }
            // 已承认独立（1946 年起的蒙古）：淡冷灰 + 实线边，读作一个正常邻国，
            // 不再用「被谁控制」的斜线纹理（原来 1911–1950 一律画成卫星国）。
            if (r.kind === 'recognized') {
                const shift = this.worldShift(r.rings[0]);
                if (!this.worldRing(r.rings[0], vw, vh, shift))
                    continue;
                ctx.save();
                ctx.beginPath();
                for (const ring of r.rings) {
                    ring.forEach(([lng, lat], i) => {
                        const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                        if (i === 0)
                            ctx.moveTo(x, y);
                        else
                            ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                }
                ctx.fillStyle = 'rgba(226,229,232,.55)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(120,125,132,.8)';
                ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.restore();
                continue;
            }
            for (const ring of r.rings) {
                const shift = this.worldShift(ring);
                if (!this.worldRing(ring, vw, vh, shift))
                    continue;
                ctx.save();
                if (r.clipRects?.length) {
                    // 省界按现代画的，历史辖区只占其中一部分：先用框裁掉，再画
                    ctx.beginPath();
                    for (const [x1, y1, x2, y2] of r.clipRects) {
                        const [ax, ay] = screenOf(this.cam, vw, vh, mercX(x1 + shift), mercY(y2));
                        const [bx, by] = screenOf(this.cam, vw, vh, mercX(x2 + shift), mercY(y1));
                        ctx.rect(ax, ay, bx - ax, by - ay);
                    }
                    ctx.clip();
                }
                ctx.beginPath();
                ring.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.closePath();
                if (r.kind === 'annexed') {
                    // 已并入他国（1944 年起的图瓦自治州）：实填，不加纹理——这块就是苏联的领土了
                    ctx.globalAlpha = 0.22;
                    ctx.fillStyle = color;
                    ctx.fill();
                }
                else if (r.kind === 'occupation') {
                    // 军事占领：淡色底 + 斜线，和割让的实填区分开
                    ctx.globalAlpha = 0.13;
                    ctx.fillStyle = color;
                    ctx.fill();
                    if (pattern) {
                        ctx.globalAlpha = 0.34;
                        ctx.fillStyle = pattern;
                        ctx.fill();
                    }
                }
                else {
                    // 傀儡 / 卫星国 / 受保护国：纸色透出来表示名义归属，斜线表示实控
                    ctx.globalAlpha = 0.13;
                    ctx.fillStyle = color;
                    ctx.fill();
                    if (pattern) {
                        ctx.globalAlpha = 0.5;
                        ctx.fillStyle = pattern;
                        ctx.fill();
                    }
                }
                ctx.globalAlpha = 0.85;
                // 先用同色描一圈：相邻省界抽稀后留下的细缝会被这一圈补上，不留真空
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = 2;
                if (r.kind === 'occupation') {
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = 0.2;
                    ctx.stroke();
                }
                // 边线：并入＝实线，受保护国＝点划线，其余＝虚线
                ctx.setLineDash(r.kind === 'annexed' ? [] : r.kind === 'protectorate' ? [6, 3, 1.5, 3] : [4, 3]);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.85;
                ctx.lineWidth = 1.1;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
                ctx.restore();
            }
        }
    }
    /** 铁路附属地：日俄在东北的线状实控，画成一条带子 */
    drawRailways(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.spheres)
            return;
        const ctx = this.ctx;
        for (const w of g.railways) {
            if (this.year < w.from || this.year >= w.to)
                continue;
            const color = g.powers[w.power]?.color || '#999';
            ctx.beginPath();
            w.path.forEach(([lng, lat], i) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            });
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
    /** 河流的三档线宽与颜色，粗层与细节层共用，免得窗口边界处粗细跳变 */
    riverWidth(r) {
        return r <= 1 ? 2 : r === 2 ? 1.4 : 1;
    }
    riverColor(r) {
        return r <= 1 ? 'rgba(112,152,180,.82)' : r === 2 ? 'rgba(130,168,194,.68)' : 'rgba(146,180,202,.58)';
    }
    /**
     * 东亚细节窗口（10m 图层覆盖的范围）。
     * 细节层是按窗口裁的：视野里看不到这块就不取（§4.337）。
     */
    static DETAIL_BOX = [70, 15, 140, 55];
    /** 视野里现在看得到东亚吗？决定要不要去取 10m 细节层 */
    wantsDetail() {
        const { w, h } = this.viewport();
        if (!w || !h)
            return true;
        const [x1, y1, x2, y2] = MapView.DETAIL_BOX;
        const [ax, ay] = screenOf(this.cam, w, h, mercX(x1), mercY(y2));
        const [bx, by] = screenOf(this.cam, w, h, mercX(x2), mercY(y1));
        return !(bx < 0 || ax > w || by < 0 || ay > h);
    }
    /** 细节层还没取、但视野转进东亚了：通知一次（main.ts 去取，取回后 redraw） */
    setDetailHandler(fn) {
        this.onDetailNeeded = fn;
    }
    /** 把绘制范围限制在细节窗口之外（窗口内交给 10m 图层）；窗口完全不可见时返回 false */
    clipOutsideDetail(vw, vh) {
        // 细节层没到（世界视野起步时就是不给）：别把窗口挖空，粗层整块画
        if (!this.geo?.landDetail?.length)
            return false;
        const [x1, y1, x2, y2] = MapView.DETAIL_BOX;
        const [ax, ay] = screenOf(this.cam, vw, vh, mercX(x1), mercY(y2));
        const [bx, by] = screenOf(this.cam, vw, vh, mercX(x2), mercY(y1));
        if (bx < 0 || ax > vw || by < 0 || ay > vh)
            return false;
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.rect(-8, -8, vw + 16, vh + 16);
        ctx.rect(ax, ay, bx - ax, by - ay);
        ctx.clip('evenodd');
        return true;
    }
    strokeRing(ring, vw, vh) {
        const pts = this.worldRing(ring, vw, vh, this.worldShift(ring));
        if (!pts)
            return;
        const ctx = this.ctx;
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    /** 南海断续线：1947 年十一段线，粗虚线，只在有这条线的年份之后画 */
    drawSouthSea(vw, vh) {
        const g = this.geo;
        const line = g?.southSea;
        // 断续线是 1947 年才有的内容，不做图层开关：年份到了就一直画
        if (!g || !line)
            return;
        if (this.year < line.from || this.year >= line.to)
            return; // to 开区间，与其它图层一致
        const ctx = this.ctx;
        ctx.save();
        ctx.setLineDash([10, 7]);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(138,74,52,.75)';
        for (const dash of line.dashes) {
            ctx.beginPath();
            dash.forEach(([lng, lat], i) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            });
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }
    /** 对外贸易航线：蓝色虚线，起点一个空心圆，末端一个小箭头 */
    drawSealanes(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.sealanes)
            return;
        const ctx = this.ctx;
        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(63,109,138,.62)';
        ctx.lineCap = 'round';
        for (const lane of lanesAt(g, this.year)) {
            const pts = lane.path.map(([lng, lat]) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                return { x, y };
            });
            ctx.beginPath();
            pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.stroke();
            // 起点空心圆：看得出航线的两端
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(pts[0].x, pts[0].y, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(251,247,238,.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(63,109,138,.8)';
            ctx.lineWidth = 1.3;
            ctx.stroke();
            ctx.setLineDash([7, 5]);
            ctx.strokeStyle = 'rgba(63,109,138,.62)';
            ctx.lineWidth = 1.5;
        }
        ctx.setLineDash([]);
        ctx.restore();
    }
    /**
     * 条约割地：底纹 + 虚线边。只画已经签过约的那几块（按条约年份出现），
     * 面积够大时在中间写条约名——太小的地方（香港岛）靠悬停看。
     */
    /** 共管的斜线填充（8×8 的 tile，重复铺） */
    cessionHatchPattern() {
        if (this.cessionHatch)
            return this.cessionHatch;
        const tile = document.createElement('canvas');
        tile.width = 9;
        tile.height = 9;
        const t = tile.getContext('2d');
        if (!t)
            return null;
        t.strokeStyle = 'rgba(168,56,42,.42)';
        t.lineWidth = 1.2;
        t.beginPath();
        t.moveTo(-2, 8);
        t.lineTo(8, -2);
        t.moveTo(2, 10);
        t.lineTo(10, 2);
        t.stroke();
        this.cessionHatch = this.ctx.createPattern(tile, 'repeat');
        return this.cessionHatch;
    }
    drawCessions(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.cessions)
            return;
        const ctx = this.ctx;
        // 条约划定的实界：取自现代国界（河界至今未变），比示意面更准
        for (const line of g.cessionLines || []) {
            if (this.year < line.from)
                continue;
            ctx.beginPath();
            line.path.forEach(([lng, lat], i) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            });
            ctx.strokeStyle = 'rgba(150,54,38,.85)';
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
        for (const c of cessionsAt(g, this.year)) {
            // 台湾的 1895–1945 交给 region「日据台湾」：割让面 82% 的纸色会把那层斜线盖掉，
            // 悬停也会先命中「条约割地」。这一块不在割让层画，图上只有「日据」一种读法。
            if (c.id === 'cede.taiwan')
                continue;
            for (const ring of c.rings) {
                const pts = this.worldRing(ring, vw, vh, this.worldShift(ring));
                if (!pts)
                    continue;
                ctx.beginPath();
                pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.closePath();
                if (c.status === 'joint') {
                    // 共管：斜线填充 + 细虚线边，和割让的淡红实填区分
                    const hatch = this.cessionHatchPattern();
                    ctx.fillStyle = hatch || 'rgba(168,56,42,.06)';
                    ctx.fill();
                    ctx.setLineDash([3, 3]);
                    ctx.strokeStyle = 'rgba(168,56,42,.55)';
                    ctx.lineWidth = 1;
                }
                else {
                    // 未承认的割让：先用纸色盖住底下的列强底色，再压一层淡红斜线。
                    // 这样这块地一直读作中国，而不是到条约年就自动变成俄国/日本领土。
                    ctx.fillStyle = 'rgba(247,242,229,.82)';
                    ctx.fill();
                    const hatch = this.cessionHatchPattern();
                    if (hatch) {
                        ctx.globalAlpha = 0.16;
                        ctx.fillStyle = hatch;
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                    ctx.setLineDash([5, 4]);
                    ctx.strokeStyle = 'rgba(168,56,42,.6)';
                    ctx.lineWidth = 1.2;
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
    /** 势力范围分界线：1907 年日俄密约的南满/北满分界，点划线 */
    /** 盟旗界线：比省界细、比标签淡，只在内札萨克那块里画 */
    drawLeagues(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.spheres || !g.leagues?.length)
            return;
        const ctx = this.ctx;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(122,104,74,.55)';
        ctx.lineWidth = 1;
        for (const lg of g.leagues) {
            for (const ring of lg.rings) {
                const shift = this.worldShift(ring);
                if (!this.worldRing(ring, vw, vh, shift))
                    continue;
                ctx.beginPath();
                ring.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);
    }
    drawSphereLines(vw, vh) {
        const g = this.geo;
        if (!g || !g.sphereLines?.length)
            return;
        const ctx = this.ctx;
        for (const line of g.sphereLines) {
            if (this.year < line.from || this.year >= line.to)
                continue;
            ctx.beginPath();
            line.path.forEach(([lng, lat], i) => {
                const [x, y] = screenOf(this.cam, vw, vh, mercX(lng), mercY(lat));
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            });
            ctx.setLineDash([9, 4, 2, 4]);
            ctx.strokeStyle = 'rgba(255,253,247,.75)';
            ctx.lineWidth = 3.2;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(92,60,120,.9)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    /** 在华租借地：面积小，画在疆域之上，描边加粗一点才看得见 */
    drawConcessions(vw, vh) {
        const g = this.geo;
        if (!g || !this.layers.spheres)
            return;
        const ctx = this.ctx;
        for (const c of g.concessions) {
            if (this.year < c.from || this.year >= c.to)
                continue;
            const color = g.powers[c.power]?.color || '#999';
            const shift = this.worldShift(c.ring);
            if (!this.worldRing(c.ring, vw, vh, shift))
                continue;
            ctx.beginPath();
            // rings：外环 + 洞（1945 年旅顺口海军根据地不含大连市）；evenodd 才能挖洞
            for (const ring of c.rings || [c.ring]) {
                ring.forEach(([lng, lat], i) => {
                    const [x, y] = screenOf(this.cam, vw, vh, mercX(lng + shift), mercY(lat));
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.closePath();
            }
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.42;
            ctx.fill('evenodd');
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
    /** 地理注记（河流名、山系名）：垫底优先级，不进命中测试 */
    geoLabels(vw, vh) {
        const out = [];
        const g = this.geo;
        if (!g)
            return out;
        const proj = (p) => screenOf(this.cam, vw, vh, mercX(p[0]), mercY(p[1]));
        // 军阀势力的块名：同一 bloc 的省取标签点平均，一期一个名字（直系/奉系/…）。
        // 优先级压在河流之上、实体之下：读得懂颜色，又不抢人名地名。
        if (this.layers.warlords && g.warlordZones) {
            const period = this.warlordPeriod();
            if (period) {
                const byId = new Map(g.warlordProvinces.map((p) => [p.id, p]));
                const agg = new Map();
                for (const prov of g.warlordZones.provinces) {
                    const zone = prov.periods[period.id];
                    if (!zone)
                        continue;
                    const shape = byId.get(prov.id);
                    if (!shape || shape.outside)
                        continue;
                    const bloc = g.warlordZones.blocs[zone.bloc];
                    if (!bloc)
                        continue;
                    const [x, y] = proj(shape.label);
                    const cur = agg.get(zone.bloc) || { x: 0, y: 0, n: 0, zh: bloc.zh, color: bloc.color };
                    cur.x += x;
                    cur.y += y;
                    cur.n += 1;
                    agg.set(zone.bloc, cur);
                }
                for (const [bloc, a] of agg) {
                    const x = a.x / a.n;
                    const y = a.y / a.n;
                    if (x < -40 || y < -20 || x > vw + 40 || y > vh + 20)
                        continue;
                    const id = `geo:warlord:${bloc}`;
                    out.push({
                        id,
                        req: { id, text: a.zh, anchor: [x, y], priority: 230, center: true, layer: 'warlord' },
                        meta: { font: 12, color: a.color, entity: '' },
                    });
                }
            }
        }
        if (this.layers.hydrology) {
            const seen = new Set();
            // 主体层现在只存东亚窗口外的河段（窗口内交给 10m 细节层），
            // 标名要两层一起看，否则长江、黄河在图上就没了名字
            const named = [...g.rivers, ...(g.riversDetail || [])];
            for (const r of named) {
                if (!r.n || r.n.length < 2 || r.r > 2 || seen.has(r.n))
                    continue;
                let best = null;
                let bestLen = 0;
                for (const { c } of named.filter((x) => x.n === r.n)) {
                    // 世界河流：美洲那一格要东移 360°，否则标签会落在接缝左边
                    const shift = this.worldShift(c);
                    const pts = c.map((p) => proj([p[0] + shift, p[1]]));
                    let len = 0;
                    for (let i = 1; i < pts.length; i++) {
                        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
                    }
                    if (len > bestLen) {
                        bestLen = len;
                        best = pts;
                    }
                }
                // 长江、黄河、珠江是主干，再短也要给名字（珠江入海口只有几十像素）
                const major = r.n === '长江' || r.n === '黄河' || r.n === '珠江';
                if (!best || (bestLen < 60 && !major))
                    continue;
                seen.add(r.n);
                const midIdx = Math.floor(best.length * (r.n === '珠江' ? 0.75 : 0.5));
                const mid = best[midIdx];
                // 不在视野里的河不标：否则求解器会把远在美洲的密西西比河「贴」到图边
                if (mid[0] < -40 || mid[1] < -20 || mid[0] > vw + 40 || mid[1] > vh + 20)
                    continue;
                const prev = best[Math.max(0, midIdx - 1)];
                const next = best[Math.min(best.length - 1, midIdx + 1)];
                const raw = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
                const angle = Math.max(-1.05, Math.min(1.05, raw > Math.PI / 2 ? raw - Math.PI : raw < -Math.PI / 2 ? raw + Math.PI : raw));
                const id = `geo:river:${r.n}`;
                out.push({
                    id,
                    req: { id, text: r.n, anchor: mid, priority: 140, center: true, angle, layer: 'river' },
                    meta: { font: 11, color: '#5b7f95', entity: '' },
                });
            }
        }
        // 湖泊名（全球大湖）：取环的重心；跨接缝的先平移
        if (this.layers.hydrology) {
            const seen = new Set();
            for (const l of g.lakes) {
                if (!l.n || l.n.length < 2 || seen.has(l.n))
                    continue;
                const shift = this.worldShift(l.c);
                let cx = 0;
                let cy = 0;
                for (const p of l.c) {
                    const q = proj([p[0] + shift, p[1]]);
                    cx += q[0];
                    cy += q[1];
                }
                cx /= l.c.length;
                cy /= l.c.length;
                if (cx < -40 || cy < -20 || cx > vw + 40 || cy > vh + 20)
                    continue;
                seen.add(l.n);
                const id = `geo:lake:${l.n}`;
                out.push({
                    id,
                    req: { id, text: l.n, anchor: [cx, cy], priority: 130, layer: 'lake' },
                    meta: { font: 10.5, color: '#4a7c9b', entity: '' },
                });
            }
        }
        // 周边城市：名字后面附当时的国名（2026-11-10）
        if (this.layers.cities && this.cam.w < 220) {
            for (const city of g.cities) {
                const nation = cityNation(city, this.year, g.polities);
                if (!nation)
                    continue;
                const shift = this.worldShift([city.c]);
                const [x, y] = proj([city.c[0] + shift, city.c[1]]);
                if (x < -60 || y < -20 || x > vw + 60 || y > vh + 20)
                    continue;
                const id = `geo:city:${city.name}`;
                out.push({
                    id,
                    req: { id, text: `${city.name}（${nation}）`, anchor: [x, y], priority: 120, layer: 'city' },
                    meta: { font: 11, color: '#4a3f35', entity: '' },
                });
            }
        }
        // 黄河故道名
        if (this.layers.yellowriver) {
            const phase = yellowAt(g, this.year);
            if (phase) {
                const pts = phase.path.map(proj);
                const mid = pts[Math.floor(pts.length / 2)];
                const id = `geo:yellow:${phase.id}`;
                out.push({
                    id,
                    req: { id, text: phase.label, anchor: mid, priority: 152, center: true, layer: 'river' },
                    meta: { font: 10, color: '#4a7c9b', entity: '' },
                });
            }
        }
        // 主张但未实控的地方（唐努乌梁海这类）：没有别的图层会给它名字，这里补上
        if (this.layers.claims) {
            const claim = claimAt(g, this.year);
            for (const block of claim?.extra || []) {
                if (block.name === '外蒙古')
                    continue; // 外蒙有「国名」层负责
                // 唐努在 1914 后有专门的实控块（俄占/图瓦），标签交给它，避免同一位置两个名字
                if (block.name === '唐努乌梁海' &&
                    g.regions.some((r) => r.id.startsWith('tannu') && this.year >= r.from && this.year < r.to)) {
                    continue;
                }
                let cx = 0;
                let cy = 0;
                let n = 0;
                for (const ring of block.rings) {
                    for (const p of ring) {
                        const q = proj(p);
                        cx += q[0];
                        cy += q[1];
                        n++;
                    }
                }
                if (!n)
                    continue;
                const id = `geo:claim:${block.name}`;
                out.push({
                    id,
                    req: { id, text: block.name, anchor: [cx / n, cy / n], priority: 135, layer: 'claim' },
                    meta: { font: 10, color: '#8a6a4a', entity: '' },
                });
            }
        }
        // 贸易航线名：标在航线中段，跟着线的方向转
        if (this.layers.sealanes) {
            for (const lane of lanesAt(g, this.year)) {
                const pts = lane.path.map(proj);
                let bestLen = 0;
                for (let i = 1; i < pts.length; i++) {
                    bestLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
                }
                if (bestLen < 120)
                    continue;
                const mid = Math.floor(pts.length / 2);
                const prev = pts[Math.max(0, mid - 1)];
                const next = pts[Math.min(pts.length - 1, mid + 1)];
                const raw = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
                const angle = Math.max(-0.9, Math.min(0.9, raw > Math.PI / 2 ? raw - Math.PI : raw < -Math.PI / 2 ? raw + Math.PI : raw));
                const id = `geo:lane:${lane.id}`;
                out.push({
                    id,
                    req: { id, text: lane.name, anchor: pts[mid], priority: 150, center: true, angle, layer: 'sealane' },
                    meta: { font: 10, color: '#3f6d8a', entity: '' },
                });
            }
        }
        // 周边国名：按当年国名，且只标在疆界之外（清代外蒙不会挂「蒙古」）
        if (this.layers.polities) {
            const base = this.activeBase();
            for (const p of g.polities) {
                const name = polityName(p, this.year);
                if (!name)
                    continue;
                if (pointInRings(p.anchor[0], p.anchor[1], base))
                    continue;
                const id = `geo:polity:${p.id}`;
                const [x, y] = proj(p.anchor);
                if (x < -60 || y < -20 || x > vw + 60 || y > vh + 20)
                    continue;
                out.push({
                    id,
                    req: { id, text: name, anchor: [x, y], priority: 85, layer: 'polity' },
                    meta: { font: 13, color: '#8d8471', entity: '' },
                });
            }
        }
        // 太平天国的名字：压在控制区的重心附近
        if (this.layers.taiping) {
            const period = taipingAt(g, this.year);
            if (period) {
                // 取最大的一块府州（一般是江宁/安庆一带），把名字放在它的重心
                let best = [];
                let bestArea = 0;
                for (const ring of period.rings) {
                    let a = 0;
                    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                        a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
                    }
                    if (Math.abs(a) > bestArea) {
                        bestArea = Math.abs(a);
                        best = ring;
                    }
                }
                let cx = 0;
                let cy = 0;
                for (const p of best) {
                    const q = proj(p);
                    cx += q[0];
                    cy += q[1];
                }
                if (best.length) {
                    out.push({
                        id: 'geo:taiping',
                        req: {
                            id: 'geo:taiping',
                            text: '太平天国',
                            anchor: [cx / best.length, cy / best.length],
                            priority: 165,
                            layer: 'taiping',
                        },
                        meta: { font: 12, color: '#a8382a', entity: '' },
                    });
                }
            }
        }
        // 傀儡政权/卫星国的名字（满洲国）；蒙古由「国名」层负责，避免重复
        if (this.layers.spheres) {
            for (const r of g.regions) {
                if (!r.labelAt)
                    continue;
                if (this.year < r.from || this.year >= r.to)
                    continue;
                const [x, y] = proj(r.labelAt);
                if (x < -40 || y < -20 || x > vw + 40 || y > vh + 20)
                    continue;
                const id = `geo:region:${r.id}`;
                out.push({
                    id,
                    req: { id, text: r.label, anchor: [x, y], priority: 95, layer: 'region' },
                    meta: { font: 12, color: g.powers[r.power]?.color || '#8a8070', entity: '' },
                });
            }
        }
        // 1907 年日俄密约分界线的名字
        if (this.layers.spheres && g.sphereLines?.length) {
            const line = g.sphereLines.find((l) => this.year >= l.from && this.year < l.to);
            if (line) {
                const [x, y] = proj([126.9, 44.45]);
                out.push({
                    id: 'geo:sphere-line',
                    req: { id: 'geo:sphere-line', text: '日俄密约分界', anchor: [x, y], priority: 60, layer: 'region' },
                    meta: { font: 11, color: '#5c3c78', entity: '' },
                });
            }
        }
        // 共管区的名字：1858–1860 才出现，和割让的实填区分
        if (this.layers.cessions) {
            const joint = cessionsAt(g, this.year).find((c) => c.status === 'joint');
            if (joint) {
                const [x, y] = proj([134.2, 46.2]);
                if (x > -40 && y > -20 && x < vw + 40 && y < vh + 20) {
                    out.push({
                        id: 'geo:cession:joint',
                        req: { id: 'geo:cession:joint', text: '中俄共管', anchor: [x, y], priority: 80, layer: 'cession' },
                        meta: { font: 12, color: '#a8382a', entity: '' },
                    });
                }
            }
        }
        if (this.layers.relief) {
            const seen = new Set();
            for (const r of g.relief) {
                if (!r.n || r.n.length < 2 || seen.has(r.n))
                    continue;
                seen.add(r.n);
                // 和画底纹一样：先按环的平均经度决定要不要东移 360°（美洲那一格）
                const shift = this.worldShift(r.c);
                let cx = 0;
                let cy = 0;
                for (const p of r.c) {
                    const q = proj([p[0] + shift, p[1]]);
                    cx += q[0];
                    cy += q[1];
                }
                cx /= r.c.length;
                cy /= r.c.length;
                if (cx < 0 || cy < 0 || cx > vw || cy > vh)
                    continue;
                const id = `geo:relief:${r.n}`;
                out.push({
                    id,
                    req: { id, text: r.n, anchor: [cx, cy], priority: 70, layer: 'relief' },
                    meta: { font: 11, color: '#8a6f45', entity: '' },
                });
            }
        }
        return out;
    }
    /** 收集标注请求 → 求解 → 画字。 */
    drawLabels(vw, vh) {
        const ctx = this.ctx;
        this.labelHits = [];
        const zoom = this.home.w / Math.max(1e-6, this.cam.w);
        const { reqs, meta } = collectLabels(this.entities, {
            year: this.year,
            hiddenTypes: this.hiddenTypes,
            zoom,
            cam: this.cam,
            width: vw,
            height: vh,
            selectedId: this.selectedId,
            onlyIds: this.highlight ?? undefined,
        });
        // 山川与水系的注记：不可点，优先级垫底，只填空
        for (const g of this.geoLabels(vw, vh)) {
            meta.set(g.id, g.meta);
            reqs.push(g.req);
        }
        if (!reqs.length)
            return;
        // 禁区：右侧详情栏、左下角年份
        const obstacles = [];
        // 右栏现在是两段（列表 + 悬停），整列都别让标签压上去
        const panel = document.getElementById('side') || document.getElementById('panel');
        if (panel) {
            const r = panel.getBoundingClientRect();
            const c = this.canvas.getBoundingClientRect();
            if (r.width > 1) {
                obstacles.push({ x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height, weight: 2 });
            }
        }
        obstacles.push({ x: 0, y: vh - 30, w: 110, h: 30 });
        const result = solveLabels(reqs, {
            width: vw,
            height: vh,
            padding: 2,
            margin: 3,
            obstacles,
            dots: reqs.map((r) => ({ x: r.anchor[0], y: r.anchor[1], r: 3.5, owner: r.id })),
            segments: this.segments,
            measure: (text, req) => {
                const m = meta.get(req.id);
                ctx.font = FONT_CSS(m.font);
                return { w: ctx.measureText(text).width, h: Math.ceil(m.font * 1.25) };
            },
        });
        const reqById = new Map(reqs.map((r) => [r.id, r]));
        ctx.lineJoin = 'round';
        // 引线：标签被挤到离自己的点很远时，拉一根细线指回去。
        // 没有这根线，密区里「这个字是哪个点的」全靠猜——标签本身不重叠，
        // 但会落在别人的点旁边。
        for (const p of result.placed) {
            if (p.rotated)
                continue;
            const px = Math.min(Math.max(p.anchor[0], p.box.x), p.box.x + p.box.w);
            const py = Math.min(Math.max(p.anchor[1], p.box.y), p.box.y + p.box.h);
            const dist = Math.hypot(px - p.anchor[0], py - p.anchor[1]);
            if (dist < 6)
                continue;
            ctx.save();
            ctx.strokeStyle = 'rgba(126,108,84,.5)';
            ctx.lineWidth = 0.8;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(p.anchor[0], p.anchor[1]);
            ctx.lineTo(px, py);
            ctx.stroke();
            ctx.restore();
        }
        for (const p of result.placed) {
            const m = meta.get(p.id);
            const angle = p.rotated ? reqById.get(p.id)?.angle || 0 : 0;
            ctx.font = FONT_CSS(m.font);
            // 纸色描边当底色，压在地图上也看得清
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(246,241,230,.92)';
            if (angle) {
                ctx.save();
                ctx.translate(p.box.x + p.box.w / 2, p.box.y + p.box.h / 2);
                ctx.rotate(angle);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeText(p.text, 0, 0);
                ctx.fillStyle = m.color;
                ctx.fillText(p.text, 0, 0);
                ctx.restore();
            }
            else {
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const x = p.box.x + 2;
                const y = p.box.y + p.box.h / 2;
                ctx.strokeText(p.text, x, y);
                ctx.fillStyle = m.color;
                ctx.fillText(p.text, x, y);
            }
            if (m.entity)
                this.labelHits.push({ id: m.entity, text: p.text, kind: '实体', box: p.box });
            else
                this.labelHits.push({ id: '', text: p.text, kind: '地理注记', box: p.box });
        }
    }
}
/**
 * 路线平滑：抽稀后按「急转弯」断开，每段各自做样条。
 *
 * 整条线一次样条的话，遇到接近直角的转折（敖德萨→圣彼得堡→柏林那种）会过冲，
 * 在拐角处绕出一个小圈。按 60° 以上的转角断开就没这个问题。
 *
 * 抽稀容差按要素类型给：出访路线只保留转折点就够了；铁路的沿线车站本身就是
 * 走向信息，用 12px 会把中间站全抽掉，整条线退化成两三个城市之间的直线。
 */
function smoothLine(pts, tol = 12) {
    if (pts.length < 3)
        return pts;
    const simp = simplifyPath(pts, tol);
    if (simp.length < 3)
        return simp;
    const out = [];
    let run = [simp[0]];
    for (let i = 1; i < simp.length - 1; i++) {
        run.push(simp[i]);
        const a = Math.atan2(simp[i].y - simp[i - 1].y, simp[i].x - simp[i - 1].x);
        const b = Math.atan2(simp[i + 1].y - simp[i].y, simp[i + 1].x - simp[i].x);
        let turn = Math.abs(b - a);
        if (turn > Math.PI)
            turn = Math.PI * 2 - turn;
        if (turn > Math.PI / 3) {
            out.push(...catmullRom(run, 0.35, 4));
            run = [simp[i]];
        }
    }
    run.push(simp[simp.length - 1]);
    out.push(...catmullRom(run, 0.35, 4));
    return out;
}
/**
 * 判断一段黄河是不是「铜瓦厢以下」的山东段。
 * 1855 年改道只改了兰考以下，上游一直是同一条河——不能整条藏掉。
 */
export function downstreamOnly(pts) {
    return pts.every(([lng]) => lng > 114.5);
}
/** 一组环的粗略面积（只用它给"主张区"排序：小的先判） */
function blockArea(b) {
    let sum = 0;
    for (const ring of b.rings) {
        let a = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        }
        sum += Math.abs(a / 2);
    }
    return sum;
}
export function ringsFromGeoJson(json) {
    const out = [];
    const feats = json.features || [];
    for (const f of feats) {
        const g = f.geometry;
        if (g.type === 'Polygon') {
            const c = g.coordinates;
            if (c[0])
                out.push(c[0]);
        }
        else if (g.type === 'MultiPolygon') {
            for (const poly of g.coordinates)
                if (poly[0])
                    out.push(poly[0]);
        }
    }
    return out;
}
