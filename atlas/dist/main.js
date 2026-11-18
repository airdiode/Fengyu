import { loadDataset } from './data.js';
import { MapView, ringsFromGeoJson } from './map.js';
import { Timeline } from './timeline.js';
import { Panel, esc } from './panel.js';
import { Reader } from './reader.js';
import { label, spanOf } from './types.js';
import { CATEGORY_ORDER, EVENT_CATEGORY, swatchSvg } from './event-category.js';
import { parseFilter, searchEntities } from './search.js';
import { GEO_LAYERS, layersAt, loadColonies, loadGeo } from './geo-layers.js';
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
    // 三样东西互不依赖，全部在同一个 tick 里发出去；**发出去的顺序就是优先级**：
    // 底图轮廓（100 KB）→ 内容（首屏要点得动它）→ 疆域快照 → 辅助图层。
    // 原来是一路 await 下去，每个文件一次往返；而本地 dev 服务器是 HTTP/1.1（每域 6 条连接），
    // 后发的请求会排在 19 份图层后面——线上走 HTTP/2 虽然能多路复用，但这个顺序也是对的（§4.335）。
    const basePromise = fetch('public/china.geojson').then((r) => r.json());
    const baseDocPromise = fetch('public/geo/base-1840.json').then((r) => r.json());
    const dataPromise = loadDataset();
    const territoriesPromise = fetch('public/territories.json').then((r) => r.json());
    // 辅助图层一共 19 份、约 4.8 MB，最后到也没关系：实体先画，图层到了再叠上去
    const geoPromise = loadGeo().catch(() => null);
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
    // 疆域快照只在没有 1840 基线时才兜底，所以永远最后叠
    void territoriesPromise
        .then((terr) => map.setTerritories(terr))
        .catch(() => { });
    // 势力范围图例：只列这一年实际存在的列强
    const powerKey = document.getElementById('power-key');
    const renderPowerKey = (_y) => {
        // 殖民地不再着色（只留国名标注），色块图例会误导，直接不显示
        powerKey.innerHTML = '';
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
                .map((t) => `<li><button type="button" class="theme-item" data-id="${t.id}">${esc(label(t.labels))}</button></li>`)
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
    const openEntity = (e, fromTheme) => {
        const sp = spanOf(e);
        if (sp && (year < sp[0] - 0.5 || year > sp[1] + 0.5)) {
            const target = yearFor(e);
            if (target !== null) {
                year = target;
                syncYear();
            }
        }
        map.focusEntity(e);
        const back = fromTheme
            ? {
                label: `返回专题 · ${label(fromTheme.labels)}`,
                onClick: () => openTheme(fromTheme),
            }
            : undefined;
        pick(e.id, back);
    };
    // 详情里的关系 chip → 打开相邻实体，读者可以顺着关系一路挖
    panel.setNavigateHandler((id) => {
        const e = data.byId.get(id);
        if (e)
            openEntity(e);
    });
    /** 从检索结果里打开 */
    const pickHit = (hit) => openEntity(hit.entity);
    // ---- 检索 ----
    const searchInput = document.getElementById('search-input');
    const searchFilter = document.getElementById('search-filter');
    const searchClear = document.getElementById('search-clear');
    // 下拉里的事件类别从同一份类别表生成，不手抄
    const catGroup = document.getElementById('search-cats');
    catGroup.innerHTML = CATEGORY_ORDER.map((c) => `<option value="cat:${c}">${EVENT_CATEGORY[c].name}</option>`).join('');
    let searching = false;
    let hits = [];
    let cursor = 0;
    const runSearch = () => {
        const q = searchInput.value;
        const filter = parseFilter(searchFilter.value);
        hits = searchEntities(data.entities, q, filter);
        cursor = 0;
        searching = hits.length > 0 || q.trim().length > 0;
        if (!searching) {
            syncYear();
            return;
        }
        panel.showResults(hits, `搜索「${q.trim()}」 · ${hits.length} 条`, (id) => {
            const hit = hits.find((h) => h.entity.id === id);
            if (hit)
                pickHit(hit);
        }, 0, q.trim());
        map.setHighlight(hits.length ? hits.map((h) => h.entity.id) : null);
        map.setSelected(null);
    };
    searchInput.addEventListener('input', runSearch);
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
    window.addEventListener('resize', () => {
        map.resize();
        timeline.resize();
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
            });
        });
    };
    const layerToggle = document.getElementById('layer-toggle');
    const layerBoxEl = document.getElementById('layer-box');
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
    // ?lon=&lat=&span=：把视图定到某处（比对/截图用）
    {
        const q = new URLSearchParams(location.search);
        const lon = Number(q.get('lon'));
        const lat = Number(q.get('lat'));
        const span = Number(q.get('span'));
        if (Number.isFinite(lon) && Number.isFinite(lat) && span > 0) {
            map.setView(lon, lat, span);
        }
    }
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
    syncYear();
    markStage('first-paint');
    // 辅助图层到了：叠上去，tier/主张线/割让面这些依赖 geo 的东西这时才画得出来
    const geo = await geoPromise;
    if (geo) {
        map.setGeo(geo);
        markStage('geo');
    }
    // ?year=1930：直接跳到某年（截图/比对用）
    {
        const y = Number(new URLSearchParams(location.search).get('year'));
        if (Number.isFinite(y) && y > 0) {
            year = Math.round(y);
            syncYear();
        }
    }
    markStage('done');
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
    document.getElementById('panel-body').textContent = `加载失败：${String(err)}`;
});
