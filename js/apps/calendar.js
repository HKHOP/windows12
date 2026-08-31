import WindowManager from '../modules/windowManager.js';

const Calendar = (() => {
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" fill="#E53935"/><rect x="3" y="4" width="18" height="6" rx="2" fill="#B71C1C"/><rect x="7" y="2" width="2" height="4" rx="1" fill="#ccc"/><rect x="15" y="2" width="2" height="4" rx="1" fill="#ccc"/><text x="12" y="18" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="sans-serif">31</text></svg>`;

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const FULL_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    const HIJRI_MONTHS = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Ula','Jumada al-Thani','Rajab','Sha\'ban','Ramadan','Shawwal','Dhul Qi\'dah','Dhul Hijjah'];
    const HEBREW_MONTHS = ['Tishrei','Cheshvan','Kislev','Tevet','Shevat','Adar I','Adar II','Nisan','Iyyar','Sivan','Tammuz','Av','Elul'];
    const PERSIAN_MONTHS = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];

    const CALENDARS = {
        gregorian: { name: 'Gregorian', months: MONTHS },
        hijri: { name: 'Hijri (Islamic)', months: HIJRI_MONTHS },
        hebrew: { name: 'Hebrew (Jewish)', months: HEBREW_MONTHS },
        persian: { name: 'Persian (Solar Hijri)', months: PERSIAN_MONTHS }
    };

    // --- Gregorian helpers ---
    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    function getFirstDayOfMonth(year, month) {
        return new Date(year, month, 1).getDay();
    }

    // --- Hijri (Kuwaiti algorithm) ---
    function gregorianToHijri(year, month, day) {
        let jd = Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4) +
                 Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12) -
                 Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4) +
                 day - 32075;

        const l = jd - 1948440 + 10632;
        const n = Math.floor((l - 1) / 10631);
        const remainder = l - 10631 * n + 354;
        const j = Math.floor((10985 - remainder) / 5316) * Math.floor((50 * remainder) / 17719) +
                  Math.floor(remainder / 5670) * Math.floor((43 * remainder) / 15238);
        const remainder2 = remainder - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
                           Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
        const hMonth = Math.floor((24 * remainder2) / 709);
        const hDay = remainder2 - Math.floor((709 * hMonth) / 24);
        const hYear = 30 * n + j - 30;

        return { year: hYear, month: hMonth - 1, day: hDay };
    }

    function hijriToGregorian(hYear, hMonth, hDay) {
        const jd = Math.floor((11 * hYear + 3) / 30) +
                   354 * hYear + 30 * hMonth - Math.floor((hMonth - 1) / 2) + hDay + 1948440 - 385;

        const l = jd + 68569;
        const n = Math.floor((4 * l) / 146097);
        const remainder = l - Math.floor((146097 * n + 3) / 4);
        const i = Math.floor((4000 * (remainder + 1)) / 1461001);
        const remainder2 = remainder - Math.floor((1461 * i) / 4) + 31;
        const j = Math.floor((80 * remainder2) / 2447);
        const day = remainder2 - Math.floor((2447 * j) / 80);
        const remainder3 = Math.floor(j / 11);
        const month = j + 2 - 12 * remainder3;
        const year = 100 * (n - 49) + i + remainder3;

        return { year, month: month - 1, day };
    }

    // --- Hebrew ---
    function gregorianToHebrew(year, month, day) {
        let jd = Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4) +
                 Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12) -
                 Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4) +
                 day - 32075;

        const d = jd - 1;
        const n4 = Math.floor(d / 146097);
        const n5 = d % 146097;
        const n1 = Math.floor(n5 / 36524);
        const n2 = n5 % 36524;
        const n3 = Math.floor(n2 / 1461);
        const n10 = n2 % 1461;
        const n11 = Math.floor(n10 / 365);
        const daysSince = d + 32044;

        const cycles = Math.floor((4 * daysSince + 3) / 146097);
        const remainder1 = daysSince - Math.floor(146097 * cycles / 4);
        const years = Math.floor((100 * remainder1 + 19640) / 3652428);
        const remainder2 = remainder1 - Math.floor(36525 * years / 100);
        const dayOfYear = Math.floor(remainder2 / 30601 * 3652428 / 100 + 1);

        const hYear = years + cycles * 400 + (dayOfYear > 300 ? 1 : 0);
        const monthStart = hYear % 4 === 0 ? 13 : 14;
        let hMonth, hDay;

        if (dayOfYear <= 306) {
            hDay = dayOfYear - (dayOfYear < 180 ? 0 : 1);
            hMonth = Math.floor((hDay - 1) / 30) + 1;
            hDay = ((hDay - 1) % 30) + 1;
        } else {
            hDay = dayOfYear - 306;
            hMonth = Math.floor((hDay - 1) / 29) + 7;
            hDay = ((hDay - 1) % 29) + 1;
        }

        if (hMonth > 12) hMonth = 12;
        if (hMonth < 1) hMonth = 1;

        return { year: hYear, month: hMonth - 1, day: hDay };
    }

    function hebrewMonthsInYear(hYear) {
        const yearLen = hebrewYearLength(hYear);
        if (yearLen > 380) return 13;
        return 12;
    }

    function hebrewYearLength(hYear) {
        return hebrewElapsedDays(hYear + 1) - hebrewElapsedDays(hYear);
    }

    function hebrewElapsedDays(hYear) {
        const months = Math.floor((235 * hYear - 234) / 19);
        let days = 20454 + 29 * months;
        const quarters = Math.floor((months * 384 + 6) / 1095);
        days -= quarters - (quarters > 1 ? 1 : 0);
        const adj = Math.floor((hYear + 1 + 12) / 15);
        days -= adj - (adj > 1 ? 1 : 0);
        const adj2 = Math.floor((hYear + 1 + 7) / 15);
        days += adj2 - (adj2 > 1 ? 1 : 0);
        return days + 1;
    }

    // --- Persian (Solar Hijri) ---
    function gregorianToPersian(year, month, day) {
        const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        const gy = year - 1600;
        const gm = month - 1;
        const gd = day - 1;

        const g_day_no = 365 * gy + Math.floor((gy + 3) / 4) - Math.floor((gy + 99) / 100) +
                          Math.floor((gy + 399) / 400) + g_d_m[gm] + gd;

        let p_day_no = g_day_no - 79;

        const p_np = Math.floor(p_day_no / 1029983);
        const p_rd = p_day_no % 1029983;

        let p_year, p_month, p_day;
        if (p_rd !== 0) {
            const p_y1 = Math.floor(p_rd / 366);
            const p_y2 = p_rd % 366;
            p_year = 978 * p_np + 33 * Math.floor(p_y1 / 8) + Math.floor(((p_y1 % 8) + 1) / 2) + (p_y2 >= 229 ? 1 : 0) + 1;
            const p_day_in_year = p_y2 < 229 ? p_y2 + 1 : p_y2 - 228;
            if (p_day_in_year < 186) {
                p_month = Math.floor(p_day_in_year / 31);
                p_day = p_day_in_year - 31 * p_month + 1;
            } else {
                p_month = Math.floor((p_day_in_year - 6) / 30);
                p_day = p_day_in_year - 30 * p_month - 5;
            }
        } else {
            p_year = 978 * p_np + 33 * 0 + 1;
            p_month = 0;
            p_day = 1;
        }

        return { year: p_year, month: p_month, day: p_day };
    }

    function persianToGregorian(pYear, pMonth, pDay) {
        const p_ym = Math.floor(((pYear - (pYear > 0 ? 474 : 473)) % 2820) + 474);
        const p_offset = 2820 * Math.floor((pYear - (pYear > 0 ? 474 : 473)) / 2820) + (pYear > 0 ? 474 : 473);
        const p_jd = 365 * (p_ym - 1) + Math.floor((8 * p_ym + 21) / 33) + pDay +
                      (pMonth < 7 ? 31 * (pMonth - 1) : 30 * (pMonth - 7) + 186) + p_offset + 1008;

        const jd = p_jd;
        const l = jd + 68569;
        const n = Math.floor((4 * l) / 146097);
        const l2 = l - Math.floor((146097 * n + 3) / 4);
        const i = Math.floor((4000 * (l2 + 1)) / 1461001);
        const l3 = l2 - Math.floor((1461 * i) / 4) + 31;
        const j = Math.floor((80 * l3) / 2447);
        const day = l3 - Math.floor((2447 * j) / 80);
        const l4 = Math.floor(j / 11);
        const month = j + 2 - 12 * l4;
        const year = 100 * (n - 49) + i + l4;

        return { year, month: month - 1, day };
    }

    function isPersianLeap(pYear) {
        const years = [1,5,9,13,17,22,26,30,34,38,43,47,51,55,59,64,68,72,76,80,85,89,93,97,101,106,110,114,118,122,127,131,135,139,143,148,152,156,160,164,169,173,177,181,185,190,194,198,202,206,211,215,219,223,227,232,236,240,244,248,253,257,261,265,269,274,278,282,286,290,295,299,303,307,311,316,320,324,328,332,337,341,345,349,353,358,362,366,370,374,379,383,387,391,395,400];
        const cycle = pYear % 2820;
        return years.includes(cycle);
    }

    function persianDaysInMonth(pYear, pMonth) {
        if (pMonth < 6) return 31;
        if (pMonth < 11) return 30;
        return isPersianLeap(pYear) ? 30 : 29;
    }

    // --- Rendering ---
    function getContent() {
        return `
            <div style="display:flex;height:100%;overflow:hidden;">
                <div style="flex:1;display:flex;flex-direction:column;padding:16px;overflow-y:auto;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <button class="cal-prev" style="background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;">&#9664;</button>
                            <span class="cal-month-label" style="font-size:16px;font-weight:600;color:var(--text-primary);"></span>
                            <button class="cal-next" style="background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;">&#9654;</button>
                        </div>
                        <select class="cal-system-select" style="min-width:140px;">
                            <option value="gregorian">Gregorian</option>
                            <option value="hijri">Hijri (Islamic)</option>
                            <option value="hebrew">Hebrew (Jewish)</option>
                            <option value="persian">Persian (Solar Hijri)</option>
                        </select>
                    </div>
                    <div class="cal-header" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;"></div>
                    <div class="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;"></div>
                </div>
                <div class="cal-sidebar" style="width:200px;border-left:1px solid var(--window-border);padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;"></div>
            </div>
        `;
    }

    function renderDayHeaders(container) {
        container.innerHTML = DAYS.map(d =>
            `<div style="text-align:center;font-size:11px;font-weight:600;color:var(--text-primary);padding:4px 0;opacity:0.7;">${d}</div>`
        ).join('');
    }

    function getMonthDays(calSystem, year, month) {
        switch (calSystem) {
            case 'hijri': return hijriDaysInMonth(year, month);
            case 'hebrew': return hebrewDaysInMonth(year, month);
            case 'persian': return persianDaysInMonth(year, month);
            default: return getDaysInMonth(year, month);
        }
    }

    function hijriDaysInMonth(hYear, hMonth) {
        if (hMonth % 2 === 0) return 30;
        if (hMonth < 11) return 29;
        return 29;
    }

    function hebrewDaysInMonth(hYear, hMonth) {
        const months = [0, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 29];
        if (hMonth === 1 && hebrewYearLength(hYear) % 10 > 4) return months[hMonth] + 1;
        return months[hMonth] || 29;
    }

    function getFirstDayOfMonthCal(calSystem, year, month) {
        const g = calToGregorian(calSystem, year, month, 1);
        return new Date(g.year, g.month, g.day).getDay();
    }

    function calToGregorian(calSystem, year, month, day) {
        switch (calSystem) {
            case 'hijri': return hijriToGregorian(year, month, day);
            case 'persian': return persianToGregorian(year, month, day);
            default: return { year, month, day };
        }
    }

    function gregorianToCal(calSystem, year, month, day) {
        switch (calSystem) {
            case 'hijri': return gregorianToHijri(year, month + 1, day);
            case 'hebrew': return gregorianToHebrew(year, month + 1, day);
            case 'persian': return gregorianToPersian(year, month + 1, day);
            default: return { year, month, day };
        }
    }

    function getPrevMonthDays(calSystem, year, month) {
        if (month > 0) {
            return getMonthDays(calSystem, year, month - 1);
        }
        switch (calSystem) {
            case 'hijri': return hijriDaysInMonth(year - 1, 11);
            case 'hebrew': return hebrewDaysInMonth(year - 1, 12);
            case 'persian': return persianDaysInMonth(year - 1, 11);
            default: return getDaysInMonth(year - 1, 11);
        }
    }

    function renderGrid(container, calSystem, year, month, selected, today) {
        const daysInMonth = getMonthDays(calSystem, year, month);
        const firstDay = getFirstDayOfMonthCal(calSystem, year, month);
        const prevDays = getPrevMonthDays(calSystem, year, month);

        const cells = [];

        for (let i = 0; i < firstDay; i++) {
            const d = prevDays - firstDay + 1 + i;
            cells.push({ day: d, dimmed: true });
        }

        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ day: d, dimmed: false });
        }

        const remaining = 42 - cells.length;
        for (let d = 1; d <= remaining; d++) {
            cells.push({ day: d, dimmed: true });
        }

        container.innerHTML = cells.map(({ day, dimmed }) => {
            const g = calToGregorian(calSystem, year, month, day);
            const date = new Date(g.year, g.month, g.day);
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = date.toDateString() === selected.toDateString();

            let secondaryDay = '';
            if (calSystem === 'gregorian') {
                const h = gregorianToHijri(g.year, g.month + 1, g.day);
                secondaryDay = `<div style="font-size:8px;opacity:0.55;line-height:1;margin-top:1px;">${h.day}</div>`;
            } else {
                secondaryDay = `<div style="font-size:8px;opacity:0.55;line-height:1;margin-top:1px;">${g.day}</div>`;
            }

            let bg = 'transparent';
            let color = 'var(--text-primary)';
            let fontWeight = '400';

            if (isToday && !isSelected) {
                bg = 'var(--accent-color)';
                color = '#fff';
                fontWeight = '700';
            } else if (isSelected) {
                bg = 'var(--accent-color)';
                color = '#fff';
                fontWeight = '600';
            }

            return `<div class="cal-day" data-date="${date.toISOString()}" data-day="${day}"
                style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:44px;
                cursor:pointer;border-radius:8px;
                background:${bg};color:${color};font-weight:${fontWeight};
                opacity:${dimmed && !isToday && !isSelected ? '0.35' : '1'};
                transition:background 0.15s,color 0.15s,opacity 0.15s;"><span style="line-height:1;">${day}</span>${secondaryDay}</div>`;
        }).join('');
    }

    function renderSidebar(container, date, calSystem) {
        const dayName = FULL_DAYS[date.getDay()];
        const monthName = MONTHS[date.getMonth()];
        const year = date.getFullYear();
        const dayNum = date.getDate();

        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();

        const hijri = gregorianToHijri(date.getFullYear(), date.getMonth() + 1, date.getDate());
        const hebrew = gregorianToHebrew(date.getFullYear(), date.getMonth() + 1, date.getDate());
        const persian = gregorianToPersian(date.getFullYear(), date.getMonth() + 1, date.getDate());

        container.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:42px;font-weight:700;color:var(--text-primary);line-height:1;">${dayNum}</div>
                <div style="font-size:13px;color:var(--text-primary);margin-top:2px;">${dayName}</div>
                <div style="font-size:11px;color:var(--text-primary);opacity:0.6;margin-top:2px;">${monthName} ${year}</div>
                ${isToday ? '<div style="display:inline-block;margin-top:8px;padding:2px 10px;border-radius:10px;background:var(--accent-color);color:#fff;font-size:11px;font-weight:600;">Today</div>' : ''}
            </div>
            <div style="border-top:1px solid var(--window-border);padding-top:10px;">
                <div style="font-size:11px;font-weight:600;color:var(--text-primary);opacity:0.5;text-transform:uppercase;margin-bottom:6px;">Other Calendars</div>
                <div style="font-size:11px;color:var(--text-primary);opacity:0.8;margin-bottom:6px;">
                    <span style="opacity:0.5;">Hijri:</span> ${hijri.day} ${HIJRI_MONTHS[hijri.month]} ${hijri.year}
                </div>
                <div style="font-size:11px;color:var(--text-primary);opacity:0.8;margin-bottom:6px;">
                    <span style="opacity:0.5;">Hebrew:</span> ${hebrew.day} ${HEBREW_MONTHS[Math.min(hebrew.month, 12)]} ${hebrew.year}
                </div>
                <div style="font-size:11px;color:var(--text-primary);opacity:0.8;">
                    <span style="opacity:0.5;">Persian:</span> ${persian.day} ${PERSIAN_MONTHS[persian.month]} ${persian.year}
                </div>
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
        let calSystem = 'gregorian';
        let currentYear, currentMonth;
        let selectedDate = new Date(today);

        const cal = gregorianToCal(calSystem, today.getFullYear(), today.getMonth() + 1, today.getDate());
        currentYear = cal.year;
        currentMonth = cal.month;

        const win = WindowManager.createWindow('calendar', 'Calendar', icon, getContent(), { width: 720, height: 480 });

        const header = win.element.querySelector('.cal-header');
        const grid = win.element.querySelector('.cal-grid');
        const monthLabel = win.element.querySelector('.cal-month-label');
        const prevBtn = win.element.querySelector('.cal-prev');
        const nextBtn = win.element.querySelector('.cal-next');
        const sidebar = win.element.querySelector('.cal-sidebar');
        const systemSelect = win.element.querySelector('.cal-system-select');

        renderDayHeaders(header);

        function update() {
            const calMonths = CALENDARS[calSystem].months;
            monthLabel.textContent = `${calMonths[currentMonth]} ${currentYear}`;
            renderGrid(grid, calSystem, currentYear, currentMonth, selectedDate, today);
            renderSidebar(sidebar, selectedDate, calSystem);

            sidebar.querySelector('.cal-today-btn')?.addEventListener('click', () => {
                const c = gregorianToCal(calSystem, today.getFullYear(), today.getMonth() + 1, today.getDate());
                currentYear = c.year;
                currentMonth = c.month;
                selectedDate = new Date(today);
                update();
            });
        }

        systemSelect.addEventListener('change', () => {
            calSystem = systemSelect.value;
            const c = gregorianToCal(calSystem, selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate());
            currentYear = c.year;
            currentMonth = c.month;
            update();
        });

        prevBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = CALENDARS[calSystem].months.length - 1;
                currentYear--;
            }
            update();
        });

        nextBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth >= CALENDARS[calSystem].months.length) {
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
