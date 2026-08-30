import WindowManager from '../modules/windowManager.js';

const Calendar = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" fill="#E53935"/><rect x="3" y="4" width="18" height="6" rx="2" fill="#B71C1C"/><rect x="7" y="2" width="2" height="4" rx="1" fill="#ccc"/><rect x="15" y="2" width="2" height="4" rx="1" fill="#ccc"/><text x="12" y="18" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="sans-serif">31</text></svg>`;

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const FULL_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    function getFirstDayOfMonth(year, month) {
        return new Date(year, month, 1).getDay();
    }

    function getContent() {
        return `
            <style>
                .cal-day:hover { filter: brightness(1.2); }
                .cal-day[data-selected="true"] { transform: scale(1.1); }
                .cal-prev:hover, .cal-next:hover { background: var(--hover-bg) !important; }
                .cal-today-btn:hover { background: var(--accent-color) !important; color: #fff !important; }
            </style>
            <div style="display:flex;height:100%;overflow:hidden;">
                <div style="flex:1;display:flex;flex-direction:column;padding:16px;overflow-y:auto;">
                    <div class="cal-nav" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                        <button class="cal-prev" style="background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;">&#9664;</button>
                        <span class="cal-month-label" style="font-size:16px;font-weight:600;color:var(--text-primary);"></span>
                        <button class="cal-next" style="background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;">&#9654;</button>
                    </div>
                    <div class="cal-header" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;"></div>
                    <div class="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;"></div>
                </div>
                <div class="cal-sidebar" style="width:160px;border-left:1px solid var(--window-border);padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;"></div>
            </div>
        `;
    }

    function renderDayHeaders(container) {
        container.innerHTML = DAYS.map(d =>
            `<div style="text-align:center;font-size:11px;font-weight:600;color:var(--text-primary);padding:4px 0;opacity:0.7;">${d}</div>`
        ).join('');
    }

    function renderGrid(container, year, month, selected, today) {
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const daysInPrevMonth = getDaysInMonth(year, month - 1);
        const cells = [];

        for (let i = 0; i < firstDay; i++) {
            const d = daysInPrevMonth - firstDay + 1 + i;
            const date = new Date(year, month - 1, d);
            cells.push({ day: d, date, dimmed: true });
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            cells.push({ day: d, date, dimmed: false });
        }

        const remaining = 42 - cells.length;
        for (let d = 1; d <= remaining; d++) {
            const date = new Date(year, month + 1, d);
            cells.push({ day: d, date, dimmed: true });
        }

        container.innerHTML = cells.map(({ day, date, dimmed }) => {
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = date.toDateString() === selected.toDateString();
            const isDimmed = dimmed;

            let bg = 'transparent';
            let color = 'var(--text-primary)';
            let fontWeight = '400';
            let borderRadius = '50%';

            if (isToday && !isSelected) {
                bg = 'var(--accent-color)';
                color = '#fff';
                fontWeight = '700';
            } else if (isSelected) {
                bg = 'var(--accent-color)';
                color = '#fff';
                fontWeight = '600';
            }

            if (isDimmed && !isToday && !isSelected) {
                color = 'var(--text-primary)';
                bg = 'transparent';
            }

            return `<div class="cal-day" data-date="${date.toISOString()}"
                style="display:flex;align-items:center;justify-content:center;aspect-ratio:1;font-size:13px;
                cursor:pointer;border-radius:${borderRadius};
                background:${bg};color:${color};font-weight:${fontWeight};
                opacity:${isDimmed && !isToday && !isSelected ? '0.35' : '1'};
                transition:background 0.15s,color 0.15s,opacity 0.15s;">${day}</div>`;
        }).join('');
    }

    function renderSidebar(container, date) {
        const dayName = FULL_DAYS[date.getDay()];
        const monthName = MONTHS[date.getMonth()];
        const year = date.getFullYear();
        const dayNum = date.getDate();

        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();

        container.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:42px;font-weight:700;color:var(--text-primary);line-height:1;">${dayNum}</div>
                <div style="font-size:13px;color:var(--text-primary);margin-top:2px;">${dayName}</div>
                <div style="font-size:11px;color:var(--text-primary);opacity:0.6;margin-top:2px;">${monthName} ${year}</div>
                ${isToday ? '<div style="display:inline-block;margin-top:8px;padding:2px 10px;border-radius:10px;background:var(--accent-color);color:#fff;font-size:11px;font-weight:600;">Today</div>' : ''}
            </div>
            <div style="border-top:1px solid var(--window-border);padding-top:10px;">
                <div style="font-size:11px;font-weight:600;color:var(--text-primary);opacity:0.5;text-transform:uppercase;margin-bottom:6px;">Details</div>
                <div style="font-size:12px;color:var(--text-primary);opacity:0.7;">Week ${getWeekNumber(date)}</div>
                <div style="font-size:12px;color:var(--text-primary);opacity:0.7;">Day ${getDayOfYear(date)} of ${isLeapYear(date.getFullYear()) ? 366 : 365}</div>
                <div style="font-size:12px;color:var(--text-primary);opacity:0.7;margin-top:2px;">${isLeapYear(date.getFullYear()) ? 'Leap Year' : 'Standard Year'}</div>
            </div>
            <div style="border-top:1px solid var(--window-border);padding-top:10px;">
                <div style="font-size:11px;font-weight:600;color:var(--text-primary);opacity:0.5;text-transform:uppercase;margin-bottom:6px;">Quick Actions</div>
                <button class="cal-today-btn" style="width:100%;padding:6px 0;border:1px solid var(--window-border);border-radius:4px;background:var(--hover-bg);color:var(--text-primary);font-size:12px;cursor:pointer;">Go to Today</button>
            </div>
        `;
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    }

    function getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        return Math.floor(diff / 86400000);
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    }

    function launch() {
        const today = new Date();
        let currentYear = today.getFullYear();
        let currentMonth = today.getMonth();
        let selectedDate = new Date(today);

        const win = WindowManager.createWindow('calendar', 'Calendar', icon, getContent(), { width: 720, height: 480 });

        const header = win.element.querySelector('.cal-header');
        const grid = win.element.querySelector('.cal-grid');
        const monthLabel = win.element.querySelector('.cal-month-label');
        const prevBtn = win.element.querySelector('.cal-prev');
        const nextBtn = win.element.querySelector('.cal-next');
        const sidebar = win.element.querySelector('.cal-sidebar');

        renderDayHeaders(header);

        function update() {
            monthLabel.textContent = `${MONTHS[currentMonth]} ${currentYear}`;
            renderGrid(grid, currentYear, currentMonth, selectedDate, today);
            renderSidebar(sidebar, selectedDate);

            sidebar.querySelector('.cal-today-btn').addEventListener('click', () => {
                currentYear = today.getFullYear();
                currentMonth = today.getMonth();
                selectedDate = new Date(today);
                update();
            });
        }

        prevBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            update();
        });

        nextBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            update();
        });

        grid.addEventListener('click', (e) => {
            const dayEl = e.target.closest('.cal-day');
            if (!dayEl) return;
            const dateStr = dayEl.dataset.date;
            if (!dateStr) return;
            selectedDate = new Date(dateStr);
            update();
        });

        update();
    }

    return { launch };
})();

export default Calendar;
