// 2048 — sliding number puzzle, keyboard + buttons, persisted best.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';

const TILE = { 2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'], 32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'], 128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'], 512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff'] };

function launch() {
    const app = createApp({ id: 'game2048', name: '2048' });
    let grid, score, over, won, announced;
    let best = 0, games = 0;
    try {
        const raw = app.files.read('stats.json');
        if (raw) { const s = JSON.parse(raw); best = s.best || 0; games = s.games || 0; }
    } catch { /* fresh */ }
    const saveStats = () => { try { app.files.write('stats.json', JSON.stringify({ best, games })); } catch { /* ignore */ } };

    const win = app.window.create({
        title: '2048', icon: app.icon(),
        content: `<div style="display:flex;flex-direction:column;height:100%;background:#1a1512;color:#fff;font-family:'Segoe UI',sans-serif;padding:14px;box-sizing:border-box;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <div style="font-size:28px;font-weight:800;color:#edc22e;">2048</div>
                <div style="margin-left:auto;display:flex;gap:6px;">
                    <div style="background:rgba(255,255,255,.08);border-radius:6px;padding:5px 10px;text-align:center;"><div style="font-size:10px;color:#aaa;">SCORE</div><div class="g-score" style="font-weight:700;">0</div></div>
                    <div style="background:rgba(255,255,255,.08);border-radius:6px;padding:5px 10px;text-align:center;"><div style="font-size:10px;color:#aaa;">BEST</div><div class="g-best" style="font-weight:700;">${best}</div></div>
                </div>
            </div>
            <div class="g-board" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;background:rgba(255,255,255,.06);border-radius:10px;padding:8px;"></div>
            <div style="display:flex;gap:6px;margin-top:10px;">
                <button class="g-new" style="flex:1;background:#edc22e;border:none;color:#4a3200;border-radius:8px;padding:9px;cursor:pointer;font-weight:700;">New game</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,44px);gap:4px;justify-content:center;margin-top:10px;">
                <span></span><button data-m="up" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:6px;padding:8px;cursor:pointer;">▲</button><span></span>
                <button data-m="left" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:6px;padding:8px;cursor:pointer;">◀</button>
                <button data-m="down" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:6px;padding:8px;cursor:pointer;">▼</button>
                <button data-m="right" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:6px;padding:8px;cursor:pointer;">▶</button>
            </div>
            <div class="g-sub" style="text-align:center;font-size:11px;color:#888;margin-top:8px;">Arrows / WASD · Best ${best} · ${games} games</div>
        </div>`,
        width: 340, height: 640
    });
    const el = win.element;
    const boardEl = el.querySelector('.g-board');

    function spawn() {
        const empty = [];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!grid[r][c]) empty.push([r, c]);
        if (!empty.length) return;
        const [r, c] = empty[Math.floor(Math.random() * empty.length)];
        grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }
    function reset() {
        grid = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
        score = 0; over = false; won = false; announced = false;
        spawn(); spawn(); games++; saveStats(); paint();
    }
    function slide(row) {
        const a = row.filter(v => v);
        for (let i = 0; i < a.length - 1; i++) {
            if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); if (a[i] === 2048) won = true; }
        }
        while (a.length < 4) a.push(0);
        return a;
    }
    function move(dir) {
        if (over) return;
        const before = JSON.stringify(grid);
        if (dir === 'left') grid = grid.map(slide);
        else if (dir === 'right') grid = grid.map(r => slide(r.slice().reverse()).reverse());
        else if (dir === 'up') { grid = transpose(grid).map(slide); grid = transpose(grid); }
        else { grid = transpose(grid).map(r => slide(r.slice().reverse()).reverse()); grid = transpose(grid); }
        if (JSON.stringify(grid) !== before) {
            spawn();
            if (score > best) { best = score; }
            saveStats();
            paint();
            if (won && !announced) {
                announced = true;
                app.dialogs.confirm('You win!', 'You reached 2048! Keep going?').then(ok => { if (!ok) reset(); });
            } else if (movesLeft()) {
                // keep playing
            } else {
                over = true; paint();
                app.dialogs.confirm('Game over', `Score: ${score}. Best: ${best}. Play again?`).then(ok => { if (ok) reset(); });
            }
        }
    }
    function transpose(g) { return g[0].map((_, c) => g.map(r => r[c])); }
    function movesLeft() {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
            if (!grid[r][c]) return true;
            if (c < 3 && grid[r][c] === grid[r][c + 1]) return true;
            if (r < 3 && grid[r][c] === grid[r + 1][c]) return true;
        }
        return false;
    }
    function paint() {
        el.querySelector('.g-score').textContent = score;
        el.querySelector('.g-best').textContent = best;
        boardEl.innerHTML = '';
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
            const v = grid[r][c];
            const [bg, fg] = TILE[v] || ['rgba(255,255,255,.08)', '#fff'];
            const d = document.createElement('div');
            d.textContent = v || '';
            d.style.cssText = `aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:8px;font-weight:700;font-size:${v >= 1024 ? '18px' : '22px'};background:${bg};color:${fg};${over ? 'opacity:.6;' : ''}`;
            boardEl.appendChild(d);
        }
        el.querySelector('.g-sub').textContent = over ? `Game over! Score ${score} · Best ${best}` : `Arrows / WASD · Best ${best} · ${games} games`;
    }

    el.querySelector('.g-new').addEventListener('click', reset);
    el.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => move(b.dataset.m)));
    const kb = { scope: el, description: '2048 move' };
    app.keyboard.register('UP', () => move('up'), { ...kb, allowInInputs: false });
    app.keyboard.register('DOWN', () => move('down'), { ...kb, allowInInputs: false });
    app.keyboard.register('LEFT', () => move('left'), { ...kb, allowInInputs: false });
    app.keyboard.register('RIGHT', () => move('right'), { ...kb, allowInInputs: false });
    app.keyboard.register('W', () => move('up'), { ...kb, allowInInputs: false });
    app.keyboard.register('S', () => move('down'), { ...kb, allowInInputs: false });
    app.keyboard.register('A', () => move('left'), { ...kb, allowInInputs: false });
    app.keyboard.register('D', () => move('right'), { ...kb, allowInInputs: false });
    // Touch swipe
    let sx = 0, sy = 0;
    boardEl.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    boardEl.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });
    reset();
    app.shell.activity.trackAppOpen('game2048');
}

export default { launch, icon: AppIcons.get('game2048') };
