/** 朝代分段：时间轴和地图上的年份都按这个分段上色/标注。 */
export const ERAS = [
    { from: 1840, to: 1912, key: 'qing', label: '清', band: '#e7d9b8', ink: '#6b5a3a' },
    { from: 1912, to: 1950, key: 'roc', label: '民国', band: '#d7e0e4', ink: '#3f5a68' },
];
/** 某一年属于哪一段（清帝退位在 1912 年 2 月，此后算民国） */
export function eraAt(year) {
    for (const e of ERAS)
        if (year >= e.from && year < e.to)
            return e;
    return year < ERAS[0].from ? ERAS[0] : ERAS[ERAS.length - 1];
}
