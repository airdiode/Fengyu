/**
 * 标注求解器（设计：新架构/设计规划.md §6.2）。
 *
 * 与图层、Canvas、DOM 都无关的纯函数模块：
 *   1. 输入是一组标注请求（锚点 + 文本 + 优先级），不关心它来自哪个图层；
 *   2. 每个标注生成 8 个候选位（右 / 左 / 上 / 下 + 4 个斜向）；
 *   3. 打分 = 优先级排序 + 重叠惩罚 + 边界/禁区惩罚；
 *   4. 贪心放置，放不下的先省略，再用一轮「挪一个邻居」的局部回溯捡回来。
 *
 * 输出只有「放哪 / 省略」，文字怎么画由调用方决定。
 */
/** 旋转后的外接矩形：碰撞检测宁可保守一点 */
function rotateSize(size, angle) {
    const c = Math.abs(Math.cos(angle));
    const s = Math.abs(Math.sin(angle));
    return { w: size.w * c + size.h * s, h: size.w * s + size.h * c };
}
/** 候选位顺序即兜底顺序：右侧 > 左侧 > 上 > 下 > 斜向。 */
const SIDES = [
    { side: 'right', dx: 1, dy: 0, cost: 0 },
    { side: 'left', dx: -1, dy: 0, cost: 12 },
    { side: 'top', dx: 0, dy: -1, cost: 24 },
    { side: 'bottom', dx: 0, dy: 1, cost: 36 },
    { side: 'top-right', dx: 1, dy: -1, cost: 44 },
    { side: 'bottom-right', dx: 1, dy: 1, cost: 52 },
    { side: 'top-left', dx: -1, dy: -1, cost: 60 },
    { side: 'bottom-left', dx: -1, dy: 1, cost: 68 },
];
const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));
/** 交叠面积（px²）。 */
export function overlapArea(a, b) {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix > 0 && iy > 0 ? ix * iy : 0;
}
/** 交叠面积 ÷ 较小的那个框面积。0 = 不碰，1 = 完全包住。 */
export function overlapRatio(a, b) {
    const small = Math.min(a.w * a.h, b.w * b.h);
    return small > 0 ? overlapArea(a, b) / small : 0;
}
function overflowRatio(box, width, height) {
    const ix = Math.max(0, Math.min(box.x + box.w, width) - Math.max(box.x, 0));
    const iy = Math.max(0, Math.min(box.y + box.h, height) - Math.max(box.y, 0));
    const area = box.w * box.h;
    return area > 0 ? 1 - (ix * iy) / area : 0;
}
function candidatesFor(req, size, padding, margin, width, height) {
    const sized = req.angle ? rotateSize(size, req.angle) : size;
    const w = sized.w + padding * 2;
    const h = sized.h + padding * 2;
    if (w > width - margin * 2 || h > height - margin * 2)
        return [];
    const [ax, ay] = req.anchor;
    const gap = req.gap ?? 6;
    const out = [];
    // 沿线排字：先试"居中压在锚点上"（会被旋转绘制），放不下再退回普通侧向位
    if (req.center) {
        const x = clamp(ax - w / 2, margin, width - margin - w);
        const y = clamp(ay - h / 2, margin, height - margin - h);
        out.push({ box: { x, y, w, h }, side: 'top', cost: 0, centered: true });
    }
    for (const s of SIDES) {
        const g = s.dx !== 0 && s.dy !== 0 ? gap * 0.7 : gap;
        const x = s.dx === 1 ? ax + g : s.dx === -1 ? ax - g - w : ax - w / 2;
        const y = s.dy === 1 ? ay + g : s.dy === -1 ? ay - g - h : ay - h / 2;
        // 贴边时收回视口，但把「原本出去了多少」记进代价，否则右侧的标签会全被挤掉。
        const bx = clamp(x, margin, width - margin - w);
        const by = clamp(y, margin, height - margin - h);
        const raw = { x, y, w, h };
        const spent = overflowRatio(raw, width, height);
        out.push({ box: { x: bx, y: by, w, h }, side: s.side, cost: s.cost + spent * 1200 });
    }
    return out;
}
const EPS_AREA = 0.5; // 半平方像素：允许边贴边，不允许真的压字
/** 外扩一圈，用来测「两个标签之间留的空够不够」。 */
function inflate(box, d) {
    return { x: box.x - d, y: box.y - d, w: box.w + d * 2, h: box.h + d * 2 };
}
/** 线段落在框内的长度（Liang–Barsky 裁剪）；0 = 没碰到 */
export function clipLength(x1, y1, x2, y2, box) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - box.x, box.x + box.w - x1, y1 - box.y, box.y + box.h - y1];
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0)
                return 0;
            continue;
        }
        const r = q[i] / p[i];
        if (p[i] < 0) {
            if (r > t1)
                return 0;
            if (r > t0)
                t0 = r;
        }
        else {
            if (r < t0)
                return 0;
            if (r < t1)
                t1 = r;
        }
    }
    return (t1 - t0) * Math.hypot(dx, dy);
}
function scoreBox(box, cost, ctx, owner, selfId) {
    // 硬约束：标签之间不许重叠、也不许挨得太近；右栏这类禁区不许压。
    const padded = inflate(box, ctx.spacing);
    for (const p of ctx.placed)
        if (overlapArea(padded, p) > EPS_AREA)
            return Infinity;
    for (const o of ctx.obstacles)
        if (overlapRatio(box, o) > 0.02)
            return Infinity;
    // 软约束：别盖住别人的点、别压在线上、优先右侧。
    let dot = 0;
    for (const d of ctx.dots) {
        // 自己的点不算：沿线居中排字本来就压在锚点上
        if (selfId && d.owner === selfId)
            continue;
        const r = overlapRatio(box, d);
        if (r > dot)
            dot = r;
    }
    // 线：只算「穿过框内」的长度，压得越深越扣分；自己那条线不算
    let ink = 0;
    for (const s of ctx.segments) {
        if (owner && s.owner === owner)
            continue;
        if (Math.min(s.x1, s.x2) > box.x + box.w + 1 ||
            Math.max(s.x1, s.x2) < box.x - 1 ||
            Math.min(s.y1, s.y2) > box.y + box.h + 1 ||
            Math.max(s.y1, s.y2) < box.y - 1) {
            continue;
        }
        ink += clipLength(s.x1, s.y1, s.x2, s.y2, box);
    }
    return cost + dot * 700 + Math.min(240, ink * 3);
}
/** 同一位置、同一文字只留优先级最高的一条（例如事件点与同名口岸）。 */
function dedupe(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
        const key = `${it.text}@${Math.round(it.anchor[0] / 6)}:${Math.round(it.anchor[1] / 6)}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(it);
    }
    return out;
}
export function solveLabels(items, opts) {
    const { width, height, measure } = opts;
    const padding = opts.padding ?? 2;
    const margin = opts.margin ?? 3;
    const dropScore = opts.dropScore ?? 150;
    const maxLabels = opts.maxLabels ?? Number.POSITIVE_INFINITY;
    const rounds = opts.backtrackRounds ?? 2;
    const ordered = dedupe([...items].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)));
    // 所有锚点都是障碍：标签压住别人的点会让人以为点在那里。
    const dots = [];
    for (const it of ordered) {
        const r = 4;
        dots.push({ x: it.anchor[0] - r, y: it.anchor[1] - r, w: r * 2, h: r * 2, owner: it.id });
    }
    const ctx = {
        placed: [],
        obstacles: opts.obstacles ?? [],
        dots,
        segments: opts.segments ?? [],
        spacing: opts.spacing ?? 4,
    };
    const slots = [];
    const dropped = [];
    let attempted = 0;
    const pickBest = (cands, req) => {
        let best = null;
        let bestScore = Infinity;
        for (const c of cands) {
            attempted++;
            const s = scoreBox(c.box, c.cost, ctx, req.owner, req.id);
            if (s < bestScore) {
                bestScore = s;
                best = { ...c, cost: s };
            }
        }
        if (!best || best.cost > dropScore)
            return null;
        return best;
    };
    for (const req of ordered) {
        if (slots.length >= maxLabels) {
            dropped.push(req);
            continue;
        }
        const cands = candidatesFor(req, measure(req.text, req), padding, margin, width, height);
        if (!cands.length) {
            dropped.push(req);
            continue;
        }
        const best = pickBest(cands, req);
        if (!best) {
            dropped.push(req);
            continue;
        }
        const label = {
            id: req.id,
            text: req.text,
            priority: req.priority,
            anchor: req.anchor,
            box: best.box,
            side: best.side,
            score: best.cost,
            rotated: !!(best.centered && req.angle),
        };
        slots.push({ cands, label, ownerId: req.owner, req });
        ctx.placed.push(best.box);
    }
    // ---- 局部回溯：被省略的标注，若只有一个已放标签挡路，试着把它挪到次优位 ----
    // 只在「挪动后两边都还在阈值内」时接受，避免为了塞一个小标签把大标签推歪。
    if (rounds > 0) {
        for (let round = 0; round < rounds; round++) {
            let changed = false;
            for (let i = dropped.length - 1; i >= 0; i--) {
                const req = dropped[i];
                const cands = candidatesFor(req, measure(req.text, req), padding, margin, width, height);
                if (!cands.length)
                    continue;
                let done = false;
                for (const cand of cands) {
                    const hit = slots.filter((s) => overlapArea(inflate(cand.box, ctx.spacing), s.label.box) > EPS_AREA);
                    if (hit.length !== 1)
                        continue;
                    const victim = hit[0];
                    // 只剩一个挡路者：把它挪到别处，且挪完两边的分都要可接受
                    const others = slots.filter((s) => s !== victim).map((s) => s.label.box);
                    const saved = ctx.placed;
                    // 挡路者以外的约束（禁区、别人的点、贴边）也要过关，别为了捡回来压住右栏
                    ctx.placed = others;
                    const candScore = scoreBox(cand.box, cand.cost, ctx, req.owner, req.id);
                    ctx.placed = others.concat([cand.box]);
                    if (!Number.isFinite(candScore) || candScore > dropScore) {
                        ctx.placed = saved;
                        continue;
                    }
                    let bestAlt = null;
                    for (const alt of victim.cands) {
                        if (overlapArea(inflate(cand.box, ctx.spacing), alt.box) > EPS_AREA)
                            continue;
                        attempted++;
                        const s = scoreBox(alt.box, alt.cost, ctx, victim.ownerId, victim.req?.id);
                        if (!bestAlt || s < bestAlt.cost)
                            bestAlt = { ...alt, cost: s };
                    }
                    ctx.placed = saved;
                    if (!bestAlt || bestAlt.cost > dropScore * 0.75)
                        continue;
                    // 接受：挪动受害者，放下新标签
                    victim.label = {
                        ...victim.label,
                        box: bestAlt.box,
                        side: bestAlt.side,
                        score: bestAlt.cost,
                        rotated: !!(bestAlt.centered && victim.req?.angle),
                    };
                    const label = {
                        id: req.id,
                        text: req.text,
                        priority: req.priority,
                        anchor: req.anchor,
                        box: cand.box,
                        side: cand.side,
                        score: candScore,
                        rotated: !!(cand.centered && req.angle),
                    };
                    slots.push({ cands, label, ownerId: req.owner, req });
                    ctx.placed = slots.map((s) => s.label.box);
                    dropped.splice(i, 1);
                    done = true;
                    changed = true;
                    break;
                }
                if (done)
                    break;
            }
            if (!changed)
                break;
        }
    }
    const placed = slots
        .map((s) => s.label)
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    return { placed, dropped, attempted };
}
