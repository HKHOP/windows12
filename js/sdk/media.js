// Windows 12 SDK — Media.
//
// Permission-gated getUserMedia: the OS grant is checked first (declared
// microphone/camera permission, revokable in Settings > Apps), then the
// browser's own device permission still applies. A revoked OS grant fails
// fast with PERMISSION_DENIED before any browser prompt appears; missing
// device APIs fail with UNSUPPORTED; a browser-side denial surfaces as
// PERMISSION_DENIED with the native name in details.
import InternalPermissions from '../modules/permissions.js';
import { ErrorCodes, SDKError, requireString, requireOptions } from './errors.js';

function supported() {
    try {
        return !!(typeof navigator !== 'undefined' && navigator.mediaDevices
            && typeof navigator.mediaDevices.getUserMedia === 'function');
    } catch { return false; }
}

async function request(appId, perm, constraints) {
    requireString(appId, 'appId');
    const opts = requireOptions(constraints, 'constraints');
    if (!InternalPermissions.isGranted(appId, perm)) {
        throw new SDKError(ErrorCodes.PERMISSION_DENIED,
            `"${appId}" needs the "${perm}" permission. Declare it in manifest.json — the user may have revoked it in Settings > Apps.`);
    }
    if (!supported()) {
        throw new SDKError(ErrorCodes.UNSUPPORTED, 'This device has no camera/microphone capture API.');
    }
    try {
        return await navigator.mediaDevices.getUserMedia(opts);
    } catch (e) {
        const name = (e && e.name) || 'UnknownError';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
            throw new SDKError(ErrorCodes.PERMISSION_DENIED,
                `The ${perm} was blocked at the browser/device prompt (${name}).`, { name });
        }
        if (name === 'NotFoundError' || name === 'OverconstrainedError') {
            throw new SDKError(ErrorCodes.UNSUPPORTED, `No ${perm} device satisfies the request (${name}).`, { name });
        }
        throw new SDKError(ErrorCodes.UNSUPPORTED, `Could not open the ${perm} (${name}).`, { name });
    }
}

/**
 * Open a microphone stream. Resolves a MediaStream for MediaRecorder,
 * AnalyserNode, or an <audio> element.
 * @param {string} appId
 * @param {object} [constraints] extra getUserMedia audio constraints
 * @returns {Promise<MediaStream>}
 */
function requestMicrophone(appId, constraints) {
    const opts = requireOptions(constraints, 'constraints');
    return request(appId, 'microphone', { audio: true, ...opts });
}

/**
 * Open a camera stream. Resolves a MediaStream for a <video> element or
 * frame scanning (e.g. QR via BarcodeDetector).
 * @param {string} appId
 * @param {object} [constraints] extra getUserMedia video constraints
 * @returns {Promise<MediaStream>}
 */
function requestCamera(appId, constraints) {
    const opts = requireOptions(constraints, 'constraints');
    return request(appId, 'camera', { video: true, ...opts });
}

export const Media = {
    supported,
    isSupported: supported,
    requestMicrophone,
    microphone: requestMicrophone,
    requestCamera,
    camera: requestCamera
};

export default Media;
