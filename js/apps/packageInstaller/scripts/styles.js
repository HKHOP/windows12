// Package Installer — wizard chrome. One shared <style> for every installer
// window (builtin app, so it never needs to be removed).
const STYLE_ID = 'w12-package-installer-styles';

export const CSS = `
.pi-root {
    display: flex;
    height: 100%;
    min-height: 0;
    background: #202020;
    color: var(--text-primary, #fff);
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
    overflow: hidden;
}
.pi-side {
    width: 200px;
    flex-shrink: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px 18px;
    box-sizing: border-box;
    background: linear-gradient(155deg, #0c3a69 0%, #0078d4 100%);
    overflow: hidden;
}
.pi-side.has-banner { background-size: cover; background-position: center; }
.pi-side::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.58));
    pointer-events: none;
}
.pi-side > * { position: relative; z-index: 1; }
.pi-logo, .pi-logo-fallback {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    object-fit: contain;
    background: rgba(255,255,255,0.14);
    box-shadow: 0 4px 14px rgba(0,0,0,0.28);
}
.pi-logo-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 600;
}
.pi-brand-name { font-size: 15px; font-weight: 600; line-height: 1.3; }
.pi-brand-sub { font-size: 11.5px; opacity: 0.82; margin-top: 3px; line-height: 1.35; }
.pi-side-foot {
    margin-top: auto;
    font-size: 10.5px;
    opacity: 0.72;
    line-height: 1.45;
}
.pi-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: #202020;
}
.pi-head { padding: 22px 24px 8px; }
.pi-title { margin: 0 0 6px; font-size: 20px; font-weight: 600; line-height: 1.25; }
.pi-sub { margin: 0; font-size: 12.5px; line-height: 1.5; color: #a9a9a9; }
.pi-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 6px 24px 14px;
    font-size: 13px;
    line-height: 1.5;
}
.pi-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 24px 18px;
    border-top: 1px solid rgba(255,255,255,0.07);
}
.pi-spacer { flex: 1; }
.pi-btn {
    min-width: 84px;
    padding: 7px 18px;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.07);
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
}
.pi-btn:hover:not(:disabled) { background: rgba(255,255,255,0.13); }
.pi-btn.primary {
    background: var(--pi-accent, #0078d4);
    border-color: transparent;
    color: #fff;
    font-weight: 600;
}
.pi-btn.primary:hover:not(:disabled) { filter: brightness(1.12); }
.pi-btn:disabled { opacity: 0.42; cursor: default; }
.pi-link {
    border: none;
    background: none;
    color: var(--pi-accent, #4cc2ff);
    padding: 0;
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
}
.pi-info { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.pi-row {
    display: flex;
    gap: 12px;
    padding: 9px 12px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    background: rgba(255,255,255,0.025);
    font-size: 12.5px;
}
.pi-row b { color: #fff; font-weight: 600; }
.pi-row span { color: #b6b6b6; }
.pi-note {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid rgba(255,196,0,0.35);
    background: rgba(255,196,0,0.08);
    font-size: 12px;
    color: #f0d48a;
    line-height: 1.45;
}
.pi-eula {
    margin: 10px 0 12px;
    max-height: 210px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: 12px 14px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    background: #161616;
    color: #d0d0d0;
    font-family: 'Cascadia Mono', Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.55;
    user-select: text;
}
.pi-accept {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12.5px;
    cursor: pointer;
    user-select: none;
}
.pi-accept input { margin-top: 2px; accent-color: var(--pi-accent, #0078d4); }
.pi-group { margin-top: 18px; }
.pi-group-title { font-size: 12px; font-weight: 600; color: #d7d7d7; margin-bottom: 8px; }
.pi-choice {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 9px 11px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: rgba(255,255,255,0.035);
    margin-bottom: 6px;
    cursor: pointer;
}
.pi-choice:hover { background: rgba(255,255,255,0.06); }
.pi-choice input { margin-top: 2px; accent-color: var(--pi-accent, #0078d4); flex-shrink: 0; }
.pi-choice-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pi-choice-name { font-size: 12.5px; font-weight: 500; color: #fff; }
.pi-choice-desc { font-size: 11.5px; color: #9e9e9e; line-height: 1.4; }
.pi-choice.locked { opacity: 0.75; cursor: default; }
.pi-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.pi-field label { font-size: 12px; color: #d8d8d8; }
.pi-field input[type="text"], .pi-field input[type="password"], .pi-field select {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 9px;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.16);
    background: #161616;
    color: #fff;
    font: inherit;
    font-size: 12.5px;
}
.pi-field input:focus, .pi-field select:focus { outline: 2px solid var(--pi-accent, #0078d4); outline-offset: -1px; }
.pi-field .pi-help { font-size: 11px; color: #8e8e8e; }
.pi-checkline { display: flex; align-items: center; gap: 8px; font-size: 12.5px; margin-bottom: 12px; }
.pi-checkline input { accent-color: var(--pi-accent, #0078d4); }
.pi-progress {
    height: 8px;
    border-radius: 4px;
    background: rgba(255,255,255,0.1);
    overflow: hidden;
    margin: 20px 0 10px;
}
.pi-progress-fill {
    width: 0%;
    height: 100%;
    border-radius: inherit;
    background: var(--pi-accent, #0078d4);
    transition: width 0.16s ease-out;
}
.pi-status { font-size: 12px; color: #a9a9a9; display: flex; justify-content: space-between; gap: 12px; }
.pi-finish-icon {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 18px 0 14px;
    background: rgba(76, 194, 255, 0.16);
    color: var(--pi-accent, #4cc2ff);
}
.pi-finish-icon.bad { background: rgba(255, 92, 92, 0.14); color: #ff8484; }
.pi-finish-title { font-size: 17px; font-weight: 600; margin-bottom: 6px; }
.pi-finish-text { font-size: 12.5px; color: #a9a9a9; line-height: 1.5; white-space: pre-wrap; }
.pi-custom { height: 100%; overflow: auto; }
.pi-headless {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    box-sizing: border-box;
    padding: 24px 26px;
    background: #202020;
    color: var(--text-primary, #fff);
    font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
}
.pi-headless-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.pi-headless-head img { width: 34px; height: 34px; object-fit: contain; }
.pi-headless-title { font-size: 15px; font-weight: 600; }
.pi-headless-sub { font-size: 11.5px; color: #9e9e9e; margin-top: 2px; }
.pi-headless .pi-foot { padding: 14px 0 0; border: none; }
.pi-headless .pi-finish-icon { width: 34px; height: 34px; margin: 0; }
@media (max-width: 520px) {
    .pi-side { width: 132px; padding: 18px 14px; }
    .pi-brand-name { font-size: 13px; }
    .pi-brand-sub, .pi-side-foot { font-size: 10px; }
    .pi-head { padding: 18px 18px 6px; }
    .pi-body { padding: 4px 18px 10px; }
    .pi-foot { padding: 12px 18px 14px; }
}
@media (max-width: 400px) {
    .pi-side { display: none; }
}
`;

export function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}
