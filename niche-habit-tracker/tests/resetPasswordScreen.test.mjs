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

function find(node, predicate) {
  return flatten(node).find(predicate);
}

const isTouchable = (node) => node.type === 'TouchableOpacity';
const isTextInput = (node) => node.type === 'TextInput';

function renderResetPassword(overrides = {}) {
  const source = readFileSync(new URL('../app/auth/reset-password.tsx', import.meta.url), 'utf8');
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

  const alertCalls = [];
  const replaceCalls = [];
  const routerMock = { replace: (...args) => { replaceCalls.push(args); } };
  const authMock = {
    authState: 'recovery',
    completePasswordRecovery: async () => ({ status: 'completed' }),
    ...overrides.auth,
  };

  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props, children }), useState };
      if (name === 'react-native') return {
        Alert: { alert: (...args) => { alertCalls.push(args); } },
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
      if (name === 'expo-router') return { useRouter: () => routerMock };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name.endsWith('/AuthContext')) return { useAuth: () => authMock };
      if (name.endsWith('/ThemeContext')) return { useTheme: () => ({ theme: {} }) };
      if (name.endsWith('/colors')) return { LightTheme: {} };
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
    replaceCalls,
    authMock,
  };
}

test('reset-password renders nothing outside authoritative recovery', () => {
  for (const state of ['loading', 'unauthenticated', 'authenticated', 'guest', 'verification_required', 'bootstrap_failed', 'recovery_processing', 'recovery_interrupted']) {
    const view = renderResetPassword({ auth: { authState: state } });
    assert.equal(view.tree, null);
  }
});

test('recovery state renders the new-password form', () => {
  const view = renderResetPassword();
  assert.match(textOf(view.tree), /Create a New Password/);
  assert.ok(find(view.tree, (node) => isTextInput(node) && node.props.secureTextEntry !== undefined));
});

test('blank password is rejected locally before calling completePasswordRecovery', async () => {
  let calls = 0;
  const view = renderResetPassword({ auth: { completePasswordRecovery: async () => { calls += 1; return { status: 'completed' }; } } });

  await find(view.tree, (node) => isTouchable(node) && /Update Password/.test(textOf(node))).props.onPress();

  assert.equal(calls, 0);
  assert.equal(view.alertCalls[0][0], 'Missing Password');
});

test('mismatched confirmation is rejected locally before calling completePasswordRecovery', async () => {
  let calls = 0;
  const view = renderResetPassword({ auth: { completePasswordRecovery: async () => { calls += 1; return { status: 'completed' }; } } });
  const inputs = flatten(view.tree).filter(isTextInput);
  inputs[0].props.onChangeText('NewPassword1');
  inputs[1].props.onChangeText('Different1');

  await find(view.tree, (node) => isTouchable(node) && /Update Password/.test(textOf(node))).props.onPress();

  assert.equal(calls, 0);
  assert.equal(view.alertCalls[0][0], 'Passwords Do Not Match');
});

test('valid submission calls completePasswordRecovery exactly once and navigates to Login on success', async () => {
  let calls = 0;
  let receivedPassword;
  const view = renderResetPassword({
    auth: { completePasswordRecovery: async (password) => { calls += 1; receivedPassword = password; return { status: 'completed' }; } },
  });
  const inputs = flatten(view.tree).filter(isTextInput);
  inputs[0].props.onChangeText('NewPassword1');
  inputs[1].props.onChangeText('NewPassword1');

  await find(view.tree, (node) => isTouchable(node) && /Update Password/.test(textOf(node))).props.onPress();

  assert.equal(calls, 1);
  assert.equal(receivedPassword, 'NewPassword1');
  assert.equal(view.replaceCalls.length, 1);
  assert.equal(view.replaceCalls[0][0].pathname, '/auth/login');
  assert.equal(view.replaceCalls[0][0].params.passwordUpdated, '1');
});

test('double submission is prevented while an update is pending', async () => {
  let calls = 0;
  let resolveUpdate;
  const pending = new Promise((resolve) => { resolveUpdate = resolve; });
  const view = renderResetPassword({ auth: { completePasswordRecovery: async () => { calls += 1; return pending; } } });
  const inputs = flatten(view.tree).filter(isTextInput);
  inputs[0].props.onChangeText('NewPassword1');
  inputs[1].props.onChangeText('NewPassword1');

  const first = find(view.tree, (node) => isTouchable(node) && /Update Password/.test(textOf(node))).props.onPress();
  find(view.tree, (node) => isTouchable(node) && /Updating…|Update Password/.test(textOf(node))).props.onPress();

  resolveUpdate({ status: 'completed' });
  await first;

  assert.equal(calls, 1);
});

for (const [reason, expectedText] of [
  ['not_authorized', /reset link is no longer valid/],
  ['invalid_password', /Enter a new password/],
  ['update_failed', /Unable to update your password/],
  ['cleanup_failed', /could not safely finish this session/],
]) {
  test(`failure reason ${reason} shows safe copy without navigating or exposing internals`, async () => {
    const view = renderResetPassword({
      auth: { completePasswordRecovery: async () => ({ status: 'failed', reason, providerError: 'synthetic-private-detail' }) },
    });
    const inputs = flatten(view.tree).filter(isTextInput);
    inputs[0].props.onChangeText('NewPassword1');
    inputs[1].props.onChangeText('NewPassword1');

    await find(view.tree, (node) => isTouchable(node) && /Update Password/.test(textOf(node))).props.onPress();

    const text = textOf(view.tree);
    assert.match(text, expectedText);
    assert.doesNotMatch(text, /synthetic-private-detail/);
    assert.equal(view.replaceCalls.length, 0);
  });
}

test('a temporary update failure allows retry while still authoritative', async () => {
  let calls = 0;
  const view = renderResetPassword({
    auth: { completePasswordRecovery: async () => { calls += 1; return calls === 1 ? { status: 'failed', reason: 'update_failed' } : { status: 'completed' }; } },
  });
  const inputs = flatten(view.tree).filter(isTextInput);
  inputs[0].props.onChangeText('NewPassword1');
  inputs[1].props.onChangeText('NewPassword1');

  await find(view.tree, (node) => isTouchable(node) && /Update Password/.test(textOf(node))).props.onPress();
  await find(view.tree, (node) => isTouchable(node) && /Update Password/.test(textOf(node))).props.onPress();

  assert.equal(calls, 2);
  assert.equal(view.replaceCalls.length, 1);
});
