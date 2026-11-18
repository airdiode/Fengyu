import { label, lineActiveAt, spanOf } from './types.js';
import { mercX, mercY, screenOf, worldLng } from './geo.js';
import { eventLabelPriority } from './event-category.js';
/** 每类实体的标签规则：优先级、字号、颜色、从哪个缩放级别开始出现。 */
export const LABEL_RULE = {
    place: { priority: 300, font: 13, color: '#2f4a5e', minZoom: 1 },
    front: { priority: 270, font: 12, color: '#a8382a', minZoom: 1 },
    event: { priority: 250, font: 12, color: '#8f3226', minZoom: 1 },
    organization: { priority: 200, font: 12, color: '#6b4277', minZoom: 1 },
    institution: { priority: 220, font: 12, color: '#3f5f33', minZoom: 1 },
    // 人物：数量最多的一类点。整幅视图就参与，但优先级排在事件/机构/组织之后；
    // 放不下由求解器按碰撞裁掉，不靠「只标名人」这种名单。
    person: { priority: 190, font: 11.5, color: '#8a5a2b', minZoom: 1 },
    group: { priority: 185, font: 11.5, color: '#7a6a4a', minZoom: 1 },
    technology: { priority: 160, font: 11, color: '#3a6b6b', minZoom: 1.2 },
    work: { priority: 150, font: 11, color: '#6b5a3a', minZoom: 1.25 },
    route: { priority: 170, font: 11.5, color: '#33556f', minZoom: 1.15 },
};
/**
 * 事件标签是整句（「七七事变，日军进攻卢沟桥，全面抗战爆发」），
 * 取第一个短句当标题。注意不按顿号切：切了会把「张学良、杨虎城发动西安事变」切成人名。
 */
