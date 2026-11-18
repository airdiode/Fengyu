import { ERAS, eraAt } from './eras.js';
import { PERIODS } from './periods.js';
import { REIGNS, REGENCIES, POWERS } from './reigns.js';
/** 画布 160px 高：下面 56px 是常显主条，上面 104px 只在悬停/展开时露出来。
 *  主条固定不动，展开的是它上面的年号、时期、灾荒条——收起时地图不被挤。 */
const ERA_Y = 106;
const ERA_H = 22;
const TICK_Y = 132;
const TICK_H = 6;
const YEAR_LABEL_Y = 152;
const REIGN_TOP = 2;
const PERIOD_TOP = 32;
const CLIMATE_BASE = 98;
const CLIMATE_MAX = 18;
export class Timeline {
    canvas;
    ctx;
    opts;
    /** 鼠标停在灾荒条上时的年份（只用于画提示，不参与选年） */
    hoverYear = null;
    /** 鼠标在时间轴上移动时的预览年份：只画引导线和年份牌，不改选中年 */
    previewYear = null;
    constructor(canvas, _entities, opts) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.opts = opts;
        this.bind();
        this.resize();
    }
    bind() {
        const pick = (ev) => {
            const rect = this.canvas.getBoundingClientRect();
            const r = (ev.clientX - rect.left) / rect.width;
            const span = this.opts.to - this.opts.from;
            const year = Math.max(this.opts.from, Math.min(this.opts.to, Math.round(this.opts.from + r * span)));
            this.opts.year = year;
            this.opts.onChange(year);
            this.draw();
        };
        let dragging = false;
        this.canvas.addEventListener('pointerdown', (ev) => {
            dragging = true;
            this.previewYear = null;
            delete this.canvas.dataset.hoverYear;
            this.canvas.classList.add('dragging');
            this.canvas.setPointerCapture(ev.pointerId);
            pick(ev);
        });
        const stripOf = (ev) => {
            const rect = this.canvas.getBoundingClientRect();
            const y = ((ev.clientY - rect.top) / rect.height) * (rect.height);
            if (y < CLIMATE_BASE - CLIMATE_MAX - 6 || y > CLIMATE_BASE + 4)
                return null; // 灾荒条那一条带
            const r = (ev.clientX - rect.left) / rect.width;
            const span = this.opts.to - this.opts.from;
            const year = Math.round(this.opts.from + r * span);
            return this.opts.climate?.has(year) ? year : null;
        };
        const yearAt = (ev) => {
            const rect = this.canvas.getBoundingClientRect();
            const r = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
            const span = this.opts.to - this.opts.from;
            return Math.round(this.opts.from + r * span);
        };
        this.canvas.addEventListener('pointermove', (ev) => {
            if (dragging) {
                pick(ev);
                return;
            }
            const y = stripOf(ev);
            this.canvas.style.cursor = y !== null ? 'pointer' : 'default';
            // 鼠标在哪一年，就把哪一年显示出来；和「选中年」是两回事
            const py = yearAt(ev);
            const changed = py !== this.previewYear || y !== this.hoverYear;
            this.previewYear = py;
            this.hoverYear = y;
            this.canvas.dataset.hoverYear = String(py);
            if (changed)
                this.draw();
        });
        this.canvas.addEventListener('pointerleave', () => {
            if (this.hoverYear !== null || this.previewYear !== null) {
                this.hoverYear = null;
                this.previewYear = null;
                delete this.canvas.dataset.hoverYear;
                this.draw();
            }
        });
        const endDrag = () => {
            dragging = false;
            this.canvas.classList.remove('dragging');
        };
        this.canvas.addEventListener('pointerup', endDrag);
        this.canvas.addEventListener('pointercancel', endDrag);
    }
    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.round(rect.width * dpr);
        const h = Math.round(rect.height * dpr);
        if (this.canvas.width !== w)
            this.canvas.width = w;
        if (this.canvas.height !== h)
            this.canvas.height = h;
        // 同 map.resize：CSS 尺寸跟位图对齐，别让浏览器按非整数比例缩放位图
        this.canvas.style.width = `${w / dpr}px`;
        this.canvas.style.height = `${h / dpr}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.draw();
    }
    setYear(year) {
        this.opts.year = year;
        this.draw();
    }
    /**
     * 时期带：明确的时期画实色条（有硬边），模糊的画两头淡出的色带（不画硬边）。
     * 条太窄就不写字，标签会互相压的时候也只画条、不写字。
     */
    /** 年号（道光→宣统）与两宫太后垂帘听政 */
    drawReigns(ctx, w, from, to) {
        const x = (y) => ((y - from) / (to - from)) * w;
        const top = REIGN_TOP;
        const height = 14;
        for (const r of REIGNS) {
            const x1 = x(Math.max(from, r.from));
            const x2 = x(Math.min(to, r.to + 1));
            const width = x2 - x1;
            if (width <= 0)
                continue;
            // 交替的浅底，让年号边界看得出来
            const alt = REIGNS.indexOf(r) % 2 === 0;
            ctx.fillStyle = alt ? 'rgba(120,104,80,.06)' : 'rgba(120,104,80,.12)';
            ctx.fillRect(x1, top, width, height);
            ctx.strokeStyle = 'rgba(120,104,80,.35)';
            ctx.beginPath();
            ctx.moveTo(x1, top);
            ctx.lineTo(x1, top + height);
            ctx.stroke();
            ctx.fillStyle = '#6b5a3a';
            ctx.font = '10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            const tw = ctx.measureText(r.name).width;
            if (width > tw + 6)
                ctx.fillText(r.name, (x1 + x2) / 2, top + 11);
        }
        // 垂帘听政：缎带画在年号下面，标签直接写在带内（9px，够宽才写）
        const ry = top + height + 2;
        const rh = 10;
        ctx.font = '9px system-ui, sans-serif';
        for (const g of REGENCIES) {
            const x1 = x(Math.max(from, g.from));
            const x2 = x(Math.min(to, g.to + 1));
            const width = x2 - x1;
            if (width <= 0)
                continue;
            ctx.fillStyle = 'rgba(150,70,50,.72)';
            ctx.fillRect(x1, ry, width, rh);
            const tw = ctx.measureText(g.label).width;
            if (width > tw + 10) {
                ctx.fillStyle = '#fff8ee';
                ctx.textAlign = 'center';
                ctx.fillText(g.label, (x1 + x2) / 2, ry + 8);
            }
        }
        // 民国实权人物：与垂帘同一行（1861–1889 与 1912–1949 不重叠），换一套冷色
        ctx.font = '9px system-ui, sans-serif';
        for (const g of POWERS) {
            const x1 = x(Math.max(from, g.from));
            const x2 = x(Math.min(to, g.to + 1));
            const width = x2 - x1;
            if (width <= 0)
                continue;
            ctx.fillStyle = 'rgba(64,88,120,.72)';
            ctx.fillRect(x1, ry, width, rh);
            const tw = ctx.measureText(g.label).width;
            if (width > tw + 10) {
                ctx.fillStyle = '#f4f7fb';
                ctx.textAlign = 'center';
                ctx.fillText(g.label, (x1 + x2) / 2, ry + 8);
            }
        }
        // 两段垂帘之间只隔 1874 年（同治亲政，1873 年两宫已撤帘）：不画成第二段垂帘，
        // 但用淡色把缎带连起来，别在时间轴上留一道看起来像画错的白缝。
        const sorted = [...REGENCIES].sort((a, b) => a.from - b.from);
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const next = sorted[i];
            const gapFrom = prev.to + 1;
            if (gapFrom >= next.from)
                continue;
            const gx1 = x(Math.max(from, gapFrom));
            const gx2 = x(Math.min(to, next.from));
            if (gx2 <= gx1)
                continue;
            ctx.fillStyle = 'rgba(150,70,50,.42)';
            ctx.fillRect(gx1, ry, gx2 - gx1, rh);
        }
    }
    /**
     * 灾荒条：每年一根竖条，高度 ∝ 当年报灾条数，颜色取当年最多的灾种。
     * 数据只到 1911（那本书的断限），所以 1912 以后这一段留白，不装作没有灾。
     */
    drawClimate(ctx, w, from, to, year) {
        const data = this.opts.climate;
        if (!data || !data.size)
            return;
        const x = (y) => ((y - from) / (to - from)) * w;
        const base = CLIMATE_BASE;
        const maxH = CLIMATE_MAX;
        let max = 0;
        for (const v of data.values())
            max = Math.max(max, v.n);
        if (!max)
            return;
        // 1840–1911 的浅底，和 1912 以后的空白分开
        const spanX1 = x(Math.max(from, 1840));
        const spanX2 = x(Math.min(to, 1912));
        if (spanX2 > spanX1) {
            ctx.fillStyle = 'rgba(120,104,80,.05)';
            ctx.fillRect(spanX1, base - maxH - 4, spanX2 - spanX1, maxH + 6);
        }
        ctx.fillStyle = 'rgba(61,53,42,.18)';
        ctx.fillRect(spanX1, base, spanX2 - spanX1, 1);
        const colorOf = (kinds) => {
            const top = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
            switch (top?.[0]) {
                case '旱': return 'rgba(168,118,58,.85)';
                case '水': return 'rgba(63,107,138,.85)';
                case '蝗': return 'rgba(122,122,46,.85)';
                case '饥': return 'rgba(138,58,42,.85)';
                case '风': return 'rgba(90,122,106,.85)';
                case '雪': return 'rgba(120,140,160,.85)';
                case '疫': return 'rgba(110,80,110,.85)';
                default: return 'rgba(138,128,112,.85)';
            }
        };
        const barW = Math.max(2, (w / (to - from)) * 0.7);
        for (const [y, v] of data) {
            if (y < from || y > to)
                continue;
            const hgt = Math.max(1, (v.n / max) * maxH);
            ctx.fillStyle = colorOf(v.kinds);
            ctx.fillRect(x(y) - barW / 2, base - hgt, barW, hgt);
        }
        // 说明：条带右端（1912 以后是空的）写一行小字，免得没人知道这排竖条是什么
        ctx.fillStyle = 'rgba(138,128,112,.9)';
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('报灾条数（1840–1911，《三千年气象记录》）', w - 4, base - 6);
        ctx.textAlign = 'center';
        // 悬停提示：年份 + 条数 + 最多的两类
        if (this.hoverYear !== null) {
            const v = data.get(this.hoverYear);
            if (v) {
                const parts = Object.entries(v.kinds)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 2)
                    .map(([k, n]) => `${k} ${n}`)
                    .join(' · ');
                const text = `${this.hoverYear} 年 · 报灾 ${v.n} 条${parts ? ' · ' + parts : ''}`;
                ctx.font = '11px system-ui, sans-serif';
                const tw = ctx.measureText(text).width;
                const cx = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, x(this.hoverYear)));
                const ty = base - maxH - 8;
                ctx.fillStyle = 'rgba(255,253,247,.97)';
                ctx.strokeStyle = 'rgba(120,104,80,.45)';
                ctx.lineWidth = 1;
                const boxW = tw + 12;
                ctx.beginPath();
                ctx.rect(cx - boxW / 2, ty - 11, boxW, 16);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#5b4a33';
                ctx.textAlign = 'center';
                ctx.fillText(text, cx, ty);
            }
        }
        // 当前年：加一道浅色底，别让它淹没在邻年里
        const cur = data.get(year);
        if (cur) {
            const hgt = Math.max(1, (cur.n / max) * maxH);
            ctx.fillStyle = 'rgba(168,56,42,.28)';
            ctx.fillRect(x(year) - barW / 2 - 1, base - maxH - 3, barW + 2, maxH + 4);
            ctx.fillStyle = 'rgba(168,56,42,.95)';
            ctx.fillRect(x(year) - barW / 2, base - hgt, barW, hgt);
        }
    }
    drawPeriods(ctx, w, from, to) {
        const x = (y) => ((y - from) / (to - from)) * w;
        const top = PERIOD_TOP;
        const height = 6;
        // 标签允许排两行：一行挤不下就往下挪，而不是干脆不写
        const rows = [[], []];
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (const p of PERIODS) {
            const x1 = x(Math.max(from, p.from));
            const x2 = x(Math.min(to, p.to));
            // 短的时期（甲午战争只有两年）也要画：给一个最小宽度的记号，否则整段消失
            const width = Math.max(3, x2 - x1);
            if (p.kind === 'fixed') {
                ctx.fillStyle = 'rgba(120,104,80,.55)';
                ctx.fillRect(x1, top, width, height);
                // 两端各画一道短线，示意"这里才是起止"
                ctx.strokeStyle = 'rgba(120,104,80,.85)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x1 + 0.5, top - 3);
                ctx.lineTo(x1 + 0.5, top + height + 3);
                ctx.moveTo(x2 - 0.5, top - 3);
                ctx.lineTo(x2 - 0.5, top + height + 3);
                ctx.stroke();
            }
            else {
                // 模糊时期：横向渐变，两头没有硬边
                const grad = ctx.createLinearGradient(x1, 0, x2, 0);
                grad.addColorStop(0, 'rgba(120,104,80,0)');
                grad.addColorStop(0.18, 'rgba(120,104,80,.42)');
                grad.addColorStop(0.82, 'rgba(120,104,80,.42)');
                grad.addColorStop(1, 'rgba(120,104,80,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(x1, top, width, height);
            }
            // 标签允许比条宽（短时期）；与上一行冲突就换下一行，两行都撞才放弃
            const tw = ctx.measureText(p.label).width;
            const cx = Math.max(4 + tw / 2, Math.min(w - 4 - tw / 2, (x1 + x2) / 2));
            const left = cx - tw / 2;
            const right = cx + tw / 2;
            let row = 0;
            while (row < rows.length && rows[row].some((it) => !(right + 6 < it.left || left - 6 > it.right)))
                row++;
            if (row >= rows.length)
                continue;
            rows[row].push({ left, right });
            ctx.fillStyle = p.kind === 'fixed' ? '#6b5a3a' : '#8a7d64';
            ctx.fillText(p.label, cx, top + height + 12 + row * 13);
        }
    }
    draw() {
        const { ctx, canvas } = this;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        const { from, to, year } = this.opts;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        const x = (y) => ((y - from) / (to - from)) * w;
        // 朝代底色：清（暖黄褐）与民国（冷灰蓝）分开，一眼看出在哪一段
        for (const era of ERAS) {
            const x1 = x(Math.max(from, era.from));
            const x2 = x(Math.min(to, era.to));
            if (x2 <= x1)
                continue;
            ctx.fillStyle = era.band;
            ctx.fillRect(x1, ERA_Y, x2 - x1, ERA_H);
        }
        // 已过区间：压一层暗色，不改变朝代色相
        ctx.fillStyle = 'rgba(61,53,42,.09)';
        ctx.fillRect(0, ERA_Y, x(year), ERA_H);
        // 朝代分界（1912 清帝退位）
        for (const era of ERAS.slice(1)) {
            const px = x(era.from);
            ctx.strokeStyle = 'rgba(61,53,42,.35)';
            ctx.beginPath();
            ctx.moveTo(px, ERA_Y);
            ctx.lineTo(px, ERA_Y + ERA_H);
            ctx.stroke();
        }
        // 朝代名
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (const era of ERAS) {
            const x1 = x(Math.max(from, era.from));
            const x2 = x(Math.min(to, era.to));
            if (x2 - x1 < 46)
                continue;
            ctx.fillStyle = era.ink;
            ctx.globalAlpha = 0.55;
            ctx.fillText(era.label, (x1 + x2) / 2, ERA_Y + 15);
            ctx.globalAlpha = 1;
        }
        // 年号行（清）与垂帘听政缎带
        this.drawReigns(ctx, w, from, to);
        // 十年刻度
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let y = Math.ceil(from / 10) * 10; y <= to; y += 10) {
            const px = x(y);
            ctx.strokeStyle = 'rgba(61,53,42,.35)';
            ctx.beginPath();
            ctx.moveTo(px, TICK_Y);
            ctx.lineTo(px, TICK_Y + TICK_H);
            ctx.stroke();
            ctx.fillStyle = '#8a8070';
            ctx.textAlign = y === Math.ceil(from / 10) * 10 ? 'left' : y >= to - 5 ? 'right' : 'center';
            ctx.fillText(String(y), px, YEAR_LABEL_Y);
        }
        // 主要时期（年刻度下面一条带）
        this.drawPeriods(ctx, w, from, to);
        // 灾荒条：1840–1911 逐年的报灾条数（《中国三千年气象记录总集》第四册）
        this.drawClimate(ctx, w, from, to, year);
        // 鼠标预览：虚线引导（画在选中年游标下面，不抢红色）
        if (this.previewYear !== null) {
            const px = x(this.previewYear);
            ctx.save();
            ctx.strokeStyle = 'rgba(61,53,42,.38)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, h - 2);
            ctx.stroke();
            ctx.restore();
        }
        // 当前年游标
        ctx.strokeStyle = '#a8382a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x(year), 0);
        ctx.lineTo(x(year), h - 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#a8382a';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        const cursorText = `${eraAt(year).label} · ${year} 年`;
        const cw = ctx.measureText(cursorText).width;
        // 放在朝代带里（那里空），不压住十年刻度
        const cx = Math.min(x(year) + 4, w - cw - 6);
        ctx.fillStyle = 'rgba(251,247,238,.92)';
        ctx.fillRect(cx - 3, ERA_Y + 3, cw + 6, 15);
        ctx.fillStyle = '#a8382a';
        ctx.fillText(cursorText, cx, ERA_Y + 14);
        // 鼠标预览年份牌：放在主条朝代带里；和「选中年」牌撞了就让到下一行
        if (this.previewYear !== null) {
            const text = `${this.previewYear} 年`;
            ctx.font = '10px system-ui, sans-serif';
            ctx.textAlign = 'left';
            const tw = ctx.measureText(text).width;
            const bw = tw + 10;
            let bx = x(this.previewYear) + 5;
            if (bx + bw > w - 4)
                bx = x(this.previewYear) - bw - 5;
            let by = ERA_Y + 3;
            const selL = cx - 3;
            const selR = cx + cw + 3;
            if (bx < selR && bx + bw > selL)
                by = ERA_Y + ERA_H + 2; // 让到刻度行
            ctx.fillStyle = 'rgba(255,253,247,.97)';
            ctx.strokeStyle = 'rgba(120,104,80,.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(bx, by, bw, 15);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#5b4a33';
            ctx.fillText(text, bx + 5, by + 11);
        }
    }
}
