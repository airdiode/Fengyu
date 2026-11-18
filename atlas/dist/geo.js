const R2D = Math.PI / 180;
export const mercX = (lng) => lng;
export const mercY = (lat) => (Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * R2D) / 2)) / R2D) * -1;
/** mercY 的逆：屏幕命中测试要把像素换回经纬度 */
export const unmercY = (y) => (2 * Math.atan(Math.exp(-y * R2D)) - Math.PI / 2) / R2D;
export function boundsOf(coords) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [lng, lat] of coords) {
        const x = mercX(lng);
        const y = mercY(lat);
        if (x < minX)
            minX = x;
        if (y < minY)
            minY = y;
        if (x > maxX)
            maxX = x;
        if (y > maxY)
            maxY = y;
    }
    return { minX, minY, maxX, maxY };
}
/** 世界坐标 → 屏幕像素 */
export function screenOf(cam, vw, vh, wx, wy) {
    return [((wx - cam.x) / cam.w) * vw, ((wy - cam.y) / cam.h) * vh];
}
/** 屏幕像素 → 世界坐标 */
export function worldOf(cam, vw, vh, sx, sy) {
    return [cam.x + (sx / vw) * cam.w, cam.y + (sy / vh) * cam.h];
}
export function fitCamera(b, vw, vh, pad = 0.06) {
    const bw = Math.max(1e-6, b.maxX - b.minX);
    const bh = Math.max(1e-6, b.maxY - b.minY);
    const scale = Math.min(vw / bw, vh / bh) / (1 + pad * 2);
    const w = vw / scale;
    const h = vh / scale;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}
/** 在相机坐标下缩放（以屏幕点为中心） */
export function zoomAt(cam, vw, vh, sx, sy, factor) {
    const [wx, wy] = worldOf(cam, vw, vh, sx, sy);
    const w = cam.w * factor;
    const h = (cam.h * factor * vh) / vh;
    const rx = sx / vw;
    const ry = sy / vh;
    return { x: wx - rx * w, y: wy - ry * h, w, h };
}
/**
 * 把世界坐标 bbox 恰好在**屏幕上的某个矩形里**放满（不一定是整个画布）。
 * 右侧有固定面板时，地图内容要居中在剩下的那一块里，而不是整个画布中心。
 */
export function fitCameraInRect(b, rect, viewport, pad = 0.08) {
    const worldW = Math.max(1e-6, b.maxX - b.minX);
    const worldH = Math.max(1e-6, b.maxY - b.minY);
    const scale = Math.min(rect.w / worldW, rect.h / worldH) * (1 - pad);
    const w = viewport.w / scale;
    const h = viewport.h / scale;
    const cxPx = rect.x + rect.w / 2;
    const cyPx = rect.y + rect.h / 2;
    const wx = (b.minX + b.maxX) / 2;
    const wy = (b.minY + b.maxY) / 2;
    return { x: wx - (cxPx / viewport.w) * w, y: wy - (cyPx / viewport.h) * h, w, h };
}
/** 点到线段的距离（悬停命中测试用） */
export function distToSegment(x, y, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (!len2)
        return Math.hypot(x - a.x, y - a.y);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}
/**
 * 世界地图的接缝经度（20°W，落在大西洋上）。
 *
 * 经度小于接缝的环整体东移 360°：美洲、格陵兰、夏威夷于是跑到太平洋东侧，
 * 从中国往右拖就是美洲，世界连成一整圈且每块地只画一次。
 */
export const WORLD_SEAM = -20;
/** 某个环应当平移多少度（0 或 360），按环的平均经度定 */
/**
 * 单个经度的「世界平移」：接缝以西（美洲）按 +360 书写，界面上才画得在陆地那一边。
 * 环、线、点都用这一个判断，免得同一块地有的挪有的不挪。
 */
export const worldLng = (lng, seam = WORLD_SEAM) => (lng < seam ? lng + 360 : lng);
export function worldShift(ring, seam = WORLD_SEAM) {
    if (!ring.length)
        return 0;
    let sum = 0;
    for (const p of ring)
        sum += p[0];
    return sum / ring.length < seam ? 360 : 0;
}
