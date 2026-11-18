export const KINDS = ['史实有误', '出处不对或缺失', '地图或图层画错', '功能与体验', '资料提供', '其他'];
export const MAX_DETAIL = 4000;
export const issueTitle = (d) => {
    const who = d.entityLabel || d.entityId || '站内反馈';
    return '[反馈] ' + d.kind + '：' + who;
};
export const issueBody = (d) => {
    const entity = d.entityId
        ? d.entityLabel + '（' + d.entityId + '）' + (d.year ? ' · ' + d.year + ' 年' : '')
        : '（未指定，整体性问题）';
    return [
        '### 反馈类型',
        d.kind,
        '',
        '### 相关条目',
        entity,
        '',
        '### 页面与版本',
        d.url,
        '数据版本：' + (d.version || '未知'),
        '',
        '### 问题描述',
        d.detail.trim(),
        '',
        '### 依据（书页 / 档案 / 链接）',
        d.basis.trim() || '（未提供）',
        '',
        '---',
        '由站内表单提交。',
    ].join('\n');
};
export const githubIssueUrl = (repo, d) => {
    const q = new URLSearchParams({ title: issueTitle(d), body: issueBody(d), labels: 'feedback' });
    return 'https://github.com/' + repo + '/issues/new?' + q.toString();
};
export const mailtoUrl = (email, d) => {
    return ('mailto:' + email +
        '?subject=' + encodeURIComponent(issueTitle(d)) +
        '&body=' + encodeURIComponent(issueBody(d)));
};
/** 必填校验：返回缺了哪些（给状态行用，不做 HTML 校验气泡） */
export const missingFields = (d) => {
    const out = [];
    if (!d.kind)
        out.push('反馈类型');
    const text = d.detail.trim();
    if (!text)
        out.push('问题描述');
    else if (text.length < 8)
        out.push('问题描述（太短，写清楚哪一条、哪里不对）');
    if (d.detail.length > MAX_DETAIL)
        out.push('问题描述（超过 ' + MAX_DETAIL + ' 字）');
    return out;
};
/** 提交给后端的载荷：字段名固定，Worker 按这个收（见 docs/feedback.md） */
export const payloadOf = (d) => ({
    kind: d.kind,
    entityId: d.entityId,
    entityLabel: d.entityLabel,
    year: d.year,
    url: d.url,
    version: d.version,
    detail: d.detail.trim(),
    basis: d.basis.trim(),
});
const readMeta = () => {
    const get = (name, fallback = '') => document.querySelector('meta[name="' + name + '"]')?.getAttribute('content') || fallback;
    return {
        endpoint: get('feedback-endpoint'),
        repo: get('feedback-repo', 'airdiode/Fengyu'),
        email: get('feedback-email', 'contact@airdiode.com'),
    };
};
export class FeedbackForm {
    dlg;
    meta = readMeta();
    version = '';
    ctx = {};
    kind;
    entityOut;
    detail;
    basis;
    agree;
    honeypot;
    status;
    submitBtn;
    mailBtn;
    constructor(dlg) {
        this.dlg = dlg;
        const $ = (id) => {
            const el = document.getElementById(id);
            if (!el)
                throw new Error('反馈表单缺元素：' + id);
            return el;
        };
        this.kind = $('fb-kind');
        this.entityOut = $('fb-entity');
        this.detail = $('fb-detail');
        this.basis = $('fb-basis');
        this.agree = $('fb-agree');
        this.honeypot = $('fb-hp');
        this.status = $('fb-status');
        this.submitBtn = $('fb-submit');
        this.mailBtn = $('fb-mail');
        this.submitBtn.textContent = this.meta.endpoint ? '提交' : '在 GitHub 上提交';
        this.submitBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            void this.submit();
        });
        this.mailBtn.addEventListener('click', () => this.sendMail());
        this.dlg.querySelectorAll('.pop-close').forEach((btn) => {
            btn.addEventListener('click', () => this.dlg.close());
        });
        const cancel = this.dlg.querySelector('#fb-cancel');
        cancel?.addEventListener('click', () => this.dlg.close());
        // 点弹窗外面的遮罩**不再关闭**：读者常常先写了一屏说明，再回头点地图找个条目名，
        // 一下就白写了。关的出口只有右上角的 × 与「取消」（Esc 仍然可以，键盘操作是明确的）。§4.341
    }
    async open(ctx) {
        this.ctx = ctx;
        this.entityOut.textContent = ctx.entityLabel
            ? ctx.entityLabel + '（' + (ctx.entityId || '') + '）'
            : '（未指定条目，整体性问题）';
        this.status.textContent = '';
        this.status.className = 'fb-status';
        await this.ensureVersion();
        if (!this.dlg.open)
            this.dlg.showModal();
        this.detail.focus();
    }
    async ensureVersion() {
        if (this.version)
            return;
        try {
            const res = await fetch('dist/version.json', { cache: 'no-store' });
            if (res.ok) {
                const v = (await res.json());
                this.version = [v.date, v.commit].filter(Boolean).join(' · ');
            }
        }
        catch {
            // 版本戳拿不到不影响提交，正文里写「未知」
        }
    }
    draft() {
        return {
            kind: this.kind.value,
            entityId: this.ctx.entityId || '',
            entityLabel: this.ctx.entityLabel || '',
            year: this.ctx.year ? String(this.ctx.year) : '',
            url: this.pageUrl(),
            version: this.version,
            detail: this.detail.value,
            basis: this.basis.value,
        };
    }
    pageUrl() {
        const u = new URL(location.href);
        if (this.ctx.year)
            u.searchParams.set('year', String(this.ctx.year));
        return u.toString();
    }
    say(text, kind = 'info') {
        this.status.textContent = text;
        this.status.className = 'fb-status is-' + kind;
    }
    async submit() {
        const d = this.draft();
        const missing = missingFields(d);
        if (missing.length)
            return this.say('还差：' + missing.join('、'), 'err');
        if (!this.agree.checked)
            return this.say('请先勾选「知道这条反馈会公开」', 'err');
        if (this.honeypot.value)
            return this.say('提交失败，请刷新页面再试', 'err');
        if (!this.meta.endpoint) {
            window.open(githubIssueUrl(this.meta.repo, d), '_blank', 'noopener');
            return this.say('已在新窗口打开 GitHub 的新建 issue 页，点 Submit 完成。没有账号的话用邮件发送。', 'info');
        }
        this.submitBtn.disabled = true;
        this.say('正在提交…');
        try {
            const res = await fetch(this.meta.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...payloadOf(d), hp: this.honeypot.value }),
            });
            const body = (await res.json().catch(() => ({})));
            if (!res.ok || !body.number)
                throw new Error(body.error || '状态码 ' + res.status);
            this.say('已提交，编号 #' + body.number + '（在 GitHub 上公开处理）', 'ok');
            this.status.insertAdjacentHTML('beforeend', body.url ? ' <a href="' + body.url + '" target="_blank" rel="noreferrer">查看</a>' : '');
            this.detail.value = '';
            this.basis.value = '';
            this.agree.checked = false;
        }
        catch (err) {
            this.say('提交失败：' + (err instanceof Error ? err.message : String(err)) + '。可以改用邮件发送。', 'err');
        }
        finally {
            this.submitBtn.disabled = false;
        }
    }
    sendMail() {
        const d = this.draft();
        const missing = missingFields(d);
        if (missing.length)
            return this.say('还差：' + missing.join('、') + '（邮件里也要写清楚）', 'err');
        location.href = mailtoUrl(this.meta.email, d);
        this.say('已打开你的邮件客户端；没有反应的话，直接发到 ' + this.meta.email, 'info');
    }
}
