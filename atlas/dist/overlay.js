/**
 * 1934 年《中华民国新地图》校准图层（位置已锁死，不再提供调整工具）。
 *
 * 用户把两幅总图按经纬网纠形、重采样成等距圆柱（Plate Carrée）并左右拼接，又沿黑色
 * 国界线手工抠图（国界线外透明），存成 sidecar 里 `src` 指的那张 PNG。
 *
 * 对位方式（2026-11-10 定稿）：图上 80°E / 130°E 两条经线与 20°N / 45°N 两条纬线是
 * 检测出来的锚，经纬窗口由它们直接算出——图幅是等距圆柱，**纬度按行线性**，
 * 不能再按墨卡托线性插值（那样 30–35°N 偏 0.8°、50°N 偏 −0.9°）。
 *
 * 渲染：底图是 Web Mercator，所以逐条带重投影——每条屏幕横带由纬度算 mercY 再贴切片，
 * 条带数固定 96，纵向误差 < 0.5 px。
 *
 * 保留这个图层是为了随时能翻出来比对；参数都在 sidecar 里，代码不再暴露微调。
 * 想重新对位：改 sidecar 的 anchors（`tools/overlay-pick.html` 取点页可从 git 历史取回）。
 */
import { mercY } from './geo.js';
const STRIPS = 96;
export class MapOverlay {
    onChange;
    meta = null;
    img = null;
    /** loadImage 的进度句柄，重复点亮开关不会重复下载 */
    loading = null;
    opts = { on: false, opacity: 0.55 };
    /** 加载失败（图不在本地）时给 UI 一句说明 */
    error = null;
    constructor(onChange) {
        this.onChange = onChange;
    }
    /** 只读 sidecar（几百字节）：开关能不能点、缺图时提示什么，都靠它 */
    async loadMeta() {
        try {
            const res = await fetch('public/geo/roc-1934-overlay.json');
            if (!res.ok)
                throw new Error(`sidecar ${res.status}`);
            this.meta = (await res.json());
            this.error = null;
        }
        catch (err) {
            this.error = String(err instanceof Error ? err.message : err);
            this.meta = null;
            this.img = null;
            this.opts.on = false;
        }
        this.onChange?.();
    }
    /**
     * 读真图（抠图版 PNG，本地 15 MB）。
     * **不能放在启动流程里**：它比整站其它资源加起来还大一個量级，
     * 而默认是不开这个图层的（§4.335）。开关第一次点亮、或 URL 带 `?overlay=1` 时才取。
     * 重复调用安全：已经有图/正在读就直接复用同一个 Promise。
     */
    async loadImage() {
        if (this.img)
            return;
        if (this.loading)
            return this.loading;
        this.loading = (async () => {
            if (!this.meta)
                await this.loadMeta();
            if (!this.meta)
                return;
            try {
                const img = new Image();
                // decode() 在无头 Chrome 里对大图会一直挂起，改用 onload/onerror
                await new Promise((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject(new Error(`图片加载失败：${this.meta?.src}`));
                    img.src = this.meta.src;
                });
                this.img = img;
                this.error = null;
            }
            catch (err) {
                this.error = String(err instanceof Error ? err.message : err);
                this.img = null;
                this.opts.on = false;
            }
            finally {
                this.loading = null;
            }
            this.onChange?.();
        })();
        return this.loading;
    }
    set(patch) {
        Object.assign(this.opts, patch);
        this.onChange?.();
    }
    /** 图幅的经纬窗口：四条锚线直接定，位置与比例都锁死 */
    window() {
        const m = this.meta;
        const [mA, mB] = m.anchors?.meridians || [];
        const [pA, pB] = m.anchors?.parallels || [];
        let lonA = m.lon0;
        let lonB = m.lon1;
        let latTop = m.lat0;
        let latBot = m.lat1;
        if (mA && mB && pA && pB) {
            const lonPerPx = (mB.lon - mA.lon) / (mB.col - mA.col);
            lonA = mA.lon + (0 - mA.col) * lonPerPx;
            lonB = mA.lon + (m.width - mA.col) * lonPerPx;
            const latPerPx = (pB.lat - pA.lat) / (pA.row - pB.row); // 正值：每行几度
            latTop = pA.lat + pA.row * latPerPx;
            latBot = latTop - m.height * latPerPx;
        }
        return { lonA, lonB, latTop, latBot };
    }
    paint(ctx, cam, vw, vh) {
        if (!this.opts.on || !this.img || !this.meta || !vw || !vh)
            return;
        const { lonA, lonB, latTop, latBot } = this.window();
        const m = this.meta;
        const spanLat = latTop - latBot;
        if (!spanLat)
            return;
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * Math.max(0, Math.min(1, this.opts.opacity));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // 图幅可能因世界平移出现在 ±360 的另一侧
        const pxPerWorld = vw / cam.w;
        const shifts = [0, 360, -360].filter((k) => {
            const x0 = (lonA + k - cam.x) * pxPerWorld;
            const x1 = (lonB + k - cam.x) * pxPerWorld;
            return x1 > 0 && x0 < vw;
        });
        for (const k of shifts) {
            const x0 = (lonA + k - cam.x) * pxPerWorld;
            const dw = (lonB - lonA) * pxPerWorld;
            for (let i = 0; i < STRIPS; i++) {
                const f0 = i / STRIPS;
                const f1 = (i + 1) / STRIPS;
                const latA = latTop - spanLat * f0; // 图上往下 = 纬度变小
                const latB = latTop - spanLat * f1;
                const wyA = mercY(latA);
                const wyB = mercY(latB);
                const destY = ((wyA - cam.y) / cam.h) * vh;
                const destH = ((wyB - wyA) / cam.h) * vh;
                if (destH === 0)
                    continue;
                if (destY > vh || destY + destH < 0)
                    continue;
                ctx.drawImage(this.img, 0, m.height * f0, m.width, m.height * (f1 - f0), x0, destY, dw, destH);
            }
        }
        ctx.restore();
    }
}
