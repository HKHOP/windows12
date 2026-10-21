// Windows Update — the app.
//
// The window itself is drawn by the shell module (js/modules/windowsUpdate.js),
// which owns the update service (js/modules/updateService.js): the service
// checks for updates in the background, downloads them and asks for a
// restart. This app is the face of that service.
import WindowsUpdate from '../../modules/windowsUpdate.js';

export function launch() {
    WindowsUpdate.launch();
}
