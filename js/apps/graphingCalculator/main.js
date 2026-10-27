// Graphing Calculator — plot y = f(x) from typed expressions.
//
// The parser is a small recursive-descent one (no eval): numbers, the
// variable x, pi/e, the usual functions, implicit multiplication (2x,
// 3(x+1), (x+1)(x-1)) and right-associative powers. Plotting samples once
// per pixel, so what you see is the real function, not a fitted polyline.
import { createApp, FileSystem } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';
import Users from '../../modules/users.js';

const PICTURES = () => Users.home(['Pictures']);

const CONSTANTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: Math.PI * 2 };
const FUNCS = {
    sin: [1, Math.sin],
    cos: [1, Math.cos],
    tan: [1, Math.tan],
    asin: [1, Math.asin],
    acos: [1, Math.acos],
    atan: [1, Math.atan],
    sinh: [1, Math.sinh],
    cosh: [1, Math.cosh],
    tanh: [1, Math.tanh],
    sqrt: [1, Math.sqrt],
    cbrt: [1, Math.cbrt],
    abs: [1, Math.abs],
    ln: [1, Math.log],
    log: [1, Math.log10],
    log2: [1, Math.log2],
    exp: [1, Math.exp],
    floor: [1, Math.floor],
    ceil: [1, Math.ceil],
    round: [1, Math.round],
    sign: [1, Math.sign],
    min: [2, Math.min],
    max: [2, Math.max],
    atan2: [2, Math.atan2],
    pow: [2, Math.pow]
};

const COLORS = ['#38bdf8', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa', '#fb7185'];
const DEFAULT_EXPRESSIONS = ['sin(x)', 'x^2/4 - 2'];

function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (/[0-9.]/.test(ch)) {
            let j = i;
            while (j < src.length && /[0-9.]/.test(src[j])) j++;
            if (src[j] === 'e' || src[j] === 'E') {
                let k = j + 1;
                if (src[k] === '+' || src[k] === '-') k++;
                if (/[0-9]/.test(src[k] || '')) {
                    k++;
                    while (k < src.length && /[0-9]/.test(src[k])) k++;
                    j = k;
                }
            }
            const text = src.slice(i, j);
            const value = Number(text);
            if (!Number.isFinite(value)) throw new Error(`"${text}" is not a number.`);
            tokens.push({ t: 'num', v: value });
            i = j;
            continue;
        }
        if (/[a-zA-Z_\u03b1-\u03c9]/.test(ch)) {
            let j = i;
            while (j < src.length && /[a-zA-Z0-9_\u03b1-\u03c9]/.test(src[j])) j++;
            tokens.push({ t: 'id', v: src.slice(i, j).toLowerCase() });
            i = j;
            continue;
        }
        if ('+-*/^%(),'.includes(ch)) {
            tokens.push({ t: ch });
            i++;
            continue;
        }
        throw new Error(`Unexpected character "${ch}".`);
    }
    tokens.push({ t: 'end' });
    return tokens;
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek() { return this.tokens[this.pos]; }

    next() { return this.tokens[this.pos++]; }

    eat(t) {
        if (this.peek().t === t) { this.pos++; return true; }
        return false;
    }

    expression() {
        let node = this.term();
        while (this.peek().t === '+' || this.peek().t === '-') {
            const op = this.next().t;
            node = { type: 'binary', op, left: node, right: this.term() };
        }
        return node;
    }

    term() {
        let node = this.unary();
        for (;;) {
            const t = this.peek().t;
            if (t === '*' || t === '/' || t === '%') {
                this.next();
                node = { type: 'binary', op: t, left: node, right: this.unary() };
                continue;
            }
            // Implicit multiplication: 2x, 3(x+1), (x+1)(x-1), x sin(x).
            if (t === 'num' || t === 'id' || t === '(') {
                node = { type: 'binary', op: '*', left: node, right: this.unary() };
                continue;
            }
            break;
        }
        return node;
    }

    unary() {
        const t = this.peek().t;
        if (t === '-') { this.next(); return { type: 'neg', value: this.unary() }; }
        if (t === '+') { this.next(); return this.unary(); }
        return this.power();
    }

    power() {
        const base = this.primary();
        if (this.peek().t === '^') {
            this.next();
            return { type: 'binary', op: '^', left: base, right: this.unary() };
        }
        return base;
    }

    primary() {
        const tok = this.next();
        if (tok.t === 'num') return { type: 'num', value: tok.v };
        if (tok.t === '(') {
            const node = this.expression();
            if (!this.eat(')')) throw new Error('Missing a closing parenthesis.');
            return node;
        }
        if (tok.t === 'id') {
            const name = tok.v;
            if (this.peek().t === '(' && FUNCS[name]) {
                this.next();
                const args = [];
                if (this.peek().t !== ')') {
                    args.push(this.expression());
                    while (this.eat(',')) args.push(this.expression());
                }
                if (!this.eat(')')) throw new Error(`Missing a closing parenthesis after ${name}(.`);
                const spec = FUNCS[name];
                if (args.length !== spec[0]) {
                    throw new Error(`${name}() takes ${spec[0]} value${spec[0] === 1 ? '' : 's'}.`);
                }
                return { type: 'call', name, args };
            }
            if (name === 'x') return { type: 'var' };
            if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
                return { type: 'num', value: CONSTANTS[name] };
            }
            throw new Error(`Unknown name "${name}". Use x, pi, or a function such as sin.`);
        }
        if (tok.t === 'end') throw new Error('The expression is incomplete.');
        throw new Error(`Unexpected "${tok.t}".`);
    }

    parse() {
        const node = this.expression();
        if (this.peek().t !== 'end') throw new Error(`Unexpected "${this.peek().t}".`);
        return node;
    }
}

