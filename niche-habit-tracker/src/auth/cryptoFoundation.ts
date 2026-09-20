/**
 * Web Crypto Foundation
 *
 * For web, preserve the existing browser WebCrypto implementation.
 * Provide the same readiness-facing API as the native version for consistency.
 */

/**
 * Readiness state
 */
let readinessSucceeded = false;

/**
 * Validate browser WebCrypto is available and functional
 */
async function validateReadiness(): Promise<void> {
  if (!globalThis.crypto || typeof globalThis.crypto.subtle?.digest !== 'function') {
    throw new Error('Browser WebCrypto is not available or not fully supported');
  }

  if (typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('Crypto foundation is unavailable');
  }
  const randomTest = new Uint32Array(56);
  try {
    if (globalThis.crypto.getRandomValues(randomTest) !== randomTest) {
      throw new Error('Crypto foundation is unavailable');
    }
  } finally {
    randomTest.fill(0);
  }

  // Test SHA-256 known-answer
  const testInput = 'abc';
  const testEncoded = new TextEncoder().encode(testInput);
  const testDigest = await globalThis.crypto.subtle.digest('SHA-256', testEncoded);

  if (!(testDigest instanceof ArrayBuffer)) {
    throw new Error('WebCrypto digest did not return ArrayBuffer');
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
}

/**
 * Shared readiness gate
 *
 * Concurrent calls share the same initialization.
 */
let readinessPromise: Promise<void> | null = null;

async function ensureReadiness(): Promise<void> {
  if (readinessSucceeded) {
    return;
  }

  if (readinessPromise) {
    return readinessPromise;
  }

  readinessPromise = validateReadiness()
    .then(() => {
      readinessSucceeded = true;
    })
    .catch((error) => {
      throw error;
    });

  return readinessPromise;
}

/**
 * Get current readiness status
 */
function isReady(): boolean {
  return readinessSucceeded;
}

/**
 * Public API: Initialize crypto foundation (web version)
 * For web, browser WebCrypto is already available, just validate it.
 */
export async function initializeCryptoFoundation(): Promise<void> {
  try {
    await ensureReadiness();
  } catch {
    throw new Error('Crypto foundation is unavailable');
  }
}

/**
 * Public API: Check if crypto is ready
 */
export function isCryptoReady(): boolean {
  return isReady();
}

/**
 * Public API: Get readiness status details
 */
export async function getCryptoReadinessStatus(): Promise<{
  ready: boolean;
  randomAvailable: boolean;
  digestAvailable: boolean;
}> {
  try {
    await ensureReadiness();
    return {
      ready: true,
      randomAvailable: typeof globalThis.crypto?.getRandomValues === 'function',
      digestAvailable: typeof globalThis.crypto?.subtle?.digest === 'function',
    };
  } catch {
    return {
      ready: false,
      randomAvailable: false,
      digestAvailable: false,
    };
  }
}
