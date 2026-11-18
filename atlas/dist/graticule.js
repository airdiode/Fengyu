/**
 * 经纬网与北回归线：只放纯计算（步长、度数格式），画线在 map.ts。
 * 这样度数写法和「缩放拉远时换档」都能单测，不用起 canvas。
 */
/** 北回归线：23°26′N（约 23.4365°）。 */
export const TROPIC_LAT = 23.4365;
/**
 * 经纬线的间隔（度）：视口横向覆盖的经度越宽，线越稀。
 * 全景（约 360°）30°，中国范围 10°，再放大到省一级换 5°/1°。
 */
export function graticuleStep(worldWidth) {
    if (worldWidth >= 200)
        return 30;
    if (worldWidth >= 90)
        return 20;
    if (worldWidth >= 25)
        return 10;
    if (worldWidth >= 8)
        return 5;
    return 1;
}
const norm = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
/** 经度写法：100°E / 100°W / 0°（180° 不带东西经）。 */
export function formatLon(lon) {
    const v = Math.round(norm(lon));
    if (v === 0)
        return '0°';
    if (Math.abs(v) === 180)
        return '180°';
    return v > 0 ? `${v}°E` : `${-v}°W`;
}
/** 纬度写法：40°N / 20°S / 0°。 */
export function formatLat(lat) {
    const v = Math.round(lat);
    if (v === 0)
        return '0°';
    return v > 0 ? `${v}°N` : `${-v}°S`;
}
