/**
 * Native Crypto Foundation
 *
 * Provides a minimal, auditable WebCrypto-compatible adapter for Supabase PKCE auth.
 * Uses expo-crypto as the trusted native provider.
 *
 * Contract:
 * - getRandomValues: fills typed array in place, delegates to expo-crypto
 * - subtle.digest: SHA-256 only, returns Promise<ArrayBuffer>, delegates to expo-crypto
 * - Fails closed: invalid input, missing implementation, or native failure throws/rejects
 * - No manual algorithm implementation
 * - No Math.random() fallback
 */

import * as ExpoCrypto from 'expo-crypto';
import type { IntBasedTypedArray, UintBasedTypedArray } from 'expo-modules-core';

type RandomTypedArray = IntBasedTypedArray | UintBasedTypedArray;

/**
 * Private marker for functions we explicitly trust from ExpoCrypto
 */
const trustedExpoCryptoRandom = ExpoCrypto.getRandomValues;
const trustedExpoCryptoDigest = ExpoCrypto.digest;

/**
 * Readiness state
 */
let readinessPromise: Promise<void> | null = null;
let readinessSucceeded = false;
let installedRandom: Crypto['getRandomValues'] | undefined;
let installedDigest: SubtleCrypto['digest'] | undefined;

/**
 * Validate that required globals are available and not broken
 */
function validateGlobals(): void {
  if (typeof TextEncoder !== 'function') {
    throw new Error('TextEncoder is not available');
  }
  if (typeof btoa !== 'function') {
    throw new Error('btoa is not available');
  }
}

/**
 * WebCrypto-compatible getRandomValues
 *
 * Accepts valid integer typed arrays, fills in place, returns the same array.
 * Enforces WebCrypto's 65,536-byte quota.
 * Delegates randomness to expo-crypto's trusted secure implementation.
 */
function getRandomValues<T extends RandomTypedArray>(array: T): T {
  // Validate input type
  if (!isValidTypedArray(array)) {
    throw new TypeError('Invalid typed array for getRandomValues');
  }

  // Check byteLength quota (65,536 bytes max per WebCrypto spec)
  const byteLength = array.byteLength ?? array.length * (array.BYTES_PER_ELEMENT ?? 1);
  if (byteLength > 65536) {
    throw new DOMException(
      'getRandomValues cannot generate more than 65,536 bytes',
      'QuotaExceededError'
    );
  }

  if (!trustedExpoCryptoRandom) {
    throw new Error('expo-crypto getRandomValues is not available');
  }

  // Delegate to expo-crypto for secure randomness
  const result = trustedExpoCryptoRandom(array);

  // Verify we got the same object back
  if (result !== array) {
    throw new Error('expo-crypto.getRandomValues did not return the same array');
  }

  return array;
}

/**
 * Check if value is a valid typed array for WebCrypto
 */
function isValidTypedArray(value: unknown): value is RandomTypedArray {
  if (!ArrayBuffer.isView(value)) {
    return false;
  }

  // Valid typed arrays for WebCrypto: integer-based
  const validTypes = [
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
  ];

  return validTypes.includes(Object.prototype.toString.call(value).slice(8, -1));
}

/**
 * WebCrypto-compatible subtle.digest
 *
 * Supports SHA-256 only (required for Supabase PKCE).
 * Accepts BufferSource forms (ArrayBuffer, Uint8Array, ArrayBufferView, etc).
 * Returns Promise<ArrayBuffer>.
 */
async function digest(
  algorithm: AlgorithmIdentifier,
  data: ArrayBuffer | ArrayBufferView
): Promise<ArrayBuffer> {
  // Normalize algorithm name
  const normalizedAlgorithm = normalizeAlgorithm(algorithm);

  if (normalizedAlgorithm !== 'SHA-256') {
    throw new DOMException(
      `Unsupported algorithm: ${normalizedAlgorithm}. Only SHA-256 is supported.`,
      'NotSupportedError'
    );
  }

  if (!trustedExpoCryptoDigest) {
    throw new Error('expo-crypto digest is not available');
  }

  // Extract exact view for the provided buffer source
  const view = extractBufferView(data);
  const digestInput = new Uint8Array(new ArrayBuffer(view.byteLength));
  digestInput.set(view);

  // Delegate to expo-crypto for SHA-256
  const result = await trustedExpoCryptoDigest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, digestInput);

  if (!(result instanceof ArrayBuffer)) {
    throw new Error('expo-crypto.digest did not return an ArrayBuffer');
  }

  return result;
}

/**
 * Normalize algorithm parameter to string
 */
function normalizeAlgorithm(algorithm: AlgorithmIdentifier): string {
  if (typeof algorithm === 'string') {
    return algorithm.toUpperCase();
  }
  if (algorithm && typeof algorithm === 'object' && 'name' in algorithm) {
    const name = (algorithm as any).name;
    if (typeof name === 'string') {
      return name.toUpperCase();
    }
  }
  throw new TypeError('Invalid algorithm format');
}

/**
 * Extract exact typed array view from BufferSource
 * Respects byteOffset and byteLength
 */
function extractBufferView(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(
      view.buffer,
      view.byteOffset,
      view.byteLength
    );
  }

  throw new TypeError('data must be an ArrayBuffer or ArrayBufferView');
}

/**
 * Perform async readiness validation
 *
 * Verifies:
 * - expo-crypto is available
 * - getRandomValues can be called
 * - TextEncoder and btoa are available
 * - SHA-256 produces known-answer result
 * - Global WebCrypto interface is safe to install
 */
