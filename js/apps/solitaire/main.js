// Solitaire — Klondike, dealt and played on the real rules.
//
// Drag a card (or a run) onto another pile, or just tap it: a tap sends the
// card to a foundation when it fits, otherwise to the first column that
// accepts it. Draw one or three from the stock, undo any number of moves,
// and auto-finish once the game is solved. Statistics live in this app's
// own sandbox, so they are per profile and need no filesystem permission.
import { createApp } from '../../sdk/index.js';
import AppIcons from '../../modules/appIcons.js';
import Scaling from '../../modules/scaling.js';

const SUITS = [
    { suit: '♠', red: false },
    { suit: '♥', red: true },
    { suit: '♦', red: true },
    { suit: '♣', red: false }
];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_W = 68;
const CARD_H = 96;
const FAN_UP = 26;
const FAN_DOWN = 10;
const STYLE_ID = 'solitaire-style';

/**
 * A fresh, ordered 52-card deck.
 * @returns {Array<{id:string, rank:number, suit:string, red:boolean, faceUp:boolean}>}
 */
export function deck() {
    const cards = [];
    SUITS.forEach(({ suit, red }) => {
        for (let rank = 1; rank <= 13; rank++) {
            cards.push({ id: `${suit}${rank}`, rank, suit, red, faceUp: false });
        }
    });
    return cards;
}

/**
 * Klondike tableau rule: descending rank, alternating colour; only a King
 * may start an empty column.
 * @param {object} card
 * @param {object|null} target the face-up card it would land on
 * @returns {boolean}
 */
export function canStackTableau(card, target) {
    if (!card) return false;
    if (!target) return card.rank === 13;
    return target.rank === card.rank + 1 && target.red !== card.red;
}

/**
 * Klondike foundation rule: same suit, ascending, starting with the Ace.
 * @param {object} card
 * @param {object|null} top
 * @returns {boolean}
 */
export function canStackFoundation(card, top) {
    if (!card) return false;
    if (!top) return card.rank === 1;
    return top.suit === card.suit && card.rank === top.rank + 1;
}

function shuffled() {
    const cards = deck();
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}