function evalNode(node, x) {
    switch (node.type) {
        case 'num': return node.value;
        case 'var': return x;
        case 'neg': return -evalNode(node.value, x);
        case 'binary': {
            const a = evalNode(node.left, x);
            const b = evalNode(node.right, x);
            switch (node.op) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                case '/': return a / b;
                case '%': return a % b;
                case '^': return Math.pow(a, b);
                default: return NaN;
            }
        }
        case 'call': {
            const spec = FUNCS[node.name];
            return spec[1](...node.args.map(a => evalNode(a, x)));
        }
        default: return NaN;
    }
}

/**
 * Compile an expression into a function of x.
 * @param {string} expr
 * @returns {(x:number)=>number}
 * @throws {Error} with a readable message on a syntax error
 */
export function compile(expr) {
    const text = String(expr || '').trim();
    if (!text) throw new Error('Type an expression, for example sin(x).');
    const ast = new Parser(tokenize(text)).parse();
    return (x) => evalNode(ast, x);
}

/**
 * Evaluate an expression at one point.
 * @param {string} expr
 * @param {number} [x]
 * @returns {number}
 */
export function evaluate(expr, x = 0) {
    return compile(expr)(x);
}

function niceStep(raw) {
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return mult * pow;
}

function fmt(v, step) {
    if (!Number.isFinite(v)) return '';
    const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step))));
    const s = v.toFixed(decimals);
    return s === '-0' ? '0' : s;
}