async function validateReadiness(): Promise<void> {
  // Validate globals first
  validateGlobals();

  // Test secure random
  if (!trustedExpoCryptoRandom) {
    throw new Error('expo-crypto.getRandomValues is not available');
  }

  const randomTest = new Uint32Array(56);
  try {
    const filled = globalThis.crypto.getRandomValues(randomTest);
    if (filled !== randomTest) {
      throw new Error('expo-crypto did not return the same array');
    }
  } finally {
    randomTest.fill(0); // Clear immediately
  }

  // Test SHA-256 known-answer
  if (!trustedExpoCryptoDigest) {
    throw new Error('expo-crypto.digest is not available');
  }

  const testInput = 'abc';
  const testEncoded = new TextEncoder().encode(testInput);
  const testDigest = await globalThis.crypto.subtle.digest('SHA-256', testEncoded);

  if (!(testDigest instanceof ArrayBuffer)) {
    throw new Error('SHA-256 digest did not return ArrayBuffer');
  }

  const testBytes = new Uint8Array(testDigest);
  if (testBytes.length !== 32) {
    throw new Error('SHA-256 digest has incorrect length');
  }

  // Verify known-answer for 'abc'
  const testBinary = Array.from(testBytes, (b) => String.fromCharCode(b)).join('');
  const testBase64Url = btoa(testBinary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const expectedSHA256Base64Url = 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0';
  if (testBase64Url !== expectedSHA256Base64Url) {
    throw new Error('SHA-256 produced incorrect result');
  }

  // Final validation: trusted references are still the same
  if (ExpoCrypto.getRandomValues !== trustedExpoCryptoRandom) {
    throw new Error('expo-crypto.getRandomValues reference changed during validation');
  }
  if (ExpoCrypto.digest !== trustedExpoCryptoDigest) {
    throw new Error('expo-crypto.digest reference changed during validation');
  }
}

/**
 * Shared readiness gate
 *
 * Concurrent calls share the same initialization.
 * Once succeeded, all future calls succeed immediately.
 * Once failed, all future calls fail with the same error.
 */
async function ensureReadiness(): Promise<void> {
  if (readinessSucceeded) {
    if (!isReady()) throw new Error('Crypto foundation is unavailable');
    return;
  }

  if (readinessPromise) {
    return readinessPromise;
  }

  readinessPromise = Promise.resolve().then(() => {
    installGlobalCrypto();
    return validateReadiness();
  })
    .then(() => {
      readinessSucceeded = true;
    })
    .catch((error) => {
      throw error;
    });

  return readinessPromise;
}

/**
 * Get current readiness status (for probes)
 */
function isReady(): boolean {
  return readinessSucceeded &&
    globalThis.crypto?.getRandomValues === installedRandom &&
    globalThis.crypto?.subtle?.digest === installedDigest &&
    typeof TextEncoder === 'function' && typeof btoa === 'function';
}

/**
 * Install minimal global WebCrypto interface if needed
 *
 * Preserves existing trusted implementations.
 * Adds missing required functionality.
 * Fails closed if installation is unsafe.
 */
function installGlobalCrypto(): void {
  if (typeof globalThis === 'undefined') {
    throw new Error('globalThis is not available');
  }

  const existing = globalThis.crypto;

  if (existing != null && typeof existing !== 'object') {
    throw new Error('Crypto foundation is unavailable');
  }
  const cryptoInterface = existing ?? {} as Crypto;
  // Native trust is established by references to the audited Expo provider.
  // Preserve unrelated functionality; never replace an unknown provider.
  if (cryptoInterface.getRandomValues != null &&
      cryptoInterface.getRandomValues !== getRandomValues &&
      cryptoInterface.getRandomValues !== trustedExpoCryptoRandom) {
    throw new Error('Crypto foundation is unavailable');
  }
  if (cryptoInterface.subtle != null && typeof cryptoInterface.subtle !== 'object') {
    throw new Error('Crypto foundation is unavailable');
  }
  if (cryptoInterface.subtle?.digest != null && cryptoInterface.subtle.digest !== digest) {
    throw new Error('Crypto foundation is unavailable');
  }
  if (cryptoInterface.getRandomValues == null) {
    Object.defineProperty(cryptoInterface, 'getRandomValues', { value: getRandomValues, configurable: true });
  }
  if (cryptoInterface.subtle == null) {
    Object.defineProperty(cryptoInterface, 'subtle', { value: {}, configurable: true });
  }
  if (cryptoInterface.subtle.digest == null) {
    Object.defineProperty(cryptoInterface.subtle, 'digest', { value: digest, configurable: true });
  }
  if (!existing) {
    Object.defineProperty(globalThis, 'crypto', { value: cryptoInterface, configurable: true });
  }
  installedRandom = globalThis.crypto.getRandomValues;
  installedDigest = globalThis.crypto.subtle.digest;
}

/**
 * Public API: Initialize crypto foundation on app startup
 */
export async function initializeCryptoFoundation(): Promise<void> {
  try {
    await ensureReadiness();
  } catch {
    throw new Error('Crypto foundation is unavailable');
  }
}

/**
 * Public API: Check if crypto is ready (for probes)
 */
export function isCryptoReady(): boolean {
  return isReady();
}

/**
 * Public API: Get readiness status details (for diagnostics)
 */
export async function getCryptoReadinessStatus(): Promise<{
  ready: boolean;
  randomAvailable: boolean;
  digestAvailable: boolean;
}> {
  try {
    await ensureReadiness();
    return {
      ready: isReady(),
      randomAvailable: isReady(),
      digestAvailable: isReady(),
    };
  } catch {
    return {
      ready: false,
      randomAvailable: false,
      digestAvailable: false,
    };
  }
}
