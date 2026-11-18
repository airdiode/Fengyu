const CIRCLE = 'M0,-1 A1,1 0 1,1 0,1 A1,1 0 1,1 0,-1 Z';
const TRIANGLE = 'M0,-1 L0.95,0.72 L-0.95,0.72 Z';
const SQUARE = 'M-0.85,-0.85 L0.85,-0.85 L0.85,0.85 L-0.85,0.85 Z';
const DIAMOND = 'M0,-1 L1,0 L0,1 L-1,0 Z';
const CROSS = 'M-0.34,-1 L0.34,-1 L0.34,-0.34 L1,-0.34 L1,0.34 L0.34,0.34 L0.34,1 L-0.34,1 L-0.34,0.34 L-1,0.34 L-1,-0.34 L-0.34,-0.34 Z';
export const EVENT_CATEGORY = {
    war: { name: '战争', color: '#a8382a', shape: TRIANGLE, filled: true, r: 3.8, weight: 50 },
    politics: { name: '政治', color: '#7a5a2a', shape: CIRCLE, filled: true, r: 3.2, weight: 40 },
    diplomacy: { name: '外交', color: '#2f6b7a', shape: CIRCLE, filled: false, r: 3.6, weight: 45 },
    economy: { name: '经济', color: '#6b5a1e', shape: SQUARE, filled: true, r: 3.4, weight: 25 },
    education: { name: '教育', color: '#3f6b52', shape: SQUARE, filled: false, r: 3.8, weight: 30 },
    culture: { name: '文化', color: '#8a3a6a', shape: DIAMOND, filled: true, r: 3.6, weight: 25 },
    science: { name: '科技', color: '#3a6a8a', shape: DIAMOND, filled: false, r: 3.8, weight: 30 },
    society: { name: '社会', color: '#6b5a3a', shape: CIRCLE, filled: true, r: 2.7, weight: 20 },
    law: { name: '法律', color: '#4a4a6a', shape: TRIANGLE, filled: false, r: 4, weight: 20 },
    disaster: { name: '灾祸', color: '#c27c1e', shape: CROSS, filled: true, r: 3.4, weight: 45 },
    other: { name: '其他', color: '#8a8070', shape: CIRCLE, filled: true, r: 2.6, weight: 0 },
};
const FALLBACK = EVENT_CATEGORY.other;
export const categoryStyle = (category) => (category && EVENT_CATEGORY[category]) || FALLBACK;
/** 事件标签优先级：内容权重叠在事件基数上（低于地点 300、战线 270，高于组织 200）。 */
export const eventLabelPriority = (e) => 200 + categoryStyle(e.category).weight;
/** 图例用的顺序：先战争/外交这些"大事件"，再社会/其他。 */
export const CATEGORY_ORDER = [
    'war',
    'diplomacy',
    'politics',
    'disaster',
    'economy',
    'education',
    'science',
    'culture',
    'society',
    'law',
    'other',
];
const pathCache = new Map();
/** Canvas 侧的路径缓存（同一形状只构造一次）。 */
export function pathOf(style) {
    const key = `${style.shape}|${style.filled}`;
    let p = pathCache.get(key);
    if (!p) {
        p = new Path2D(style.shape);
        pathCache.set(key, p);
    }
    return p;
}
/** 图例侧：把单位框里的 path 压进 14×14 的 svg。 */
export function swatchSvg(style, size = 11) {
    const inner = style.filled
        ? `<path d="${style.shape}" fill="${style.color}"/>`
        : `<path d="${style.shape}" fill="none" stroke="${style.color}" stroke-width="0.32"/>`;
    return `<svg width="${size}" height="${size}" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true">${inner}</svg>`;
}
