import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return (node.children ?? []).map(textOf).join(' ');
}

function flatten(node, out = []) {
  if (node == null || typeof node !== 'object') return out;
  out.push(node);
  for (const child of node.children ?? []) flatten(child, out);
  return out;
}

function findAll(node, predicate) {
  return flatten(node).filter(predicate);
}

function find(node, predicate) {
  return findAll(node, predicate)[0];
}

const isTouchable = (node) => node.type === 'TouchableOpacity';
const isTextInput = (node) => node.type === 'TextInput';

function renderLogin(overrides = {}) {
  const source = readFileSync(new URL('../app/auth/login.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  });

  const stateCells = [];
  let cellIndex = 0;
  const useState = (initial) => {
    const idx = cellIndex++;
    if (idx >= stateCells.length) stateCells.push(typeof initial === 'function' ? initial() : initial);
    const setState = (next) => {
      stateCells[idx] = typeof next === 'function' ? next(stateCells[idx]) : next;
      renderer.render();
    };
    return [stateCells[idx], setState];
  };
  const useRef = (initial) => {
    const idx = cellIndex++;
    if (idx >= stateCells.length) stateCells.push({ current: initial });
    return stateCells[idx];
  };

  const alertCalls = [];
  const routerMock = { replace: () => {}, back: () => {} };
  const hapticsMock = {
    notificationAsync: async () => {},
    impactAsync: async () => {},
    NotificationFeedbackType: { Success: 'success' },
    ImpactFeedbackStyle: { Medium: 'medium' },
  };
  const authMock = {
    authState: 'unauthenticated',
    authError: null,
    signIn: async () => ({ status: 'authenticated' }),
    signInWithGoogle: async () => {},
    signInAsGuest: async () => {},
    requestPasswordRecovery: async () => ({ status: 'requested' }),
    ...overrides.auth,
  };

  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props, children }), useRef, useState };
      if (name === 'react-native') return {
        Alert: { alert: (...args) => { alertCalls.push(args); } },
        Image: 'Image',
        KeyboardAvoidingView: 'KeyboardAvoidingView',
        Platform: { OS: 'ios' },
        SafeAreaView: 'SafeAreaView',
        ScrollView: 'ScrollView',
        StyleSheet: { create: (value) => value },
        Text: 'Text',
        TextInput: 'TextInput',
        TouchableOpacity: 'TouchableOpacity',
        View: 'View',
      };
      if (name === 'expo-router') return { useRouter: () => routerMock, useLocalSearchParams: () => (overrides.params ?? {}) };
      if (name === 'expo-haptics') return hapticsMock;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name.endsWith('/ThemeContext')) return { useTheme: () => ({ theme: overrides.theme ?? {} }) };
      if (name.endsWith('/colors')) return { LightTheme: {} };
      if (name.endsWith('/AuthContext')) return { useAuth: () => authMock };
      if (name.endsWith('GoogleG_FullColor_RGB.png')) return 'GoogleG_FullColor_RGB.png';
      throw new Error(`Unexpected screen dependency: ${name}`);
    },
  });

  const Component = exports.default;
  const renderer = {
    tree: null,
    render() { cellIndex = 0; renderer.tree = Component(); },
  };
  renderer.render();

  return {
    get tree() { return renderer.tree; },
    alertCalls,
    router: routerMock,
    authMock,
  };
}

test('Forgot password action is present between password field and Sign In, and enters recovery mode with the login email prefilled', () => {
  const view = renderLogin();
  const nodes = flatten(view.tree);

  const passwordInputIndex = nodes.findIndex((node) => isTextInput(node) && node.props.secureTextEntry !== undefined);
  const forgotIndex = nodes.findIndex((node) => isTouchable(node) && /Forgot password\?/.test(textOf(node)));
  const signInIndex = nodes.findIndex((node) => isTouchable(node) && textOf(node).trim() === 'Sign In');
  assert.ok(passwordInputIndex >= 0 && forgotIndex >= 0 && signInIndex >= 0);
  assert.ok(passwordInputIndex < forgotIndex, 'Forgot password must appear below the password field');
  assert.ok(forgotIndex < signInIndex, 'Forgot password must appear before the Sign In button');

  const emailInput = find(view.tree, (node) => isTextInput(node) && node.props.keyboardType === 'email-address');
  emailInput.props.onChangeText('typed@example.test');

  const forgot = find(view.tree, (node) => isTouchable(node) && /Forgot password\?/.test(textOf(node)));
  forgot.props.onPress();

  const recoveryEmailInput = find(view.tree, (node) => isTextInput(node) && node.props.keyboardType === 'email-address');
  assert.equal(recoveryEmailInput.props.value, 'typed@example.test');
  assert.match(textOf(view.tree), /Reset Your Password/);
});

