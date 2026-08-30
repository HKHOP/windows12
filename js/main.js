import WindowManager from './modules/windowManager.js';
import { Taskbar, AppRegistry } from './modules/taskbar.js';
import StartMenu from './modules/startMenu.js';
import Settings from './apps/settings.js';
import Notepad from './apps/notepad.js';
import FileExplorer from './apps/fileExplorer.js';

AppRegistry.register('settings', Settings);
AppRegistry.register('notepad', Notepad);
AppRegistry.register('fileExplorer', FileExplorer);

document.addEventListener('DOMContentLoaded', () => {
    WindowManager.init();
    Taskbar.init();
    StartMenu.init();
});
