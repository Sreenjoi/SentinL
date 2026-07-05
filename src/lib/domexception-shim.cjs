/**
 * This is a shim for node-domexception to fix the deprecation warning.
 * It simply exports the native DOMException available in Node.js 17+.
 */
module.exports = globalThis.DOMException;
