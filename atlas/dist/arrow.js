/** 折线采样：沿着路径走一段距离，返回位置与切线方向（作战箭头用）。 */
export function pathLength(pts) {
    let sum = 0;
    for (let i = 1; i < pts.length; i++)
        sum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return sum;
}
/** 从起点沿路径走 dist 像素；超出终点就取终点。 */
export function pointAlong(pts, dist) {
    if (pts.length === 0)
        return { point: { x: 0, y: 0 }, angle: 0 };
    if (pts.length === 1)
        return { point: { ...pts[0] }, angle: 0 };
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (acc + seg >= dist || i === pts.length - 1) {
            const t = seg > 0 ? Math.min(1, Math.max(0, (dist - acc) / seg)) : 0;
            return {
                point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
                angle: Math.atan2(b.y - a.y, b.x - a.x),
            };
        }
        acc += seg;
    }
    return { point: { ...pts[pts.length - 1] }, angle: 0 };
}
/** 路径上每隔 step 取一个点（用于排箭头），phase 让图案沿路径移动。 */
export function samplesAlong(pts, step, phase = 0) {
    const total = pathLength(pts);
    if (!(step > 0) || total < step)
        return [];
    const out = [];
    const start = ((phase % step) + step) % step;
    for (let d = start; d < total - 4; d += step)
        out.push(pointAlong(pts, d));
    return out;
}
/** 去掉重复点：重复点会让切线变成 NaN */
function dedupe(pts) {
    const out = [];
    for (const p of pts) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5)
            out.push(p);
    }
    return out;
}
/**
 * Catmull–Rom 样条 → 三次贝塞尔 → 加密折线。
 *
 * 行军路线给的是历史途经点，**必须穿过**每一个点（所以不能用 B 样条或 Chaikin 切角），
 * 但点与点之间要圆滑过渡，不能出现折角。tension 0.5 是标准参数；
 * 采样步长按屏幕像素算，缩放时曲线的"圆滑度"看起来一致。
 */
export function catmullRom(pts, tension = 0.5, step = 4) {
    const p = dedupe(pts);
    if (p.length < 3)
        return p;
    const out = [{ ...p[0] }];
    for (let i = 0; i < p.length - 1; i++) {
        const p0 = p[i - 1] || p[i];
        const p1 = p[i];
        const p2 = p[i + 1];
        const p3 = p[i + 2] || p2;
        const c1 = {
            x: p1.x + (p2.x - p0.x) * (tension / 3),
            y: p1.y + (p2.y - p0.y) * (tension / 3),
        };
        const c2 = {
            x: p2.x - (p3.x - p1.x) * (tension / 3),
            y: p2.y - (p3.y - p1.y) * (tension / 3),
        };
        const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const n = Math.max(2, Math.ceil(segLen / step));
        for (let k = 1; k <= n; k++) {
            const u = k / n;
            const mu = 1 - u;
            out.push({
                x: mu * mu * mu * p1.x + 3 * mu * mu * u * c1.x + 3 * mu * u * u * c2.x + u * u * u * p2.x,
                y: mu * mu * mu * p1.y + 3 * mu * mu * u * c1.y + 3 * mu * u * u * c2.y + u * u * u * p2.y,
            });
        }
    }
    return out;
}
/** Douglas–Peucker：抽稀到只剩"转折点"，之后再用样条把这些点连成弧线 */
export function simplifyPath(pts, tol = 8) {
    const p = dedupe(pts);
    if (p.length < 3)
        return p;
    const keep = new Uint8Array(p.length);
    keep[0] = 1;
    keep[p.length - 1] = 1;
    const sq = tol * tol;
    const segDist2 = (q, a, b) => {
        let x = a.x;
        let y = a.y;
        let dx = b.x - x;
        let dy = b.y - y;
        if (dx !== 0 || dy !== 0) {
            const t = ((q.x - x) * dx + (q.y - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = b.x;
                y = b.y;
            }
            else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }
        return (q.x - x) ** 2 + (q.y - y) ** 2;
    };
    const stack = [[0, p.length - 1]];
    while (stack.length) {
        const [start, end] = stack.pop();
        let maxD = 0;
        let idx = -1;
        for (let i = start + 1; i < end; i++) {
            const d = segDist2(p[i], p[start], p[end]);
            if (d > maxD) {
                maxD = d;
                idx = i;
            }
        }
        if (maxD > sq && idx > 0) {
            keep[idx] = 1;
            stack.push([start, idx], [idx, end]);
        }
    }
    return p.filter((_, i) => keep[i]);
}
