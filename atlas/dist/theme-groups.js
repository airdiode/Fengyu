/**
 * 2026-11-18 重新归类（§4.327）。三条原则：
 * 1. 同一类题材放在一组——三篇「女性」不再拆在两组里；
 * 2. 组名要能一句话说清边界（「经济与基建」不再叫「经济与技术」，因为技术另有一组）；
 * 3. 每组不超过 8 条（三列浮层排得下，`theme-groups.test.mjs` 有硬约束）。
 * 4. 组内按专题的起始年大致排序（2026-11-21）：新加的线不会随手塞到组末，
 *    读者按时间从头读到尾；同年保持这张表里的先后，个别长时段线（边疆、戏台）按起点排。
 */
export const THEME_GROUPS = [
    {
        // 打出来的、谈出来的、守住的边界；长时段与开头年排序，frontier 从 1639 起
        title: '战争、外交与边疆',
        ids: [
            'theme.frontier',
            'theme.yapian',
            'theme.treaties',
            'theme.ruoguo-shijie',
            'theme.sino-french',
            'theme.mongol-nationalism',
            'theme.jiawu',
            'theme.gengzi',
        ],
    },
    {
        // 清末这七十年：内乱、宫廷、新政、革命
        title: '晚清变局',
        ids: [
            'theme.qing-power',
            'theme.taiping',
            'theme.opium2',
            'theme.chuilian',
            'theme.xinzheng',
            'theme.xinhai',
        ],
    },
    {
        // 民国谁在台上、谁在名单里
        title: '民国政制与人物',
        ids: [
            'theme.north-cabinet',
            'theme.north-presidents',
            'theme.roc-power',
            'theme.warlords',
            'theme.dangjun-zhengdun',
            'theme.roster-1949',
        ],
    },
    {
        // 厂矿、铁路、货币
        title: '经济与基建',
        ids: [
            'theme.currency',
            'theme.yangwu',
            'theme.prices-wages',
            'theme.rails',
            'theme.money1940s',
            'theme.wartime-economy',
        ],
    },
    {
        // 城里人怎么过日子，女性这一百年（三篇放在一起）
        title: '社会、日常与女性',
        ids: [
            'theme.chengshi-richang',
            'theme.media',
            'theme.disaster',
            'theme.women',
            'theme.nvxing-falv',
            'theme.nvzi-jiaoyu',
            'theme.shenghuo-bianhua',
        ],
    },
    {
        // 银幕与戏台：演的人、唱的人
        title: '电影、戏剧与曲艺',
        ids: [
            'theme.opera',
            'theme.film-stars',
            'theme.drama',
        ],
    },
    {
        // 钱怎么变成学堂、人怎么出去读书、病怎么统计
        title: '教育与卫生',
        ids: [
            'theme.liumei-youtong',
            'theme.jibing-yu-chengshi',
            'theme.daxue-xiaozhang',
            'theme.translation',
            'theme.gengkuan',
            'theme.xingxue',
        ],
    },
    {
        // 读者自己走一遍的线
        title: '读书与探访',
        ids: [
            'theme.city-walks',
            'theme.person-trails',
            'theme.kong-lineage',
        ],
    },
    {
        // 抗战这一场大搬家：文物、学校与人怎么走到西南
        title: '抗战中的迁徙与后方',
        ids: [
            'theme.wenwu-nanqian',
            'theme.daxue-qianyi',
            'theme.chongqing-bombing',
        ],
    },
];
/** 专题起始年：interval 取 start、instant 取 at；没有时间或读不出来给 Infinity，排到组末。 */
function startYearOf(t) {
    const raw = t.time?.kind === 'instant' ? t.time.at : t.time?.start;
    const m = /^(-?\d+)/.exec(String(raw || ''));
    return m ? Number(m[1]) : Infinity;
}
/** 把专题实体按上面的表分组；表里没有的落「其他」，保证一条都不丢。 */
export function groupThemes(themes) {
    const byId = new Map(themes.map((t) => [t.id, t]));
    const used = new Set();
    const out = [];
    for (const g of THEME_GROUPS) {
        const list = [];
        for (const id of g.ids) {
            const t = byId.get(id);
            if (t && !used.has(id)) {
                list.push(t);
                used.add(id);
            }
        }
        // 组内大致按时间排：取专题的起始年，同年保持 THEME_GROUPS 里的先后（Array.sort 是稳定的）。
        // 没有时间的排到最后，不至于把一条线顶到最前面（`test/theme-groups` 守着）。
        list.sort((a, b) => startYearOf(a) - startYearOf(b));
        if (list.length)
            out.push({ title: g.title, themes: list });
    }
    const rest = themes.filter((t) => !used.has(t.id));
    if (rest.length)
        out.push({ title: '其他', themes: rest });
    return out;
}
