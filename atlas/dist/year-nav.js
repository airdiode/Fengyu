/**
 * 年份步进的纯逻辑：和键盘事件分开，方便单测。
 *
 * ←/→ 走一年，Shift+←/→ 走十年（「十年一格」的快切）。
 * 走到 1840/1949 就钳住，不绕回去。
 */
export const YEAR_FROM = 1840;
export const YEAR_TO = 1949;
/** 十年快切的档位；改这里就同时改了提示与行为。 */
export const YEAR_STEP_FAST = 10;
/**
 * 按一次左右键后的年份；不该动时返回 null（不是左右键，或已经顶到端点）。
 */
export function yearStep(year, key, shiftKey = false) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight')
        return null;
    const dir = key === 'ArrowRight' ? 1 : -1;
    const next = Math.min(YEAR_TO, Math.max(YEAR_FROM, Math.round(year) + dir * (shiftKey ? YEAR_STEP_FAST : 1)));
    return next === year ? null : next;
}
