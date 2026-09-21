import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function renderScreen(file, callback, authState = 'unauthenticated') {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props, children }) };
      if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Text: 'Text', View: 'View', StyleSheet: { create: (value) => value } };
      if (name.endsWith('/AuthCallbackHandoffContext')) return { useAuthCallbackHandoff: () => callback };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ authState }) };
      if (name.endsWith('/ThemeContext')) return { useTheme: () => ({ theme: {} }) };
      if (name.endsWith('/colors')) return { LightTheme: {} };
      // No router, SDK, URL or password APIs are allowed in these thin surfaces.
      throw new Error(`Unexpected screen dependency: ${name}`);
    },
  });
  return exports.default();
}
const callbackFile = '../app/auth/callback.tsx';

function textOf(node) {
  if (typeof node === 'string') return node;
  return node?.children?.map(textOf).join(' ') ?? '';
}

test('callback displays safe recovery processing and success status', () => {
  assert.match(textOf(renderScreen(callbackFile, { status: 'processing', intent: 'recovery' })), /Preparing password reset/);
  const text = textOf(renderScreen(callbackFile, { status: 'complete', result: { status: 'recovery' } }));
  assert.match(text, /Password reset ready/);
  assert.doesNotMatch(text, /Email verification complete/);
});

for (const reason of ['invalid_callback', 'verification_failed', 'device_verifier_missing', 'conflicting_identity', 'stale_operation', 'recovery_evidence_mismatch', 'replayed']) {
  test(`callback renders safe recovery copy for ${reason}`, () => {
    const text = textOf(renderScreen(callbackFile, { status: 'complete', result: {
      status: reason === 'replayed' ? 'replayed' : 'failed', reason, intent: 'recovery',
      // Synthetic extra data must never appear in the rendered output.
      providerError: 'synthetic-private-provider-message', code: 'synthetic-private-code',
    } }));
    assert.match(text, /Password reset could not be completed/);
    assert.doesNotMatch(text, /synthetic-private|email verification/);
    if (reason === 'device_verifier_missing') {
      assert.match(text, /on this device/);
      assert.doesNotMatch(text, /sign in|PKCE|verifier/);
    }
  });
}

test('verification status copy remains unchanged', () => {
  assert.match(textOf(renderScreen(callbackFile, { status: 'processing' })), /Verifying your email/);
  assert.match(textOf(renderScreen(callbackFile, { status: 'complete', result: { status: 'authenticated' } })), /Email verification complete/);
});
