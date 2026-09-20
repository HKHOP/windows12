// Centralized custom SVG icon set for system UI surfaces:
// Settings, Desktop, File Explorer (plus shared file/folder + context-menu glyphs).
// No emojis. Outline icons use `currentColor` so they inherit theme text color;
// folder/file icons use fixed Fluent-style colors.
const UIIcons = (() => {
    function wrap(inner, size = 24, extra = '') {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ${extra}>${inner}</svg>`;
    }
    const stroke = (color = 'currentColor', w = 1.8) =>
        `stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

    // ---- Action / context-menu glyphs (outline, currentColor) ----
    const actions = {
        open: (s) => wrap(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" ${stroke()}/>`, s),
        openWith: (s) => wrap(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" ${stroke()}/><path d="M12 11v6M9 14h6" ${stroke()}/>`, s),
        cut: (s) => wrap(`<circle cx="6" cy="6" r="2.5" ${stroke()}/><circle cx="6" cy="18" r="2.5" ${stroke()}/><path d="M8 7.5L20 19M8 16.5L20 5" ${stroke()}/>`, s),
        copy: (s) => wrap(`<rect x="8" y="8" width="12" height="12" rx="2" ${stroke()}/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" ${stroke()}/>`, s),
        paste: (s) => wrap(`<rect x="5" y="4" width="14" height="17" rx="2" ${stroke()}/><path d="M9 4a3 3 0 0 1 6 0" ${stroke()}/><path d="M9 12h6M9 16h4" ${stroke()}/>`, s),
        rename: (s) => wrap(`<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" ${stroke()}/><path d="M14.5 6.5l3 3" ${stroke()}/>`, s),
        delete: (s) => wrap(`<path d="M4 7h16" ${stroke()}/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" ${stroke()}/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" ${stroke()}/><path d="M10 11v6M14 11v6" ${stroke()}/>`, s),
        properties: (s) => wrap(`<circle cx="12" cy="12" r="9" ${stroke()}/><path d="M12 11v5" ${stroke()}/><circle cx="12" cy="8" r="1.1" fill="currentColor"/>`, s),
        newFolder: (s) => wrap(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" ${stroke()}/><path d="M12 11v6M9 14h6" ${stroke()}/>`, s),
        newFile: (s) => wrap(`<path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" ${stroke()}/><path d="M14 2v4h4" ${stroke()}/><path d="M12 12v6M9 15h6" ${stroke()}/>`, s),
        refresh: (s) => wrap(`<path d="M20 12a8 8 0 1 1-2.3-5.6" ${stroke()}/><path d="M20 3v4h-4" ${stroke()}/>`, s),
        view: (s) => wrap(`<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" ${stroke()}/><circle cx="12" cy="12" r="2.5" ${stroke()}/>`, s),
        sort: (s) => wrap(`<path d="M8 5v14M8 19l-3-3M8 19l3-3" ${stroke()}/><path d="M16 19V5M16 5l-3 3M16 5l3 3" ${stroke()}/>`, s),
        display: (s) => wrap(`<rect x="3" y="4" width="18" height="12" rx="2" ${stroke()}/><path d="M9 20h6M12 16v4" ${stroke()}/>`, s),
        personalize: (s) => wrap(`<path d="M4 20c2 0 3-1 3-3 0-1-1-2-2-2H4v5zM6 15c0-3 3-6 8-6h4a2 2 0 0 1 2 2v2c0 3-2.5 7-8 7H9" ${stroke()}/><circle cx="9" cy="11" r="1" fill="currentColor"/><circle cx="13" cy="9" r="1" fill="currentColor"/>`, s),
        taskManager: (s) => wrap(`<rect x="3" y="3" width="18" height="18" rx="2" ${stroke()}/><path d="M7 15l3-4 2.5 2.5L17 8" ${stroke()}/><path d="M14 8h3v3" ${stroke()}/>`, s),
        taskbarSettings: (s) => wrap(`<circle cx="12" cy="12" r="3" ${stroke()}/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1" ${stroke()}/>`, s),
        close: (s) => wrap(`<path d="M6 6l12 12M18 6L6 18" ${stroke()}/>`, s),
        pin: (s) => wrap(`<path d="M9 4h6l1 7 2 3v2H6v-2l2-3 1-7z" ${stroke()}/><path d="M12 16v5" ${stroke()}/>`, s),
        unpin: (s) => wrap(`<path d="M9 4h6l1 7 2 3v2H6v-2l2-3 1-7z" ${stroke()}/><path d="M12 16v5" ${stroke()}/><path d="M4 4l16 16" stroke="#E81123" stroke-width="1.8" stroke-linecap="round"/>`, s),
        restore: (s) => wrap(`<path d="M4 9V5a1 1 0 0 1 1-1h4" ${stroke()}/><path d="M20 15v4a1 1 0 0 1-1 1h-4" ${stroke()}/><rect x="7" y="7" width="10" height="10" rx="1.5" ${stroke()}/>`, s),
        move: (s) => wrap(`<path d="M12 3v18M3 12h18" ${stroke()}/><path d="M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" ${stroke()} stroke-width="1.4"/>`, s),
        size: (s) => wrap(`<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" ${stroke()}/>`, s),
        minimize: (s) => wrap(`<path d="M5 12h14" ${stroke()} stroke-width="2.2"/>`, s),
        maximize: (s) => wrap(`<rect x="5" y="5" width="14" height="14" rx="1.5" ${stroke()}/>`, s),
        empty: (s) => wrap(`<path d="M4 7h16" ${stroke()}/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" ${stroke()}/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" ${stroke()}/>`, s),
        check: (s) => wrap(`<path d="M4 12.5l5 5L20 6.5" ${stroke()} stroke-width="2.2"/>`, s),
        selectAll: (s) => wrap(`<rect x="4" y="4" width="16" height="16" rx="2" ${stroke()} stroke-dasharray="3 2"/><path d="M8.5 12.5l2.5 2.5 4.5-5" ${stroke()} stroke-width="1.6"/>`, s),
        camera: (s) => wrap(`<rect x="3" y="7" width="18" height="13" rx="2" ${stroke()}/><path d="M8 7l1.5-2.5h5L16 7" ${stroke()}/><circle cx="12" cy="13" r="3.5" ${stroke()}/>`, s),
        arrowUp: (s) => wrap(`<path d="M12 19V5m0 0l-6 6m6-6l6 6" ${stroke()} stroke-width="2"/>`, s),
        arrowDown: (s) => wrap(`<path d="M12 5v14m0 0l-6-6m6 6l6-6" ${stroke()} stroke-width="2"/>`, s),
        power: (s) => wrap(`<path d="M12 3v8" ${stroke()} stroke-width="2.2"/><path d="M6.3 6.5a8 8 0 1 0 11.4 0" ${stroke()}/>`, s),
        logout: (s) => wrap(`<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" ${stroke()}/><path d="M10 8l-4 4 4 4" ${stroke()}/><path d="M6 12h10" ${stroke()}/>`, s),
        restart: (s) => wrap(`<path d="M20 12a8 8 0 1 1-2.3-5.6" ${stroke()}/><path d="M20 3v4h-4" ${stroke()}/>`, s),
        shutdown: (s) => wrap(`<path d="M12 3v8" ${stroke()} stroke-width="2.2"/><path d="M6.3 6.5a8 8 0 1 0 11.4 0" ${stroke()}/>`, s),
        switchUser: (s) => wrap(`<circle cx="9" cy="8" r="3.5" ${stroke()}/><path d="M3 20a6 6 0 0 1 12 0" ${stroke()}/><path d="M16 8l4 4-4 4" ${stroke()}/><path d="M20 12h-6" ${stroke()}/>`, s),
        lock: (s) => wrap(`<rect x="5" y="11" width="14" height="9" rx="2" ${stroke()}/><path d="M8 11V8a4 4 0 0 1 8 0v3" ${stroke()}/>`, s),
        uninstall: (s) => wrap(`<path d="M4 7h16" ${stroke()}/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" ${stroke()}/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" ${stroke()}/><path d="M10 11v6M14 11v6" ${stroke()}/>`, s),
        save: (s) => wrap(`<path d="M5 3h11l3 3v15H5V3z" ${stroke()}/><path d="M8 3v5h7V3" ${stroke()}/><rect x="8" y="13" width="8" height="8" ${stroke()}/>`, s),
        info: (s) => wrap(`<circle cx="12" cy="12" r="9" ${stroke()}/><path d="M12 11v5" ${stroke()}/><circle cx="12" cy="8" r="1.1" fill="currentColor"/>`, s),
        search: (s) => wrap(`<circle cx="11" cy="11" r="7" ${stroke()}/><path d="M16 16l5 5" ${stroke()} stroke-width="2.2"/>`, s),
    };

    // ---- Settings glyphs (outline, currentColor) ----
    const settings = {
        system: (s) => wrap(`<rect x="3" y="4" width="18" height="12" rx="2" ${stroke()}/><path d="M9 20h6M12 16v4" ${stroke()}/><circle cx="12" cy="10" r="2" ${stroke()} stroke-width="1.4"/>`, s),
        personalization: (s) => actions.personalize(s),
        apps: (s) => wrap(`<rect x="3" y="3" width="8" height="8" rx="1.5" ${stroke()}/><rect x="13" y="3" width="8" height="8" rx="1.5" ${stroke()}/><rect x="3" y="13" width="8" height="8" rx="1.5" ${stroke()}/><rect x="13" y="13" width="8" height="8" rx="1.5" ${stroke()}/>`, s),
        accounts: (s) => wrap(`<circle cx="12" cy="8" r="4" ${stroke()}/><path d="M4 21a8 8 0 0 1 16 0" ${stroke()}/>`, s),
        time: (s) => wrap(`<circle cx="12" cy="12" r="9" ${stroke()}/><path d="M12 7v5l3.5 2" ${stroke()}/>`, s),
        privacy: (s) => wrap(`<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" ${stroke()}/><path d="M9.5 12l2 2 3.5-4" ${stroke()}/>`, s),
        update: (s) => actions.restart(s),
        about: (s) => actions.info(s),
        display: (s) => actions.display(s),
        sound: (s) => wrap(`<path d="M4 10v4h4l5 4V6l-5 4H4z" ${stroke()}/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" ${stroke()}/>`, s),
        soundMute: (s) => wrap(`<path d="M4 10v4h4l5 4V6l-5 4H4z" ${stroke()}/><path d="M16 9l6 6M22 9l-6 6" ${stroke()}/>`, s),
        notifications: (s) => wrap(`<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" ${stroke()}/><path d="M10 20a2 2 0 0 0 4 0" ${stroke()}/>`, s),
        power: (s) => wrap(`<rect x="2" y="8" width="17" height="9" rx="2" ${stroke()}/><path d="M21 11v3" ${stroke()} stroke-width="2.2"/><path d="M6 11v3M10 11v3" ${stroke()} stroke-width="1.4"/>`, s),
        storage: (s) => wrap(`<ellipse cx="12" cy="6" rx="8" ry="3" ${stroke()}/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" ${stroke()}/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" ${stroke()}/>`, s),
        multitasking: (s) => wrap(`<rect x="3" y="4" width="18" height="16" rx="2" ${stroke()}/><path d="M12 4v16M3 9h18" ${stroke()} stroke-width="1.4"/>`, s),
        touchpad: (s) => wrap(`<rect x="4" y="3" width="16" height="18" rx="3" ${stroke()}/><path d="M9 8v5M12 7v6M15 9v4" ${stroke()} stroke-width="1.4"/><path d="M9 16.5h6" ${stroke()}/>`, s),
        brightnessLow: (s) => wrap(`<circle cx="12" cy="12" r="3" ${stroke()}/><path d="M12 5v1.5M12 17.5V19M5 12h1.5M17.5 12H19" ${stroke()} stroke-width="1.4"/>`, s),
        brightnessHigh: (s) => wrap(`<circle cx="12" cy="12" r="4" ${stroke()}/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" ${stroke()}/>`, s),
        moon: (s) => wrap(`<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" ${stroke()}/>`, s),
        sun: (s) => wrap(`<circle cx="12" cy="12" r="4" ${stroke()}/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" ${stroke()}/>`, s),
        battery: (s) => wrap(`<rect x="2" y="8" width="17" height="9" rx="2" ${stroke()}/><path d="M21 11v3" ${stroke()} stroke-width="2.2"/><rect x="5" y="11" width="9" height="3" rx="1" fill="#00b894"/>`, s),
        swipe: (s) => wrap(`<path d="M8 12H3m0 0l3-3M3 12l3 3" ${stroke()}/><path d="M16 12h5m0 0l-3-3m3 3l-3 3" ${stroke()}/><rect x="8" y="7" width="8" height="10" rx="4" ${stroke()} stroke-width="1.4"/>`, s),
        tap: (s) => wrap(`<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V11m0-3a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.6 15a1.6 1.6 0 0 1 2.6-1.8L9 16.5" ${stroke()} stroke-width="1.4"/><circle cx="17.5" cy="4.5" r="1.4" ${stroke()} stroke-width="1.4"/>`, s),
        doubleTap: (s) => wrap(`<path d="M9 13V8a1.5 1.5 0 0 1 3 0v5m0-3.5a1.5 1.5 0 0 1 3 0V13m0-2a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7" ${stroke()} stroke-width="1.4"/><circle cx="8" cy="4" r="1.2" ${stroke()} stroke-width="1.3"/><circle cx="13" cy="3" r="1.2" ${stroke()} stroke-width="1.3"/>`, s),
        drag: (s) => wrap(`<path d="M12 3v10m0-10L9.5 5.5M12 3l2.5 2.5" ${stroke()}/><path d="M7 13a5 5 0 0 1 10 0v3a5 5 0 0 1-10 0v-3z" ${stroke()}/><path d="M7 21h10" ${stroke()}/>`, s),
        twoFingerTap: (s) => wrap(`<path d="M10 12V6a1.5 1.5 0 0 1 3 0v6m0-4a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3" ${stroke()} stroke-width="1.4"/><circle cx="17" cy="5" r="1.3" ${stroke()} stroke-width="1.3"/>`, s),
        twoFingerSwipe: (s) => wrap(`<path d="M7 5v10M11 5v10" ${stroke()} stroke-width="1.6"/><path d="M7 8L4 11l3 3M17 14l3 3-3 3" ${stroke()} stroke-width="1.4"/>`, s),
        hold: (s) => wrap(`<circle cx="12" cy="12" r="8" ${stroke()}/><circle cx="12" cy="12" r="3" ${stroke()}/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>`, s),
        slow: (s) => wrap(`<path d="M4 14a8 8 0 0 1 16 0" ${stroke()}/><path d="M12 14l-3-4" ${stroke()} stroke-width="2"/><circle cx="12" cy="14" r="1.4" fill="currentColor"/>`, s),
        fast: (s) => wrap(`<path d="M4 14a8 8 0 0 1 16 0" ${stroke()}/><path d="M12 14l3-4" ${stroke()} stroke-width="2"/><circle cx="12" cy="14" r="1.4" fill="currentColor"/>`, s),
    };

    // ---- Sidebar / special folder icons (colored) ----
    function folderBase(body = '#FFC107', tab = '#FFB300') {
        return `<path d="M2 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" fill="${body}"/><path d="M2 9h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z" fill="#000" opacity="0.12"/><path d="M2 9h20" stroke="#fff" stroke-opacity="0.5" stroke-width="1"/>`;
    }
    const places = {
        home: (s) => wrap(`<path d="M4 11l8-7 8 7" ${stroke('#4FC3F7', 2)}/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" ${stroke('#4FC3F7', 2)}/>`, s),
        desktop: (s) => wrap(`<rect x="3" y="4" width="18" height="12" rx="2" fill="#1E88E5"/><rect x="5" y="6" width="14" height="8" rx="1" fill="#90CAF9"/><path d="M9 20h6M12 16v4" stroke="#1E88E5" stroke-width="1.8" stroke-linecap="round"/>`, s),
        documents: (s) => wrap(`<path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#42A5F5"/><path d="M14 2v4h4" fill="#90CAF9"/><path d="M7 12h10M7 15.5h10M7 19h6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`, s),
        downloads: (s) => wrap(`${folderBase()}<path d="M12 10v6m0 0l-2.5-2.5M12 16l2.5-2.5" stroke="#5D4037" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 19h8" stroke="#5D4037" stroke-width="1.8" stroke-linecap="round"/>`, s),
        pictures: (s) => wrap(`<rect x="3" y="4" width="18" height="16" rx="2" fill="#43A047"/><circle cx="9" cy="10" r="1.8" fill="#fff"/><path d="M3 17l5-5 3 3 4-4 6 6v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1z" fill="#fff" opacity="0.9"/>`, s),
        music: (s) => wrap(`<circle cx="12" cy="12" r="9" fill="#AB47BC"/><path d="M10 16.5V8l6-1.5V15" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="8" cy="16.5" r="2" fill="#fff"/><circle cx="14" cy="15" r="2" fill="#fff"/>`, s),
        videos: (s) => wrap(`<rect x="3" y="5" width="18" height="14" rx="2" fill="#E53935"/><path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="#fff"/>`, s),
        recycle: (s) => wrap(`<path d="M4 7h16" stroke="#9E9E9E" stroke-width="1.8" stroke-linecap="round"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="#9E9E9E" stroke-width="1.8"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="#9E9E9E" stroke-width="1.8"/><path d="M10 11v6M14 11v6" stroke="#9E9E9E" stroke-width="1.8" stroke-linecap="round"/>`, s),
        recycleFull: (s) => wrap(`<path d="M4 7h16" stroke="#FF6B6B" stroke-width="1.8" stroke-linecap="round"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="#FF6B6B" stroke-width="1.8"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="#FF6B6B" stroke-width="1.8" fill="#FF6B6B" fill-opacity="0.15"/><path d="M10 11v6M14 11v6" stroke="#FF6B6B" stroke-width="1.8" stroke-linecap="round"/>`, s),
        thispc: (s) => wrap(`<rect x="3" y="4" width="18" height="12" rx="2" fill="#546E7A"/><rect x="5" y="6" width="14" height="8" rx="1" fill="#B0BEC5"/><path d="M9 20h6M12 16v4" stroke="#546E7A" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="10" r="2" fill="#ECEFF1"/>`, s),
        drive: (s) => wrap(`<rect x="3" y="8" width="18" height="9" rx="2" fill="#78909C"/><path d="M3 12h18" stroke="#546E7A" stroke-width="1.5"/><circle cx="17.5" cy="14.5" r="1" fill="#4CAF50"/><circle cx="7" cy="10" r="0.8" fill="#CFD8DC"/>`, s),
        folder: (s) => wrap(folderBase(), s),
        folderOpen: (s) => wrap(`<path d="M2 6a2 2 0 0 1 2-2h4l2 2h4" stroke="#FFB300" stroke-width="1.8" stroke-linecap="round"/><path d="M2 10c2-1 5-1.5 8-1.5l4 1c3 0 5 1 6 2l1 6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7z" fill="#FFC107"/>`, s),
        projects: (s) => wrap(`${folderBase('#FFA000')}<path d="M9 12h6M9 15h4" stroke="#5D4037" stroke-width="1.6" stroke-linecap="round"/>`, s),
        system: (s) => wrap(`${folderBase()}<circle cx="12" cy="14" r="3" fill="#fff"/><circle cx="12" cy="14" r="1" fill="#FFC107"/><path d="M12 10.5v1M12 16.5v1M8.5 14h1M14.5 14h1" stroke="#78909C" stroke-width="1.3" stroke-linecap="round"/>`, s),
        users: (s) => wrap(`${folderBase()}<circle cx="12" cy="13" r="2.2" fill="#fff"/><path d="M8.5 17a3.5 3.5 0 0 1 7 0" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>`, s),
        programs: (s) => wrap(`${folderBase()}<path d="M12 10l3 1.5v3L12 16l-3-1.5v-3L12 10z" fill="#fff"/><path d="M12 10v6M9 11.5l6 3M15 11.5l-6 3" stroke="#FFC107" stroke-width="1"/>`, s),
        wallpapers: (s) => wrap(`${folderBase()}<rect x="8" y="11.5" width="8" height="6" rx="1" fill="#fff"/><circle cx="10" cy="13.5" r="0.8" fill="#43A047"/><path d="M8 16l2.5-2.5 2 2 1.5-1.5 2 2" stroke="#43A047" stroke-width="1.2" fill="none"/>`, s),
        screenshots: (s) => wrap(`${folderBase()}<rect x="8" y="11.5" width="8" height="5.5" rx="1" fill="#fff"/><circle cx="12" cy="14.2" r="1.5" stroke="#455A64" stroke-width="1.2" fill="none"/><circle cx="14.5" cy="12.8" r="0.5" fill="#E53935"/>`, s),
    };

    // ---- File icons (colored doc + glyph) ----
    function doc(color, inner, size) {
        return wrap(`<path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="${color}"/><path d="M14 2v4h4" fill="#fff" opacity="0.55"/>${inner}`, size);
    }
    const files = {
        txt: (s) => doc('#78909C', `<path d="M7 12h10M7 15.5h10M7 19h6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`, s),
        md: (s) => doc('#42A5F5', `<path d="M7 12h10M7 15.5h7" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="16.5" cy="18.5" r="1.4" fill="#fff"/>`, s),
        json: (s) => doc('#FB8C00', `<path d="M9 12.5c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5H8c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5M15 12.5c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5h1c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/>`, s),
        js: (s) => doc('#FBC02D', `<path d="M9 14c0 2 1.5 2.5 3 2.5 1.2 0 2-.5 2-1.5 0-1.2-1.5-1.2-2.5-1.5-.8-.3-1.5-.7-1.5-1.7 0-1.2 1.2-1.8 2.5-1.8 1 0 2 .4 2.3 1.3" stroke="#5D4037" stroke-width="1.3" stroke-linecap="round" fill="none"/>`, s),
        html: (s) => doc('#EF6C00', `<path d="M8 11l-1.5 3L8 17M16 11l1.5 3L16 17M13 10l-2 8" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`, s),
        css: (s) => doc('#1E88E5', `<path d="M8 11h8M8 14.5h8M10 8h4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`, s),
        image: (s) => wrap(`<rect x="3" y="4" width="18" height="16" rx="2" fill="#43A047"/><circle cx="9" cy="10" r="1.8" fill="#fff"/><path d="M3 17l5-5 3 3 4-4 6 6v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1z" fill="#fff" opacity="0.9"/>`, s),
        audio: (s) => doc('#AB47BC', `<path d="M10 16.5V9l5-1.2V15" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="8" cy="16.5" r="1.8" fill="#fff"/><circle cx="13" cy="15" r="1.8" fill="#fff"/>`, s),
        video: (s) => doc('#E53935', `<path d="M9.5 11v5l4-2.5-4-2.5z" fill="#fff"/>`, s),
        pdf: (s) => doc('#D32F2F', `<path d="M7 14c0-2 1-3 3-3h2c1 0 1.5.8 1.5 1.5S13 14 12 14H9" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/><path d="M14.5 11v7M14.5 14h2.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`, s),
        docx: (s) => doc('#1E88E5', `<path d="M7 11h3l1.5 4L13 11h3l-3 8h-3l-3-8z" fill="#fff" opacity="0.95"/>`, s),
        xls: (s) => doc('#2E7D32', `<path d="M7 11h10M7 14.5h10M7 18h10M11 9v11" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`, s),
        ppt: (s) => doc('#EF6C00', `<rect x="7" y="10" width="10" height="7" rx="1" stroke="#fff" stroke-width="1.3"/><path d="M7 13.5h10" stroke="#fff" stroke-width="1.1"/>`, s),
        zip: (s) => doc('#8D6E63', `<path d="M9 3v6h6V3" stroke="#fff" stroke-width="1.3"/><rect x="7" y="9" width="10" height="11" rx="1.5" stroke="#fff" stroke-width="1.4"/><path d="M10 13h4M10 16h4" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`, s),
        exe: (s) => doc('#616161', `<path d="M9 8l6 4-6 4V8z" fill="#fff"/><path d="M16 8v8" stroke="#FFC107" stroke-width="1.6" stroke-linecap="round"/>`, s),
        bat: (s) => wrap(`<rect x="3" y="4" width="18" height="16" rx="2" fill="#212121"/><path d="M7 9l3 2-3 2" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 15h5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`, s),
        vbs: (s) => doc('#7E57C2', `<path d="M9 9l6 3-6 3V9z" fill="#fff"/>`, s),
        data: (s) => doc('#78909C', `<path d="M7 12h10M7 15.5h6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="16" cy="18" r="1.5" stroke="#fff" stroke-width="1.3"/>`, s),
        generic: (s) => doc('#90A4AE', `<path d="M7 12h10M7 15.5h7" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`, s),
    };

    const FOLDER_NAME_MAP = {
        'Desktop': 'desktop', 'Documents': 'documents', 'Downloads': 'downloads',
        'Pictures': 'pictures', 'Music': 'music', 'Videos': 'videos',
        'Projects': 'projects', 'New Folder': 'folder', 'system': 'system',
        'users': 'users', 'default': 'users', 'programs data': 'programs',
        'Wallpapers': 'wallpapers', 'Screenshots': 'screenshots',
        '$Recycle.Bin': 'recycle', 'C:': 'drive', 'Home': 'home', 'This PC': 'thispc'
    };
    const SIDEBAR_NAME_MAP = {
        'Home': 'home', 'Desktop': 'desktop', 'Documents': 'documents',
        'Downloads': 'downloads', 'Pictures': 'pictures', 'Music': 'music',
        'Videos': 'videos', 'Recycle Bin': 'recycle', 'This PC': 'thispc'
    };
    const FILE_EXT_MAP = {
        txt: 'txt', md: 'md', json: 'json', cfg: 'json', ini: 'json',
        js: 'js', mjs: 'js', html: 'html', htm: 'html', css: 'css',
        png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', bmp: 'image', svg: 'image', webp: 'image',
        mp3: 'audio', wav: 'audio', ogg: 'audio',
        mp4: 'video', avi: 'video', mkv: 'video', webm: 'video',
        pdf: 'pdf', doc: 'docx', docx: 'docx',
        xls: 'xls', xlsx: 'xls', csv: 'xls', ppt: 'ppt', pptx: 'ppt',
        zip: 'zip', rar: 'zip', '7z': 'zip',
        exe: 'exe', msi: 'exe', bat: 'bat', cmd: 'bat',
        vbs: 'vbs', vbe: 'vbs',
        log: 'data', xml: 'data', yml: 'data', yaml: 'data'
    };

    function folder(name, size = 32) {
        const key = FOLDER_NAME_MAP[name] || 'folder';
        return (places[key] || places.folder)(size);
    }
    function file(ext = '', name = '', size = 32) {
        if (name === 'config.json') return files.json(size);
        const key = FILE_EXT_MAP[String(ext || '').toLowerCase()] || 'generic';
        return (files[key] || files.generic)(size);
    }
    function sidebar(name, size = 16) {
        const key = SIDEBAR_NAME_MAP[name] || FOLDER_NAME_MAP[name] || 'folder';
        return (places[key] || places.folder)(size);
    }
    function action(name, size = 16) {
        return (actions[name] || actions.open)(size);
    }
    function setting(name, size = 20) {
        return (settings[name] || settings.system)(size);
    }
    function get(name, size = 24) {
        if (actions[name]) return actions[name](size);
        if (settings[name]) return settings[name](size);
        if (places[name]) return places[name](size);
        if (files[name]) return files[name](size);
        return places.folder(size);
    }

    return { get, folder, file, sidebar, action, setting, actions, settings, places, files };
})();

export default UIIcons;
