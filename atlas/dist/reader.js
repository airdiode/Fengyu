import { label, spanOf } from './types.js';
import { categoryStyle, swatchSvg } from './event-category.js';
import { sourceTitle } from './sources.js';
import { esc } from './panel.js';
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 条目的一句提要：编者注记 > 摘要首句；人物摘要常以「某地人，」开头，跳过它 */
function ledeOf(e, noteText) {
    if (noteText)
        return noteText;
    const raw = label(e.summary) || '';
    if (!raw)
        return '';
    const parts = raw.split(/[。；]/).filter(Boolean);
    let first = parts[0] || '';
    // 人物摘要常以「某地人，」或干脆「某地人。」开头，跳过它取下一句
    const m = /^[\u4e00-\u9fa5]{2,8}人[，,](.+)$/.exec(first);
    if (m)
        first = m[1];
    else if (/^[\u4e00-\u9fa5]{2,8}人$/.test(first) && parts[1])
        first = parts[1];
    return first.length > 56 ? `${first.slice(0, 56)}…` : first;
}
function yearOf(e) {
    const sp = spanOf(e);
    if (!sp)
        return '';
    const a = Math.floor(sp[0]);
    const b = Math.floor(sp[1]);
    return a === b ? String(a) : `${a}–${b}`;
}
function iconOf(e) {
    if (e.type === 'event')
        return `<span class="rd-ico">${swatchSvg(categoryStyle(e.category), 9)}</span>`;
    return '<span class="rd-ico dot"></span>';
}
/** 读页正文（纯函数，Node 里可测） */
export function renderReader(t, byId) {
    const sections = t.sections?.length
        ? t.sections
        : [{ title: undefined, intro: undefined, members: t.members || [] }];
    const note = t.memberNote || {};
    const total = sections.reduce((n, s) => n + s.members.length, 0);
    const span = spanOf(t);
    const years = span
        ? Math.floor(span[0]) === Math.floor(span[1])
            ? `${Math.floor(span[0])} 年`
            : `${Math.floor(span[0])}–${Math.floor(span[1])} 年`
        : '';
    const refs = (t.sources || [])
        .map((s) => byId.get(s.ref))
        .filter((e) => !!e && e.type === 'source')
        .map((e) => sourceTitle(e))
        .filter(Boolean);
    const toc = sections
        .map((s, i) => {
        const title = s.title ? label(s.title) : '条目';
        return `<a class="rd-toc-a" href="#rd-ch-${i + 1}"><span class="rd-toc-n">${NUM[i] || i + 1}</span>${esc(title)}<span class="rd-toc-c">${s.members.length}</span></a>`;
    })
        .join('');
    const body = sections
        .map((s, i) => {
        const title = s.title ? label(s.title) : '条目';
        const intro = s.intro ? label(s.intro) : '';
        const items = s.members
            .map((id) => {
            const e = byId.get(id);
            if (!e)
                return '';
            const y = yearOf(e);
            const noteText = note[id] ? label(note[id]) : '';
            const lede = ledeOf(e, noteText);
            return `<li class="rd-item" data-id="${esc(id)}"><span class="rd-year">${esc(y)}</span>${iconOf(e)}<span class="rd-main"><b class="rd-name">${esc(label(e.labels))}</b>${lede ? `<span class="rd-lede">${esc(lede)}</span>` : ''}</span></li>`;
        })
            .join('');
        return `<section class="rd-ch" id="rd-ch-${i + 1}">
  <h2 class="rd-h2"><span class="rd-num">${NUM[i] || i + 1}</span>${esc(title)}<span class="rd-h2-n">${s.members.length} 条</span></h2>
  ${intro ? `<p class="rd-intro">${esc(intro)}</p>` : ''}
  <ul class="rd-list">${items}</ul>
</section>`;
    })
        .join('');
    return `<div class="rd">
  <header class="rd-head">
    <div class="rd-kicker">专题 · ${sections.length} 章 · ${total} 条</div>
    <h1 class="rd-h1">${esc(label(t.labels))}</h1>
    ${t.question ? `<p class="rd-q">${esc(label(t.question))}</p>` : ''}
    ${t.summary ? `<p class="rd-lede-2">${esc(label(t.summary))}</p>` : ''}
    <div class="rd-meta">${esc(years)}${refs.length ? ` · 参考 ${refs.map(esc).join('、')}` : ''}</div>
  </header>
  <nav class="rd-toc">${toc}</nav>
  <div class="rd-body">${body}</div>
  <footer class="rd-foot">点任意条目展开详情 · Esc 关闭</footer>
</div>`;
}
/** 读页的开关与事件代理：只管 DOM，不碰数据 */
export class Reader {
    root;
    body;
    sheet;
    byId;
    onPick;
    current = null;
    constructor(root, byId, onPick) {
        this.root = root;
        this.body = root.querySelector('#reader-body');
        this.sheet = root.querySelector('.reader-sheet');
        this.byId = byId;
        this.onPick = onPick;
        root.querySelectorAll('[data-reader-close]').forEach((el) => el.addEventListener('click', () => this.close()));
        this.body.addEventListener('click', (ev) => {
            const target = ev.target.closest('[data-id]');
            if (!target)
                return;
            const id = target.dataset.id;
            if (!this.byId.has(id))
                return;
            const from = this.current;
            this.close();
            this.onPick(id, from);
        });
        // 目录里的锚点：自己滚，别让整页跳
        this.body.addEventListener('click', (ev) => {
            const a = ev.target.closest('a.rd-toc-a');
            if (!a)
                return;
            ev.preventDefault();
            const id = a.getAttribute('href')?.slice(1);
            const el = id ? this.body.querySelector(`#${CSS.escape(id)}`) : null;
            if (el)
                this.sheet.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
        });
        // Esc 关闭：捕获阶段抢在详情卡、图层菜单之前，读页开着时 Esc 只关读页
        window.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && this.isOpen) {
                ev.stopPropagation();
                ev.preventDefault();
                this.close();
            }
        }, true);
    }
    get theme() {
        return this.current;
    }
    get isOpen() {
        return !this.root.hidden;
    }
    open(t) {
        this.current = t;
        this.body.innerHTML = renderReader(t, this.byId);
        this.root.hidden = false;
        this.sheet.scrollTop = 0;
        document.body.classList.add('reading');
    }
    close() {
        if (this.root.hidden)
            return;
        this.current = null;
        this.root.hidden = true;
        this.body.innerHTML = '';
        document.body.classList.remove('reading');
    }
}
