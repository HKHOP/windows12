// Windows 12 SDK — TypeScript declarations (reference only; the runtime
// stays dependency-free vanilla JS). SDK contract version 1.2.0.
declare module '../../sdk/index.js' {
    export const SDK_VERSION: string;
    export function createApp(def: { id: string; name?: string }): BoundApp;

    export interface WindowBounds {
        x: number;
        y: number;
        width: number;
        height: number;
        maximized: boolean;
        minimized: boolean;
    }
    export interface WindowHandle {
        id: string;
        appId: string;
        title: string;
        icon: string;
        element: HTMLElement;
        isMaximized: boolean;
        minimized: boolean;
        resizable: boolean;
        dragging: boolean;
        resizing: boolean;
    }
    export interface CreateWindowOptions {
        appId: string;
        title?: string;
        icon?: string;
        content?: string;
        width?: number;
        height?: number;
        minWidth?: number;
        minHeight?: number;
        resizable?: boolean;
        saveState?: boolean;
    }
    export interface FileEntry {
        name: string;
        type: 'file' | 'folder';
        ext: string;
        modified: number;
        size: number;
        blob: boolean;
    }
    export interface ShortcutOptions {
        scope?: HTMLElement;
        owner?: string;
        allowInInputs?: boolean;
        preventDefault?: boolean;
        stopPropagation?: boolean;
        system?: boolean;
        description?: string;
    }
    export interface NotificationOptions {
        appId?: string;
        sticky?: boolean;
        critical?: boolean;
        silent?: boolean;
        tag?: string;
        timeout?: number;
        actions?: Array<{ label: string; value?: string; primary?: boolean }>;
        fields?: Array<{ key: string; label: string; type?: string; value?: string; placeholder?: string; options?: string[] }>;
        onAction?: (value: string, id: string) => void;
        onSubmit?: (data: Record<string, string>, id: string) => void;
        onDismiss?: (reason: string, id?: string) => void;
    }
    export interface MenuItem {
        label: string;
        icon?: string;
        shortcut?: string;
        action?: () => void;
        disabled?: boolean;
    }
    export interface BoundApp {
        id: string;
        name: string;
        icon(): string;
        window: {
            create(options: Omit<CreateWindowOptions, 'appId'>): WindowHandle;
            byId(id: string): WindowHandle | null;
            focus(id: string): boolean;
            isFocused(id: string): boolean;
            focused(): WindowHandle | null;
            minimize(id: string): boolean;
            restore(id: string): boolean;
            isMinimized(id: string): boolean;
            toggleMaximize(id: string): boolean;
            maximize(id: string): boolean;
            unmaximize(id: string): boolean;
            isMaximized(id: string): boolean;
            bounds(id: string): WindowBounds | null;
            getBounds(id: string): WindowBounds | null;
            setBounds(id: string, bounds: Partial<Pick<WindowBounds, 'x' | 'y' | 'width' | 'height'>>): boolean;
            position(id: string): { x: number; y: number } | null;
            move(id: string, x: number, y: number): boolean;
            size(id: string): { width: number; height: number } | null;
            resize(id: string, width: number, height: number): boolean;
            center(id: string): boolean;
            desktopArea(): { ox: number; oy: number; w: number; h: number };
            isResizable(id: string): boolean;
            setResizable(id: string, resizable: boolean): boolean;
            isDragging(id: string): boolean;
            isResizing(id: string): boolean;
            onDragState(cb: (id: string, dragging: boolean) => void): () => void;
            onResizeState(cb: (id: string, resizing: boolean) => void): () => void;
            onBoundsChanged(cb: (id: string, bounds: WindowBounds) => void): () => void;
            onClosed(cb: (appId: string, windowId: string) => void): () => void;
            onMinimizeState(cb: (appId: string, windowId: string, minimized: boolean) => void): () => void;
            onFocusChanged(cb: (appId: string | null) => void): () => void;
            setFullscreen(id: string): Promise<boolean>;
            exitFullscreen(id?: string): boolean;
            isFullscreen(id: string): boolean;
            setTitle(id: string, title: string): boolean;
            setMinSize(id: string, minWidth: number, minHeight: number): boolean;
            close(id: string): void;
            requestClose(id: string): Promise<boolean>;
            closeAll(): void;
            requestCloseAll(): Promise<void>;
            open(): WindowHandle[];
            all(): WindowHandle[];
        };
        files: {
            read(name: string): string | null;
            write(name: string, content: string): boolean;
            exists(name: string): boolean;
            list(subfolder?: string): FileEntry[];
            mkdir(name: string): boolean;
            remove(name: string): boolean;
            rename(name: string, newName: string): boolean;
            settings: {
                get(key: string, fallback?: unknown): unknown;
                set(key: string, value: unknown): void;
                all(): Record<string, unknown>;
            };
        };
        notify: {
            info(title: string, message: string, options?: NotificationOptions): string;
            action(title: string, message: string, options?: NotificationOptions): string;
            form(title: string, message: string, options?: NotificationOptions): string;
        };
        keyboard: {
            register(combo: string, callback: (e: KeyboardEvent) => boolean | void, options?: ShortcutOptions): () => void;
            unregister(ref: string | (() => void)): boolean;
            unregisterAll(): number;
            isDown(name: string): boolean;
        };
        permissions: {
            has(perm: string): boolean;
            require(perm: string): true;
            declared(): string[];
        };
        lifecycle: {
            onClose(handler: (w: WindowHandle) => boolean | void | Promise<boolean | void>): void;
            offClose(): void;
            onWindowClose(windowId: string, handler: (w: WindowHandle) => boolean | void | Promise<boolean | void>): (() => void) | null;
            offWindowClose(windowId: string, handler: (w: WindowHandle) => boolean | void | Promise<boolean | void>): void;
        };
        pointerLock: {
            request(element: Element): Promise<boolean>;
            exit(): boolean;
            isLocked(element?: Element): boolean;
            onChange(cb: (detail: { element: Element | null; locked: boolean; error?: boolean }) => void): () => void;
        };
        input: {
            keyState(element: HTMLElement, options?: { prevent?: string[] | true }): {
                isDown(code: string): boolean;
                clear(): void;
                onKeyDown(cb: (d: { code: string; event: KeyboardEvent }) => void): () => void;
                onKeyUp(cb: (d: { code: string; event: KeyboardEvent }) => void): () => void;
                dispose(): void;
                element: HTMLElement;
            };
        };
        audio: {
            supported(): boolean;
            context(): AudioContext;
            masterGain(): GainNode;
            masterVolume(): number;
            unlock(): Promise<string>;
            suspend(): void;
            state(): string;
            beep(opts?: { freq?: number; endFreq?: number; duration?: number; type?: OscillatorType; volume?: number; delay?: number }): void;
        };
        background: {
            canRun(): boolean;
            isBackground(): boolean;
            goBackground(): Promise<boolean>;
            bringToForeground(): boolean;
        };
        media: {
            microphone(constraints?: object): Promise<MediaStream>;
            camera(constraints?: object): Promise<MediaStream>;
            supported(): boolean;
        };
        dialogs: typeof Dialogs;
        clipboard: typeof Clipboard;
        apps: typeof Apps;
        settings: typeof Settings;
        shell: typeof Shell;
        associations: typeof FileAssociations;
        system: typeof System;
        events: typeof Events;
    }