function getContent() {
    return `
        <div class="gc-root" style="display:flex;height:100%;background:#12141a;color:#e6e6ea;font-family:'Segoe UI',sans-serif;">
            <div style="width:236px;flex:none;display:flex;flex-direction:column;background:#1a1c23;border-right:1px solid #2a2d36;min-height:0;">
                <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #2a2d36;">
                    <span style="font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:#9aa0ad;">Functions</span>
                    <div style="flex:1;"></div>
                    <button class="gc-add" title="Add a function" style="background:var(--accent-color);border:none;border-radius:5px;color:#fff;width:24px;height:24px;font-size:16px;line-height:1;cursor:pointer;">+</button>
                </div>
                <div class="gc-list" style="padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:none;max-height:44%;"></div>
                <div class="gc-panels" style="flex:1;overflow-y:auto;border-top:1px solid #2a2d36;padding:10px 12px;min-height:0;">
                    <div class="gc-roots"></div>
                </div>
                <div style="display:flex;gap:6px;padding:8px 10px;border-top:1px solid #2a2d36;">
                    <button class="gc-zoom-out" title="Zoom out" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #35394a;border-radius:5px;color:#e6e6ea;padding:5px;font-size:13px;cursor:pointer;">−</button>
                    <button class="gc-zoom-in" title="Zoom in" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #35394a;border-radius:5px;color:#e6e6ea;padding:5px;font-size:13px;cursor:pointer;">+</button>
                    <button class="gc-reset" title="Reset the view" style="flex:1.6;background:rgba(255,255,255,0.07);border:1px solid #35394a;border-radius:5px;color:#e6e6ea;padding:5px;font-size:11px;cursor:pointer;">Reset</button>
                    <button class="gc-export" title="Save the graph as a PNG" style="flex:1.6;background:rgba(255,255,255,0.07);border:1px solid #35394a;border-radius:5px;color:#e6e6ea;padding:5px;font-size:11px;cursor:pointer;">Save PNG</button>
                </div>
            </div>
            <div style="flex:1;position:relative;min-width:0;background:#0f1116;">
                <canvas class="gc-canvas" style="position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair;"></canvas>
                <div class="gc-readout" style="position:absolute;left:10px;bottom:10px;background:rgba(12,14,19,0.86);border:1px solid #2a2d36;border-radius:6px;padding:6px 10px;font-size:11px;color:#c9cdd6;pointer-events:none;line-height:1.5;white-space:pre;"></div>
                <div class="gc-hint" style="position:absolute;right:10px;bottom:10px;font-size:11px;color:#5f6470;pointer-events:none;">Drag to pan · scroll to zoom · double-click to reset</div>
            </div>
        </div>`;
}

