export const PERIODS = [
    { from: 1840, to: 1842, label: '鸦片战争', kind: 'fixed' },
    { from: 1851, to: 1864, label: '太平天国', kind: 'fixed' },
    { from: 1861, to: 1895, label: '洋务运动', kind: 'fuzzy' },
    { from: 1894, to: 1895, label: '甲午战争', kind: 'fixed' },
    // 官方表述是「义和团运动」（反帝爱国运动），不用旧称「庚子之变」
    { from: 1899, to: 1901, label: '义和团运动', kind: 'fixed' },
    { from: 1901, to: 1911, label: '清末新政', kind: 'fuzzy' },
    { from: 1911, to: 1912, label: '辛亥革命', kind: 'fixed' },
    { from: 1916, to: 1928, label: '军阀混战', kind: 'fixed' },
    { from: 1924, to: 1927, label: '国民革命', kind: 'fixed' },
    // 1927–1937 按现行分期叫「土地革命战争」，不叫「十年建设」（那是旧表述）
    { from: 1927, to: 1937, label: '土地革命战争', kind: 'fixed' },
    { from: 1931, to: 1945, label: '抗日战争', kind: 'fixed' },
    { from: 1946, to: 1949, label: '解放战争', kind: 'fixed' },
];
/** 落在某段年份里的时期（含跨界的） */
export function periodsAt(year) {
    return PERIODS.filter((p) => year >= p.from && year <= p.to);
}