function getContent() {
    return `
        <style id="${STYLE_ID}">
            .sol-root { display:flex; flex-direction:column; height:100%; font-family:'Segoe UI',sans-serif; color:#e6e6ea;
                background:radial-gradient(circle at 30% -10%, #14402f, #081a13 70%); }
            .sol-toolbar { display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(0,0,0,0.28);
                border-bottom:1px solid rgba(255,255,255,0.07); flex-wrap:wrap; font-size:12px; }
            .sol-btn { background:rgba(255,255,255,0.09); border:1px solid rgba(255,255,255,0.16); border-radius:5px;
                color:#e6e6ea; padding:5px 11px; font-size:12px; cursor:pointer; font-family:inherit; }
            .sol-btn:hover { background:rgba(255,255,255,0.16); }
            .sol-btn.primary { background:var(--accent-color); border-color:transparent; color:#fff; }
            .sol-btn:disabled { opacity:0.4; cursor:default; }
            .sol-meta { display:flex; gap:14px; margin-left:auto; color:#9fb3a8; font-size:11px; }
            .sol-meta b { color:#e6e6ea; font-weight:600; }
            .sol-top { display:flex; align-items:flex-start; gap:10px; padding:14px 16px 6px; }
            .sol-gap { width:10px; }
            .sol-spacer { flex:1; }
            .sol-pile { position:relative; width:${CARD_W}px; height:${CARD_H}px; border-radius:8px; flex:none; }
            .sol-slot { width:${CARD_W}px; height:${CARD_H}px; border:1.5px dashed rgba(255,255,255,0.2);
                border-radius:8px; box-sizing:border-box; display:flex; align-items:center; justify-content:center;
                color:rgba(255,255,255,0.28); font-size:22px; }
            .sol-tableau { flex:1; min-height:0; display:flex; gap:10px; padding:8px 16px 16px; overflow:auto; }
            .sol-col { position:relative; width:${CARD_W}px; flex:0 0 ${CARD_W}px; border-radius:8px;
                border:1.5px dashed transparent; }
            .sol-col.empty { border-color:rgba(255,255,255,0.16); }
            .sol-col.drop { border-color:rgba(56,189,248,0.9); background:rgba(56,189,248,0.08); }
            .sol-pile.drop { box-shadow:0 0 0 2px rgba(56,189,248,0.9); border-radius:8px; background:rgba(56,189,248,0.1); }
            .sol-card { position:absolute; width:${CARD_W}px; height:${CARD_H}px; border-radius:8px; box-sizing:border-box;
                user-select:none; -webkit-user-select:none; touch-action:none; cursor:pointer;
                box-shadow:0 2px 5px rgba(0,0,0,0.4); border:1px solid rgba(0,0,0,0.35); }
            .sol-card.face { background:linear-gradient(#fdfdff, #e9edf3); color:#111827; }
            .sol-card.back { background:linear-gradient(135deg,#1d4ed8,#1e3a8a); border:1px solid #0b255e; }
            .sol-card.back::after { content:''; position:absolute; inset:4px; border-radius:5px; border:1px solid rgba(255,255,255,0.3);
                background-image:repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0 4px, transparent 4px 9px); }
            .sol-card.hidden { visibility:hidden; }
            .sol-drag { position:absolute; pointer-events:none; z-index:40; }
            .sol-corner { position:absolute; display:flex; flex-direction:column; align-items:center; line-height:1;
                font-weight:700; font-size:13px; letter-spacing:-0.02em; }
            .sol-corner.tl { left:4px; top:4px; }
            .sol-corner.br { right:4px; bottom:4px; transform:rotate(180deg); }
            .sol-pip { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-size:30px; line-height:1; }
            .sol-red { color:#dc2626; }
            .sol-black { color:#111827; }
            .sol-win { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
                justify-content:center; gap:12px; background:rgba(4,12,9,0.82); z-index:30; text-align:center; padding:24px; }
            .sol-win h2 { margin:0; font-size:26px; font-weight:600; }
            .sol-win p { margin:0; color:#a9c0b4; font-size:13px; }
        </style>
        <div class="sol-root">
            <div class="sol-toolbar">
                <button class="sol-btn primary sol-new">New game</button>
                <button class="sol-btn sol-undo">Undo</button>
                <button class="sol-btn sol-finish">Auto-finish</button>
                <button class="sol-btn sol-draw">Draw 1</button>
                <div class="sol-meta">
                    <span>Time <b class="sol-time">0:00</b></span>
                    <span>Moves <b class="sol-moves">0</b></span>
                    <span class="sol-record">Games won <b class="sol-won">0</b></span>
                </div>
            </div>
            <div class="sol-top">
                <div class="sol-pile sol-stock" data-pile="stock"></div>
                <div class="sol-pile sol-waste" data-pile="waste"></div>
                <div class="sol-spacer"></div>
                <div class="sol-pile sol-foundation" data-pile="foundation" data-pile-index="0"></div>
                <div class="sol-pile sol-foundation" data-pile="foundation" data-pile-index="1"></div>
                <div class="sol-pile sol-foundation" data-pile="foundation" data-pile-index="2"></div>
                <div class="sol-pile sol-foundation" data-pile="foundation" data-pile-index="3"></div>
            </div>
            <div class="sol-tableau"></div>
        </div>`;
}

