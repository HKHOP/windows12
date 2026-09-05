import WindowManager from '../modules/windowManager.js';
import AppIcons from '../modules/appIcons.js';

const Calculator = (() => {
    const icon = AppIcons.get('calculator');

    function getContent() {
        return `
            <div style="display:flex;flex-direction:column;height:100%;padding:8px;gap:6px;">
                <div class="calc-display" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:12px 16px;text-align:right;min-height:72px;display:flex;flex-direction:column;justify-content:flex-end;">
                    <div class="calc-expression" style="font-size:13px;color:var(--text-secondary);height:20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;"></div>
                    <div class="calc-result" style="font-size:32px;font-weight:300;color:var(--text-primary);line-height:1.2;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">0</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;flex:1;">
                    ${btn('calc-btn','CE','rgba(255,255,255,0.06)','var(--text-primary)','13px','')}
                    ${btn('calc-btn','C','rgba(255,255,255,0.06)','var(--text-primary)','13px','')}
                    ${btn('calc-btn','⌫','rgba(255,255,255,0.06)','var(--text-primary)','16px','')}
                    ${btn('calc-btn','÷','rgba(255,255,255,0.06)','var(--text-primary)','16px','')}
                    ${btn('calc-btn','7','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','8','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','9','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','×','rgba(255,255,255,0.06)','var(--text-primary)','16px','')}
                    ${btn('calc-btn','4','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','5','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','6','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','-','rgba(255,255,255,0.06)','var(--text-primary)','16px','')}
                    ${btn('calc-btn','1','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','2','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','3','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','+','rgba(255,255,255,0.06)','var(--text-primary)','16px','')}
                    ${btn('calc-btn','±','rgba(255,255,255,0.06)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','0','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn','.','var(--button-bg,#2d2d2d)','var(--text-primary)','15px','')}
                    ${btn('calc-btn-eq','=','var(--accent-color,#0078D4)','white','18px','font-weight:600;')}
                </div>
            </div>
        `;
    }

    function btn(cls, label, bg, color, fontSize, extra) {
        return `<button class="${cls}" data-val="${label}" style="background:${bg};color:${color};border:none;border-radius:4px;font-size:${fontSize};cursor:pointer;transition:background 0.12s,transform 0.08s;display:flex;align-items:center;justify-content:center;padding:0;${extra}" onmouseenter="this.style.background='rgba(255,255,255,0.12)'" onmouseleave="this.style.background='${bg}'">${label}</button>`;
    }

    function launch() {
        const win = WindowManager.createWindow('calculator', 'Calculator', icon, getContent(), { width: 320, height: 460 });

        const expressionEl = win.element.querySelector('.calc-expression');
        const resultEl = win.element.querySelector('.calc-result');
        const buttons = win.element.querySelectorAll('.calc-btn, .calc-btn-eq');

        let current = '0';
        let previous = '';
        let operator = null;
        let resetNext = false;
        let lastResult = null;

        function updateDisplay() {
            resultEl.textContent = current;
            if (operator && previous) {
                const opSymbol = operator === '*' ? '×' : operator === '/' ? '÷' : operator;
                expressionEl.textContent = `${previous} ${opSymbol}`;
            } else {
                expressionEl.textContent = '';
            }
        }

        function formatNumber(num) {
            if (num === null || num === undefined) return '0';
            if (typeof num === 'string') return num;
            if (!isFinite(num)) return 'Error';
            const str = String(num);
            if (str.length > 16) {
                const n = parseFloat(num.toPrecision(12));
                return String(n);
            }
            return str;
        }

        function calculate(a, op, b) {
            const x = parseFloat(a);
            const y = parseFloat(b);
            if (isNaN(x) || isNaN(y)) return 'Error';
            switch (op) {
                case '+': return x + y;
                case '-': return x - y;
                case '*': return x * y;
                case '/': return y === 0 ? 'Error' : x / y;
                default: return y;
            }
        }

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.val;

                if (val >= '0' && val <= '9' || val === '.') {
                    if (resetNext) {
                        current = val === '.' ? '0.' : val;
                        resetNext = false;
                    } else {
                        if (val === '.' && current.includes('.')) return;
                        current = current === '0' && val !== '.' ? val : current + val;
                    }
                    updateDisplay();
                } else if (val === '±') {
                    if (current !== '0' && current !== 'Error') {
                        current = current.startsWith('-') ? current.slice(1) : '-' + current;
                    }
                    updateDisplay();
                } else if (val === 'CE') {
                    current = '0';
                    updateDisplay();
                } else if (val === 'C') {
                    current = '0';
                    previous = '';
                    operator = null;
                    resetNext = false;
                    lastResult = null;
                    updateDisplay();
                } else if (val === '⌫') {
                    if (current.length > 1) {
                        current = current.slice(0, -1);
                        if (current === '-') current = '0';
                    } else {
                        current = '0';
                    }
                    updateDisplay();
                } else if (['+', '-', '×', '÷'].includes(val)) {
                    const opMap = { '×': '*', '÷': '/' };
                    const actualOp = opMap[val] || val;

                    if (operator && !resetNext) {
                        const result = calculate(previous, operator, current);
                        current = formatNumber(result);
                        previous = current;
                    } else {
                        previous = current;
                    }

                    operator = actualOp;
                    resetNext = true;
                    updateDisplay();
                } else if (val === '=') {
                    if (operator && previous) {
                        const result = calculate(previous, operator, current);
                        expressionEl.textContent = `${previous} ${operator === '*' ? '×' : operator === '/' ? '÷' : operator} ${current} =`;
                        current = formatNumber(result);
                        previous = '';
                        operator = null;
                        resetNext = true;
                    }
                    updateDisplay();
                } else if (val === '%') {
                    if (previous && operator) {
                        current = formatNumber((parseFloat(previous) * parseFloat(current)) / 100);
                    } else {
                        current = formatNumber(parseFloat(current) / 100);
                    }
                    updateDisplay();
                }
            });

            btn.addEventListener('mousedown', () => {
                btn.style.transform = 'scale(0.95)';
            });
            btn.addEventListener('mouseup', () => {
                btn.style.transform = '';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = '';
            });
        });

        win.element.addEventListener('keydown', (e) => {
            const keyMap = {
                '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
                '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
                '.': '.', '+': '+', '-': '-', '*': '×', '/': '÷',
                'Enter': '=', '=': '=', 'Backspace': '⌫', 'Delete': 'CE',
                'Escape': 'C', '%': '%'
            };
            const mapped = keyMap[e.key];
            if (mapped) {
                e.preventDefault();
                const target = win.element.querySelector(`.calc-btn[data-val="${mapped}"],.calc-btn-eq[data-val="${mapped}"]`);
                if (target) target.click();
            }
        });

        updateDisplay();
    }

    return { launch };
})();

export default Calculator;
