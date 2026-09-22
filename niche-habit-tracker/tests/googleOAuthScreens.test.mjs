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
const find = (node, predicate) => flatten(node).find(predicate);
const isTouchable = (node) => node.type === 'TouchableOpacity';

function renderSignup(overrides = {}) {
  const source = readFileSync(new URL('../app/auth/signup.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  });
  const cells = [];
  let cursor = 0;
  let renderer;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
    return [cells[index], (next) => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; renderer.render(); }];
  };
  const useRef = (initial) => {
    const index = cursor++;
    if (!(index in cells)) cells[index] = { current: initial };
    return cells[index];
  };
  const alerts = [];
  const auth = {
    signUp: async () => ({ status: 'verification_required' }),
    signInWithGoogle: async () => ({ status: 'failed', reason: 'stale_operation' }),
    ...overrides.auth,
  };
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props, children }), useState, useRef };
      if (name === 'react-native') return {
        Alert: { alert: (...args) => alerts.push(args) },
        Image: 'Image',
        KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, SafeAreaView: 'SafeAreaView',
        ScrollView: 'ScrollView', StyleSheet: { create: (value) => value }, Text: 'Text', TextInput: 'TextInput',
        TouchableOpacity: 'TouchableOpacity', View: 'View',
      };
      if (name === 'expo-router') return { useRouter: () => ({ replace: () => {}, back: () => {} }) };
      if (name === 'expo-haptics') return {
        impactAsync: async () => {}, notificationAsync: async () => {},
        ImpactFeedbackStyle: { Medium: 'medium' }, NotificationFeedbackType: { Success: 'success' },
      };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name.endsWith('/ThemeContext')) return { useTheme: () => ({ theme: overrides.theme ?? {} }) };
      if (name.endsWith('/colors')) return { LightTheme: {} };
      if (name.endsWith('/AuthContext')) return { useAuth: () => auth };
      if (name.endsWith('GoogleG_FullColor_RGB.png')) return 'GoogleG_FullColor_RGB.png';
      throw new Error(`Unexpected screen dependency: ${name}`);
    },
  });
  const Component = exports.default;
  renderer = { tree: null, render() { cursor = 0; renderer.tree = Component(); } };
  renderer.render();
  return { get tree() { return renderer.tree; }, alerts, auth };
}

function googleButton(view) {
  return find(view.tree, (node) => isTouchable(node) && /Sign up with Google/.test(textOf(node)));
}

test('Signup renders the canonical standalone Google G with the required accessible action label', () => {
  const view = renderSignup();
  const button = googleButton(view);
  const image = find(button, (node) => node.props?.source !== undefined);
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.accessibilityLabel, 'Sign up with Google');
  assert.equal(image.props.source, 'GoogleG_FullColor_RGB.png');
  assert.equal(image.props.resizeMode, 'contain');
  assert.equal(JSON.stringify(image.props.style), JSON.stringify({ position: 'absolute', width: 64, height: 64, left: -22, top: -20 }));
  assert.equal(button.props.style[0].height, 48);
  assert.equal(button.props.style[0].minHeight, 48);
  assert.doesNotMatch(textOf(button), /\bG\b/);
});

test('Signup keeps the canonical Google G unchanged in dark mode', () => {
  const view = renderSignup({ theme: { isDark: true } });
  assert.equal(find(googleButton(view), (node) => node.props?.source !== undefined).props.source, 'GoogleG_FullColor_RGB.png');
});

test('Signup Google action uses the shared AuthContext action once and disables while pending', async () => {
  let calls = 0;
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const view = renderSignup({ auth: { signInWithGoogle: async () => { calls += 1; return pending; } } });
  const first = googleButton(view);
  const firstPress = first.props.onPress();
  googleButton(view).props.onPress();
  assert.equal(googleButton(view).props.disabled, true);
  assert.equal(find(googleButton(view), (node) => node.props?.source !== undefined).props.source, 'GoogleG_FullColor_RGB.png');
  resolve({ status: 'authenticated' });
  await firstPress;
  assert.equal(calls, 1);
});

test('Signup Google cancellation and stale results remain silent', async () => {
  for (const result of [{ status: 'failed', reason: 'verification_failed' }, { status: 'failed', reason: 'stale_operation' }]) {
    const view = renderSignup({ auth: { signInWithGoogle: async () => result } });
    await googleButton(view).props.onPress();
    if (result.reason === 'stale_operation') assert.equal(view.alerts.length, 0);
    else assert.equal(view.alerts[0][0], 'Google Sign Up');
  }
});

test('Signup Google failure uses generic app-owned copy', async () => {
  const view = renderSignup({ auth: { signInWithGoogle: async () => ({ status: 'failed', reason: 'verification_failed' }) } });
  await googleButton(view).props.onPress();
  assert.deepEqual(view.alerts[0], ['Google Sign Up', 'Unable to start Google sign-in. Please try again.']);
});

test('Signup Google success does not navigate from browser initiation alone', async () => {
  const view = renderSignup({ auth: { signInWithGoogle: async () => ({ status: 'authenticated' }) } });
  await googleButton(view).props.onPress();
  assert.equal(view.alerts.length, 0);
});