export function shortTitle(s, max) {
    const t = s.split(/[，；。：,;]/)[0].trim();
    return t && t.length <= max ? t : null;
}
/** 线要素的标注锚点：最长的一条线上，沿线的中点。 */
export function lineAnchor(e, cam, vw, vh, year) {
    let best = null;
    let bestLen = 0;
    for (const line of (e.space?.lines || []).filter((l) => year === undefined || lineActiveAt(l, year))) {
        const coords = line.geometry.coordinates || [];
        if (coords.length < 2)
            continue;
        const pts = coords.map(([lng, lat]) => screenOf(cam, vw, vh, mercX(lng), mercY(lat)));
        let len = 0;
        for (let i = 1; i < pts.length; i++) {
            len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        }
        if (len > bestLen) {
            bestLen = len;
            best = pts;
        }
    }
    if (!best || bestLen <= 0)
        return null;
    let acc = 0;
    const half = bestLen / 2;
    for (let i = 1; i < best.length; i++) {
        const seg = Math.hypot(best[i][0] - best[i - 1][0], best[i][1] - best[i - 1][1]);
        if (acc + seg >= half) {
            const t = seg > 0 ? (half - acc) / seg : 0;
            return [
                best[i - 1][0] + (best[i][0] - best[i - 1][0]) * t,
                best[i - 1][1] + (best[i][1] - best[i - 1][1]) * t,
            ];
        }
        acc += seg;
    }
    return best[best.length - 1];
}
const MAX_ANGLE = (60 * Math.PI) / 180;
/** 把角度收进 ±60°：斜体可读，倒置不可读 */
function clampAngle(a) {
    let x = a;
    while (x > Math.PI / 2)
        x -= Math.PI;
    while (x < -Math.PI / 2)
        x += Math.PI;
    if (x > MAX_ANGLE)
        x = MAX_ANGLE;
    if (x < -MAX_ANGLE)
        x = -MAX_ANGLE;
    return x;
}
/** 锚点附近那条线的方向角（屏幕坐标，顺时针为正） */
function lineAngleAt(e, cam, vw, vh, anchor, year) {
    let bestDx = 0;
    let bestDy = 0;
    let bestDist = Infinity;
    for (const line of (e.space?.lines || []).filter((l) => year === undefined || lineActiveAt(l, year))) {
        const coords = line.geometry.coordinates || [];
        for (let i = 1; i < coords.length; i++) {
            const a = screenOf(cam, vw, vh, mercX(coords[i - 1][0]), mercY(coords[i - 1][1]));
            const b = screenOf(cam, vw, vh, mercX(coords[i][0]), mercY(coords[i][1]));
            const mx = (a[0] + b[0]) / 2;
            const my = (a[1] + b[1]) / 2;
            const d = Math.hypot(mx - anchor[0], my - anchor[1]);
            if (d < bestDist) {
                bestDist = d;
                bestDx = b[0] - a[0];
                bestDy = b[1] - a[1];
            }
        }
    }
    if (!bestDx && !bestDy)
        return 0;
    return Math.atan2(bestDy, bestDx);
}
export function collectLabels(entities, opts) {
    const { year, zoom, cam, width, height, selectedId, onlyIds } = opts;
    const meta = new Map();
    const reqs = [];
    const activeAt = (e) => {
        const sp = spanOf(e);
        return !!sp && sp[0] <= year + 0.5 && sp[1] >= year - 1.5;
    };
    // 同一年里事件短标题重名的（两件事都叫「抗战爆发」），改用地名，免得两处写一样的字。
    const titleCount = new Map();
    for (const e of entities) {
        if (e.type !== 'event' || !activeAt(e))
            continue;
        const t = shortTitle(label(e.labels), 10);
        if (t)
            titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
    }
    // 人物活动地：点的 time 落在当年才参与标签；没有 time 的点一直参与
    const pointActive = (p) => {
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
        return year >= a - 0.5 && year <= (Number.isFinite(b) ? b : a) + 0.5;
    };
    const startYear = (p) => {
        const m = /^(-?\d+)/.exec(p.time?.at ?? p.time?.start ?? '');
        return m ? Number(m[1]) : 0;
    };
    const add = (key, e, anchor, text, priority) => {
        if (!text)
            return;
        const rule = LABEL_RULE[e.type];
        meta.set(key, { font: rule.font, color: rule.color, entity: e.id });
        reqs.push({ id: key, text, anchor, priority, layer: e.type, owner: e.id });
    };
    for (const e of entities) {
        const base = LABEL_RULE[e.type];
        if (!base)
            continue;
        // 未来不标；过去只淡显不标；当年 ±1 实显才标
        if (!activeAt(e))
            continue;
        if (onlyIds && !onlyIds.has(e.id))
            continue;
        // 事件不按类型一刀切：战争/外交/灾祸比社会/文化更该先出现
        const priority = e.type === 'event' ? eventLabelPriority(e) : base.priority;
        const selected = e.id === selectedId;
        if (!selected && zoom < base.minZoom)
            continue;
        if (e.type === 'route' || e.type === 'front') {
            // 只按「当年真走的那一段」找锚点：不然 1904 年画的是拉萨→库伦，
            // 名字却挂在 1909 年那段北京→拉萨线的中点上，悬在空地里
            const anchor = lineAnchor(e, cam, width, height, year);
            if (!anchor)
                continue;
            let text = label(e.labels);
            if (e.type === 'front' && text.includes('·'))
                text = text.split('·').pop().trim();
            const key = `${e.id}#line`;
            add(key, e, anchor, text, selected ? 1000 : priority);
            // 沿线排字：角度取该处线方向，超过 ±60° 就放平（倒过来的字没法读）
            const req = reqs[reqs.length - 1];
            req.center = true;
            req.angle = clampAngle(lineAngleAt(e, cam, width, height, anchor, year));
            // 西逃/回銮这类「驻点有意义」的路线，途经点各自标名（别的路线点太多，不标）
            if (e.tags?.includes('西逃') ||
                e.tags?.includes('回銮') ||
                e.tags?.includes('西征') ||
                e.tags?.includes('游历') ||
                e.tags?.includes('考察') ||
                e.tags?.includes('出行')) {
                for (const [i, p] of (e.space?.points || []).entries()) {
                    const [x, y] = screenOf(cam, width, height, mercX(worldLng(p.coord[0])), mercY(p.coord[1]));
                    if (x < -40 || y < -40 || x > width + 40 || y > height + 40)
                        continue;
                    add(`${e.id}#stop${i}`, e, [x, y], label(p.name), 170 - i * 0.5);
                }
            }
            continue;
        }
        // 人物：一个名字只标一次——当年有活动地就标在活动地，否则标在籍贯/出生点。
        // 多标会让同一个人在每个活动地都出现一次，既重复又挤。
        if (e.type === 'person') {
            const pts = e.space?.points || [];
            const active = pts
                .filter((p) => p.role === 'activity' && pointActive(p))
                // 两个活动地重叠的年份（孙中山 1924–25 在广州/北京、蒋介石 1937 在南京/重庆），
                // 名字跟「最近开始的那一段」走，免得人已经北上、名字还留在广州
                .sort((a, b) => startYear(b) - startYear(a));
            const primary = pts.filter((p) => p.role !== 'activity');
            for (const p of [...active, ...primary]) {
                const [x, y] = screenOf(cam, width, height, mercX(worldLng(p.coord[0])), mercY(p.coord[1]));
                if (x < -40 || y < -40 || x > width + 40 || y > height + 40)
                    continue;
                add(`${e.id}#label`, e, [x, y], label(e.labels), selected ? 1000 : priority);
                break;
            }
            continue;
        }
        for (const [i, p] of (e.space?.points || []).entries()) {
            const [x, y] = screenOf(cam, width, height, mercX(worldLng(p.coord[0])), mercY(p.coord[1]));
            if (x < -40 || y < -40 || x > width + 40 || y > height + 40)
                continue;
            let text = label(e.labels);
            if (e.type === 'event') {
                const t = shortTitle(text, 10);
                text = t && titleCount.get(t) === 1 ? t : label(p.name) || '';
                if (text.length > 12)
                    text = '';
            }
            add(`${e.id}#${i}`, e, [x, y], text, selected ? 1000 : priority - i);
        }
    }
    return { reqs, meta };
}
