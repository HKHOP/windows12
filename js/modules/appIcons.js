const AppIcons = (() => {
    const icons = {
        fileExplorer: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" fill="#FFC107"/><path d="M2 8h20" stroke="white" stroke-opacity="0.4" stroke-width="1"/><path d="M9 4V8M2 8l3-4h4l3 4" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,

        settings: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#555"/><circle cx="12" cy="12" r="3.5" stroke="white" stroke-width="1.8" fill="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,

        notepad: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#1E88E5"/><rect x="7" y="6" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="9.5" width="8" height="1.5" rx="0.5" fill="white"/><rect x="7" y="13" width="10" height="1.5" rx="0.5" fill="white"/><rect x="7" y="16.5" width="6" height="1.5" rx="0.5" fill="white"/></svg>`,

        calendar: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="18" rx="2" fill="#E53935"/><rect x="2" y="4" width="20" height="6" rx="2" fill="#B71C1C"/><rect x="6" y="2" width="2" height="4" rx="1" fill="white" fill-opacity="0.6"/><rect x="16" y="2" width="2" height="4" rx="1" fill="white" fill-opacity="0.6"/><path d="M7 14h3v3H7zM14 14h3v3h-3zM7 19h3v1H7zM14 19h3v1h-3z" fill="white" fill-opacity="0.9"/></svg>`,

        taskManager: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="3" fill="#0078D4"/><path d="M6 6h5v5H6zM13 6h5v5h-5zM6 13h5v5H6zM13 13h5v5h-5z" fill="white" fill-opacity="0.9" rx="1"/></svg>`,

        photos: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" fill="#43A047"/><circle cx="8.5" cy="9" r="2" fill="white"/><path d="M2 17l5-5 3 3 4-4 8 8v1c0 1-.8 1.8-1.8 1.8H3.8C2.8 20.1 2 19.3 2 18.3V17z" fill="white" fill-opacity="0.85"/></svg>`,

        calculator: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="2" width="18" height="20" rx="3" fill="#0078D4"/><rect x="6" y="4" width="12" height="5" rx="1.5" fill="white" fill-opacity="0.25"/><path d="M6.5 12h2.5v2.5H6.5zM10.75 12h2.5v2.5h-2.5zM15 12h2.5v2.5H15zM6.5 16h2.5v2.5H6.5zM10.75 16h2.5v2.5h-2.5zM15 16h2.5v2.5H15z" fill="white" fill-opacity="0.9" rx="0.8"/><path d="M6.5 20h6.25v2H6.5z" fill="white" fill-opacity="0.9" rx="0.8"/></svg>`,

        clock: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#333"/><circle cx="12" cy="12" r="8.5" stroke="white" stroke-width="1.2" fill="none"/><path d="M12 6v6.5l4 2.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="1" fill="white"/></svg>`,

        paint: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="3" fill="#FF9800"/><path d="M12 5l-1 7h2l-1-7z" fill="white" fill-opacity="0.9"/><path d="M8 16c0-2.2 1.8-4 4-4s4 1.8 4 4c0 1.5-1 3-2 3h-4c-1 0-2-1.5-2-3z" fill="white" fill-opacity="0.85"/></svg>`,

        browser: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#2196F3"/><circle cx="12" cy="12" r="8" stroke="white" stroke-width="1" fill="none"/><path d="M2 12h20" stroke="white" stroke-width="1" stroke-opacity="0.6"/><path d="M12 4c2.5 2.5 4 6 4 8s-1.5 5.5-4 8c-2.5-2.5-4-6-4-8s1.5-5.5 4-8z" stroke="white" stroke-width="1.2" fill="none"/></svg>`,

        appStore: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 8h14l-1.5 11H6.5L5 8z" fill="#0078D4"/><path d="M8 8V6a4 4 0 0 1 8 0v2" stroke="white" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="12" cy="14" r="2" fill="white"/></svg>`,

        terminal: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="18" rx="3" fill="#1a1a2e"/><path d="M6 9l4 3-4 3" stroke="#4ade80" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 15h5" stroke="#4ade80" stroke-width="1.8" stroke-linecap="round"/></svg>`,

        sampleApp: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5" fill="#6a11cb"/><path d="M8 8h3v8H8zM13 8h3v5h-3z" fill="white" fill-opacity="0.9"/></svg>`,

        vscode: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="3" fill="#007ACC"/><path d="M16 5l-8 7 8 7" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7 5l-3.5 7L7 19" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,

        export: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="3" fill="#0078D4"/><path d="M12 5v10" stroke="white" stroke-width="1.8" stroke-linecap="round"/><path d="M8 9l4-4 4 4" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 17v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,

        windowsUpdate: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="3" fill="#0078D4"/><path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" fill="white" fill-opacity="0.9" rx="1"/></svg>`,

        words: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="2" width="18" height="20" rx="2" fill="#3b82f6"/><path d="M7 7h10M7 11h10M7 15h7" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>`,

        sledgePoint: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#D83B01"/><path d="M7 8h4v8H7V8zm6 3h4v5h-4v-5z" fill="white"/></svg>`
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
