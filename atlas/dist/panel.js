import { label, spanOf } from './types.js';
import { numberBadge } from './numeric.js';
import { categoryStyle, swatchSvg } from './event-category.js';
import { resolveSources, sourceNote, sourceTitle } from './sources.js';
const TYPE_ZH = {
    event: '事件',
    person: '人物',
    organization: '组织',
    place: '地点',
    route: '路线',
    front: '战线',
    institution: '机构',
    technology: '技术',
    work: '作品',
    territory: '疆域',
    asset: '资源',
    instrument: '货币/票据',
    group: '群体',
    practice: '常态',
};
const RIGHTS = {
    'public-domain': '公有领域',
    cc: '知识共享许可',
    own: '本项目自制',
    permission: '已获授权',
    restricted: '受限使用',
    unknown: '版权不明',
};
const ASSET_ROLE = {
    image: '图片', audio: '音频', video: '视频', map: '地图', document: '文档',
};
const SECTOR = {
    education: '教育', medical: '医疗', press: '出版/报刊', industry: '工业',
    mining: '矿业', finance: '金融', charity: '慈善', utility: '公用事业', politics: '政务', other: '其他',
};
const MEDIUM = {
    film: '电影', novel: '小说', play: '话剧', poem: '诗', painting: '绘画',
    song: '歌曲', photo: '摄影', essay: '文章', other: '其他',
};
const INSTRUMENT = {
    currency: '货币', stock: '股票', bond: '债券', note: '票据', measure: '度量衡',
};
/** 人物关系网络：正向（我 → 对方）与反向（对方 → 我）两套叫法 */
const NET_OUT = {
    'custom:teacher_of': '学生', 'custom:student_of': '老师',
    subordinate_of: '上级', 'custom:superior_of': '部下',
    'custom:colleague_of': '同事', 'custom:spouse_of': '配偶',
    'custom:son_in_law_of': '岳父', 'custom:financier_of': '筹饷',
    'custom:child_of': '父亲', 'custom:sibling_of': '兄弟',
    allied_with: '同盟', rival_of: '对手',
};
const NET_IN = {
    'custom:teacher_of': '老师', 'custom:student_of': '学生',
    subordinate_of: '部下', 'custom:superior_of': '上级',
    'custom:colleague_of': '同事', 'custom:spouse_of': '配偶',
    'custom:son_in_law_of': '女婿', 'custom:financier_of': '筹饷者',
    'custom:child_of': '子女', 'custom:sibling_of': '兄弟',
    allied_with: '同盟', rival_of: '对手',
};
// 这张表以前漏了「岳父/女婿/筹饷」三种：它们有映射、却不在顺序表里，
// 面板 filter 一遍就整行消失（张佩纶的岳父李鸿章、胡雪岩的筹饷左宗棠都是这样丢的）。
const NET_ORDER = [
    '老师', '学生', '上级', '部下', '同事', '同盟', '对手', '配偶', '父亲', '子女',
    '兄弟', '岳父', '女婿', '筹饷', '筹饷者',
];
/** 机构/组织/事件 ↔ 人物：关系词 → 在对方卡片上的角色 */
const PEOPLE_ROLE = {
    participant: '参与者', founded: '创办者', founded_by: '创办者',
    member_of: '成员', studied_at: '校友', taught_at: '任教',
    commanded: '指挥', 'custom:president_of': '校长',
    'custom:director_of': '主持', 'custom:editor_of': '编辑',
    'custom:leader_of': '首领', 'custom:board_member_of': '董事',
    'custom:suppressed_by': '镇压',
};
const PEOPLE_ORDER = [
    '创办者', '校长', '主持', '首领', '董事', '任教', '校友', '成员', '参与者', '指挥', '编辑', '镇压',
];
/** 实地点位的类型词：归葬地 / 故居 / 纪念馆 / 博物馆 / 铜像 */
const VISIT_KIND = {
    grave: '归葬地', residence: '故居', memorial: '纪念馆', museum: '博物馆', statue: '铜像', site: '遗址', other: '其他',
};
/** 现状：原址留存 / 重建 / 迁建 / 已毁 */
const VISIT_STATUS = {
    extant: '原址留存', rebuilt: '重建', moved: '迁建', lost: '已毁',
};
/** 常态（practice）的类别词表是开放的，这里只把常用的译成中文 */
const PRACTICE_CAT = {
    gender: '性别', marriage: '婚姻', body: '身体', labor: '劳动', custom: '习俗',
};
/** 技术采用阶段 */
const STAGE = {
    introduced: '引入', trial: '试用', diffused: '普及',
};
/** 关系词的中文写法：面板里出现英文 `participant · 曾国藩` 很刺眼 */
const REL = {
    participant: '参与', located_at: '位于', part_of: '隶属', caused_by: '起因',
    succeeded_by: '继任', member_of: '成员', subordinate_of: '下属', allied_with: '同盟',
    rival_of: '对手', derived_from: '衍生自', merged_into: '并入', renamed_to: '改名',
    authored: '创作', commanded: '指挥', founded: '创办', founded_by: '创办者',
    introduced_at: '引入', impacted: '影响', aggravated_by: '加剧', predecessor_of: '前身是',
    successor_of: '后身是', replaces: '取代', replaced_by: '被取代', studied_at: '就读于',
    taught_at: '任教于', illustrated_by: '插图', soundtrack: '配乐',
    'custom:theme_song': '主题歌',
    'custom:editor_of': '编辑',
    'custom:president_of': '校长',
    'custom:son_in_law_of': '岳父',
    'custom:financier_of': '筹饷',
    'custom:child_of': '父亲',
    'custom:leader_of': '首领',
    'custom:board_member_of': '董事',
    'custom:suppressed_by': '镇压',
    // 2026-11-16：汤飞凡 → 中央防疫处 这条边在人物卡上漏译，显示成英文 director_of
    'custom:director_of': '主持',
};
const relName = (t) => REL[t] || t.replace(/^custom:/, '');
/** 剪贴板降级：老浏览器 / 非安全上下文里 clipboard API 不可用时，用临时 textarea */
function copyFallback(text, done) {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    try {
        document.execCommand('copy');
        done();
    }
    catch {
        /* 复制失败就保持原样，不弹窗打扰 */
    }
    document.body.removeChild(el);
}
export const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/**
 * 战役负载的 HTML（交战方 / 兵力 / 伤亡 / 结果）。
 * 抽成纯函数是为了能脱离 DOM 测：`test/battle-panel.test.mjs` 直接断言这段标记。
 */
