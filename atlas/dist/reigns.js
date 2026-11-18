/** 清代年号与两宫太后垂帘听政的时段（时间轴上用）。 */
/** 年号：起止按改元之年，与时间轴覆盖的 1840–1912 取交集 */
export const REIGNS = [
    { name: '道光', from: 1840, to: 1850, emperor: '清宣宗' },
    { name: '咸丰', from: 1851, to: 1861, emperor: '清文宗' },
    { name: '同治', from: 1862, to: 1874, emperor: '清穆宗' },
    { name: '光绪', from: 1875, to: 1908, emperor: '清德宗' },
    { name: '宣统', from: 1909, to: 1911, emperor: '溥仪' },
];
/**
 * 垂帘听政两段：
 * 1861 年辛酉政变后慈安、慈禧两宫垂帘，至 1873 年同治亲政；
 * 1875 年光绪即位再度垂帘，1881 年慈安去世后慈禧一人听政，至 1889 年光绪亲政。
 */
export const REGENCIES = [
    { label: '两宫垂帘', from: 1861, to: 1873, note: '慈安、慈禧两宫太后垂帘，1873 年同治亲政' },
    { label: '垂帘·慈禧独断', from: 1875, to: 1889, note: '再度垂帘；1881 年慈安去世后慈禧一人听政，1889 年光绪亲政' },
];
export const POWERS = [
    { label: '袁世凯', from: 1912, to: 1915, note: '临时大总统→大总统，1915 年底称帝、1916 年 3 月取消，6 月卒' },
    { label: '段祺瑞', from: 1916, to: 1919, note: '皖系，国务总理与参战督办；黎元洪、冯国璋、徐世昌是前台' },
    { label: '曹锟', from: 1920, to: 1923, note: '直系（曹锟、吴佩孚），直皖战争与第一次直奉战争后掌北京' },
    { label: '张作霖', from: 1924, to: 1927, note: '奉系，第二次直奉战争后入关；1927 年任安国军大元帅' },
    { label: '蒋介石', from: 1928, to: 1949, note: '国民政府主席→军事委员会委员长→总统；1927、1949 两次下野' },
];
/** 某年的年号 */
export function reignAt(year) {
    for (const r of REIGNS)
        if (year >= r.from && year <= r.to)
            return r;
    return null;
}
/** 某年是否在垂帘听政期间 */
export function regencyAt(year) {
    for (const r of REGENCIES)
        if (year >= r.from && year <= r.to)
            return r;
    return null;
}
