import { loadDataset } from './data.js';
import { MapView, ringsFromGeoJson } from './map.js';
import { Timeline } from './timeline.js';
import { Panel, esc } from './panel.js';
import { Reader } from './reader.js';
import { label, spanOf } from './types.js';
import { CATEGORY_ORDER, EVENT_CATEGORY, swatchSvg } from './event-category.js';
import { filterByEra, parseFilter, searchEntities, suggestSimilar } from './search.js';
import { RECENT_KEY, parseRecent, pushRecent, serializeRecent } from './recent.js';
import { applyDetail, applyYearLayers, ensureYearLayers, fetchDetailLayers, fetchYearLayers, GEO_LAYERS, layersAt, loadColonies, loadGeo, } from './geo-layers.js';
import { MapOverlay } from './overlay.js';
import { YEAR_FROM, YEAR_TO, yearStep } from './year-nav.js';
import { groupThemes } from './theme-groups.js';
import { FeedbackForm } from './feedback.js';
async function boot() {
    /** 启动阶段写进 <html data-stage>：首屏探针（tools/perf-probe.mjs）按这些点量时间 */
    const markStage = (name) => {
        document.documentElement.dataset.stage = name;
        // 同时记一条 Performance 标记：探针读它拿精确时间，不必靠轮询撞大运（§4.335）
        if (typeof performance !== 'undefined' && performance.mark)
            performance.mark('fengyu:' + name);
    };
    markStage('boot');
    /** 首屏进度条：走过去由 CSS 动画负责，这里只管「到了就补满、淡出」（见 index.html/.loadbar） */
    const loadbar = document.getElementById('loadbar');
    const finishLoadbar = () => {
        if (!loadbar || loadbar.classList.contains('done'))
            return;
        loadbar.classList.add('done');
        setTimeout(() => loadbar.classList.add('hide'), 240);
    };
    // 兜底：脚本中途出错（或某个请求永远不回）时，别让那条线一直挂在顶上
    setTimeout(finishLoadbar, 20000);
    // 三样东西互不依赖，全部在同一个 tick 里发出去；**发出去的顺序就是优先级**：
    // 底图轮廓（100 KB）→ 内容（首屏要点得动它）→ 疆域快照 → 辅助图层。
    // 原来是一路 await 下去，每个文件一次往返；而本地 dev 服务器是 HTTP/1.1（每域 6 条连接），
    // 后发的请求会排在 19 份图层后面——线上走 HTTP/2 虽然能多路复用，但这个顺序也是对的（§4.335）。
    const basePromise = fetch('public/china.geojson').then((r) => r.json());
    const baseDocPromise = fetch('public/geo/base-1840.json').then((r) => r.json());
    const dataPromise = loadDataset();
    // 起始年份（`?year=1930` 截图/比对用）：要在取「按年图层」之前定下来，
    // 免得先按 1840 取一份、再为 1930 补一份（§4.337）
    let startYear = YEAR_FROM;
    {
        const y = Number(new URLSearchParams(location.search).get('year'));
        if (Number.isFinite(y) && y > 0)
            startYear = Math.max(YEAR_FROM, Math.min(YEAR_TO, Math.round(y)));
    }
    const territoriesPromise = fetch('public/territories.json').then((r) => r.json());
    // 辅助图层最后到也没关系：实体先画，图层到了再叠上去
    const geoPromise = loadGeo().catch(() => null);
    // 按年份才需要的图层（当年那份主张线、割让面、太平天国）也一起发出去（§4.337）
    const yearLayersPromise = fetchYearLayers(startYear);
    const data = await dataPromise;
    markStage('data');
    const map = new MapView(document.getElementById('map'));
    const base = await basePromise;
    map.setBase(ringsFromGeoJson(base));
    const baseDoc = (await baseDocPromise);
    map.setTerritoryBase(baseDoc.rings, { note: baseDoc.note, tiers: baseDoc.tiers });
    // 实体不等辅助图层：2,091 条点先画出来，读者这时已经能点、能搜
    map.setEntities(data.entities);
    markStage('entities');
    // ?lon=&lat=&span=：把视图定到某处（比对/截图用）。要在决定「取不取细节层」之前定，
    // 否则世界视野的深链也会把 1.1 MB 的东亚细节层拉下来（§4.337）
    {
        const q = new URLSearchParams(location.search);
        const lon = Number(q.get('lon'));
        const lat = Number(q.get('lat'));
        const span = Number(q.get('span'));
        if (Number.isFinite(lon) && Number.isFinite(lat) && span > 0)
            map.setView(lon, lat, span);
    }
    /** 按窗口裁：视野里看不到东亚就不取 10m 细节层（世界视野深链省 1.1 MB） */
    let geoData = null;
    const detailPromise = map.wantsDetail() ? fetchDetailLayers() : null;
    // 疆域快照只在没有 1840 基线时才兜底，所以永远最后叠
    void territoriesPromise
        .then((terr) => map.setTerritories(terr))
        .catch(() => { });
    // 势力范围图例：只列这一年实际存在的列强
    const powerKey = document.getElementById('power-key');
    const warlordKey = document.getElementById('warlord-key');
    const warKey = document.getElementById('war-key');
    const renderPowerKey = (y) => {
        powerKey.innerHTML = '';
        warlordKey.hidden = true;
        warlordKey.innerHTML = '';
        warKey.hidden = true;
        warKey.innerHTML = '';
        // 1940 抗战态势：与军阀图例不会同年出现，直接放同一位置
        const war = geoData?.war;
        if (war && y >= 1937 && y < 1946 && layerState['war']) {
            warKey.innerHTML =
                `<b>1937–1945 抗战态势</b>` +
                    `<span class="pk"><i style="background:#8a3a2a;border-radius:50%"></i>日军占领城市</span>` +
                    `<span class="pk"><i style="background:#8a3a2a"></i>日军控制铁路</span>` +
                    `<span class="pk"><i style="background:#7a4a3a"></i>伪政权名义辖区</span>` +
                    `<span class="pk"><i style="background:#4a6b3f"></i>抗日根据地</span>` +
                    `<span class="pk-note">城市/铁路为占领点线；伪政权辖区是名义范围；根据地是示意面。</span>`;
            warKey.hidden = false;
        }
        // 军阀势力图例：只在 1916–1928、图层开着时显示；一期一组色块
        const zones = geoData?.warlordZones;
        if (!zones || y < 1911 || y >= 1938)
            return;
        if (!layerState['warlords'])
            return;
        const period = zones.periods.find((p) => y >= p.from && y < p.to);
        if (!period)
            return;
        const used = new Set();
        for (const prov of zones.provinces) {
            const z = prov.periods[period.id];
            if (z)
                used.add(z.bloc);
        }
        const chips = [...used]
            .filter((b) => zones.blocs[b])
            .map((b) => `<span class="pk"><i style="background:${zones.blocs[b].color}"></i>${esc(zones.blocs[b].zh)}</span>`)
            .join('');
        const html = `<b>${esc(period.label)}</b>${chips}<span class="pk-note">省级近似，斜线=争夺；川边（西康）与西藏噶厦在金沙江以西交错</span>`;
        powerKey.innerHTML = html;
        warlordKey.innerHTML = html;
        warlordKey.hidden = false;
    };
    const panel = new Panel(document.getElementById('panel-head'), document.getElementById('panel-body'), data.byId, data.sources, document.getElementById('hover-body'), data.climate);
    // 专题读页：整块浮层，点条目进详情，返回时回到读页
    const reader = new Reader(document.getElementById('reader'), data.byId, (id, from) => {
        const e = data.byId.get(id);
        if (e)
            openEntity(e, from || undefined);
    });
    // 卡片是否被「固定」：点一下就固定，点地图空白处取消（见下面的 pick / unpin）
    let pinned = false;
    /** 现在右栏开着的是哪一个县的报灾页；换年时别把它清掉（县级页要能点年份逐年看） */
    let countyPage = null;
    // 详情卡开着时，鼠标扫过点或线只在鼠标旁点个小标签（只写标题），免得遮住正在读的卡片
    const tag = document.getElementById('cursor-tag');
    const stage = document.getElementById('stage');
    const hideTag = () => {
        tag.hidden = true;
    };
    const showTag = (text, x, y) => {
        if (!text)
            return hideTag();
        tag.textContent = text;
        tag.hidden = false;
        const w = tag.offsetWidth;
        const h = tag.offsetHeight;
        // 右侧有详情栏时，可用宽度要减掉它，免得小标签钻到卡片底下
        const side = document.getElementById('side');
        const sideW = side && !side.hidden ? side.getBoundingClientRect().width + 14 : 0;
        const limitX = stage.clientWidth - sideW - 8;
        let left = x + 16;
        let top = y + 14;
        // 贴到右/下沿就翻到鼠标另一侧
        if (left + w > limitX)
            left = Math.max(4, x - w - 12);
        if (top + h > stage.clientHeight - 8)
            top = Math.max(4, y - h - 10);
        tag.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    map.setHoverHandler((t, pos) => {
        if (!pinned) {
            hideTag();
            panel.showHover(t);
            return;
        }
        if (!t || !pos)
            return hideTag();
        const e = t.id ? data.byId.get(t.id) : undefined;
        showTag(t.title || (e ? label(e.labels) : ''), pos.x, pos.y);
    });
    let year = YEAR_FROM;
    const timeline = new Timeline(document.getElementById('timeline-canvas'), data.entities, {
        from: YEAR_FROM,
        to: YEAR_TO,
        year,
        climate: data.climate,
        onChange: (y) => {
            year = y;
            syncYear();
        },
    });
    // 底部时间轴：平时只露主条，鼠标移上去临时展开；按钮可钉住（触屏/键盘用）
    const timelineEl = document.getElementById('timeline');
    const timelineToggle = document.getElementById('timeline-toggle');
    let timelineHover = false;
    let timelinePinned = false;
    const syncTimelineOpen = () => {
        const open = timelineHover || timelinePinned;
        timelineEl.classList.toggle('expanded', open);
        timelineToggle.setAttribute('aria-expanded', String(open));
        timelineToggle.textContent = timelinePinned ? '收起时间轴 ▾' : '展开时间轴 ▴';
    };
    timelineEl.addEventListener('pointerenter', () => {
        timelineHover = true;
        syncTimelineOpen();
    });
    timelineEl.addEventListener('pointerleave', () => {
        // 拖着游标时别收起：手指/鼠标移出底边很常见，收起来会闪
        if (timelineEl.querySelector('#timeline-canvas.dragging'))
            return;
        timelineHover = false;
        syncTimelineOpen();
    });
    timelineToggle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        timelinePinned = !timelinePinned;
        syncTimelineOpen();
    });
    // 拖游标时指针会被 canvas 捕获，pointerleave 不触发；松手若已经拖到面板外，补一次收起
    timelineEl.addEventListener('pointerup', (ev) => {
        if (timelinePinned)
            return;
        const c = document.getElementById('timeline-canvas').getBoundingClientRect();
        const inside = ev.clientX >= c.left && ev.clientX <= c.right && ev.clientY >= c.top && ev.clientY <= c.bottom;
        if (!inside) {
            timelineHover = false;
            syncTimelineOpen();
        }
    });
    const input = document.getElementById('year-input');
    input.value = String(year);
    /**
     * 点选 = 把卡片「固定」下来：
     * 详情栏打开、悬停卡片收起，此后鼠标扫过别的点不再唤出悬停卡，
     * 这样可以放心把鼠标移到卡片上滚轮读长文。点地图空白处即关闭并恢复悬停。
     */
    const pick = (id, back) => {
        countyPage = null;
        panel.show(id, back);
        map.setSelected(id);
        pinned = true;
        panel.showHover(null); // 详情已展开，同一项的悬停卡收起（鼠标旁另有只写标题的小标签）
    };
    /**
     * 非实体要素（国境线、割让面、势力范围、地理注记…）：详情卡里放标题、说明与附注。
     * 路线、战线这类「有实体 id」的线也走这里——它们悬停时只给了 id，得转回实体详情卡。
     */
    const pickTarget = (t) => {
        if (t.id && data.byId.has(t.id)) {
            pick(t.id);
            return;
        }
        panel.showTarget(t);
        map.setSelected(null);
        pinned = true;
        panel.showHover(null);
    };
    const unpin = () => {
        countyPage = null;
        panel.clear();
        map.setSelected(null);
        panel.showHover(null);
        hideTag();
        pinned = false;
    };
    /** 实体在时间轴上的落点：起点夹在 1840–1949 里（人物 1785–1850 落在 1840） */
    const yearFor = (e) => {
        const sp = spanOf(e);
        if (!sp)
            return null;
        const y = Math.max(YEAR_FROM, Math.min(YEAR_TO, Math.round(sp[0])));
        return y >= sp[0] - 0.5 && y <= sp[1] + 0.5 ? y : null;
    };
    // ---- 专题菜单：按内容分组、三列排（一个下拉早就不够用了）----
    const themes = data.entities.filter((e) => e.type === 'theme');
    const themeMenu = document.getElementById('theme-menu');
    const themeToggle = document.getElementById('theme-toggle');
    const themePanel = document.getElementById('theme-panel');
    const closeThemeMenu = () => {
        if (themePanel.hidden)
            return;
        themePanel.hidden = true;
        themeToggle.setAttribute('aria-expanded', 'false');
    };
    const openTheme = (t) => {
        closeThemeMenu();
        // 专题走读页：正式的文章版式，比侧栏里的一串列表更适合按顺序读
        reader.open(t);
        map.setHighlight(t.members || []);
    };
    const themeGroups = groupThemes(themes);
    themePanel.innerHTML =
        `<div class="theme-panel-head">按专题读 · ${themes.length} 条线，按内容分 ${themeGroups.length} 组</div>` +
            '<div id="theme-groups">' +
            themeGroups
                .map((g) => `<section class="theme-group">
          <h3 class="theme-group-title">${esc(g.title)}</h3>
          <ul class="theme-group-list">${g.themes
                .map((t) => `<li><button type="button" class="theme-item" data-id="${t.id}">${esc(label(t.labels))}${t.isNew ? '<span class="theme-new">new</span>' : ''}</button></li>`)
                .join('')}</ul>
        </section>`)
                .join('') +
            '</div>';
    themePanel.querySelectorAll('.theme-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const t = data.byId.get(btn.dataset.id || '');
            if (t)
                openTheme(t);
        });
    });
    themeToggle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const willOpen = themePanel.hidden;
        themePanel.hidden = !willOpen;
        themeToggle.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('click', (ev) => {
        if (!themeMenu.contains(ev.target))
            closeThemeMenu();
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape')
            closeThemeMenu();
    });
    /** 打开一个实体：必要时跳到它的年份、镜头对准、再选中。
     *  `fromTheme` 给了就从专题列表点进来的——详情顶部放一个「返回专题」。 */
    const openEntity = (e, fromTheme, backOverride) => {
        const sp = spanOf(e);
        if (sp && (year < sp[0] - 0.5 || year > sp[1] + 0.5)) {
            const target = yearFor(e);
            if (target !== null) {
                year = target;
                syncYear();
            }
        }
        map.focusEntity(e);
        const back = backOverride ??
            (fromTheme
                ? {
                    label: `返回专题 · ${label(fromTheme.labels)}`,
                    onClick: () => openTheme(fromTheme),
                }
                : undefined);
        pick(e.id, back);
    };
    // 详情里的关系 chip → 打开相邻实体，读者可以顺着关系一路挖
    panel.setNavigateHandler((id) => {
        const e = data.byId.get(id);
        if (e)
            openEntity(e);
    });
    /**
     * 从检索结果里打开：面板留一个「← 返回检索结果」。
     * 检索词、类型过滤、结果顺序都在 `renderHits()` 里，回来时原样重画，不用重新输入。
     */
    const pickHit = (hit) => openEntity(hit.entity, undefined, {
        label: `返回检索结果「${searchInput.value.trim()}」· ${hits.length} 条`,
        onClick: () => renderHits(),
    });
    // ---- 检索 ----
    const searchInput = document.getElementById('search-input');
    const searchFilter = document.getElementById('search-filter');
    const searchClear = document.getElementById('search-clear');
    // 下拉里的事件类别从同一份类别表生成，不手抄
    const catGroup = document.getElementById('search-cats');
    catGroup.innerHTML = CATEGORY_ORDER.map((c) => `<option value="cat:${c}">${EVENT_CATEGORY[c].name}</option>`).join('');
    let searching = false;
    /** 全部命中（不再按类型二次过滤），用于顶部类型分组条的计数 */
    let baseHits = [];
    /** 当前展示的命中（可能按类型过滤过） */
    let hits = [];
    let cursor = 0;
    /** 结果面板里点选类型后的过滤（null = 全部） */
    let hitType = null;
    /** 结果分组方式：类型 / 年代（2026-11-21 加年代） */
    let groupMode = 'type';
    /** 按年代过滤（null = 全部） */
    let hitEra = null;
    const renderHits = () => {
        const q = searchInput.value.trim();
        hits =
            groupMode === 'era'
                ? filterByEra(baseHits, hitEra)
                : hitType
                    ? baseHits.filter((h) => h.entity.type === hitType)
                    : baseHits;
        cursor = 0;
        // 地图高亮最多 120 个点：全量高亮会拖慢重绘，而 120 个已经足够看出「命中的分布」
        map.setHighlight(baseHits.length ? baseHits.slice(0, 120).map((h) => h.entity.id) : null);
        map.setSelected(null);
        panel.showResults(hits, `搜索「${q}」 · ${hits.length} 条`, (id) => {
            const hit = hits.find((h) => h.entity.id === id);
            if (hit)
                pickHit(hit);
        }, 0, q, {
            base: baseHits,
            activeType: hitType,
            onFilter: (t) => {
                hitType = t;
                renderHits();
            },
            groupMode,
            activeEra: hitEra,
            onMode: (m) => {
                groupMode = m;
                // 换一种分法就把另一种的筛选清掉，免得「切回类型」时还带着旧的年代条件
                hitType = null;
                hitEra = null;
                renderHits();
            },
            onEra: (k) => {
                hitEra = k;
                renderHits();
            },
            // 一条都没有时给相近条目：按名称/别名/标签的二字组兜底
            similar: baseHits.length ? [] : suggestSimilar(data.entities, q),
        });
    };
    const runSearch = () => {
        const q = searchInput.value;
        const filter = parseFilter(searchFilter.value);
        // 上限 500：再大的词也不可能一屏读完；500 足够让类型计数与「共 N 条」有意义
        baseHits = searchEntities(data.entities, q, filter, 500);
        hitType = null;
        hitEra = null;
        searching = baseHits.length > 0 || q.trim().length > 0;
        if (!searching) {
            map.setHighlight(null);
            syncYear();
            return;
        }
        renderHits();
    };
    // ---- 最近搜过的词（localStorage；无痕/禁用时读写失败也不影响搜索）----
    const recentEl = document.getElementById('search-recent');
    let recent = parseRecent((() => {
        try {
            return localStorage.getItem(RECENT_KEY);
        }
        catch {
            return null;
        }
    })());
    const saveRecent = (q) => {
        const next = pushRecent(recent, q);
        if (next.join('\u0000') === recent.join('\u0000'))
            return;
        recent = next;
        try {
            localStorage.setItem(RECENT_KEY, serializeRecent(recent));
        }
        catch {
            /* 存不下就只在内存里留着 */
        }
    };
    const hideRecent = () => {
        recentEl.hidden = true;
        recentEl.innerHTML = '';
    };
    const renderRecent = () => {
        if (!recent.length || searchInput.value.trim()) {
            hideRecent();
            return;
        }
        const items = recent
            .map((q, i) => `<button type="button" data-q="${esc(q)}"><span class="rn">${i + 1}</span>${esc(q)}</button>`)
            .join('');
        recentEl.innerHTML = `${items}<button type="button" class="clear-recent" data-clear="1">清除历史</button>`;
        recentEl.hidden = false;
    };
    recentEl.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn)
            return;
        if (btn.dataset.clear) {
            recent = [];
            try {
                localStorage.removeItem(RECENT_KEY);
            }
            catch {
                /* 忽略 */
            }
            hideRecent();
            return;
        }
        const q = btn.dataset.q || '';
        if (!q)
            return;
        searchInput.value = q;
        hideRecent();
        runSearch();
        searchInput.focus();
    });
    searchInput.addEventListener('focus', renderRecent);
    searchInput.addEventListener('blur', () => window.setTimeout(hideRecent, 160));
    // 输入停顿 700ms 才记一条：每敲一个字都记的话，历史里全是「南」「南京」「南京条」这种半成品
    let recentTimer = 0;
    const scheduleRecent = () => {
        window.clearTimeout(recentTimer);
        const q = searchInput.value.trim();
        if (q.length < 2)
            return;
        recentTimer = window.setTimeout(() => saveRecent(q), 700);
    };
    searchInput.addEventListener('input', () => {
        hideRecent();
        runSearch();
        scheduleRecent();
    });
    searchFilter.addEventListener('change', () => {
        if (searchInput.value.trim())
            runSearch();
    });
    const clearSearch = () => {
        searchInput.value = '';
        searching = false;
        hits = [];
        map.setHighlight(null);
        syncYear();
    };
    searchClear.addEventListener('click', clearSearch);
    searchInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            clearSearch();
            searchInput.blur();
            return;
        }
        if (ev.key === 'Enter' && hits.length) {
            saveRecent(searchInput.value);
            pickHit(hits[Math.min(cursor, hits.length - 1)]);
            return;
        }
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            if (!hits.length)
                return;
            ev.preventDefault();
            cursor = (cursor + (ev.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
            panel.highlight(cursor);
        }
    });
    // 「/」聚焦检索框（不在输入框里时）
    window.addEventListener('keydown', (ev) => {
        const tag = ev.target?.tagName;
        if (ev.key === '/' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
            ev.preventDefault();
            searchInput.focus();
        }
    });
    const climateRecs = new Map();
    const loadClimateYear = async (y) => {
        if (climateRecs.has(y))
            return climateRecs.get(y);
        try {
            const res = await fetch(`content/climate/${y}.json`);
            if (!res.ok)
                throw new Error('no file');
            const body = (await res.json());
            const rows = body.records || [];
            climateRecs.set(y, rows);
            return rows;
        }
        catch {
            climateRecs.set(y, []);
            return [];
        }
    };
    // 本年灾情县点：默认关；打开后按年取明细、对坐标、画到图上
    let climateOn = false;
    let climateGeo = null;
    const climateGeoReady = (async () => {
        try {
            const res = await fetch('content/climate-geo.json');
            if (res.ok)
                climateGeo = (await res.json()).points;
        }
        catch {
            climateGeo = null;
        }
    })();
    const renderClimateDots = async (y) => {
        if (!climateOn) {
            map.setClimateDots([]);
            return;
        }
        await climateGeoReady;
        if (!climateGeo) {
            map.setClimateDots([]);
            return;
        }
        const rows = await loadClimateYear(y);
        // 同一个县一年可能有多条：合成一个点，记条数与出现最多的灾种（点色用它）
        const byCounty = new Map();
        for (const r of rows) {
            if (!climateGeo[r.c])
                continue;
            let one = byCounty.get(r.c);
            if (!one) {
                one = { n: 0, kinds: new Map() };
                byCounty.set(r.c, one);
            }
            one.n++;
            for (const k of r.k)
                if (k)
                    one.kinds.set(k, (one.kinds.get(k) || 0) + 1);
        }
        const dots = [];
        for (const [c, one] of byCounty) {
            const coord = climateGeo[c];
            const kind = [...one.kinds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            dots.push({ lon: coord[0], lat: coord[1], kind, c, n: one.n });
        }
        map.setClimateDots(dots);
    };
    let countyIndex = null;
    let countyIndexLoading = null;
    const loadCountyIndex = async () => {
        if (countyIndex)
            return countyIndex;
        if (!countyIndexLoading) {
            countyIndexLoading = (async () => {
                try {
                    const res = await fetch('content/climate-county.json');
                    if (!res.ok)
                        throw new Error('no file');
                    const body = (await res.json());
                    countyIndex = body.counties || {};
                    return countyIndex;
                }
                catch {
                    return null;
                }
            })();
        }
        return countyIndexLoading;
    };
    const openCounty = async (c) => {
        const idx = await loadCountyIndex();
        const info = idx?.[c];
        if (!info)
            return;
        countyPage = c;
        panel.showCounty(c, info, (y) => {
            year = y;
            syncYear();
        });
        map.setSelected(null);
        pinned = true;
        panel.showHover(null);
    };
    map.setClimatePickHandler((c) => void openCounty(c));
    // 本年灾情小结：换年时更新，只在气象年表覆盖的年份（1840–1911）显示
    const climateCard = document.getElementById('climate-card');
    const HAZARD_ORDER = ['旱', '水', '蝗', '饥', '风', '雪', '疫', '雹', '霜', '震'];
    const HAZARD_COLOR = {
        旱: '#a8763a', 水: '#3f6b8a', 蝗: '#7a7a2e', 饥: '#8a3a2a',
        风: '#5a7a6a', 雪: '#788ca0', 疫: '#6e506e', 雹: '#8a8070', 霜: '#8a8070', 震: '#8a8070',
    };
    const renderClimate = () => {
        const c = data.climate.get(year);
        if (!c) {
            climateCard.hidden = true;
            return;
        }
        const kinds = Object.entries(c.kinds)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ');
        const provinces = Object.entries(c.top || {}).slice(0, 2);
        const top = provinces
            .map(([k, v]) => `<button class="cc-prov" data-p="${esc(k)}">${k.replace(/(省|自治区|市)$/, '')}</button> ${v}`)
            .join(' · ');
        const totalKinds = Object.entries(c.kinds).reduce((a, b) => a + b[1], 0) || 1;
        const bar = HAZARD_ORDER.filter((k) => c.kinds[k])
            .map((k) => `<i style="flex:${c.kinds[k]};background:${HAZARD_COLOR[k]}"></i>`)
            .join('');
        climateCard.innerHTML =
            `<b>${year} 年</b> 报灾 ${c.n} 条` +
                (kinds ? `<div class="cc-sub">${kinds}</div>` : '') +
                (top ? `<div class="cc-sub">${top}</div>` : '') +
                `<div class="cc-bar">${bar.replace(/flex:(\d+)/g, (_, v) => `flex:${Math.max(1, Math.round((Number(v) / totalKinds) * 100))}`)}</div>`;
        climateCard.title = '据《中国三千年气象记录总集》第四册（OCR 抽取，仅供量级参考）';
        climateCard.hidden = false;
    };
    // 点省名 → 右侧列出该年该省的每一条报灾记录（带书页，便于回原书核对）
    climateCard.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.cc-prov');
        if (!btn)
            return;
        const prov = btn.dataset.p || '';
        void loadClimateYear(year).then((rows) => {
            const hit = rows.filter((r) => r.p === prov);
            panel.showRecords(`本年报灾 · ${prov.replace(/(省|自治区|市)$/, '')}`, hit, `${year} 年 · ${hit.length} 条记录 · 《中国三千年气象记录总集》第四册`, openCounty);
            pinned = true;
        });
    });
    const syncYear = () => {
        input.value = String(year);
        map.setYear(year);
        timeline.setYear(year);
        renderClimate();
        void renderClimateDots(year);
        // 右侧不再默认列「当年条目」（2026-11-09，待换内容形式）：没内容就整块不显示；
        // 专题 / 检索 / 点选仍会把内容放进详情栏
        // 县级报灾页开着时换年只换图，不清右栏
        if (!searching && !countyPage)
            unpin();
        renderLegend();
        renderPowerKey(year);
        renderLayers(year);
        // 切年时补当年缺的图层（跨主张期、1842 起的割让面、1851–1865 的太平天国），到了重画
        if (geoData) {
            void ensureYearLayers(geoData, year).then((added) => {
                if (added)
                    map.redraw();
            });
        }
    };
    // ←/→ 换一年，Shift+←/→ 十年一格；焦点在输入框/下拉里时让给它们
    window.addEventListener('keydown', (ev) => {
        const tag = ev.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
            return;
        if (ev.metaKey || ev.ctrlKey || ev.altKey)
            return;
        const next = yearStep(year, ev.key, ev.shiftKey);
        if (next === null)
            return;
        ev.preventDefault();
        year = next;
        syncYear();
    });
    // 详情卡的关闭：右上角 ×，或 Esc（焦点在输入框里时让给输入框）
    document.getElementById('panel-close')?.addEventListener('click', unpin);
    window.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape')
            return;
        const tag = ev.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
            return;
        const panelEl = document.getElementById('panel');
        if (!panelEl || panelEl.hidden)
            return;
        if (document.querySelector('dialog[open]'))
            return; // 弹窗自己会处理 Esc
        ev.preventDefault();
        unpin();
    });
    map.setPickHandler(pick);
    map.setPickTargetHandler(pickTarget);
    map.setEmptyClickHandler(unpin);
    input.addEventListener('change', () => {
        const v = Math.max(YEAR_FROM, Math.min(YEAR_TO, Number(input.value) || YEAR_FROM));
        year = v;
        syncYear();
    });
    // 顶栏高度写进 CSS 变量：窄屏上顶栏是两行（标题 + 搜索 + 按钮），
    // 专题浮层与图层菜单要从它下面开始，不能写死 px（§4.338）
    const topbarEl = document.getElementById('topbar');
    const syncTopbarHeight = () => {
        if (topbarEl)
            document.documentElement.style.setProperty('--topbar-h', `${topbarEl.offsetHeight}px`);
    };
    syncTopbarHeight();
    window.addEventListener('resize', () => {
        map.resize();
        timeline.resize();
        syncTopbarHeight();
        // 跨过 900px 断点时重画详情卡：宽屏铺开、窄屏折叠（2026-11-21）
        panel.refreshFold();
    });
    // 图层开关：只列当年有意义的图层（太平天国、行军箭头只在 1850–60 年代）
    const layerBox = document.getElementById('layer-list');
    const layerState = {};
    for (const l of GEO_LAYERS)
        layerState[l.key] = l.on;
    const renderLayers = (y) => {
        const visible = layersAt(y);
        layerBox.innerHTML = visible
            .map((l) => `<label class="layer-item" title="${l.hint}">
      <input type="checkbox" data-layer="${l.key}" ${layerState[l.key] ? 'checked' : ''} />
      <i class="layer-swatch" style="background:${l.color}"></i>${l.name}
    </label>`)
            .join('') +
            `<label class="layer-item layer-climate" title="把当年报灾的县点画在地图上（据《中国三千年气象记录总集》第四册，覆盖 1840–1911）">
      <input type="checkbox" data-climate="1" ${climateOn ? 'checked' : ''} />
      <i class="layer-swatch" style="background:#a8763a"></i>本年灾情县点
    </label>`;
        layerBox.querySelectorAll('input').forEach((el) => {
            el.addEventListener('change', () => {
                const input = el;
                if (input.dataset.climate) {
                    climateOn = input.checked;
                    void renderClimateDots(year);
                    return;
                }
                const key = input.dataset.layer;
                layerState[key] = input.checked;
                map.setLayer(key, input.checked);
                if (key === 'warlords' || key === 'war')
                    renderPowerKey(year);
            });
        });
    };
    const layerToggle = document.getElementById('layer-toggle');
    const layerBoxEl = document.getElementById('layer-box');
    // 内容开关：人物点与名一起显隐（图层面板里单独一行，不占 GeoData 的图层位）
    layerBoxEl.querySelector('input[data-entity="person"]')?.addEventListener('change', (ev) => {
        map.setTypeVisible('person', ev.target.checked);
        renderLegend();
    });
    const setLayerOpen = (open) => {
        layerBoxEl.hidden = !open;
        layerToggle.setAttribute('aria-expanded', String(open));
    };
    layerToggle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setLayerOpen(layerBoxEl.hidden);
    });
    // 点面板外面、按 Esc 都收起
    document.addEventListener('click', (ev) => {
        if (layerBoxEl.hidden)
            return;
        const t = ev.target;
        if (layerBoxEl.contains(t) || layerToggle.contains(t))
            return;
        setLayerOpen(false);
    });
    window.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !layerBoxEl.hidden)
            setLayerOpen(false);
    });
    // 关于页的参考资料汇总：只列图书/地图/史料，维基与网页不逐条铺开（各条目详情里有）
    const fillAboutRefs = () => {
        const list = document.getElementById('about-refs');
        const note = document.getElementById('about-ref-note');
        if (!list)
            return;
        const rows = new Map();
        let wiki = 0;
        let web = 0;
        for (const src of data.sources.values()) {
            if (src.kind === 'wiki')
                wiki++;
            else if (src.kind === 'web')
                web++;
            if (src.id.startsWith('source.legacy'))
                continue;
            if (!['book', 'map', 'other'].includes(src.kind || ''))
                continue;
            const raw = label(src.title) || src.id.replace(/^source\./, '');
            // 有的来源把两本书写在一个标题里，拆开列
            for (const part of raw.split(/[；;]/)) {
                const name = part.trim();
                if (!name)
                    continue;
                const author = typeof src.author === 'string' ? src.author : label(src.author);
                const date = src.date || (src.year ? String(src.year) : '');
                const publisher = typeof src.publisher === 'string' ? src.publisher : label(src.publisher);
                const prev = rows.get(name);
                if (!prev)
                    rows.set(name, { author, date, publisher });
            }
        }
        const sorted = [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans'));
        list.innerHTML = sorted
            .map(([name, meta]) => {
            const bits = [meta.author, meta.date, meta.publisher].filter(Boolean);
            return `<li><span class="ref-name">${esc(name)}</span>${bits.length ? `<span class="ref-meta">${esc(bits.join(' · '))}</span>` : ''}</li>`;
        })
            .join('');
        if (note) {
            note.textContent = `按书名汇总，共 ${sorted.length} 种；作者、年份/出版信息有则列，具体用于哪条见各条目详情里的出处。另有 ${wiki} 条维基百科与 ${web} 条网络资料，不在此重复。`;
        }
    };
    fillAboutRefs();
    // 纠错与投稿：页脚入口 + 详情卡的「这一条有误？」（面板只派发事件，不反向依赖面板）
    const fbDlg = document.getElementById('feedback');
    if (fbDlg) {
        const feedback = new FeedbackForm(fbDlg);
        const yearOf = () => year;
        document.getElementById('feedback-open')?.addEventListener('click', () => {
            void feedback.open({ year: yearOf() });
        });
        window.addEventListener('fengyu:feedback', (ev) => {
            const detail = ev.detail || {};
            void feedback.open({ ...detail, year: yearOf() });
        });
    }
    // 关于页的条目/出处数：运行时统计，避免手抄一遍数字再过期
    const aboutStats = document.getElementById('about-stats');
    if (aboutStats) {
        const themes = data.entities.filter((e) => e.type === 'theme').length;
        aboutStats.textContent =
            '目前 ' + data.entities.length + ' 条实体、' + data.sources.size + ' 种出处、' + themes + ' 条专题线。';
    }
    // 弹窗：关于本项目（页脚入口）与使用帮助（顶栏入口），共用 .pop / .pop-close
    const help = document.getElementById('help');
    const about = document.getElementById('about');
    document.getElementById('help-open')?.addEventListener('click', () => help?.showModal());
    document.getElementById('about-open')?.addEventListener('click', () => about?.showModal());
    document.querySelectorAll('.pop-close').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.getElementById(btn.dataset.close || '')?.close();
        });
    });
    for (const d of [help, about]) {
        d?.addEventListener('click', (ev) => {
            if (ev.target === d)
                d.close(); // 点背景关掉
        });
    }
    // ?（Shift+/）打开帮助；跟着输入框走的时候不抢
    window.addEventListener('keydown', (ev) => {
        const tag = ev.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
            return;
        if (ev.key !== '?')
            return;
        ev.preventDefault();
        help?.showModal();
    });
    // ---------------------------------------------------------------- 1934 校准图层（位置已锁死）
    // 对位参数在 sidecar 里（80/130°E、20/45°N 四条锚线定死），面板只留开关和透明度；
    // 保留这个图层是为了随时能翻出来比对，微调工具已经不需要了。
    const overlay = new MapOverlay(() => map.redraw());
    map.setOverlay(overlay);
    const ovlOn = document.getElementById('ovl-on');
    const ovlOpacity = document.getElementById('ovl-opacity');
    const ovlHint = document.getElementById('ovl-hint');
    const syncOverlayInfo = () => {
        const ok = !!overlay.meta;
        ovlOn.disabled = !ok;
        ovlOpacity.disabled = !ok;
        ovlHint.textContent = ok ? '' : `未找到校准图${overlay.error ? '：' + overlay.error : ''}`;
    };
    ovlOn.addEventListener('change', () => {
        // 图是 15 MB 的 PNG，第一次点亮才取；取的过程里开关先保持按下，图到了自动重画
        if (ovlOn.checked)
            void overlay.loadImage();
        overlay.set({ on: ovlOn.checked });
    });
    ovlOpacity.addEventListener('input', () => overlay.set({ opacity: Number(ovlOpacity.value) / 100 }));
    syncOverlayInfo();
    // 只读 sidecar（几百字节）决定开关能不能点；真图等点亮开关或 ?overlay=1 时再取（§4.335）
    void overlay.loadMeta().then(() => {
        // ?overlay=1 直接打开校准图，方便截图/分享定位
        if (overlay.meta && /[?&]overlay=1\b/.test(location.search)) {
            ovlOn.checked = true;
            overlay.set({ on: true });
            void overlay.loadImage();
        }
        syncOverlayInfo();
    });
    // 图例是派生视图：只看当前这一年真正出现的东西（设计规划 §十二）
    const legend = document.getElementById('legend');
    // 地图上会画成点的类型都要能在这里找到：人物以前漏了，作品/常态/技术也只有零星几个点。
    const TYPE_LEGEND = [
        ['place', '#33556f', '地点'],
        ['person', '#8a5a2b', '人物'],
        ['institution', '#4a6b3f', '机构'],
        ['organization', '#7a4b8a', '组织'],
        ['work', '#6b5a3a', '作品'],
        ['practice', '#5f6b3a', '常态'],
        ['group', '#7a6a4a', '群体'],
        ['technology', '#3a6b6b', '技术'],
        ['route', '#26455c', '路线'],
        ['front', '#b5402c', '战线'],
    ];
    const renderLegend = () => {
        // 图例直接问地图：这一年到底把哪些东西画成了实显
        const seenTypes = new Set(map.visibleTypes());
        const cats = new Set(map.visibleEventCategories());
        const parts = [];
        for (const [type, color, name] of TYPE_LEGEND) {
            if (!seenTypes.has(type))
                continue;
            parts.push(`<span class="legend-item"><i class="swatch" style="background:${color}"></i>${name}</span>`);
        }
        for (const cat of CATEGORY_ORDER) {
            if (!cats.has(cat))
                continue;
            parts.push(`<span class="legend-item">${swatchSvg(EVENT_CATEGORY[cat], 11)}${EVENT_CATEGORY[cat].name}</span>`);
        }
        legend.innerHTML = parts.join('');
    };
    year = startYear;
    // 第一帧之前把「按年 / 按窗口」的图层补齐：第一帧就是完整的那一帧，
    // 不会先画一版没有主张线、没有海岸线的图再跳一下（§4.337）
    const geo = await geoPromise;
    if (geo) {
        geoData = geo;
        const yearData = await yearLayersPromise;
        applyYearLayers(geo, yearData);
        if (detailPromise) {
            const detail = await detailPromise;
            if (detail)
                applyDetail(geo, detail);
        }
        map.setGeo(geo);
        markStage('geo');
    }
    // 之后缩放到东亚（或从世界视野转进来）再补细节层：只通知一次，到了重画
    map.setDetailHandler(() => {
        if (!geoData || detailPromise)
            return;
        void fetchDetailLayers().then((detail) => {
            if (!detail || !geoData)
                return;
            if (!applyDetail(geoData, detail))
                return;
            map.redraw();
        });
    });
    syncYear();
    markStage('first-paint');
    markStage('done');
    finishLoadbar();
    console.log('[fengyu] loaded', data.manifest.total, 'entities', label({ 'zh-Hans': 'ok' }));
    // 殖民地的判定面最后补：它们不画、只服务悬停，首屏为它们等 1.6 MB 不值得（§4.336）。
    // 在此之前悬停不会报「英属印度」这类归属，其余（租借地、割地、占领区）照常。
    void loadColonies().then((list) => {
        if (!list.length)
            return;
        map.setSpheres(list);
        markStage('hover');
    });
}
boot().catch((err) => {
    console.error(err);
    document.getElementById('loadbar')?.classList.add('done', 'hide');
    document.getElementById('panel-body').textContent = `加载失败：${String(err)}`;
});