export const battleHtml = (b) => {
    const sides = (b.sides || [])
        .map((s) => `<div class="battle-side"><b>${esc(label(s.name))}</b>${s.strength ? ` <span>${esc(label(s.strength))}</span>` : ''}</div>`)
        .join('');
    const rows = [sides];
    if (b.casualties)
        rows.push(`<div class="battle-row"><b>伤亡</b>${esc(label(b.casualties))}</div>`);
    rows.push(`<div class="battle-row"><b>结果</b>${esc(label(b.result))}</div>`);
    return `<div class="battle">${rows.join('')}</div>`;
};
/** 检索结果里的查询词高亮：只标第一处，够用且不会把整段刷满 */
function mark(text, query) {
    const safe = esc(text);
    if (!query)
        return safe;
    const needle = esc(query);
    const i = safe.toLowerCase().indexOf(needle.toLowerCase());
    if (i < 0)
        return safe;
    return `${safe.slice(0, i)}<mark>${safe.slice(i, i + needle.length)}</mark>${safe.slice(i + needle.length)}`;
}
/** 死亡区间：不写伪精度，能拆开就拆成「900 万–1300 万」 */
function fmtDeaths(h) {
    const d = h.deaths;
    if (!d)
        return '无统计';
    const fmt = (n) => n >= 10000 ? `${Math.round(n / 10000)} 万` : n.toLocaleString('zh-CN');
    return d.low === d.high ? fmt(d.low) : `${fmt(d.low)}–${fmt(d.high)}`;
}
export class Panel {
    head;
    body;
    byId;
    bySource;
    /** 气象年表：灾荒条目里补一句「该年全国报灾多少」 */
    climate;
    /** 点关系 chip 时跳到另一个实体（由主程序接到 openEntity） */
    navigate = () => { };
    hoverBody;
    panelEl;
    hoverEl;
    constructor(head, body, byId, bySource, hoverBody, climate) {
        this.head = head;
        this.body = body;
        this.byId = byId;
        this.bySource = bySource;
        this.climate = climate;
        this.hoverBody = hoverBody ?? null;
        this.panelEl = head.closest('section');
        this.hoverEl = hoverBody?.closest('section') ?? null;
    }
    setNavigateHandler(fn) {
        this.navigate = fn;
    }
    /**
     * 右侧栏只在一屏有内容时出现：两块都空就把 #side 整个藏掉。
     * 藏掉的栏 getBoundingClientRect() 宽 0，地图标签求解器就不会给看不见的栏让位。
     */
    syncSide() {
        const side = document.getElementById('side');
        if (!side)
            return;
        const panelOpen = !!this.panelEl && !this.panelEl.hidden;
        const hoverOpen = !!this.hoverEl && !this.hoverEl.hidden;
        side.hidden = !panelOpen && !hoverOpen;
        // 右上角的关闭按钮只在详情卡显示时出现
        const close = document.getElementById('panel-close');
        if (close)
            close.hidden = !panelOpen;
    }
    showPanel() {
        if (this.panelEl)
            this.panelEl.hidden = false;
        this.syncSide();
    }
    /** 清空上面的详情/列表栏并隐藏（右侧不再默认显示「当年条目」） */
    clear() {
        this.head.textContent = '';
        this.body.innerHTML = '';
        if (this.panelEl)
            this.panelEl.hidden = true;
        this.syncSide();
    }
    show(id, back) {
        const e = this.byId.get(id);
        if (!e)
            return;
        this.showPanel();
        const sp = spanOf(e);
        const span = sp ? (sp[0] === sp[1] ? `${Math.floor(sp[0])} 年` : `${Math.floor(sp[0])}–${Math.round(sp[1])} 年`) : '—';
        this.head.textContent = `${TYPE_ZH[e.type] || e.type} · ${label(e.labels)}`;
        const cat = e.type === 'event' ? categoryStyle(e.category) : null;
        const extra = [];
        // 「硬数字」几块（灾祸 / 条约 / 战役 / 口岸）单独一类：它们要紧跟摘要，
        // 不能埋到「可以去看看」下面——读者点开一条条约，先要看赔了多少、开了哪几口（§4.340）。
        const facts = [];
        const h = e.hazard;
        if (h) {
            const HAZARD = {
                earthquake: '地震', epidemic: '疫病', flood: '水灾', drought: '旱灾',
                famine: '饥荒', typhoon: '台风', fire: '火灾', other: '其它',
            };
            const y = Number(String(e.time?.start ?? e.time?.at ?? '').slice(0, 4));
            const c = this.climate?.get(y);
            if (c) {
                const parts = Object.entries(c.kinds)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([k, n]) => `${k} ${n}`)
                    .join(' · ');
                facts.push(`<div class="meta">该年全国报灾 ${c.n} 条${parts ? `（${parts}）` : ''} · 见时间轴下方灾荒条</div>`);
            }
            facts.push(`<div class="hazard">
        <b>${HAZARD[h.kind] || h.kind}</b>
        ${h.intensity ? `· ${h.intensity.value}${h.intensity.unit || ''}` : ''}
        · 死亡 ${fmtDeaths(h)}
        ${h.cause === 'human' ? '· 人祸' : h.cause === 'mixed' ? '· 天灾人祸交织' : ''}
        ${h.response ? `<p>${label(h.response)}</p>` : ''}
      </div>`);
        }
        // 不平等条约：割地、赔款、口岸、特权一次列清
        const t = e.treaty;
        if (t) {
            const rows = [];
            rows.push(`<div class="meta">${t.signed} 年 · ${t.place} · ${t.parties.join(' / ')}${t.war ? ` · ${t.war}` : ''}</div>`);
            if (t.ceded?.length) {
                rows.push(`<div class="treaty-row"><b>割让</b>${t.ceded.map((c) => `<span class="chip">${c}</span>`).join('')}</div>`);
            }
            if (t.indemnity) {
                rows.push(`<div class="treaty-row"><b>赔款</b>${t.indemnity.amount} ${t.indemnity.unit}</div>`);
            }
            if (t.ports?.length) {
                rows.push(`<div class="treaty-row"><b>口岸</b>${t.ports.map((p) => `<span class="chip">${p}</span>`).join('')}</div>`);
            }
            if (t.privileges?.length) {
                rows.push(`<div class="treaty-row"><b>条款</b>${t.privileges.map((p) => `<span class="chip">${p}</span>`).join('')}</div>`);
            }
            facts.push(`<div class="treaty">${rows.join('')}</div>`);
        }
        // 战役：交战方、兵力、伤亡、结果（战争部分，2026-11-17 起）
        if (e.battle)
            facts.push(battleHtml(e.battle));
        // 通商口岸：约开还是自开，依据哪一条约
        if (e.port) {
            const kind = e.port.kind === 'self' ? '自开商埠' : '约开商埠';
            facts.push(`<div class="meta">${e.port.open} 年 · ${kind}${e.port.treaty ? ` · ${e.port.treaty}` : ''}</div>`);
        }
        if (e.type === 'institution' && e.sector)
            extra.push(`<div class="meta">行业 · ${SECTOR[e.sector] || e.sector}</div>`);
        if (e.type === 'work' && e.medium)
            extra.push(`<div class="meta">形式 · ${MEDIUM[e.medium] || e.medium}</div>`);
        // 创办者 / 创作者 / 前身后身：这些是 schema 里的独立字段，不走 relations，也得显示
        const names = (ids) => (ids || [])
            .map((id) => this.byId.get(id))
            .filter((x) => !!x)
            .map((x) => label(x.labels));
        const creators = names(e.creators);
        if (creators.length)
            extra.push(`<div class="meta">创作 · ${creators.join('、')}</div>`);
        if (e.type === 'practice' && e.category) {
            extra.push(`<div class="meta">类别 · ${PRACTICE_CAT[e.category] || e.category}</div>`);
        }
        if (e.traits?.length)
            extra.push(`<div class="meta">特征 · ${e.traits.join('、')}</div>`);
        if (e.changes?.length) {
            const ch = names(e.changes);
            if (ch.length)
                extra.push(`<div class="meta">转折 · ${ch.join('、')}</div>`);
        }
        if (e.predecessor) {
            const t = this.byId.get(e.predecessor);
            extra.push(`<div class="meta">前身 · ${t ? label(t.labels) : e.predecessor}</div>`);
        }
        if (e.successor) {
            const t = this.byId.get(e.successor);
            extra.push(`<div class="meta">后身 · ${t ? label(t.labels) : e.successor}</div>`);
        }
        if (e.publisher) {
            const t = this.byId.get(e.publisher);
            extra.push(`<div class="meta">出品 · ${t ? label(t.labels) : e.publisher}</div>`);
        }
        if (e.type === 'asset') {
            extra.push(`<div class="meta">${ASSET_ROLE[e.role || ''] || e.role || '资源'} · ${RIGHTS[e.rights?.status || 'unknown'] || e.rights?.status}</div>`);
        }
        if (e.type === 'instrument' && e.kind)
            extra.push(`<div class="meta">种类 · ${INSTRUMENT[e.kind] || e.kind}</div>`);
        // 图片类资源直接画出来；版权与出处写在图注里，别藏着
        const assets = (e.type === 'asset' ? [e] : (e.relations || [])
            .filter((r) => r.type === 'illustrated_by' || r.type === 'soundtrack')
            .map((r) => this.byId.get(r.target))
            .filter((a) => !!a && a.type === 'asset'));
        const figures = assets
            .map((a) => {
            const isImage = a.role === 'image' || a.role === 'map' || a.role === 'document';
            const body = isImage
                ? `<img src="${a.src}" alt="${label(a.caption || a.labels)}" loading="lazy" />`
                : `<audio controls src="${a.src}"></audio>`;
            return `<figure class="asset">${body}
          <figcaption>${label(a.caption || a.labels)}
            <span class="rights">${RIGHTS[a.rights?.status || 'unknown'] || a.rights?.status}</span>
            ${a.provenance ? `<span class="prov">${label(a.provenance)}</span>` : ''}
          </figcaption></figure>`;
        })
            .join('');
        const rels = (e.relations || [])
            // 人物→人物放进「关系网络」，这里只留事件/机构等
            .filter((r) => {
            const t = this.byId.get(r.target);
            if (['event', 'institution', 'organization', 'group'].includes(e.type) && t?.type === 'person')
                return false;
            if (e.type !== 'person')
                return true;
            if (t?.type === 'person')
                return false; // 人物→人物交给关系网络
            if (r.type === 'participant' && t?.type === 'event')
                return false; // 参与事件也在网络里列
            return true;
        })
            .map((r) => {
            const t = this.byId.get(r.target);
            if (!t)
                return '';
            const kind = relName(r.type);
            // 关系词和角色名相同时（主题歌 · 主题歌）不要写成两遍
            const role = r.role && label(r.role) !== kind ? `（${label(r.role)}）` : '';
            // 关系可点：读者从一个知识点跳到相邻知识点，自己串线
            return `<button type="button" class="chip rel-link" data-id="${esc(t.id)}">${kind}${role} · ${esc(label(t.labels))}</button>`;
        })
            .join('');
        this.body.innerHTML = `
      <div class="detail">
        ${back ? `<button class="panel-back" type="button">← ${esc(back.label)}</button>` : ''}
        <h2>${label(e.labels)}</h2>
        <div class="meta">${cat ? `${swatchSvg(cat, 10)} ` : ''}${span}${cat ? ' · ' + cat.name : ''}${e.type === 'event' && e.category && !cat ? ' · ' + e.category : ''}</div>
        ${e.summary ? `<p>${label(e.summary)}</p>` : ''}
        ${facts.join('')}
        ${this.personPointsBlock(e)}
        ${this.visitsBlock(e)}
        ${extra.join('')}
        ${this.relatedPeopleBlock(e)}
        ${this.personNetworkBlock(e)}
        ${this.adoptionBlock(e)}
        ${this.metricsBlock(e)}
        ${figures}
        ${rels ? `<div>${rels}</div>` : ''}
        ${this.refsBlock(e)}
        <p class="meta">${e.id} · 点击地图空白处关闭 · <button type="button" class="feedback-link" data-id="${esc(e.id)}" data-label="${esc(label(e.labels))}">这一条有误？</button></p>
      </div>`;
        if (back)
            this.body.querySelector('.panel-back')?.addEventListener('click', back.onClick);
        this.body.querySelectorAll('.rel-link').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const id = btn.dataset.id;
                if (id)
                    this.navigate(id);
            });
        });
        // 纠错入口：只把条目抛出去，弹窗归 main.ts 管（面板不认识反馈模块）
        this.body.querySelectorAll('.feedback-link').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                window.dispatchEvent(new CustomEvent('fengyu:feedback', {
                    detail: { entityId: btn.dataset.id, entityLabel: btn.dataset.label },
                }));
            });
        });
        // 实地点位的「复制坐标 / 复制位置」：只写剪贴板，不打开任何地图外链
        this.body.querySelectorAll('.vp-copy').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const text = btn.dataset.copy || '';
                const what = btn.dataset.copyLabel || '';
                const done = () => {
                    const old = btn.textContent;
                    btn.textContent = '已复制';
                    btn.classList.add('is-copied');
                    window.setTimeout(() => {
                        btn.textContent = old;
                        btn.classList.remove('is-copied');
                    }, 1200);
                };
                if (!text)
                    return;
                if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(text).then(done).catch(() => copyFallback(text, done));
                }
                else {
                    copyFallback(text, done);
                }
                void what;
            });
        });
    }
    /** 一条出处的行内写法：书名（有 url 就成链接）+ 作者/年份/等级 */
    refItem(s, page, chapter) {
        const title = esc(sourceTitle(s));
        const body = s.url
            ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${title}</a>`
            : title;
        const note = sourceNote(s);
        // 纸质本记页码，电子本记章节：电子书的「位置号」不是书页，写了反而指错地方
        const pg = page ? `第 ${esc(page)} 页` : '';
        const ch = !page && chapter ? esc(chapter) : '';
        return `<span class="ref">${body}${pg ? `<span class="pg">${pg}</span>` : ''}${ch ? `<span class="pg">${ch}</span>` : ''}${note ? `<span class="k">${esc(note)}</span>` : ''}</span>`;
    }
    /** 详情面板底部的「参考」：每个知识点都有出处，这里把它们列出来 */
    /**
     * 机构/组织/事件页的「相关人物」：显式 founders + 正向 relations + 人物端的反向 relations。
     * 只做聚合，不新增第二份数据；一条边仍然只存人物那一端。
     */
    relatedPeopleBlock(e) {
        if (!['event', 'institution', 'organization', 'group'].includes(e.type))
            return '';
        const groups = new Map();
        const seen = new Set();
        const push = (role, p) => {
            const key = `${role}|${p.id}`;
            if (seen.has(key))
                return;
            seen.add(key);
            const list = groups.get(role) || [];
            list.push(p);
            groups.set(role, list);
        };
        for (const id of e.founders || []) {
            const p = this.byId.get(id);
            if (p?.type === 'person')
                push('创办者', p);
        }
        for (const r of e.relations || []) {
            const p = this.byId.get(r.target);
            if (p?.type !== 'person')
                continue;
            const role = PEOPLE_ROLE[r.type];
            if (role)
                push(role, p);
        }
        for (const p of this.byId.values()) {
            if (p.type !== 'person' || p.id === e.id)
                continue;
            for (const r of p.relations || []) {
                if (r.target !== e.id)
                    continue;
                const role = PEOPLE_ROLE[r.type];
                if (role)
                    push(role, p);
            }
        }
        const rows = PEOPLE_ORDER.filter((role) => groups.has(role)).map((role) => {
            const list = groups.get(role);
            const shown = list.slice(0, 20);
            const btns = shown
                .map((p) => `<button type="button" class="chip rel-link" data-id="${esc(p.id)}">${esc(label(p.labels))}</button>`)
                .join('');
            return `<div class="net-row"><span class="net-kind">${role}</span>${btns}${list.length > shown.length ? `<span class="net-more">等 ${list.length} 人</span>` : ''}</div>`;
        });
        if (!rows.length)
            return '';
        return `<div class="network"><b class="block-title">相关人物</b>${rows.join('')}</div>`;
    }
    /**
     * 人物关系网络：师承 / 上下级 / 同事 / 配偶，以及「共同参与过什么事件」。
     * 显式关系只写一个方向，反向在这里推；共同事件从 event 的 participant 实时算，
     * 不落第二份数据。
     */
    personNetworkBlock(e) {
        if (e.type !== 'person')
            return '';
        const seen = new Set();
        const groups = new Map();
        const notes = new Map();
        /** 关系边自己带的「凭什么」：优先用 note，其次用关系级出处 */
        const hintOf = (r) => {
            const note = r.note?.['zh-Hans'];
            if (note)
                return note;
            const titles = (r.source || [])
                .map((ref) => {
                const src = this.byId.get(ref);
                return src && src.type === 'source' ? sourceTitle(src) : '';
            })
                .filter(Boolean);
            return titles.length ? `据${titles.join('、')}` : '';
        };
        const push = (kind, other, hint = '') => {
            const key = `${kind}|${other.id}`;
            if (seen.has(key))
                return;
            seen.add(key);
            const list = groups.get(kind) || [];
            list.push(other);
            groups.set(kind, list);
            if (hint)
                notes.set(key, hint);
        };
        for (const r of e.relations || []) {
            const t = this.byId.get(r.target);
            if (!t || t.type !== 'person')
                continue;
            const kind = NET_OUT[r.type];
            if (kind)
                push(kind, t, hintOf(r));
        }
        for (const other of this.byId.values()) {
            if (other.type !== 'person' || other.id === e.id)
                continue;
            for (const r of other.relations || []) {
                if (r.target !== e.id)
                    continue;
                const kind = NET_IN[r.type];
                if (kind)
                    push(kind, other, hintOf(r));
            }
        }
        // 共同参与的事件：event --participant--> person
        const myEvents = [];
        for (const ent of this.byId.values()) {
            if (ent.type !== 'event')
                continue;
            if ((ent.relations || []).some((r) => r.type === 'participant' && r.target === e.id))
                myEvents.push(ent);
        }
        const co = new Map();
        for (const ev of myEvents) {
            for (const r of ev.relations || []) {
                if (r.type !== 'participant')
                    continue;
                const p = this.byId.get(r.target);
                if (!p || p.type !== 'person' || p.id === e.id)
                    continue;
                const list = co.get(p.id) || [];
                list.push(ev);
                co.set(p.id, list);
            }
        }
        const coTop = [...co.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
        const btn = (t, suffix = '', title = '') => `<button type="button" class="chip rel-link" data-id="${esc(t.id)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label(t.labels))}${suffix ? `<span class="net-count">${suffix}</span>` : ''}</button>`;
        const rows = NET_ORDER.filter((k) => groups.has(k)).map((k) => {
            const list = groups.get(k);
            // 同类太多时只露前 10 个，剩下的给个数
            const shown = list.slice(0, 10);
            return `<div class="net-row"><span class="net-kind">${k}</span>${shown
                .map((x) => btn(x, '', notes.get(`${k}|${x.id}`) || ''))
                .join('')}${list.length > shown.length ? `<span class="net-more">等 ${list.length} 人</span>` : ''}</div>`;
        });
        if (myEvents.length) {
            // 事件本身也列出来（最多 5 条），点进去就是那件事；比只给「N 件」更能挖
            const evBtn = (ent) => {
                const t = label(ent.labels);
                const y = spanOf(ent)?.[0];
                const year = Number.isFinite(y) ? String(Math.floor(y)) : '';
                // 一行一件、写全标题：从人物找事件时，标题本身就是要找的东西，截断反而难认
                return `<button type="button" class="net-event rel-link" data-id="${esc(ent.id)}" title="${esc(t)}">` +
                    `<span class="net-year">${year}</span><span>${esc(t)}</span></button>`;
            };
            const sorted = [...myEvents].sort((a, b) => (spanOf(a)?.[0] || 0) - (spanOf(b)?.[0] || 0));
            // 全部列出：从人物找事件是读者最常用的路径之一，不截断
            rows.push(`<div class="net-row"><span class="net-kind">参与事件</span><span class="net-more">${sorted.length} 件</span></div>` +
                `<div class="net-events">${sorted.map(evBtn).join('')}</div>`);
        }
        if (coTop.length) {
            rows.push(`<div class="net-row"><span class="net-kind">同场</span>${coTop
                .map(([id, evs]) => {
                const p = this.byId.get(id);
                return p ? btn(p, ` · ${evs.length}`, evs.map((x) => label(x.labels)).join('、')) : '';
            })
                .join('')}</div>`);
        }
        if (!rows.length)
            return '';
        return `<div class="network"><b class="block-title">关系网络</b>${rows.join('')}</div>`;
    }
    /**
     * 「可以去看看」：人物的归葬地/故居，也可以是事件、机构的遗址与纪念馆
     * （马尾船政、刘公岛提督署、大沽口炮台、虎门销烟池、武昌红楼）。
     *
     * 2026-11-16 起有：不上图，只在资料页列出——地图画的是 1840–1949 的历史空间，
     * 现代门牌与墓园位置混进去会互相打架。这里给地址（细到能导航）、一句现状说明，
     * 以及「原墓/迁建/重建」这类最容易踩坑的现状标注。
     */
    visitsBlock(e) {
        const list = e.visits || [];
        if (!list.length)
            return '';
        const rows = list
            .map((v) => {
            const kind = VISIT_KIND[v.kind] || v.kind;
            const status = v.status && v.status !== 'extant' ? `<span class="vp-status">${VISIT_STATUS[v.status] || v.status}</span>` : '';
            const since = v.since ? `<span class="vp-since">${esc(v.since)} 年起</span>` : '';
            const addr = v.address ? `<div class="vp-addr">${esc(label(v.address))}</div>` : '';
            const note = v.note ? `<div class="vp-note">${esc(label(v.note))}</div>` : '';
            // 只给「复制位置」：坐标不提供——中国地图有 GCJ-02 偏移，直接给 WGS-84 坐标会把人导偏
            const placeText = [label(v.name), v.address ? label(v.address) : ''].filter(Boolean).join(' · ');
            const copyPlace = placeText
                ? `<button type="button" class="vp-copy" data-copy-label="位置" data-copy="${esc(placeText)}">复制位置</button>`
                : '';
            const srcs = (v.sources || [])
                .map((s) => {
                const src = this.bySource.get(s.ref);
                if (!src)
                    return '';
                const t = esc(sourceTitle(src));
                const body = src.url
                    ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${t}</a>`
                    : t;
                return `<span class="ref">${body}</span>`;
            })
                .join('');
            return `<div class="vp-row">
          <div class="vp-head"><span class="chip">${kind}</span><b>${esc(label(v.name))}</b>${status}${since}</div>
          ${addr}${note}${copyPlace ? `<div class="vp-acts">${copyPlace}</div>` : ''}${srcs ? `<div class="vp-src">${srcs}</div>` : ''}
        </div>`;
        })
            .join('');
        return `<div class="visits"><b class="block-title">可以去看看</b>${rows}</div>`;
    }
    /**
     * 人物的点位口径：实心点是籍贯/出生地，空心点是他这一年的活动地。
     * 只列有活动地的人物；没有的保持原来的「一个点」。
     */
    personPointsBlock(e) {
        if (e.type !== 'person')
            return '';
        const pts = e.space?.points || [];
        const acts = pts.filter((p) => p.role === 'activity');
        if (!acts.length)
            return '';
        const prim = pts.filter((p) => p.role !== 'activity');
        const yearOf = (s) => String(s || '').slice(0, 4);
        const span = (p) => {
            const t = p.time;
            if (!t)
                return '';
            const a = yearOf(t.at ?? t.start);
            const b = t.at ? '' : yearOf(t.end);
            return b && b !== a ? `${a}–${b}` : a;
        };
        const name = (p) => esc(label(p.name));
        return `<div class="person-points">
      <div class="meta">地图点 · 实心＝籍贯/出生地，空心＝活动地（只在对应年份显示）</div>
      ${prim.length ? `<div class="meta">籍贯/出生地 · ${prim.map(name).join('、')}</div>` : ''}
      <div class="meta">活动地 · ${acts.map((p) => `${name(p)} ${span(p)}`).join('；')}</div>
    </div>`;
    }
    /**
     * 技术采用阶段：哪个城市、哪一年、走到哪一步。
     * 只做「引入 / 试用 / 普及」三档，不做曲线——阶段是定性，曲线交给指标。
     */
    adoptionBlock(e) {
        const rows = (e.adoption || [])
            .slice()
            .sort((a, b) => a.year - b.year)
            .map((a) => {
            const place = this.byId.get(a.place);
            const name = place ? label(place.labels) : a.place.replace(/^place\./, '');
            const note = a.note ? `<span class="adopt-note">${esc(label(a.note))}</span>` : '';
            return `<div class="adopt-row"><span class="chip">${STAGE[a.stage] || a.stage}</span>
          <b>${esc(name)}</b> <span class="adopt-year">${a.year}</span>${note}</div>`;
        })
            .join('');
        return rows ? `<div class="adoption"><b class="block-title">采用</b>${rows}</div>` : '';
    }
    /**
     * 指标：一条折线 + 首末/峰值。数值不写单位换算，单位照数据原样。
     * 宽度用 viewBox 自适应，详情卡 300px 里刚好；单点只画一个点，不假装有趋势。
     */
    metricsBlock(e) {
        const series = (e.metrics || []).filter((m) => m.points?.length);
        if (!series.length)
            return '';
        const fmt = (n) => (Math.abs(n) >= 10000 ? n.toLocaleString('zh-CN') : String(n));
        const blocks = series
            .map((m) => {
            const pts = [...m.points].sort((a, b) => a.year - b.year);
            const W = 252;
            const H = 54;
            const padL = 4;
            const padR = 4;
            const padT = 6;
            const padB = 16;
            const x0 = pts[0].year;
            const x1 = pts[pts.length - 1].year;
            const vmax = Math.max(...pts.map((p) => p.value), 0);
            const X = (year) => padL + (x1 === x0 ? (W - padL - padR) / 2 : ((year - x0) / (x1 - x0)) * (W - padL - padR));
            const Y = (value) => H - padB - (vmax ? (value / vmax) * (H - padT - padB) : 0);
            const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.year).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
            const dots = pts
                .map((p) => `<circle class="dot" cx="${X(p.year).toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="2.2"><title>${p.year} 年 · ${fmt(p.value)} ${esc(m.unit || '')}</title></circle>`)
                .join('');
            const peak = pts.reduce((a, b) => (b.value > a.value ? b : a), pts[0]);
            // 只有一个点时不画折线：没有趋势可看，只报「哪一年、多少」
            if (pts.length === 1) {
                return `<div class="metric single">
            <div class="metric-head"><span>${esc(label(m.name))}</span>
              <span class="metric-value">${fmt(pts[0].value)} <i>${esc(m.unit || '')}</i></span></div>
            <div class="metric-foot">${pts[0].year} 年</div>
          </div>`;
            }
            const foot = `${x0} ${fmt(pts[0].value)} → ${x1} ${fmt(pts[pts.length - 1].value)} · 峰 ${fmt(peak.value)}（${peak.year}）`;
            return `<div class="metric">
          <div class="metric-head"><span>${esc(label(m.name))}</span><span class="metric-unit">${esc(m.unit || '')}</span></div>
          <svg class="metric-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label(m.name))}">
            <line class="base" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" />
            ${pts.length > 1 ? `<path class="line" d="${line}" />` : ''}${dots}
            <text class="axis" x="${padL}" y="${H - 3}">${x0}</text>
            <text class="axis" x="${W - padR}" y="${H - 3}" text-anchor="end">${x1}</text>
          </svg>
          <div class="metric-foot">${foot}</div>
        </div>`;
        })
            .join('');
        return `<div class="metrics"><b class="block-title">指标</b>${blocks}</div>`;
    }
    refsBlock(e) {
        const list = resolveSources(e.sources, this.bySource);
        if (!list.length)
            return '';
        // 出处可以细到书页（SourceRef.page）：条约、灾荒这类重点来源指到页，读者能回书核
        const pages = new Map();
        const chapters = new Map();
        for (const r of e.sources || []) {
            if (r.page)
                pages.set(r.ref, r.page);
            if (r.chapter)
                chapters.set(r.ref, r.chapter);
        }
        return `<div class="refs"><b>参考</b>${list
            .map((s) => this.refItem(s, pages.get(s.id), chapters.get(s.id)))
            .join('')}</div>`;
    }
    /** 检索结果：显示命中字段与类型，标出查询词 */
    showResults(hits, title, onPick, selected = 0, query = '') {
        this.showPanel();
        this.head.textContent = title;
        if (!hits.length) {
            this.body.innerHTML = '<p class="empty">没有匹配的条目。换个词，或把筛选改成「全部」。</p>';
            return;
        }
        const items = hits
            .slice(0, 80)
            .map((h, i) => {
            const e = h.entity;
            const sp = spanOf(e);
            const y = sp ? Math.floor(sp[0]) : '';
            const icon = e.type === 'event'
                ? `<span class="ico">${swatchSvg(categoryStyle(e.category), 9)}</span>`
                : '<span class="ico dot"></span>';
            const typeName = h.field === 'alias'
                ? '别名'
                : h.field === 'summary'
                    ? '摘要'
                    : h.field === 'body'
                        ? h.where || '正文'
                        : TYPE_ZH[e.type] || e.type;
            // 摘要/正文命中时给一行上下文，否则只看到标题不知道命中了什么
            const snip = h.field === 'summary' || h.field === 'body'
                ? `<span class="snip">${mark(h.text, query)}</span>`
                : '';
            return `<li data-id="${e.id}" class="${i === selected ? 'sel' : ''}">${icon}<span class="y">${y}</span>${label(e.labels)}${badgeHtml(e)}<span class="tag">${typeName}</span>${snip}</li>`;
        })
            .join('');
        this.body.innerHTML = `<ul class="event-list result-list">${items}</ul>`;
        this.body.querySelectorAll('li').forEach((li) => {
            li.addEventListener('click', () => onPick(li.dataset.id));
        });
    }
    /** 专题：导读问题 + 章节 + 成员（按叙事顺序） */
    showTheme(t, byId, onPick) {
        this.showPanel();
        this.head.textContent = `专题 · ${label(t.labels)}`;
        const note = t.memberNote || {};
        const member = (id) => {
            const e = byId.get(id);
            if (!e)
                return '';
            const sp = spanOf(e);
            const y = sp ? Math.floor(sp[0]) : '';
            const icon = e.type === 'event'
                ? `<span class="ico">${swatchSvg(categoryStyle(e.category), 9)}</span>`
                : '<span class="ico dot"></span>';
            const n = note[id] ? `<span class="note">${label(note[id])}</span>` : '';
            return `<li data-id="${id}"><span class="y">${y}</span>${icon}${label(e.labels)}${n}</li>`;
        };
        const sections = t.sections && t.sections.length
            ? t.sections
            : [{ title: undefined, members: t.members || [] }];
        this.body.innerHTML = `
      <div class="theme">
        ${t.question ? `<p class="question">${label(t.question)}</p>` : ''}
        ${t.summary ? `<p class="meta">${label(t.summary)}</p>` : ''}
        ${sections
            .map((sec) => `<div class="theme-sec">${sec.title ? `<h3>${label(sec.title)}</h3>` : ''}<ul class="event-list">${sec.members.map(member).join('')}</ul></div>`)
            .join('')}
      </div>`;
        this.body.querySelectorAll('li').forEach((li) => {
            li.addEventListener('click', () => onPick(li.dataset.id));
        });
    }
    /** 悬停详情：鼠标停在哪就显示哪；没有内容就整块收起，不留空占位 */
    showHover(t) {
        const el = this.hoverBody;
        if (!el)
            return;
        if (!t) {
            el.className = 'empty';
            el.innerHTML = '';
            if (this.hoverEl)
                this.hoverEl.hidden = true;
            this.syncSide();
            return;
        }
        if (this.hoverEl)
            this.hoverEl.hidden = false;
        this.syncSide();
        let title = t.title || '';
        let kind = t.kind || '';
        let meta = t.meta || '';
        let summary = t.summary || '';
        if (t.id) {
            const e = this.byId.get(t.id);
            if (e) {
                title = label(e.labels);
                kind = TYPE_ZH[e.type] || e.type;
                const sp = spanOf(e);
                meta = sp ? (sp[0] === sp[1] ? `${Math.floor(sp[0])} 年` : `${Math.floor(sp[0])}–${Math.round(sp[1])} 年`) : '';
                summary = label(e.summary) || '';
            }
        }
        el.className = '';
        el.innerHTML = `
      <div class="hover-title">${title}</div>
      <div class="hover-kind">${kind}${meta ? ' · ' + meta : ''}${t.id && this.byId.get(t.id) ? badgeHtml(this.byId.get(t.id)) : ''}</div>
      ${summary ? `<p class="hover-sum">${summary}</p>` : ''}
      <div class="hover-hint">点击展开详情</div>`;
    }
    /** 图层/边界线的附注：数据源、组成方式、精度、可信度、分段（悬停与详情卡共用） */
    provBlock(p) {
        if (!p)
            return '';
        return `<div class="hover-notes">
      <div class="hover-notes-h">附注 · 数据源与精度</div>
      <div class="hn-row"><b>数据源</b><span>${esc(p.source)}</span></div>
      ${p.method ? `<div class="hn-row"><b>组成方式</b><span>${esc(p.method)}</span></div>` : ''}
      ${p.precision ? `<div class="hn-row"><b>精度</b><span>${esc(p.precision)}</span></div>` : ''}
      ${p.confidence ? `<div class="hn-row"><b>可信度</b><span>${esc(p.confidence)}</span></div>` : ''}
      ${(p.segments || [])
            .map((s) => `<div class="hover-seg"><span class="part">${esc(s.part)}</span><span class="src">${esc(s.source)}</span>${s.precision ? `<span class="meta">${esc(s.precision)}</span>` : ''}${s.confidence ? `<span class="meta">${esc(s.confidence)}</span>` : ''}</div>`)
            .join('')}
    </div>`;
    }
    /**
     * 非实体要素（国境线、割让面、势力范围、太平天国控制区、地理注记…）的详情卡。
     * 这些东西以前只有悬停卡，点下去什么也没有；现在点开就是这张。
     */
    showTarget(t) {
        this.showPanel();
        this.head.textContent = t.kind || '地图要素';
        this.body.innerHTML = `
      <div class="detail">
        <h2>${esc(t.title || '')}</h2>
        <div class="meta">${esc(t.kind || '')}${t.meta ? ' · ' + esc(t.meta) : ''}</div>
        ${t.summary ? `<p>${esc(t.summary)}</p>` : ''}
        ${this.provBlock(t.provenance)}
        <p class="meta">${esc(t.id || '')} · 点击地图空白处关闭</p>
      </div>`;
    }
    /**
     * 某年某省的报灾清单（从《中国三千年气象记录总集》OCR 抽出来的明细）。
     * 只做索引：县名 + 灾种 + 原文截断 + 书页；引用前要回原书核对。
     */
    showRecords(title, rows, sub, onPickCounty) {
        this.showPanel();
        this.head.textContent = title;
        const items = rows
            .map((r) => `<li${onPickCounty ? ` class="link" data-c="${esc(r.c)}"` : ''}><b>${esc(r.c)}</b>${r.k
            .map((k) => `<span class="chip">${esc(k)}</span>`)
            .join('')}
        <div class="rc-text">${esc(r.t)}</div>
        <span class="rc-page">第 ${r.g} 页</span></li>`)
            .join('');
        this.body.innerHTML = `<div class="records">
      <div class="meta">${esc(sub)}</div>
      <ul class="record-list">${items || '<li>本年这一省没有记录</li>'}</ul>
      <p class="meta">OCR 抽取，字准约 85–90%，引用前请核对原书页。${onPickCounty ? '点县名看该县历年记录。' : ''}</p>
    </div>`;
        if (onPickCounty) {
            this.body.querySelectorAll('li[data-c]').forEach((li) => {
                li.addEventListener('click', () => onPickCounty(li.dataset.c));
            });
        }
    }
    /**
     * 一个县 1840–1911 的全部报灾记录（地图上点县点进来）。
     * 这是「地方史」的入口：不是某一年的一条，而是这个县七十年的灾情序列。
     */
    showCounty(name, info, onYear) {
        this.showPanel();
        this.head.textContent = name;
        const HAZ = ['旱', '水', '蝗', '饥', '风', '雪', '疫', '雹', '霜', '震'];
        const kindChips = HAZ.filter((k) => info.kinds[k])
            .map((k) => `<span class="chip">${k} ${info.kinds[k]}</span>`)
            .join('');
        const peak = info.years.reduce((a, b) => (b[1] > a[1] ? b : a), info.years[0] || [0, 0]);
        const first = info.years[0]?.[0];
        const last = info.years[info.years.length - 1]?.[0];
        const items = info.recs
            .map(([y, ks, t, g]) => `<li>${onYear ? `<button class="cc-year" data-y="${y}">${y}</button>` : `<b>${y}</b>`}${ks.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}
        <div class="rc-text">${esc(t)}</div>
        <span class="rc-page">第 ${g} 页</span></li>`)
            .join('');
        this.body.innerHTML = `<div class="records county">
      <div class="meta">${esc(info.p || '省份不明')} · ${first}–${last} 年共 ${info.n} 条${peak[0] ? ` · 最多 ${peak[0]} 年（${peak[1]} 条）` : ''}</div>
      <div class="cc-kinds">${kindChips}</div>
      <ul class="record-list">${items}</ul>
      <p class="meta">《中国三千年气象记录总集》第四册 OCR 抽取，字准约 85–90%；这里只作索引，引用前请核对原书页。${onYear ? '点年份跳到那一年。' : ''}</p>
    </div>`;
        if (onYear) {
            this.body.querySelectorAll('.cc-year').forEach((btn) => {
                btn.addEventListener('click', () => onYear(Number(btn.dataset.y)));
            });
        }
    }
    /** 检索结果里的键盘选中项 */
    highlight(index) {
        const items = this.body.querySelectorAll('.result-list li');
        items.forEach((li, i) => li.classList.toggle('sel', i === index));
        const el = items[index];
        el?.scrollIntoView({ block: 'nearest' });
    }
    /** 当年条目列表。2026-11-09 起右侧不再默认显示它（待换内容形式），保留给以后复用。 */
    showList(list, title, onPick) {
        this.showPanel();
        this.head.textContent = title;
        const items = list
            .slice(0, 80)
            .map((e) => {
            const sp = spanOf(e);
            const y = sp ? Math.floor(sp[0]) : '';
            const icon = e.type === 'event' ? `<span class="ico">${swatchSvg(categoryStyle(e.category), 9)}</span>` : '';
            return `<li data-id="${e.id}"><span class="y">${y}</span>${icon}${label(e.labels)}</li>`;
        })
            .join('');
        this.body.innerHTML = `<ul class="event-list">${items}</ul>`;
        this.body.querySelectorAll('li').forEach((li) => {
            li.addEventListener('click', () => onPick(li.dataset.id));
        });
    }
}
/**
 * 「这一条带的数」的小标标记（§4.344）：检索结果行与悬停卡共用。
 * 抽成纯函数是为了能脱离 DOM 测（`test/numeric.test.mjs`）。
 */
export const badgeHtml = (e) => {
    const b = numberBadge(e);
    return b ? `<span class="num-badge">${esc(b.text)}</span>` : '';
};
