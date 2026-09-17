// Windows 12 SDK — stable public errors.
//
// Every SDK boundary validates its arguments and throws SDKError (never a
// bare TypeError or a leaked low-level exception) so apps can reliably do:
//   try { ... } catch (e) { if (e.code === 'NOT_INSTALLED') ... }

/** Stable machine-readable error codes. */
export const ErrorCodes = {
    INVALID_ARGS: 'INVALID_ARGS',
    NOT_FOUND: 'NOT_FOUND',
    NOT_INSTALLED: 'NOT_INSTALLED',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    UNSUPPORTED: 'UNSUPPORTED'
};

/** The only error type the SDK throws. */
export class SDKError extends Error {
    /**
     * @param {string} code one of ErrorCodes
     * @param {string} message human-readable detail
     * @param {any} [details] optional structured context
     */
    constructor(code, message, details) {
        super(`[Windows12 SDK: ${code}] ${message}`);
        this.name = 'SDKError';
        this.code = code;
        this.details = details === undefined ? null : details;
    }
}

/**
 * Throw SDKError(code, message) unless cond is truthy.
 * @param {any} cond
 * @param {string} code
 * @param {string} message
 * @param {any} [details]
 */
export function assert(cond, code, message, details) {
    if (!cond) throw new SDKError(code, message, details);
}

/**
 * Require a non-empty string argument.
 * @param {any} value
 * @param {string} name argument name for the error message
 * @returns {string} the validated value
 */
export function requireString(value, name) {
    assert(typeof value === 'string' && value.length > 0,
        ErrorCodes.INVALID_ARGS, `${name} must be a non-empty string.`);
    return value;
}

/**
 * Require a plain options object (or undefined → {}).
 * @param {any} value
 * @param {string} name
 * @returns {object}
 */
export function requireOptions(value, name) {
    if (value === undefined || value === null) return {};
    assert(typeof value === 'object' && !Array.isArray(value),
        ErrorCodes.INVALID_ARGS, `${name} must be an options object.`);
    return value;
}

/**
 * Require a function argument.
 * @param {any} value
 * @param {string} name
 * @returns {Function}
 */
export function requireFunction(value, name) {
    assert(typeof value === 'function',
        ErrorCodes.INVALID_ARGS, `${name} must be a function.`);
    return value;
}
