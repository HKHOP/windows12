const AppIcons = (() => {
    const icons = {
        fileExplorer: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#FFC107"/><path d="M3 7H21V9H3V7Z" fill="#FFD54F"/></svg>`,

        settings: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,

        notepad: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="16.5" width="6" height="1.5" rx="0.5" fill="white"/></svg>`,

        calendar: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" fill="#E53935"/><rect x="3" y="4" width="18" height="6" rx="2" fill="#B71C1C"/><rect x="7" y="2" width="2" height="4" rx="1" fill="#ccc"/><rect x="15" y="2" width="2" height="4" rx="1" fill="#ccc"/><text x="12" y="18" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="sans-serif">31</text></svg>`,

        taskManager: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" fill="#0078D4"/><rect x="14" y="3" width="7" height="7" rx="1" fill="#0078D4"/><rect x="3" y="14" width="7" height="7" rx="1" fill="#0078D4"/><rect x="14" y="14" width="7" height="7" rx="1" fill="#0078D4"/></svg>`,

        photos: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#43A047"/><circle cx="8.5" cy="8.5" r="2" fill="white"/><path d="M3 16l4-4 3 3 4-4 7 7v1c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-3z" fill="white"/></svg>`,

        calculator: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#0078D4"/><rect x="7" y="4" width="10" height="5" rx="1" fill="#B3E5FC"/><rect x="7" y="11" width="2.5" height="2.5" rx="0.5" fill="white"/><rect x="10.75" y="11" width="2.5" height="2.5" rx="0.5" fill="white"/><rect x="14.5" y="11" width="2.5" height="2.5" rx="0.5" fill="#FFB74D"/><rect x="7" y="14.75" width="2.5" height="2.5" rx="0.5" fill="white"/><rect x="10.75" y="14.75" width="2.5" height="2.5" rx="0.5" fill="white"/><rect x="14.5" y="14.75" width="2.5" height="2.5" rx="0.5" fill="#FFB74D"/><rect x="7" y="18.5" width="6.25" height="2.5" rx="0.5" fill="white"/><rect x="14.5" y="18.5" width="2.5" height="2.5" rx="0.5" fill="#FFB74D"/></svg>`,

        clock: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,

        paint: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#FF9800"/><circle cx="8" cy="8" r="2" fill="white"/><circle cx="16" cy="8" r="2" fill="#E53935"/><circle cx="12" cy="16" r="2" fill="#43A047"/><circle cx="8" cy="16" r="2" fill="#1E88E5"/></svg>`,

        browser: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2196F3" stroke-width="2"/><path d="M2 12h20" stroke="#2196F3" stroke-width="1.5"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#2196F3" stroke-width="1.5"/></svg>`,

        appStore: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 7C4 5.34 5.34 4 7 4h10c1.66 0 3 1.34 3 3v10c0 1.66-1.34 3-3 3H7c-1.66 0-3-1.34-3-3V7z" fill="#0078D4"/><path d="M8 4v16M16 4v16M4 12h16" stroke="white" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="2.5" fill="white"/></svg>`,

        terminal: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="18" rx="2" fill="#0C0C0C" stroke="#555" stroke-width="1"/><polyline points="6 9 10 12 6 15" stroke="#CCCCCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="18" y2="15" stroke="#CCCCCC" stroke-width="2" stroke-linecap="round"/></svg>`,

        sampleApp: `<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#6a11cb"/><text x="12" y="17" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="sans-serif">S</text></svg>`,

        vscode: `<svg viewBox="0 0 24 24" fill="none"><path d="M17.5 2.5L6 12l11.5 9.5V2.5z" fill="#007ACC"/><path d="M6 12L2.5 9.5 6 12z" fill="#1E90FF"/><path d="M6 12l-3.5 2.5L6 12z" fill="#1E90FF"/><path d="M21 12l-3.5 2.5V9.5L21 12z" fill="#1E90FF"/></svg>`,

        export: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="#0078D4" stroke-width="2" stroke-linecap="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="#0078D4" stroke-width="2" stroke-linecap="round"/></svg>`,

        windowsUpdate: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" fill="#0078D4"/></svg>`,

        words: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="2" width="18" height="20" rx="2" fill="#3b82f6"/><path d="M7 7h10M7 11h10M7 15h7" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>`
    };

    const fallback = `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="#666"/></svg>`;

    function get(id) {
        return icons[id] || fallback;
    }

    function getAll() {
        return { ...icons };
    }

    return { get, getAll };
})();

export default AppIcons;