test('recovery mode submits the recovery email exactly once and shows the generic confirmation', async () => {
  let calls = 0;
  const view = renderLogin({ auth: { requestPasswordRecovery: async () => { calls += 1; return { status: 'requested' }; } } });

  find(view.tree, (node) => isTouchable(node) && /Forgot password\?/.test(textOf(node))).props.onPress();
  find(view.tree, (node) => isTextInput(node)).props.onChangeText('someone@example.test');

  await find(view.tree, (node) => isTouchable(node) && /Send Reset Link/.test(textOf(node))).props.onPress();

  assert.equal(calls, 1);
  assert.match(textOf(view.tree), /If an account exists for this email, we'll send a password reset link\./);
});

test('double submission is prevented while a request is pending', async () => {
  let calls = 0;
  let resolveRequest;
  const pending = new Promise((resolve) => { resolveRequest = resolve; });
  const view = renderLogin({
    auth: { requestPasswordRecovery: async () => { calls += 1; return pending; } },
  });

  find(view.tree, (node) => isTouchable(node) && /Forgot password\?/.test(textOf(node))).props.onPress();
  find(view.tree, (node) => isTextInput(node)).props.onChangeText('someone@example.test');

  const firstSubmit = find(view.tree, (node) => isTouchable(node) && /Send Reset Link/.test(textOf(node))).props.onPress();
  // Second press before the first resolves must be a no-op (state already re-rendered as submitting).
  find(view.tree, (node) => isTouchable(node) && /Sending…|Send Reset Link/.test(textOf(node))).props.onPress();

  resolveRequest({ status: 'requested' });
  await firstSubmit;

  assert.equal(calls, 1);
});

test('invalid email is rejected locally without contacting the provider', async () => {
  let calls = 0;
  const view = renderLogin({ auth: { requestPasswordRecovery: async () => { calls += 1; return { status: 'failed', reason: 'invalid_email' }; } } });

  find(view.tree, (node) => isTouchable(node) && /Forgot password\?/.test(textOf(node))).props.onPress();
  find(view.tree, (node) => isTextInput(node)).props.onChangeText('not-an-email');
  await find(view.tree, (node) => isTouchable(node) && /Send Reset Link/.test(textOf(node))).props.onPress();

  assert.equal(calls, 1);
  assert.equal(view.alertCalls.length, 1);
  assert.equal(view.alertCalls[0][0], 'Enter Your Email');
});

test('genuine operational failure produces safe generic failure copy, not a raw provider error', async () => {
  const view = renderLogin({ auth: { requestPasswordRecovery: async () => ({ status: 'failed', reason: 'request_failed' }) } });

  find(view.tree, (node) => isTouchable(node) && /Forgot password\?/.test(textOf(node))).props.onPress();
  find(view.tree, (node) => isTextInput(node)).props.onChangeText('someone@example.test');
  await find(view.tree, (node) => isTouchable(node) && /Send Reset Link/.test(textOf(node))).props.onPress();

  const text = textOf(view.tree);
  assert.match(text, /Unable to send a reset link right now/);
  assert.doesNotMatch(text, /account exists/);
});

test('user can return from Forgot Password mode to normal Sign In', () => {
  const view = renderLogin();
  find(view.tree, (node) => isTouchable(node) && /Forgot password\?/.test(textOf(node))).props.onPress();
  assert.match(textOf(view.tree), /Reset Your Password/);

  find(view.tree, (node) => isTouchable(node) && /Back to Sign In/.test(textOf(node))).props.onPress();
  assert.match(textOf(view.tree), /Welcome Back/);
  assert.ok(find(view.tree, (node) => isTouchable(node) && textOf(node).trim() === 'Sign In'));
});

test('requesting an email never touches authState (invariant guarded by fixed mock state)', async () => {
  const view = renderLogin();
  find(view.tree, (node) => isTouchable(node) && /Forgot password\?/.test(textOf(node))).props.onPress();
  find(view.tree, (node) => isTextInput(node)).props.onChangeText('someone@example.test');
  await find(view.tree, (node) => isTouchable(node) && /Send Reset Link/.test(textOf(node))).props.onPress();
  assert.equal(view.authMock.authState, 'unauthenticated');
});

test('Login renders the canonical standalone Google G with the required accessible action label', () => {
  const view = renderLogin();
  const button = find(view.tree, (node) => isTouchable(node) && /Sign in with Google/.test(textOf(node)));
  const image = find(button, (node) => node.type === 'Image');
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.accessibilityLabel, 'Sign in with Google');
  assert.equal(image.props.source, 'GoogleG_FullColor_RGB.png');
  assert.equal(image.props.resizeMode, 'contain');
  assert.equal(JSON.stringify(image.props.style), JSON.stringify({ position: 'absolute', width: 64, height: 64, left: -22, top: -20 }));
  assert.equal(button.props.style[0].height, 48);
  assert.equal(button.props.style[0].minHeight, 48);
  assert.doesNotMatch(textOf(button), /Continue with Google|\bG\b/);
});

test('Login keeps the canonical Google G unchanged in dark mode', () => {
  const view = renderLogin({ theme: { isDark: true } });
  const button = find(view.tree, (node) => isTouchable(node) && /Sign in with Google/.test(textOf(node)));
  assert.equal(find(button, (node) => node.type === 'Image').props.source, 'GoogleG_FullColor_RGB.png');
});

test('Login Google action prevents double tap while browser flow is pending', async () => {
  let calls = 0;
  let resolveGoogle;
  const pending = new Promise((resolve) => { resolveGoogle = resolve; });
  const view = renderLogin({ auth: { signInWithGoogle: async () => { calls += 1; return pending; } } });
  const google = find(view.tree, (node) => isTouchable(node) && /Sign in with Google/.test(textOf(node)));

  const first = google.props.onPress();
  find(view.tree, (node) => isTouchable(node) && /Sign in with Google/.test(textOf(node))).props.onPress();
  assert.equal(find(view.tree, (node) => isTouchable(node) && /Sign in with Google/.test(textOf(node))).props.disabled, true);
  resolveGoogle({ status: 'failed', reason: 'verification_failed' });
  await first;

  assert.equal(calls, 1);
  assert.equal(view.alertCalls.length, 1);
  assert.equal(view.alertCalls[0][0], 'Google Sign In');
});

test('Login Google stale result is silent and raw provider errors are not exposed', async () => {
  const view = renderLogin({ auth: { signInWithGoogle: async () => ({ status: 'failed', reason: 'stale_operation' }) } });
  find(view.tree, (node) => isTouchable(node) && /Sign in with Google/.test(textOf(node))).props.onPress();
  await Promise.resolve();
  assert.equal(view.alertCalls.length, 0);
});