function launch() {
    const app = createApp({ id: 'solitaire', name: 'Solitaire' });
    const win = app.window.create({
        title: 'Solitaire',
        icon: app.icon(),
        content: getContent(),
        width: 780,
        height: 700,
        minWidth: 560,
        minHeight: 480
    });
    const el = win.element;
    const root = el.querySelector('.sol-root');
    const bodyEl = el.querySelector('.window-body');
    const stockEl = el.querySelector('.sol-stock');
    const wasteEl = el.querySelector('.sol-waste');
    const foundationEls = [...el.querySelectorAll('.sol-foundation')];
    const tableauEl = el.querySelector('.sol-tableau');
    const timeEl = el.querySelector('.sol-time');
    const movesEl = el.querySelector('.sol-moves');
    const wonEl = el.querySelector('.sol-won');
    const drawBtn = el.querySelector('.sol-draw');
    const undoBtn = el.querySelector('.sol-undo');
    const finishBtn = el.querySelector('.sol-finish');

    let state = { stock: [], waste: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []] };
    let undoStack = [];
    let drawCount = 1;
    let moves = 0;
    let startedAt = 0;
    let elapsed = 0;
    let timer = null;
    let won = false;
    let drag = null;
    let layer = null;
    let highlight = null;
    let stats = loadStats();
    let winBackup = null;
    let viewWidth = 780;

    // ---------- persistence (app sandbox, per profile) ----------

    function loadStats() {
        try {
            const raw = app.files.read('stats.json');
            if (raw) return { played: 0, won: 0, bestTime: 0, bestMoves: 0, draw: 1, ...JSON.parse(raw) };
        } catch { /* first run */ }
        return { played: 0, won: 0, bestTime: 0, bestMoves: 0, draw: 1 };
    }

    function saveStats() {
        try { app.files.write('stats.json', JSON.stringify(stats)); } catch { /* sandbox unavailable */ }
    }

    // ---------- game state ----------

    function serialize() {
        return JSON.stringify({
            stock: state.stock,
            waste: state.waste,
            foundations: state.foundations,
            tableau: state.tableau,
            moves,
            elapsed,
            started: !!startedAt
        });
    }

    function restore(snap) {
        const data = JSON.parse(snap);
        state = {
            stock: data.stock,
            waste: data.waste,
            foundations: data.foundations,
            tableau: data.tableau
        };
        moves = data.moves;
        elapsed = data.elapsed;
        startedAt = data.started ? Date.now() : 0;
    }

    function pushUndo() {
        undoStack.push(serialize());
        if (undoStack.length > 400) undoStack.shift();
    }

    function newGame(asked) {
        if (asked && moves > 0 && !won) {
            app.dialogs.confirm('New game', 'Start a new game? The current one will be lost.')
                .then(ok => { if (ok) newGame(false); })
                .catch(() => {});
            return;
        }
        const cards = shuffled();
        state = {
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableau: [[], [], [], [], [], [], []]
        };
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j <= i; j++) {
                const card = cards.pop();
                card.faceUp = j === i;
                state.tableau[i].push(card);
            }
        }
        state.stock = cards;
        cards.forEach(c => { c.faceUp = false; });
        undoStack = [];
        moves = 0;
        startedAt = 0;
        elapsed = 0;
        won = false;
        winBackup = null;
        stats.played++;
        saveStats();
        render();
    }

    function touchClock() {
        if (won || startedAt) return;
        startedAt = Date.now();
    }

    function clock() {
        if (!startedAt) return elapsed;
        return elapsed + Math.floor((Date.now() - startedAt) / 1000);
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function startTimer() {
        if (timer) return;
        timer = setInterval(() => {
            timeEl.textContent = formatTime(clock());
        }, 1000);
    }

    // ---------- moves ----------

    function foundationFor(card) {
        for (let i = 0; i < 4; i++) {
            const f = state.foundations[i];
            if (canStackFoundation(card, f.length ? f[f.length - 1] : null)) return i;
        }
        return -1;
    }

    function sourceCards(from) {
        if (from.pile === 'waste') {
            if (from.cardIndex !== state.waste.length - 1) return null;
            return [state.waste[from.cardIndex]];
        }
        if (from.pile === 'foundation') {
            const f = state.foundations[from.index];
            if (from.cardIndex !== f.length - 1) return null;
            return [f[from.cardIndex]];
        }
        if (from.pile === 'tableau') {
            const col = state.tableau[from.index];
            const run = col.slice(from.cardIndex);
            if (!run.length || !run.every(c => c.faceUp)) return null;
            for (let i = 1; i < run.length; i++) {
                if (!canStackTableau(run[i], run[i - 1])) return null;
            }
            return run;
        }
        return null;
    }

    function takeCards(from, count) {
        if (from.pile === 'waste') return state.waste.splice(state.waste.length - count, count);
        if (from.pile === 'foundation') return state.foundations[from.index].splice(-count, count);
        return state.tableau[from.index].splice(from.cardIndex, count);
    }

    function flipExposed(from) {
        if (from.pile !== 'tableau') return;
        const col = state.tableau[from.index];
        const top = col[col.length - 1];
        if (top && !top.faceUp) top.faceUp = true;
    }

    function commit(from, cards, to) {
        pushUndo();
        takeCards(from, cards.length);
        if (to.pile === 'foundation') state.foundations[to.index].push(...cards);
        else state.tableau[to.index].push(...cards);
        flipExposed(from);
        moves++;
        touchClock();
        render();
        checkWin();
    }

    function bestTableauTarget(cards, fromIndex) {
        const head = cards[0];
        let empty = -1;
        for (let i = 0; i < 7; i++) {
            if (i === fromIndex) continue;
            const col = state.tableau[i];
            if (!col.length) {
                if (empty < 0 && head.rank === 13) empty = i;
                continue;
            }
            if (canStackTableau(head, col[col.length - 1])) return i;
        }
        return empty;
    }

    function tapMove(from) {
        const cards = sourceCards(from);
        if (!cards || !cards.length) return;
        if (cards.length === 1) {
            const f = foundationFor(cards[0]);
            if (f >= 0 && !(from.pile === 'foundation' && from.index === f)) {
                commit(from, cards, { pile: 'foundation', index: f });
                return;
            }
        }
        const target = bestTableauTarget(cards, from.pile === 'tableau' ? from.index : -1);
        if (target >= 0) commit(from, cards, { pile: 'tableau', index: target });
    }

    function draw() {
        if (won) return;
        pushUndo();
        if (!state.stock.length) {
            if (!state.waste.length) {
                undoStack.pop();
                return;
            }
            state.stock = state.waste.reverse();
            state.stock.forEach(c => { c.faceUp = false; });
            state.waste = [];
            moves++;
        } else {
            const n = Math.min(drawCount, state.stock.length);
            for (let i = 0; i < n; i++) {
                const card = state.stock.pop();
                card.faceUp = true;
                state.waste.push(card);
            }
            moves++;
        }
        touchClock();
        render();
    }

    function undo() {
        const snap = undoStack.pop();
        if (!snap) return;
        // Stepping back out of a win un-earns it: the result was counted the
        // moment the foundations filled, so put the statistics back too.
        if (won && winBackup) {
            stats = { ...winBackup };
            winBackup = null;
            saveStats();
        }
        restore(snap);
        won = false;
        render();
    }

    function autoFinish() {
        if (won) return;
        const snap = serialize();
        let placed = 0;
        let dry = 0;
        for (let guard = 0; guard < 400 && dry < 80; guard++) {
            let did = false;
            for (const col of state.tableau) {
                const top = col[col.length - 1];
                if (!top || !top.faceUp) continue;
                const f = foundationFor(top);
                if (f >= 0) {
                    col.pop();
                    state.foundations[f].push(top);
                    const next = col[col.length - 1];
                    if (next && !next.faceUp) next.faceUp = true;
                    placed++;
                    did = true;
                }
            }
            const wt = state.waste[state.waste.length - 1];
            if (wt) {
                const f = foundationFor(wt);
                if (f >= 0) {
                    state.waste.pop();
                    state.foundations[f].push(wt);
                    placed++;
                    did = true;
                }
            }
            if (did) { dry = 0; continue; }
            if (state.stock.length) {
                const card = state.stock.pop();
                card.faceUp = true;
                state.waste.push(card);
                dry++;
                continue;
            }
            break;
        }
        if (!placed) {
            app.notify.info('Solitaire', 'There are no cards that can go to the foundations right now.');
            return;
        }
        undoStack.push(snap);
        moves += placed;
        touchClock();
        render();
        checkWin();
    }

    function checkWin() {
        if (won) return;
        if (!state.foundations.every(f => f.length === 13)) return;
        winBackup = { ...stats };
        won = true;
        elapsed = clock();
        startedAt = 0;
        stats.won++;
        if (!stats.bestTime || elapsed < stats.bestTime) stats.bestTime = elapsed;
        if (!stats.bestMoves || moves < stats.bestMoves) stats.bestMoves = moves;
        saveStats();
        render();
    }

    // ---------- rendering ----------

    function cardFace(card, cls, extra) {
        const color = card.red ? 'sol-red' : 'sol-black';
        return `<div class="sol-card face ${cls}" style="${extra || ''}">
            <div class="sol-corner tl ${color}"><span>${RANKS[card.rank]}</span><span>${card.suit}</span></div>
            <div class="sol-pip ${color}">${card.suit}</div>
            <div class="sol-corner br ${color}"><span>${RANKS[card.rank]}</span><span>${card.suit}</span></div>
        </div>`;
    }

    function cardBack(cls, extra) {
        return `<div class="sol-card back ${cls}" style="${extra || ''}"></div>`;
    }

    function offsetsFor(col, avail) {
        const steps = [];
        for (let i = 1; i < col.length; i++) steps.push(col[i - 1].faceUp ? FAN_UP : FAN_DOWN);
        const total = steps.reduce((a, b) => a + b, 0);
        const scale = total + CARD_H > avail && total > 0
            ? Math.max(0.25, (avail - CARD_H) / total)
            : 1;
        const out = [0];
        let y = 0;
        steps.forEach(step => { y += step * scale; out.push(y); });
        return out;
    }

    function render() {
        timeEl.textContent = formatTime(clock());
        movesEl.textContent = String(moves);
        wonEl.textContent = String(stats.won);
        undoBtn.disabled = undoStack.length === 0;
        finishBtn.disabled = won;
        drawBtn.textContent = drawCount === 1 ? 'Draw 1' : 'Draw 3';

        // stock
        if (state.stock.length) {
            stockEl.innerHTML = cardBack('', `left:0;top:0;`);
        } else {
            stockEl.innerHTML = `<div class="sol-slot" style="position:absolute;inset:0;">${state.waste.length ? '↻' : ''}</div>`;
        }

        // waste (fan the last three so draw-3 reads naturally)
        const shown = state.waste.slice(-3);
        wasteEl.innerHTML = shown.map((card, i) => {
            const attrs = `data-pile="waste" data-card="${state.waste.length - shown.length + i}"`;
            return cardFace(card, '', `left:${i * 18}px;top:0;`)
                .replace(/^<div class="sol-card/, `<div ${attrs} class="sol-card`);
        }).join('');

        // foundations
        foundationEls.forEach((slot, i) => {
            const pile = state.foundations[i];
            const top = pile[pile.length - 1];
            if (!top) {
                slot.innerHTML = '<div class="sol-slot" style="position:absolute;inset:0;">A</div>';
            } else {
                slot.innerHTML = cardFace(top, '', 'left:0;top:0;')
                    .replace(/^<div class="sol-card/, `<div data-pile="foundation" data-pile-index="${i}" data-card="${pile.length - 1}" class="sol-card`);
            }
        });

        // tableau
        const avail = Math.max(CARD_H + 24, tableauEl.clientHeight - 8);
        tableauEl.innerHTML = state.tableau.map((col, ci) => {
            const offsets = offsetsFor(col, avail);
            const height = offsets.length ? offsets[offsets.length - 1] + CARD_H : CARD_H;
            const cards = col.map((card, i) => {
                const style = `left:0;top:${offsets[i]}px;`;
                const attrs = `data-pile="tableau" data-pile-index="${ci}" data-card="${i}"`;
                const face = card.faceUp ? cardFace(card, '', style) : cardBack('', style);
                return face.replace(/^<div class="sol-card/, `<div ${attrs} class="sol-card`);
            }).join('');
            return `<div class="sol-col ${col.length ? '' : 'empty'}" data-pile="tableau" data-pile-index="${ci}"
                style="height:${Math.max(CARD_H, height)}px;">${cards}</div>`;
        }).join('');

        if (won) {
            root.querySelector('.sol-win')?.remove();
            const overlay = document.createElement('div');
            overlay.className = 'sol-win';
            overlay.innerHTML = `
                <h2>You won!</h2>
                <p>${formatTime(elapsed)} · ${moves} move${moves === 1 ? '' : 's'}</p>
                <p>Best: ${stats.bestTime ? formatTime(stats.bestTime) : '—'} · ${stats.bestMoves || '—'} moves</p>
                <button class="sol-btn primary sol-win-new" style="margin-top:6px;">Play again</button>`;
            overlay.querySelector('.sol-win-new').addEventListener('click', () => newGame(false));
            root.appendChild(overlay);
        } else {
            root.querySelector('.sol-win')?.remove();
        }
    }

    // ---------- pointer: drag and tap ----------

    function pileFrom(elOrNull) {
        const pileEl = elOrNull && elOrNull.closest('[data-pile]');
        if (!pileEl) return null;
        return {
            pile: pileEl.dataset.pile,
            index: Number(pileEl.dataset.pileIndex || 0)
        };
    }

    function onPointerDown(e) {
        if (drag) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const stock = e.target.closest('[data-pile="stock"]');
        if (stock) { draw(); return; }
        const cardEl = e.target.closest('.sol-card');
        if (!cardEl || !cardEl.dataset.pile) return;
        const from = {
            pile: cardEl.dataset.pile,
            index: Number(cardEl.dataset.pileIndex || 0),
            cardIndex: Number(cardEl.dataset.card || 0)
        };
        const cards = sourceCards(from);
        if (!cards || !cards.length) return;
        e.preventDefault();
        const zoom = Scaling.getUiZoom() || 1;
        const rect = cardEl.getBoundingClientRect();
        const bodyRect = bodyEl.getBoundingClientRect();
        drag = {
            from,
            cards,
            startX: e.clientX,
            startY: e.clientY,
            zoom,
            bodyLeft: bodyRect.left + bodyEl.scrollLeft * zoom,
            bodyTop: bodyRect.top + bodyEl.scrollTop * zoom,
            grabX: (e.clientX - rect.left) / zoom,
            grabY: (e.clientY - rect.top) / zoom,
            moved: false,
            sources: from.pile === 'tableau'
                ? [...el.querySelectorAll(`.sol-col[data-pile-index="${from.index}"] .sol-card`)]
                    .filter(node => Number(node.dataset.card) >= from.cardIndex)
                : [...el.querySelectorAll('.sol-card')].filter(node =>
                    node.dataset.pile === from.pile
                    && Number(node.dataset.card) === from.cardIndex
                    && (from.pile !== 'foundation' || Number(node.dataset.pileIndex) === from.index))
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }

    function buildGhost() {
        layer = document.createElement('div');
        layer.className = 'sol-drag';
        drag.cards.forEach((card, i) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = `position:absolute;left:0;top:${i * FAN_UP}px;width:${CARD_W}px;height:${CARD_H}px;`;
            wrap.innerHTML = cardFace(card, '', `left:0;top:0;`);
            layer.appendChild(wrap);
        });
        bodyEl.appendChild(layer);
        drag.sources.forEach(node => node.classList.add('hidden'));
    }

    function moveGhost(e) {
        if (!layer) return;
        layer.style.left = `${(e.clientX - drag.bodyLeft) / drag.zoom - drag.grabX}px`;
        layer.style.top = `${(e.clientY - drag.bodyTop) / drag.zoom - drag.grabY}px`;
    }

    function dropTargetFor(finished, e) {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = pileFrom(under);
        if (!target) return null;
        if (target.pile === 'foundation') {
            if (finished.cards.length !== 1) return null;
            const f = state.foundations[target.index];
            return canStackFoundation(finished.cards[0], f.length ? f[f.length - 1] : null) ? target : null;
        }
        if (target.pile === 'tableau') {
            if (finished.from.pile === 'tableau' && finished.from.index === target.index) return null;
            const col = state.tableau[target.index];
            return canStackTableau(finished.cards[0], col.length ? col[col.length - 1] : null) ? target : null;
        }
        return null;
    }

    function setHighlight(targetEl) {
        if (highlight === targetEl) return;
        if (highlight) highlight.classList.remove('drop');
        highlight = targetEl;
        if (highlight) highlight.classList.add('drop');
    }

    function onPointerMove(e) {
        if (!drag) return;
        if (!drag.moved) {
            if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return;
            drag.moved = true;
            buildGhost();
        }
        moveGhost(e);
        const target = dropTargetFor(drag, e);
        setHighlight(target
            ? el.querySelector(`[data-pile="${target.pile}"][data-pile-index="${target.index}"]`)
            : null);
    }

    function onPointerUp(e) {
        if (!drag) return;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        const current = drag;
        drag = null;
        setHighlight(null);
        if (layer) {
            layer.remove();
            layer = null;
        }
        current.sources.forEach(node => node.classList.remove('hidden'));

        if (!current.moved) {
            tapMove(current.from);
            return;
        }
        const target = dropTargetFor(current, e);
        if (target) {
            commit(current.from, current.cards, target);
        } else {
            render();
        }
    }

    // ---------- wiring ----------

    root.addEventListener('pointerdown', onPointerDown);

    el.querySelector('.sol-new').addEventListener('click', () => newGame(true));
    el.querySelector('.sol-undo').addEventListener('click', undo);
    el.querySelector('.sol-finish').addEventListener('click', autoFinish);
    drawBtn.addEventListener('click', () => {
        drawCount = drawCount === 1 ? 3 : 1;
        stats.draw = drawCount;
        saveStats();
        render();
    });

    const offUndo = app.keyboard.register('CTRL+Z', undo, { scope: el });

    const ro = new ResizeObserver(() => {
        const w = tableauEl.clientWidth;
        if (w && Math.abs(w - viewWidth) > 4) {
            viewWidth = w;
            render();
        }
    });
    ro.observe(tableauEl);

    const onClosed = (e) => {
        if (!e.detail || e.detail.id !== win.id) return;
        window.removeEventListener('window-closed', onClosed);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        ro.disconnect();
        app.keyboard.unregister(offUndo);
        if (timer) clearInterval(timer);
        timer = null;
        if (layer) { layer.remove(); layer = null; }
    };
    window.addEventListener('window-closed', onClosed);

    drawCount = stats.draw === 3 ? 3 : 1;
    newGame(false);
    startTimer();
    app.shell.activity.trackAppOpen('solitaire');
}

export default { launch, icon: AppIcons.get('solitaire') };