function launch() {
    const app = createApp({ id: 'graphingCalculator', name: 'Graphing Calculator' });
    const win = app.window.create({
        title: 'Graphing Calculator',
        icon: app.icon(),
        content: getContent(),
        width: 1020,
        height: 660,
        minWidth: 620,
        minHeight: 420
    });
    const el = win.element;
    const canvas = el.querySelector('.gc-canvas');
    const ctx = canvas.getContext('2d');
    const list = el.querySelector('.gc-list');
    const rootsEl = el.querySelector('.gc-roots');
    const readout = el.querySelector('.gc-readout');

    const view = { cx: 0, cy: 0, span: 20 };
    let entries = [];
    let nextId = 1;
    let dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    let trace = null;
    let panning = null;
    let frame = 0;
    let closed = false;

    function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            draw();
        });
    }

    function bounds() {
        const w = canvas.clientWidth || 1;
        const h = canvas.clientHeight || 1;
        const spanX = view.span;
        const spanY = spanX * (h / w);
        return {
            w, h, spanX, spanY,
            xMin: view.cx - spanX / 2,
            xMax: view.cx + spanX / 2,
            yMin: view.cy - spanY / 2,
            yMax: view.cy + spanY / 2
        };
    }

    const toPx = (x, b) => (x - b.xMin) / b.spanX * b.w;
    const toPy = (y, b) => b.h - (y - b.yMin) / b.spanY * b.h;

    function draw() {
        const b = bounds();
        const cw = Math.max(1, Math.round(b.w * dpr));
        const ch = Math.max(1, Math.round(b.h * dpr));
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#0f1116';
        ctx.fillRect(0, 0, b.w, b.h);

        const step = niceStep(b.spanX / 10);
        const minor = step / 5;

        // Minor grid
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.045)';
        ctx.beginPath();
        for (let x = Math.ceil(b.xMin / minor) * minor; x <= b.xMax; x += minor) {
            const px = Math.round(toPx(x, b)) + 0.5;
            ctx.moveTo(px, 0);
            ctx.lineTo(px, b.h);
        }
        for (let y = Math.ceil(b.yMin / minor) * minor; y <= b.yMax; y += minor) {
            const py = Math.round(toPy(y, b)) + 0.5;
            ctx.moveTo(0, py);
            ctx.lineTo(b.w, py);
        }
        ctx.stroke();

        // Major grid
        ctx.strokeStyle = 'rgba(255,255,255,0.11)';
        ctx.beginPath();
        for (let x = Math.ceil(b.xMin / step) * step; x <= b.xMax; x += step) {
            const px = Math.round(toPx(x, b)) + 0.5;
            ctx.moveTo(px, 0);
            ctx.lineTo(px, b.h);
        }
        for (let y = Math.ceil(b.yMin / step) * step; y <= b.yMax; y += step) {
            const py = Math.round(toPy(y, b)) + 0.5;
            ctx.moveTo(0, py);
            ctx.lineTo(b.w, py);
        }
        ctx.stroke();

        // Axes
        const ax = toPx(0, b);
        const ay = toPy(0, b);
        ctx.strokeStyle = 'rgba(220,225,235,0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        if (ay >= 0 && ay <= b.h) { ctx.moveTo(0, ay); ctx.lineTo(b.w, ay); }
        if (ax >= 0 && ax <= b.w) { ctx.moveTo(ax, 0); ctx.lineTo(ax, b.h); }
        ctx.stroke();

        // Tick labels
        ctx.fillStyle = '#7b818d';
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let x = Math.ceil(b.xMin / step) * step; x <= b.xMax; x += step) {
            if (Math.abs(x) < step / 2) continue;
            const px = toPx(x, b);
            const py = Math.min(Math.max(ay + 4, 2), b.h - 14);
            ctx.fillText(fmt(x, step), px, py);
        }
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let y = Math.ceil(b.yMin / step) * step; y <= b.yMax; y += step) {
            if (Math.abs(y) < step / 2) continue;
            const py = toPy(y, b);
            const px = Math.min(Math.max(ax - 6, 26), b.w - 4);
            ctx.fillText(fmt(y, step), px, py);
        }

        // Functions
        const drawable = entries.filter(e => e.visible && e.fn);
        drawable.forEach(entry => {
            ctx.strokeStyle = entry.color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            let pen = false;
            let prevPy = 0;
            const xStep = b.spanX / Math.max(1, b.w);
            for (let px = 0; px <= b.w; px++) {
                const x = b.xMin + px * xStep;
                let y;
                try { y = entry.fn(x); } catch { y = NaN; }
                if (!Number.isFinite(y)) { pen = false; continue; }
                const py = toPy(y, b);
                // Break the line across a vertical asymptote instead of
                // drawing the connecting spike.
                if (pen && Math.abs(py - prevPy) > b.h * 1.5) pen = false;
                if (!pen) { ctx.moveTo(px, py); pen = true; }
                else ctx.lineTo(px, py);
                prevPy = py;
            }
            ctx.stroke();
        });

        // Trace markers
        if (trace) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath();
            ctx.moveTo(trace.px, 0);
            ctx.lineTo(trace.px, b.h);
            ctx.stroke();
            ctx.restore();
            drawable.forEach(entry => {
                let y;
                try { y = entry.fn(trace.x); } catch { y = NaN; }
                if (!Number.isFinite(y)) return;
                const py = toPy(y, b);
                if (py < -20 || py > b.h + 20) return;
                ctx.fillStyle = entry.color;
                ctx.beginPath();
                ctx.arc(trace.px, py, 3.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    // ---------- expression list ----------

    function compileEntry(entry) {
        entry.fn = null;
        entry.error = '';
        entry.label = `f${entry.index}(x)`;
        if (!entry.text.trim()) return;
        try {
            entry.fn = compile(entry.text);
        } catch (err) {
            entry.error = err.message || 'Invalid expression';
        }
    }

    let rootsTimer = 0;
    function updateRoots() {
        clearTimeout(rootsTimer);
        rootsTimer = setTimeout(computeRoots, 120);
    }

    function computeRoots() {
        const b = bounds();
        const found = [];
        entries.filter(e => e.visible && e.fn).forEach(entry => {
            const samples = 600;
            const dx = b.spanX / samples;
            let prevX = b.xMin;
            let prevY = entry.fn(prevX);
            for (let i = 1; i <= samples; i++) {
                const x = b.xMin + i * dx;
                let y;
                try { y = entry.fn(x); } catch { y = NaN; }
                if (Number.isFinite(prevY) && Number.isFinite(y)) {
                    if (y === 0) {
                        found.push({ color: entry.color, x, label: entry.label });
                    } else if (prevY * y < 0) {
                        // Bisect for a precise root.
                        let lo = prevX;
                        let hi = x;
                        let flo = prevY;
                        for (let k = 0; k < 48; k++) {
                            const mid = (lo + hi) / 2;
                            let fm;
                            try { fm = entry.fn(mid); } catch { fm = NaN; }
                            if (!Number.isFinite(fm)) break;
                            if (flo * fm <= 0) { hi = mid; } else { lo = mid; flo = fm; }
                        }
                        found.push({ color: entry.color, x: (lo + hi) / 2, label: entry.label });
                    }
                }
                prevX = x;
                prevY = y;
            }
        });
        const unique = [];
        found.forEach(r => {
            if (!unique.some(u => u.label === r.label && Math.abs(u.x - r.x) < b.spanX * 1e-4)) unique.push(r);
        });
        if (!unique.length) {
            rootsEl.innerHTML = '<div style="font-size:11px;color:#5f6470;line-height:1.5;">Roots (x-intercepts) in this view appear here.</div>';
            return;
        }
        rootsEl.innerHTML = `
            <div style="font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:#9aa0ad;margin-bottom:6px;">Roots</div>
            ${unique.slice(0, 24).map(r => `
                <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#c9cdd6;padding:2px 0;">
                    <span style="width:7px;height:7px;border-radius:50%;background:${r.color};flex:none;"></span>
                    <span style="color:#7b818d;">${r.label}:</span>
                    <span>x = ${Number(r.x.toFixed(6))}</span>
                </div>`).join('')}`;
    }

    function renderList() {
        list.innerHTML = '';
        entries.forEach(entry => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
            row.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;">
                    <input class="gc-vis" type="checkbox" ${entry.visible ? 'checked' : ''} title="Show this function" style="accent-color:${entry.color};margin:0;cursor:pointer;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${entry.color};flex:none;"></span>
                    <input class="gc-expr" type="text" value="${entry.text.replace(/"/g, '&quot;')}" spellcheck="false"
                        style="flex:1;min-width:0;background:#12141a;border:1px solid ${entry.error ? '#b91c1c' : '#35394a'};border-radius:5px;color:#e6e6ea;padding:5px 7px;font-size:12px;font-family:Consolas,monospace;">
                    <button class="gc-del" title="Remove" style="background:none;border:none;color:#6b7280;font-size:14px;cursor:pointer;padding:0 2px;">×</button>
                </div>
                ${entry.error ? `<div style="font-size:10px;color:#f87171;padding-left:20px;line-height:1.4;">${entry.error}</div>` : ''}`;
            const expr = row.querySelector('.gc-expr');
            const vis = row.querySelector('.gc-vis');
            expr.addEventListener('input', () => {
                entry.text = expr.value;
                compileEntry(entry);
                entry.label = `f${entry.index}(x)`;
                if (!entry.error) expr.style.borderColor = '#35394a';
                else expr.style.borderColor = '#b91c1c';
                schedule();
                updateRoots();
            });
            expr.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') expr.blur();
            });
            vis.addEventListener('change', () => {
                entry.visible = vis.checked;
                schedule();
                updateRoots();
            });
            row.querySelector('.gc-del').addEventListener('click', () => {
                entries = entries.filter(e => e !== entry);
                entries.forEach((e, i) => { e.index = i + 1; });
                renderList();
                schedule();
                updateRoots();
            });
            list.appendChild(row);
        });
    }

    function addExpression(text) {
        const entry = {
            id: nextId++,
            text: text || '',
            color: COLORS[entries.length % COLORS.length],
            visible: true,
            index: entries.length + 1,
            fn: null,
            error: ''
        };
        entry.label = `f${entry.index}(x)`;
        entries.push(entry);
        compileEntry(entry);
        renderList();
        schedule();
        updateRoots();
        const inputs = list.querySelectorAll('.gc-expr');
        const last = inputs[inputs.length - 1];
        if (last) { last.focus(); last.select(); }
    }

    // ---------- interaction ----------

    function zoomAt(clientX, factor) {
        const rect = canvas.getBoundingClientRect();
        const b = bounds();
        const fx = (clientX - rect.left) / rect.width;
        const xUnder = b.xMin + fx * b.spanX;
        const next = Math.min(1e7, Math.max(1e-5, view.span * factor));
        const ratio = next / view.span;
        view.cx = xUnder - (xUnder - view.cx) * ratio;
        view.span = next;
        schedule();
        updateRoots();
    }

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomAt(e.clientX, e.deltaY > 0 ? 1.14 : 1 / 1.14);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        canvas.setPointerCapture(e.pointerId);
        panning = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    });

    canvas.addEventListener('pointermove', (e) => {
        if (panning) {
            const rect = canvas.getBoundingClientRect();
            const dx = e.clientX - panning.x;
            const dy = e.clientY - panning.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panning.moved = true;
            const b = bounds();
            view.cx = panning.cx - dx / rect.width * b.spanX;
            view.cy = panning.cy + dy / rect.height * b.spanY;
            trace = null;
            readout.textContent = '';
            schedule();
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const b = bounds();
        const fx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const x = b.xMin + fx * b.spanX;
        trace = { x, px: fx * b.w };
        const lines = [`x = ${Number(x.toFixed(5))}`];
        entries.filter(en => en.visible && en.fn).forEach(en => {
            let y;
            try { y = en.fn(x); } catch { y = NaN; }
            lines.push(`${en.label} = ${Number.isFinite(y) ? Number(y.toFixed(5)) : 'undefined'}`);
        });
        readout.textContent = lines.join('\n');
        schedule();
    });

    const endPan = (e) => {
        if (!panning) return;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        panning = null;
        updateRoots();
    };
    canvas.addEventListener('pointerup', endPan);
    canvas.addEventListener('pointercancel', endPan);
    canvas.addEventListener('pointerleave', () => {
        if (panning) return;
        trace = null;
        readout.textContent = '';
        schedule();
    });
    canvas.addEventListener('dblclick', () => resetView());

    function resetView() {
        view.cx = 0;
        view.cy = 0;
        view.span = 20;
        trace = null;
        readout.textContent = '';
        schedule();
        updateRoots();
    }

    el.querySelector('.gc-reset').addEventListener('click', resetView);
    el.querySelector('.gc-zoom-in').addEventListener('click', () => {
        const rect = canvas.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, 1 / 1.4);
    });
    el.querySelector('.gc-zoom-out').addEventListener('click', () => {
        const rect = canvas.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, 1.4);
    });
    el.querySelector('.gc-add').addEventListener('click', () => addExpression(''));

    async function exportPng() {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
            app.notify.info('Graphing Calculator', 'The graph could not be encoded.');
            return;
        }
        const q = await FileSystem.pickSave({
            defaultName: 'Graph.png',
            defaultPath: PICTURES(),
            extensions: [{ value: 'png', label: 'PNG image' }],
            parentApp: 'graphingCalculator'
        });
        if (!q) return;
        const ok = await FileSystem.writeBlob(q.path, q.fullName, blob, 'png');
        if (ok) app.notify.info('Graphing Calculator', `Saved ${q.fullName}.`);
    }
    el.querySelector('.gc-export').addEventListener('click', exportPng);

    const ro = new ResizeObserver(() => {
        dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
        schedule();
        updateRoots();
    });
    ro.observe(canvas);

    const onClosed = (e) => {
        if (!e.detail || e.detail.id !== win.id) return;
        closed = true;
        window.removeEventListener('window-closed', onClosed);
        ro.disconnect();
        cancelAnimationFrame(frame);
        clearTimeout(rootsTimer);
    };
    window.addEventListener('window-closed', onClosed);

    DEFAULT_EXPRESSIONS.forEach(text => {
        const entry = {
            id: nextId++,
            text,
            color: COLORS[entries.length % COLORS.length],
            visible: true,
            index: entries.length + 1,
            fn: null,
            error: ''
        };
        entry.label = `f${entry.index}(x)`;
        entries.push(entry);
        compileEntry(entry);
    });
    renderList();
    schedule();
    updateRoots();

    if (!closed) app.shell.activity.trackAppOpen('graphingCalculator');
}

export default { launch, icon: AppIcons.get('graphingCalculator') };
