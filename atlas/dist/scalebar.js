/** 赤道上 1° 经度的长度（公里） */
const KM_PER_DEG = 111.32;
/** 赤道处每像素多少公里 → 指定纬度处每像素多少公里 */
export function kmPerPxAt(cam, vw, lat) {
    const degPerPx = cam.w / vw;
    const cos = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    return (degPerPx * KM_PER_DEG * cos) / 1;
}
/** 千分位：5000 → 5,000 */
const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** 1 / 2 / 5 序列里的一个数 → 文字 */
export function scaleLabel(km) {
    if (km >= 1)
        return `${group(Math.round(km))} 公里`;
    return `${Math.round(km * 1000)} 米`;
}
/**
 * 从 1、2、5 的十进序列里挑一个：宽度不超过 maxPx，取其中最大的那个。
 * 这样比例尺永远是「整」数（500 公里，不是 487 公里），缩放时按档跳。
 */
export function niceScaleBar(pxPerKm, maxPx = 132) {
    const safe = Math.max(1e-9, pxPerKm);
    let km = 0.001; // 1 米，缩到极近时的兜底
    for (let exp = -3; exp <= 5; exp++) {
        for (const s of [1, 2, 5]) {
            const k = s * 10 ** exp;
            if (k > 1e6)
                continue;
            if (k * safe <= maxPx)
                km = k;
        }
    }
    return { km, px: km * safe, label: scaleLabel(km) };
}
