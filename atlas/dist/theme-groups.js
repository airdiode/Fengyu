/**
 * 2026-11-18 重新归类（§4.327）。三条原则：
 * 1. 同一类题材放在一组——三篇「女性」不再拆在两组里；
 * 2. 组名要能一句话说清边界（「经济与基建」不再叫「经济与技术」，因为技术另有一组）；
 * 3. 每组不超过 8 条（三列浮层排得下，`theme-groups.test.mjs` 有硬约束）。
 */
export const THEME_GROUPS = [
    {
        // 打出来的、谈出来的、守住的边界
        title: '战争、外交与边疆',
        ids: [
            'theme.yapian',
            'theme.jiawu',
            'theme.gengzi',
            'theme.treaties',
            'theme.ruoguo-shijie',
            'theme.frontier',
            'theme.mongol-nationalism',
        ],
    },
    {
        // 清末这七十年：内乱、宫廷、新政、革命
        title: '晚清变局',
        ids: ['theme.taiping', 'theme.chuilian', 'theme.qing-power', 'theme.xinzheng', 'theme.xinhai'],
    },
    {
        // 民国谁在台上、谁在名单里
        title: '民国政制与人物',
        ids: ['theme.north-cabinet', 'theme.north-presidents', 'theme.roc-power', 'theme.roster-1949'],
    },
    {
        // 厂矿、铁路、货币
        title: '经济与基建',
        ids: ['theme.yangwu', 'theme.rails', 'theme.currency'],
    },
    {
        // 城里人怎么过日子，女性这一百年（三篇放在一起）
        title: '社会、日常与女性',
        ids: [
            'theme.chengshi-richang',
            'theme.shenghuo-bianhua',
            'theme.media',
            'theme.disaster',
            'theme.women',
            'theme.nvxing-falv',
            'theme.nvzi-jiaoyu',
        ],
    },
    {
        // 钱怎么变成学堂、人怎么出去读书、病怎么统计
        title: '教育与卫生',
        ids: ['theme.xingxue', 'theme.gengkuan', 'theme.liumei-youtong', 'theme.jibing-yu-chengshi'],
    },
    {
        // 读者自己走一遍的线
        title: '读书与探访',
        ids: ['theme.city-walks', 'theme.person-trails', 'theme.kong-lineage'],
    },
];
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
        if (list.length)
            out.push({ title: g.title, themes: list });
    }
    const rest = themes.filter((t) => !used.has(t.id));
    if (rest.length)
        out.push({ title: '其他', themes: rest });
    return out;
}