    export const WindowManager: {
        create(options: CreateWindowOptions): WindowHandle;
        createWindow(appId: string, title: string, icon: string, content: string, options?: object): WindowHandle;
        get(id: string): WindowHandle | null;
        focus(id: string): boolean;
        isFocused(id: string): boolean;
        getFocused(): WindowHandle | null;
        minimize(id: string): boolean;
        restore(id: string): boolean;
        isMinimized(id: string): boolean;
        toggleMaximize(id: string): boolean;
        maximize(id: string): boolean;
        unmaximize(id: string): boolean;
        isMaximized(id: string): boolean;
        getBounds(id: string): WindowBounds | null;
        setBounds(id: string, bounds: Partial<Pick<WindowBounds, 'x' | 'y' | 'width' | 'height'>>): boolean;
        getPosition(id: string): { x: number; y: number } | null;
        setPosition(id: string, x: number, y: number): boolean;
        getSize(id: string): { width: number; height: number } | null;
        setSize(id: string, width: number, height: number): boolean;
        center(id: string): boolean;
        getDesktopArea(): { ox: number; oy: number; w: number; h: number };
        isResizable(id: string): boolean;
        setResizable(id: string, resizable: boolean): boolean;
        isDragging(id: string): boolean;
        isResizing(id: string): boolean;
        onDragState(cb: (id: string, dragging: boolean) => void): () => void;
        onResizeState(cb: (id: string, resizing: boolean) => void): () => void;
        onBoundsChanged(cb: (id: string, bounds: WindowBounds) => void): () => void;
        onClosed(cb: (appId: string, windowId: string) => void): () => void;
        onMinimizeState(cb: (appId: string, windowId: string, minimized: boolean) => void): () => void;
        onFocusChanged(cb: (appId: string | null) => void): () => void;
        setFullscreen(id: string): Promise<boolean>;
        exitFullscreen(id?: string): boolean;
        isFullscreen(id: string): boolean;
        setTitle(id: string, title: string): boolean;
        setMinSize(id: string, minWidth: number, minHeight: number): boolean;
        close(id: string): void;
        requestClose(id: string): Promise<boolean>;
        closeAll(appId: string): void;
        requestCloseAll(appId: string): Promise<void>;
        getByApp(appId: string): WindowHandle[];
        getAllWindows(): WindowHandle[];
        getAll(): WindowHandle[];
    };
    export const PointerLock: {
        request(element: Element, appId?: string): Promise<boolean>;
        exit(): boolean;
        isLocked(element?: Element): boolean;
        onChange(cb: (detail: { element: Element | null; locked: boolean; error?: boolean }) => void): () => void;
    };
    export const Input: {
        keyState(element: HTMLElement, options?: { prevent?: string[] | true }): {
            isDown(code: string): boolean;
            clear(): void;
            onKeyDown(cb: (d: { code: string; event: KeyboardEvent }) => void): () => void;
            onKeyUp(cb: (d: { code: string; event: KeyboardEvent }) => void): () => void;
            dispose(): void;
            element: HTMLElement;
        };
    };
    export const Audio: {
        supported(): boolean;
        isSupported(): boolean;
        context(): AudioContext;
        masterGain(): GainNode;
        masterVolume(): number;
        unlock(): Promise<string>;
        suspend(): void;
        state(): string;
        beep(opts?: { freq?: number; endFreq?: number; duration?: number; type?: OscillatorType; volume?: number; delay?: number }): void;
    };
    export const FileSystem: {
        readFile(path: string[]): string | null;
        read(path: string[]): string | null;
        writeFile(path: string[], content: string): boolean;
        write(path: string[], content: string): boolean;
        createFile(dir: string[], name: string, content?: string, ext?: string): boolean;
        createFolder(dir: string[], name: string): boolean;
        deleteFile(path: string[]): boolean;
        delete(path: string[]): boolean;
        remove(path: string[]): boolean;
        destroy(path: string[]): boolean;
        rename(path: string[], newName: string): boolean;
        move(srcPath: string[], destDir: string[]): boolean;
        exists(path: string[]): boolean;
        isFolder(path: string[]): boolean;
        list(path: string[]): FileEntry[];
        getChildren(path: string[]): FileEntry[];
        isBlob(path: string[]): boolean;
        writeBlob(dir: string[], name: string, blob: Blob, ext?: string): Promise<boolean>;
        readBlob(path: string[]): Promise<Blob | null>;
        recycleBin(): Array<Record<string, unknown>>;
        getRecycleBinContent(): Array<Record<string, unknown>>;
        restoreFromRecycleBin(recycleKey: string): boolean;
        emptyRecycleBin(): boolean;
        storageInfo(): { used: number; quota: number };
        pickSave(options?: object): Promise<{ path: string[]; name: string; fullName: string; ext: string } | null>;
        saveDialog(options?: object): Promise<{ path: string[]; name: string; fullName: string; ext: string } | null>;
    };
    export const Notifications: {
        info(title: string, message: string, options?: NotificationOptions): string;
        action(title: string, message: string, options?: NotificationOptions): string;
        form(title: string, message: string, options?: NotificationOptions): string;
        forum(title: string, message: string, options?: NotificationOptions): string;
        dismiss(id: string): void;
        clearAll(): void;
        clear(): void;
        getAll(): Array<Record<string, unknown>>;
        open(): void;
        close(): void;
        toggle(): void;
        setDoNotDisturb(enabled: boolean): void;
        isDoNotDisturb(): boolean;
    };
    export const Dialogs: {
        alert(title: string, message: string): Promise<string>;
        info(title: string, message: string): Promise<string>;
        warn(title: string, message: string): Promise<string>;
        error(title: string, message: string): Promise<string>;
        confirm(title: string, message: string): Promise<boolean>;
        text(title: string, message: string, options?: { value?: string; placeholder?: string }): Promise<string | null>;
        textbox(title: string, message: string, options?: { value?: string; placeholder?: string }): Promise<string | null>;
        select(title: string, message: string, options: Array<string | { label: string }>): Promise<unknown>;
        pick(title: string, message: string, options: Array<string | { label: string }>): Promise<unknown>;
        form(title: string, fields: Array<Record<string, unknown>>): Promise<Record<string, string> | null>;
        forum(title: string, fields: Array<Record<string, unknown>>): Promise<Record<string, string> | null>;
    };
    export const Keyboard: {
        register(combo: string, callback: (e: KeyboardEvent) => boolean | void, options?: ShortcutOptions): () => void;
        unregister(ref: string | (() => void)): boolean;
        unregisterAll(owner: string): number;
        list(): Array<Record<string, unknown>>;
        isDown(name: string): boolean;
    };
    export const Clipboard: {
        writeText(text: string): Promise<void>;
        readText(): Promise<string>;
        sync(): Promise<void>;
        syncFromSystemClipboard(): Promise<void>;
        show(): void;
        hide(): void;
        toggle(): void;
        isOpen(): boolean;
        getHistory(): Array<Record<string, unknown>>;
        getHistoryItems(): Array<Record<string, unknown>>;
        clearHistory(): void;
    };
    export const Apps: {
        get(id: string): Record<string, unknown> | null;
        getManifest(id: string): Record<string, unknown> | null;
        getMetadata(id: string): { name: string; icon: string };
        getAll(): Array<Record<string, unknown>>;
        isInstalled(id: string): boolean;
        launch(id: string, options?: object): boolean;
        open(id: string, options?: object): boolean;
        install(idOrUuid: string): Promise<boolean>;
        uninstall(idOrUuid: string): Promise<boolean>;
        getPermissions(id: string): string[];
        hasPermission(id: string, perm: string): boolean;
    };
    export const Settings: {
        get(key: string): unknown;
        getAll(): Record<string, unknown>;
        set(key: string, value: unknown): void;
        open(): void;
        openPage(page: string, subPage?: string): void;
    };
    export const Shell: {
        icons: {
            app(id: string): string;
            action(name: string, size?: number): string;
            file(ext: string, fileName?: string, size?: number): string;
            folder(name: string, size?: number): string;
            sidebar(name: string, size?: number): string;
            setting(name: string, size?: number): string;
        };
        contextMenu(x: number, y: number, items: Array<MenuItem | 'separator'>): void;
        showContextMenu(x: number, y: number, items: Array<MenuItem | 'separator'>): void;
        files: {
            open(path: string[], onOpened?: (appId: string) => void): boolean;
            openWith(path: string[], onOpened?: (appId: string) => void): void;
            openWithApp(path: string[], appId: string, onOpened?: (appId: string) => void): boolean;
        };
        openFile(path: string[], onOpened?: (appId: string) => void): boolean;
        openWith(path: string[], onOpened?: (appId: string) => void): void;
        activity: {
            trackFileOpen(path: string[], name: string): void;
            trackAppOpen(appId: string): void;
            recommended(): Array<Record<string, unknown>>;
        };
    };
    export const FileAssociations: {
        register(appId: string, extensions: string[], openFn: (path: string[], content: string) => void): void;
        unregister(appId: string): void;
        getCandidates(extension: string): Array<Record<string, unknown>>;
        getAllCapable(): string[];
        getDefault(extension: string): string | null;
        setDefault(extension: string, appId: string): boolean;
        clearDefault(extension: string): boolean;
        getSupportedExtensions(): string[];
    };
    export const System: {
        info(): { name: string; version: string; build: string };
        version(): { name: string; version: string; build: string };
        theme(): 'dark' | 'light';
        setTheme(mode: 'dark' | 'light'): void;
        accent(): string;
        setAccent(color: string): void;
    };
    export const Events: {
        on(name: string, handler: (e: CustomEvent) => void): () => void;
        off(ref: (() => void) | string): boolean;
        names(): string[];
        supported(): string[];
    };
    export const Permissions: {
        known(): string[];
        getDeclared(appId: string): string[];
        has(appId: string, perm: string): boolean;
        require(appId: string, perm: string): true;
        request(appId: string): Promise<boolean>;
        requestInstallConsent(appId: string): Promise<boolean>;
        catalog(): Record<string, { label: string; description: string }>;
        getCatalog(): Record<string, { label: string; description: string }>;
        iconFor(perm: string): string;
    };
    export const Lifecycle: {
        onClose(appId: string, handler: (w: WindowHandle) => boolean | void | Promise<boolean | void>): void;
        offClose(appId: string): void;
        onWindowClose(windowId: string, handler: (w: WindowHandle) => boolean | void | Promise<boolean | void>): (() => void) | null;
        offWindowClose(windowId: string, handler: (w: WindowHandle) => boolean | void | Promise<boolean | void>): void;
    };
    export const Background: {
        canRun(appId: string): boolean;
        canRunBackground(appId: string): boolean;
        isService(appId: string): boolean;
        isBackground(appId: string): boolean;
        running(): string[];
        getBackgroundApps(): string[];
        goBackground(appId: string): Promise<boolean>;
        requestBackground(appId: string): Promise<boolean>;
        bringToForeground(appId: string): boolean;
        startService(appId: string): Promise<boolean>;
        stopService(appId: string): Promise<boolean>;
    };
    export const Media: {
        supported(): boolean;
        isSupported(): boolean;
        requestMicrophone(appId: string, constraints?: object): Promise<MediaStream>;
        microphone(appId: string, constraints?: object): Promise<MediaStream>;
        requestCamera(appId: string, constraints?: object): Promise<MediaStream>;
        camera(appId: string, constraints?: object): Promise<MediaStream>;
    };
    export class SDKError extends Error {
        code: string;
        details: unknown;
        constructor(code: string, message: string, details?: unknown);
    }
    export const ErrorCodes: Record<string, string>;

    const Windows12: {
        SDK_VERSION: string;
        version: string;
        createApp(def: { id: string; name?: string }): BoundApp;
        WindowManager: typeof WindowManager;
        FileSystem: typeof FileSystem;
        Files: typeof FileSystem;
        Notifications: typeof Notifications;
        Dialogs: typeof Dialogs;
        Keyboard: typeof Keyboard;
        Clipboard: typeof Clipboard;
        Apps: typeof Apps;
        Settings: typeof Settings;
        Shell: typeof Shell;
        FileAssociations: typeof FileAssociations;
        System: typeof System;
        Events: typeof Events;
        Permissions: typeof Permissions;
        Lifecycle: typeof Lifecycle;
        Background: typeof Background;
        Media: typeof Media;
        PointerLock: typeof PointerLock;
        Input: typeof Input;
        Audio: typeof Audio;
        SDKError: typeof SDKError;
        ErrorCodes: Record<string, string>;
    };
    export default Windows12;
}
