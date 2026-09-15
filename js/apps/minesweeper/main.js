import WindowManager from '../../modules/windowManager.js';
import AppIcons from '../../modules/appIcons.js';
import Popup from '../../modules/popup.js';
import FileSystem from '../../modules/fileSystem.js';
import Sounds from '../../modules/sounds.js';

const Minesweeper = (() => {
    const icon = AppIcons.get('minesweeper');
    const DATA_PATH = ['/', 'system', 'programs data', 'minesweeper'];

    const DIFFICULTIES = {
        beginner: { name: 'Beginner', rows: 9, cols: 9, mines: 10 },
        intermediate: { name: 'Intermediate', rows: 16, cols: 16, mines: 40 },
        expert: { name: 'Expert', rows: 16, cols: 30, mines: 99 }
    };

    function ensureDataDir() {
        if (!FileSystem.itemExists(DATA_PATH)) {
            FileSystem.createFolder(['/', 'system', 'programs data'], 'minesweeper');
        }
    }

    function loadHighScores() {
        ensureDataDir();
        const raw = FileSystem.readFile([...DATA_PATH, 'scores.json']);
        if (raw) {
            try { return JSON.parse(raw); } catch (e) {}
        }
        return {
            beginner: { time: null, name: '-' },
            intermediate: { time: null, name: '-' },
            expert: { time: null, name: '-' }
        };
    }

    function saveHighScores(scores) {
        ensureDataDir();
        const json = JSON.stringify(scores, null, 2);
        const path = [...DATA_PATH, 'scores.json'];
        if (FileSystem.itemExists(path)) {
            FileSystem.writeFile(path, json);
        } else {
            FileSystem.createFile(DATA_PATH, 'scores.json', json, 'json');
        }
    }

    function loadSettings() {
        ensureDataDir();
        const raw = FileSystem.readFile([...DATA_PATH, 'settings.json']);
        if (raw) {
            try { return JSON.parse(raw); } catch (e) {}
        }
        return { difficulty: 'beginner', soundEnabled: true };
    }

    function saveSettings(settings) {
        ensureDataDir();
        const json = JSON.stringify(settings, null, 2);
        const path = [...DATA_PATH, 'settings.json'];
        if (FileSystem.itemExists(path)) {
            FileSystem.writeFile(path, json);
        } else {
            FileSystem.createFile(DATA_PATH, 'settings.json', json, 'json');
        }
    }

    function launch() {
        const settings = loadSettings();
        const diffConfig = DIFFICULTIES[settings.difficulty] || DIFFICULTIES.beginner;

        const win = WindowManager.createWindow(
            'minesweeper',
            'Minesweeper',
            icon,
            getInitialHTML(diffConfig),
            { width: Math.max(420, diffConfig.cols * 28 + 60), height: Math.max(480, diffConfig.rows * 28 + 140), minWidth: 350, minHeight: 400 }
        );

        initGame(win, settings.difficulty);
    }

    function getInitialHTML(cfg) {
        return `
            <div class="ms-app" style="display:flex;flex-direction:column;height:100%;background:#202020;color:white;font-family:'Segoe UI',sans-serif;user-select:none;overflow:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#2d2d2d;border-bottom:1px solid #3d3d3d;">
                    <div style="display:flex;gap:8px;">
                        <button class="ms-menu-btn" style="padding:4px 10px;background:#3d3d3d;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;">Game</button>
                        <button class="ms-scores-btn" style="padding:4px 10px;background:#3d3d3d;border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;">High Scores</button>
                    </div>
                    <div style="font-size:13px;font-weight:600;color:#aaa;" class="ms-diff-label">${cfg.name} (${cfg.cols}x${cfg.rows}, ${cfg.mines} mines)</div>
                </div>

                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;">
                    <div style="background:#2d2d2d;border:2px solid #3d3d3d;border-radius:8px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,0.4);display:flex;flex-direction:column;align-items:center;gap:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;background:#1e1e1e;padding:8px 12px;border-radius:6px;border:1px solid #3d3d3d;">
                            <div class="ms-mine-count" style="font-family:monospace;font-size:20px;font-weight:bold;color:#ff5555;background:#000;padding:2px 8px;border-radius:4px;min-width:48px;text-align:center;">0${cfg.mines}</div>
                            <button class="ms-face-btn" style="width:36px;height:36px;border-radius:50%;background:#3d3d3d;border:1px solid #555;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.1s;">😊</button>
                            <div class="ms-timer" style="font-family:monospace;font-size:20px;font-weight:bold;color:#55ff55;background:#000;padding:2px 8px;border-radius:4px;min-width:48px;text-align:center;">000</div>
                        </div>

                        <div class="ms-board-wrap" style="background:#1a1a1a;border:2px inset #3d3d3d;padding:4px;border-radius:4px;overflow:auto;max-width:100%;max-height:65vh;">
                            <div class="ms-board" style="display:grid;grid-template-columns:repeat(${cfg.cols}, 26px);grid-template-rows:repeat(${cfg.rows}, 26px);gap:1px;background:#333;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function initGame(win, currentDiff) {
        let cfg = DIFFICULTIES[currentDiff] || DIFFICULTIES.beginner;
        let board = [];
        let mineCount = cfg.mines;
        let timer = 0;
        let timerInterval = null;
        let gameOver = false;
        let gameWon = false;
        let firstClick = true;
        let flaggedCount = 0;

        const el = win.element;
        const boardEl = el.querySelector('.ms-board');
        const mineCountEl = el.querySelector('.ms-mine-count');
        const timerEl = el.querySelector('.ms-timer');
        const faceBtn = el.querySelector('.ms-face-btn');
        const diffLabel = el.querySelector('.ms-diff-label');

        function playSound(type) {
            const settings = loadSettings();
            if (!settings.soundEnabled) return;
            if (type === 'click') Sounds.click();
            else if (type === 'win') Sounds.confirm();
            else if (type === 'lose') Sounds.error();
            else if (type === 'flag') Sounds.click();
        }

        function resetBoard(newCfg) {
            if (newCfg) {
                cfg = newCfg;
                diffLabel.textContent = `${cfg.name} (${cfg.cols}x${cfg.rows}, ${cfg.mines} mines)`;
                boardEl.style.gridTemplateColumns = `repeat(${cfg.cols}, 26px)`;
                boardEl.style.gridTemplateRows = `repeat(${cfg.rows}, 26px)`;
                win.element.style.width = `${Math.max(420, cfg.cols * 28 + 60)}px`;
                win.element.style.height = `${Math.max(480, cfg.rows * 28 + 140)}px`;
            }
            if (timerInterval) clearInterval(timerInterval);
            timer = 0;
            timerEl.textContent = '000';
            gameOver = false;
            gameWon = false;
            firstClick = true;
            flaggedCount = 0;
            mineCount = cfg.mines;
            updateMineDisplay();
            faceBtn.textContent = '😊';

            board = [];
            for (let r = 0; r < cfg.rows; r++) {
                let row = [];
                for (let c = 0; c < cfg.cols; c++) {
                    row.push({
                        row: r,
                        col: c,
                        mine: false,
                        revealed: false,
                        flagged: false,
                        neighborMines: 0
                    });
                }
                board.push(row);
            }

            renderBoard();
        }

        function placeMines(excludeR, excludeC) {
            let placed = 0;
            while (placed < cfg.mines) {
                let r = Math.floor(Math.random() * cfg.rows);
                let c = Math.floor(Math.random() * cfg.cols);
                // First click guarantee: exclude clicked cell and neighbors
                if (Math.abs(r - excludeR) <= 1 && Math.abs(c - excludeC) <= 1) continue;
                if (!board[r][c].mine) {
                    board[r][c].mine = true;
                    placed++;
                }
            }

            // Calculate neighbor numbers
            for (let r = 0; r < cfg.rows; r++) {
                for (let c = 0; c < cfg.cols; c++) {
                    if (board[r][c].mine) continue;
                    let count = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            let nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols && board[nr][nc].mine) {
                                count++;
                            }
                        }
                    }
                    board[r][c].neighborMines = count;
                }
            }
        }

        function startTimer() {
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                if (!gameOver && !gameWon) {
                    timer++;
                    if (timer > 999) timer = 999;
                    timerEl.textContent = String(timer).padStart(3, '0');
                }
            }, 1000);
        }

        function updateMineDisplay() {
            let rem = cfg.mines - flaggedCount;
            mineCountEl.textContent = (rem < 0 ? '-' : '') + String(Math.abs(rem)).padStart(2, '0');
        }

        function renderBoard() {
            boardEl.innerHTML = '';
            for (let r = 0; r < cfg.rows; r++) {
                for (let c = 0; c < cfg.cols; c++) {
                    const cell = board[r][c];
                    const cellEl = document.createElement('div');
                    cellEl.className = 'ms-cell';
                    cellEl.dataset.row = r;
                    cellEl.dataset.col = c;
                    cellEl.style.cssText = `
                        width: 26px; height: 26px; display:flex; align-items:center; justify-content:center;
                        font-weight: bold; font-size: 13px; cursor: pointer; border-radius: 2px;
                        background: ${cell.revealed ? '#2a2a2a' : '#3c3c3c'};
                        border: ${cell.revealed ? '1px solid #444' : 'outset 2px #555'};
                        color: ${getTextColor(cell.neighborMines)};
                    `;

                    if (cell.revealed) {
                        if (cell.mine) {
                            cellEl.style.background = '#e53935';
                            cellEl.textContent = '💣';
                        } else if (cell.neighborMines > 0) {
                            cellEl.textContent = cell.neighborMines;
                        }
                    } else if (cell.flagged) {
                        cellEl.textContent = '🚩';
                    }

                    cellEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (gameOver || gameWon || cell.flagged || cell.revealed) return;
                        clickCell(r, c);
                    });

                    cellEl.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (gameOver || gameWon || cell.revealed) return;
                        cell.flagged = !cell.flagged;
                        flaggedCount += cell.flagged ? 1 : -1;
                        updateMineDisplay();
                        playSound('flag');
                        renderBoard();
                    });

                    boardEl.appendChild(cellEl);
                }
            }
        }

        function getTextColor(num) {
            const colors = {
                1: '#4da6ff', 2: '#55ff55', 3: '#ff5555', 4: '#bd93f9',
                5: '#ffb86c', 6: '#8be9fd', 7: '#f1fa8c', 8: '#ff79c6'
            };
            return colors[num] || 'white';
        }

        function clickCell(r, c) {
            if (firstClick) {
                firstClick = false;
                placeMines(r, c);
                startTimer();
            }

            const cell = board[r][c];
            if (cell.mine) {
                // Game over!
                cell.revealed = true;
                triggerGameOver(false);
                return;
            }

            revealCellRecursive(r, c);
            playSound('click');
            renderBoard();
            checkWinCondition();
        }

        function revealCellRecursive(r, c) {
            const cell = board[r][c];
            if (cell.revealed || cell.flagged) return;
            cell.revealed = true;

            if (cell.neighborMines === 0) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        let nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols) {
                            revealCellRecursive(nr, nc);
                        }
                    }
                }
            }
        }

        function checkWinCondition() {
            let won = true;
            for (let r = 0; r < cfg.rows; r++) {
                for (let c = 0; c < cfg.cols; c++) {
                    if (!board[r][c].mine && !board[r][c].revealed) {
                        won = false;
                        break;
                    }
                }
                if (!won) break;
            }

            if (won) {
                triggerGameOver(true);
            }
        }

        function triggerGameOver(won) {
            gameOver = true;
            gameWon = won;
            if (timerInterval) clearInterval(timerInterval);

            // Reveal all mines if lost
            if (!won) {
                for (let r = 0; r < cfg.rows; r++) {
                    for (let c = 0; c < cfg.cols; c++) {
                        if (board[r][c].mine) board[r][c].revealed = true;
                    }
                }
                faceBtn.textContent = '😵';
                playSound('lose');
                renderBoard();
            } else {
                faceBtn.textContent = '😎';
                playSound('win');
                // Check high score
                const scores = loadHighScores();
                const curBest = scores[currentDiff].time;
                if (curBest === null || timer < curBest) {
                    Popup.textbox('New High Score!', `Amazing! You solved ${cfg.name} in ${timer} seconds. Enter your name:`, { value: 'Player' }).then(name => {
                        if (name) {
                            scores[currentDiff] = { time: timer, name };
                            saveHighScores(scores);
                        }
                    });
                }
            }
        }

        faceBtn.addEventListener('click', () => {
            resetBoard();
        });

        el.querySelector('.ms-menu-btn').addEventListener('click', () => {
            Popup.pick('Minesweeper Options', 'Select an action:', [
                { label: 'New Game', action: () => resetBoard() },
                { label: 'Difficulty: Beginner (9x9)', action: () => { saveSettings({ difficulty: 'beginner', soundEnabled: loadSettings().soundEnabled }); resetBoard(DIFFICULTIES.beginner); } },
                { label: 'Difficulty: Intermediate (16x16)', action: () => { saveSettings({ difficulty: 'intermediate', soundEnabled: loadSettings().soundEnabled }); resetBoard(DIFFICULTIES.intermediate); } },
                { label: 'Difficulty: Expert (30x16)', action: () => { saveSettings({ difficulty: 'expert', soundEnabled: loadSettings().soundEnabled }); resetBoard(DIFFICULTIES.expert); } },
                { label: loadSettings().soundEnabled ? 'Disable Sound' : 'Enable Sound', action: () => { const s = loadSettings(); s.soundEnabled = !s.soundEnabled; saveSettings(s); Popup.info('Sound', s.soundEnabled ? 'Sound enabled' : 'Sound disabled'); } }
            ]).then(res => {
                if (res && res.action) res.action();
            });
        });

        el.querySelector('.ms-scores-btn').addEventListener('click', () => {
            const scores = loadHighScores();
            Popup.info('High Scores', `
                <div style="text-align:left;padding:8px;line-height:1.6;">
                    <div><b>Beginner:</b> ${scores.beginner.time !== null ? `${scores.beginner.time}s by ${scores.beginner.name}` : 'No record'}</div>
                    <div><b>Intermediate:</b> ${scores.intermediate.time !== null ? `${scores.intermediate.time}s by ${scores.intermediate.name}` : 'No record'}</div>
                    <div><b>Expert:</b> ${scores.expert.time !== null ? `${scores.expert.time}s by ${scores.expert.name}` : 'No record'}</div>
                </div>
            `);
        });

        resetBoard();
    }

    return { launch };
})();

export default Minesweeper;
