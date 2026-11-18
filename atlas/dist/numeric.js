import { label } from './types.js';
/** 万 / 亿：死亡人数动辄七位，直接写 9000000 没人读 */
const inTenThousands = (n) => {
    if (n >= 10000) {
        const w = n / 10000;
        return `${Number.isInteger(w) ? w : w.toFixed(1).replace(/\.0$/, '')} 万`;
    }
    return String(n);
};
/** 从一句话里抠出第一个「数字 + 量词」，抠不到就返回 null（宁可不出数，别出坏数） */
export function firstQuantity(text) {
    const m = /([\d,]+(?:\.\d+)?)\s*(万人|万余人|万|千人|人)/.exec(text || '');
    return m ? `${m[1]}${m[2]}` : null;
}
export function numberBadge(e) {
    if (!e)
        return null;
    const t = e.treaty;
    if (t) {
        if (t.indemnity && Number.isFinite(t.indemnity.amount)) {
            return { text: `赔款 ${t.indemnity.amount} ${t.indemnity.unit}`, kind: 'treaty' };
        }
        if (t.ports?.length)
            return { text: `开口岸 ${t.ports.length} 处`, kind: 'treaty' };
        if (t.ceded?.length)
            return { text: `割地 ${t.ceded.length} 处`, kind: 'treaty' };
    }
    const casualties = e.battle?.casualties ? label(e.battle.casualties) : '';
    const casNum = firstQuantity(casualties);
    if (casNum)
        return { text: `伤亡 ${casNum}`, kind: 'battle' };
    const deaths = e.hazard?.deaths;
    if (deaths) {
        const { low, high } = deaths;
        if (Number.isFinite(low) && Number.isFinite(high)) {
            return {
                text: low === high ? `死亡 ${inTenThousands(low)}` : `死亡 ${inTenThousands(low)}–${inTenThousands(high)}`,
                kind: 'hazard',
            };
        }
    }
    const metric = (e.metrics || []).find((m) => (m.points || []).length);
    if (metric) {
        const last = metric.points[metric.points.length - 1];
        const unit = metric.unit ? ` ${metric.unit}` : '';
        return { text: `${label(metric.name)} ${last.value}${unit}`, kind: 'metric' };
    }
    const adopt = (e.adoption || [])[0];
    if (adopt)
        return { text: `${adopt.year} 年采用`, kind: 'adoption' };
    return null;
}
