const CESSION_COMMON = {
    source: '条约文字 + 现代 10m 地理数据 + 旧图描线',
    method: '割让面为示意性闭合范围，不是条约附图逐点复原',
    precision: '界线 0.01–0.1°，面 0.1–0.3°',
    confidence: '中低',
};
const CESSIONS = {
    'cession:cede.amur-north': {
        source: '《瑷珲条约》（1858）文字；黑龙江中心线与外兴安岭按现代 10m 河道/地形参照',
        method: '南界取黑龙江中心线（现代国界，真实河道）；北界按条约「外兴安岭」走向示意闭合',
        precision: '界线约 0.01°（沿河道），北界约 0.2°',
        confidence: '中（界线可靠、北界示意）',
        segments: [
            { part: '南界（黑龙江）', source: '现代中俄边界河道', precision: '0.01°', confidence: '高' },
            { part: '北界（外兴安岭）', source: '条约文字 + 地形示意', precision: '0.2°', confidence: '低' },
        ],
    },
    'cession:cede.ussuri-east': {
        source: '《中俄北京条约》（1860）；西界现代中俄边界（乌苏里江—兴凯湖—图们江），南/东取 10m 海岸线，北界阿穆尔河中心线',
        method: '沿真实河道与海岸线闭合；不含库页岛（1860 年条约只割乌苏里江以东陆地）',
        precision: '0.01–0.05°',
        confidence: '中高（界线沿真实河道/海岸）',
        segments: [
            { part: '西界（乌苏里江—图们江）', source: '现代中俄边界', precision: '0.01°', confidence: '高' },
            { part: '东界（日本海海岸）', source: 'Natural Earth 10m 海岸线', precision: '0.01°', confidence: '高' },
        ],
    },
    'cession:cede.ussuri-joint': {
        source: '《瑷珲条约》（1858）共管条款',
        method: '1858–1860 两年共管区，范围按条约示意闭合',
        precision: '0.1–0.2°',
        confidence: '低（共管无明确界线）',
    },
    'cession:cede.nw-1864': {
        source: '《勘分西北界约记》（1864）；东界现代中哈/中吉边界，西界据《清史地图集》p.152 描线',
        method: '东界走 1864 年条约线（即现代国界）；西界逐行追踪《清史地图集》p.152 的青色旧界带，仿射配准残差约 0.01°，线本身来回约 0.1°',
        precision: '0.1°（西界），东界 0.01°',
        confidence: '中低（西界为描线，非测绘）',
        segments: [
            { part: '东界（现代中哈/中吉）', source: '现代国界（1864 年条约线）', precision: '0.01°', confidence: '高' },
            { part: '西界（巴尔喀什湖以东旧界）', source: '《清史地图集》p.152 描线', precision: '0.1°', confidence: '中低' },
        ],
    },
    'cession:cede.ili-west': {
        source: '《伊犁条约》（1881）第七条；东界现代中哈边界，西/南据《清史地图集》p.152 描线',
        method: '东界走 1882 年划定的现代国界；西界顺霍尔果斯河—伊犁河—乌宗岛山旧界描线；南端绕特克斯河谷',
        precision: '0.1°',
        confidence: '中低（描线，范围示意）',
        segments: [
            { part: '东界（现代中哈）', source: '现代国界（1882 年线）', precision: '0.01°', confidence: '高' },
            { part: '西/南界（旧界）', source: '《清史地图集》p.152 描线', precision: '0.1°', confidence: '中低' },
        ],
    },
    'cession:cede.hongkong-island': {
        source: '《南京条约》（1842）文字',
        method: '香港岛海岸线取现代 10m 数据，范围按条约示意',
        precision: '0.02°',
        confidence: '中（岛界清楚）',
    },
    'cession:cede.kowloon': {
        source: '《北京条约》（1860）文字',
        method: '九龙司范围按条约与旧图示意闭合',
        precision: '0.05°',
        confidence: '中低',
    },
    'cession:cede.new-territories': {
        source: '《展拓香港界址专条》（1898）文字',
        method: '新界租借范围按旧图与现代行政界示意',
        precision: '0.05°',
        confidence: '中低',
    },
};
const REGIONS = {
    'region:tibet-vassal': {
        source: 'CHGIS V6 1820 西藏单元 + 1934 年《中华民国新地图》藏南/阿里修正',
        method: '1820 单元取环；西南段换成 1934 年图的主张线，补回阿里南部、亚东、珞渝',
        precision: '0.05–0.1°',
        confidence: '中',
        segments: [
            { part: '主体', source: 'CHGIS V6 1820', precision: '0.02°', confidence: '中高' },
            { part: '西南段（藏南/阿里）', source: '1934 年《中华民国新地图》', precision: '0.1°', confidence: '中' },
        ],
    },
    'region:tibet-1913': {
        source: '1934 年《中华民国新地图》与 CHGIS 1911 西藏范围',
        method: '噶厦治理范围按 1913–1951 年实际控制示意',
        precision: '0.1°',
        confidence: '中低',
    },
    'region:mongolia-1911': {
        source: 'CHGIS V6 1911 年喀尔喀四部 + 达里冈爱牧场',
        method: '四部 + 牧场 0.02° 栅格并集，描边成整块',
        precision: '0.02°',
        confidence: '中高（行政单元并集）',
        segments: [
            { part: '喀尔喀四部', source: 'CHGIS 1911（土谢图汗/车臣汗/三音诺颜/扎萨克图汗）', precision: '0.02°', confidence: '中高' },
            { part: '达里冈爱牧场', source: 'CHGIS 1911 单独单元', precision: '0.02°', confidence: '中' },
        ],
    },
    'region:mongolia-autonomy': {
        source: '同 1911 年喀尔喀四部（CHGIS V6）',
        method: '1915–1919 自治时期沿用四部范围',
        precision: '0.02°',
        confidence: '中高',
    },
    'region:mongolia': {
        source: '同 1911 年喀尔喀四部（CHGIS V6）',
        method: '1921–1946 苏联控制时期沿用四部范围',
        precision: '0.02°',
        confidence: '中高',
    },
    'region:mongolia-independent': {
        source: '同 1911 年喀尔喀四部（CHGIS V6）',
        method: '1946 年承认独立后沿用四部范围',
        precision: '0.02°',
        confidence: '中高',
    },
    'region:taiwan-1895': {
        source: '清代台湾府界 + Natural Earth 10m 海岸线',
        method: '按 1895 年割台时的行政区与海岸线示意',
        precision: '0.02°',
        confidence: '中',
    },
    'region:manchukuo': {
        source: '现代黑吉辽三省界近似',
        method: '伪满洲国范围无可靠历史界线，用现代省界近似',
        precision: '0.2–0.5°',
        confidence: '低（近似）',
    },
    'region:ru-ili': {
        source: '《伊犁条约》前后的俄占范围，手绘',
        method: '按条约文字与旧图圈定，北/东界接现代国界',
        precision: '0.2°',
        confidence: '低',
    },
    'region:nw-1864-claim': {
        source: '《勘分西北界约记》1864 年旧界（《清史地图集》p.152 描线）',
        method: '与 `cede.nw-1864` 同一份描线，表示「未承认的割让」',
        precision: '0.1°',
        confidence: '中低',
    },
    'region:outer-manchuria-claim': {
        source: '《瑷珲条约》《北京条约》前的清代范围',
        method: '以现代中俄边界为西/南界，按旧图向北/东闭合',
        precision: '0.2°',
        confidence: '低',
    },
    'region:sakhalin-contested': {
        source: 'Natural Earth 10m 库页岛轮廓 + 条约文字',
        method: '岛形取现代海岸线，归属按年份切换',
        precision: '0.02°',
        confidence: '中',
    },
};
const REGION_DEFAULT = {
    source: 'CHGIS V6 / 1934 年图 / 旧图手绘（见条目说明）',
    method: '按行政单元或旧图范围取环，必要时与现代地理数据拼接',
    precision: '0.05–0.2°',
    confidence: '中低',
};
const CLAIM_EXTRA = {
    source: 'CHGIS V6 1911/1820 单元（喀尔喀四部、唐努乌梁海）',
    method: '主张块与实控环并集后取外轮廓；小块单独画',
    precision: '0.02°',
    confidence: '中高（行政单元并集）',
};
const SPHERE = {
    source: '殖民地边界用现代国界近似（Natural Earth 10m）；在华租借地手绘；1907 日俄密约线手绘',
    method: '列强势力范围按「殖民地/租借地/占领区」分块叠加，不是条约附图',
    precision: '0.2–1°',
    confidence: '低（示意）',
    segments: [
        { part: '英属印度/缅甸/锡兰、法属印支、荷属东印度等', source: '现代国界近似', precision: '0.2–0.5°', confidence: '低' },
        { part: '在华租借地（旅大、胶州湾、威海卫、广州湾、新界、澳门）', source: '手绘', precision: '0.1–0.3°', confidence: '低' },
        { part: '1907 日俄密约分界线', source: '手绘', precision: '0.2°', confidence: '低' },
    ],
};
const CONCESSION = {
    source: '租借条约文字 + 旧图 + 现代城市参照',
    method: '各租借地单独手绘闭合，面积/形状仅示意',
    precision: '0.1–0.3°',
    confidence: '低',
};
const SPHERE_LINE = {
    source: '1907 年日俄第一次《密约》文字',
    method: '按密约划定的南满/北满分界手绘',
    precision: '0.2°',
    confidence: '低（示意）',
};
const TAIPING = {
    source: '旧项目 14 个年度的「控制府州」清单 + CHGIS V6 1820 府级几何',
    method: '按年把清单里的府州拼成控制区，0.02° 栅格并集后描边',
    precision: '0.02–0.05°',
    confidence: '中（府级归属有取舍）',
    segments: [
        { part: '控制府州清单', source: '旧项目 `taiping.json`（14 个年度）', precision: '府级', confidence: '中' },
        { part: '府级几何', source: 'CHGIS V6 1820 府级界线', precision: '0.02°', confidence: '中高' },
    ],
};
const GEO = {
    source: 'Natural Earth 1:10m（河流、湖泊、山系、高原、盆地）',
    method: '现代参考底图，按需裁剪/抽稀；不是历史水系复原',
    precision: '1:10m（约 1 km）',
    confidence: '高（作为现代底图）；历史时期仅作参照',
};
const TERRITORY = {
    source: 'CHGIS V6 1796 年疆域快照（经「江山时序」atlas 汇编）；西段/西南段按《清史地图集》与 1934 年图手修；东段按现代中俄边界裁切',
    method: '主环 = CHGIS 快照 → 东段取现代中俄边界（黑龙江—乌苏里江）→ 帕米尔段换 1934 年图 11 点描线 → 西南并入西藏 1934 藩部弧段',
    precision: '0.01–0.1°（约 1–10 km）',
    confidence: '中（示意性复原，非测绘）',
    segments: [
        { part: '主体（行省/将军辖区/藩部）', source: 'CHGIS V6 1796 快照', precision: '0.01°', confidence: '中高' },
        { part: '东段（外东北/库页岛）', source: '现代中俄边界裁切', precision: '0.01°', confidence: '高' },
        { part: '帕米尔西段（75.5–78.6°E）', source: '1934 年《中华民国新地图》11 点描线', precision: '0.1°', confidence: '中' },
        { part: '西南（西藏/藏南/阿里）', source: '1934 年图主张线并入 CHGIS 弧段', precision: '0.1°', confidence: '中' },
    ],
};
const CLAIM_MAIN = {
    source: '1840：实控基线 ∪ 主张块；1912/1945/1946：CHGIS 1912/1945 疆域 + 外蒙/唐努；104°E 以西换 1934 年图线',
    method: '主张环 = 实控环 ∪ 主张块；西段在 104°E 处接 1934 年图线（接缝 105.4–106.2°E，交点差 0.04°）；1945 段补台湾环',
    precision: '0.05–0.1°',
    confidence: '中低（主张口径随政府/时期而异）',
    segments: [
        { part: '1840 主张', source: '清 1840 实控 + 外西北/科布多/唐努/外东北/库页岛主张块', precision: '0.05°', confidence: '中' },
        { part: '1912–1945', source: 'CHGIS 1912 疆域 + 外蒙（喀尔喀四部）+ 唐努；台湾不在内', precision: '0.05°', confidence: '中低' },
        { part: '1945–1946', source: '同 1912 环 + 台湾', precision: '0.05°', confidence: '中低' },
        { part: '1946–', source: 'CHGIS 1945 疆域；外蒙已承认独立', precision: '0.05°', confidence: '中' },
        { part: '西段（104°E 以西）', source: '1934 年《中华民国新地图》手工抠图线', precision: '0.1°', confidence: '中低' },
    ],
};
const CLAIM_EXTRA_MONGOLIA = {
    source: 'CHGIS V6 1911 年喀尔喀四部 + 达里冈爱牧场',
    method: '四部 + 牧场 0.02° 栅格并集，描边成整块',
    precision: '0.02°',
    confidence: '中高',
    segments: [
        { part: '喀尔喀四部', source: 'CHGIS 1911', precision: '0.02°', confidence: '中高' },
        { part: '达里冈爱牧场', source: 'CHGIS 1911 单独单元', precision: '0.02°', confidence: '中' },
    ],
};
const CLAIM_EXTRA_TANNU = {
    source: 'CHGIS V6 1820 年「唐努乌梁海」单元',
    method: '单单元取环，简化；清代乌里雅苏台辖区示意',
    precision: '0.02°',
    confidence: '中',
};
const TABLE = {
    territory: TERRITORY,
    'claim:main': CLAIM_MAIN,
    'claim:外蒙古': CLAIM_EXTRA_MONGOLIA,
    'claim:唐努乌梁海': CLAIM_EXTRA_TANNU,
    taiping: TAIPING,
    ...CESSIONS,
    ...REGIONS,
};
const WARLORD = {
    source: 'CHGIS V6 1911 府级界线（按 LEV1 合并的省级近似环）+ 各省军政长官任期表；1925 年与日本参谋本部《支那分争地图》（大正十四年十一月十二日调）对照',
    method: '按该省军政长官（督军／督办／都统／省主席）的派系归属上色；六期快照（1916–31），不是逐年控制线，也不代表省内没有别的军队',
    precision: '省级（府级层合并、0.02° 简化）；用的是 1911 年府级界线，与 1916–28 年实际辖境有出入',
    confidence: '中低：控制多为名义，标「争夺中」的省有交战或双重政权',
};
export function provenanceFor(id) {
    if (TABLE[id])
        return TABLE[id];
    if (id.startsWith('cession:'))
        return CESSION_COMMON;
    if (id.startsWith('concession:'))
        return CONCESSION;
    if (id.startsWith('region:'))
        return REGION_DEFAULT;
    if (id.startsWith('sphere:'))
        return SPHERE;
    if (id.startsWith('sphereline:'))
        return SPHERE_LINE;
    if (id.startsWith('claim:'))
        return CLAIM_EXTRA;
    if (id.startsWith('geo:'))
        return GEO;
    if (id.startsWith('warlord:'))
        return WARLORD;
    return undefined;
}
