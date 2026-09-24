import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ownsOnboardingRequest } from '../src/services/onboardingRequestOwnership.ts';

const onboardingSource = readFileSync(new URL('../app/auth/onboarding.tsx', import.meta.url), 'utf8');

const createHarness = () => {
  let currentController = null;
  const state = {
    profile: 'initial',
    currentField: 'primaryGoal',
    quickReplies: ['first'],
    messages: [],
    isComplete: false,
    isLoading: false,
  };

  const begin = () => {
    const controller = new AbortController();
    currentController?.abort();
    currentController = controller;
    state.isLoading = true;
    return controller;
  };

  const owns = (controller) => ownsOnboardingRequest(currentController, controller);

  const applySuccess = (controller, suffix) => {
    if (!owns(controller)) return;
    state.profile = `profile-${suffix}`;
    state.currentField = `field-${suffix}`;
    state.quickReplies = [`reply-${suffix}`];
    state.messages.push(`assistant-${suffix}`);
    state.isComplete = true;
  };

  const applyFailure = (controller, suffix) => {
    if (!owns(controller)) return;
    state.messages.push(`error-${suffix}`);
  };

  const finish = (controller) => {
    if (!owns(controller)) return;
    currentController = null;
    state.isLoading = false;
  };

  return { begin, applySuccess, applyFailure, finish, state, current: () => currentController };
};

test('stale success has no onboarding state authority while the newer request remains active', () => {
  const harness = createHarness();
  const requestA = harness.begin();
  const requestB = harness.begin();
  const before = structuredClone(harness.state);

  harness.applySuccess(requestA, 'A');
  harness.finish(requestA);

  assert.deepEqual(harness.state, { ...before, isLoading: true });
  assert.equal(harness.current(), requestB);

  harness.applySuccess(requestB, 'B');
  harness.finish(requestB);
  assert.deepEqual(harness.state, {
    profile: 'profile-B',
    currentField: 'field-B',
    quickReplies: ['reply-B'],
    messages: ['assistant-B'],
    isComplete: true,
    isLoading: false,
  });
});

test('stale failure has no message or loading authority while the newer request remains active', () => {
  const harness = createHarness();
  const requestA = harness.begin();
  const requestB = harness.begin();

  harness.applyFailure(requestA, 'A');
  harness.finish(requestA);

  assert.deepEqual(harness.state.messages, []);
  assert.equal(harness.state.isLoading, true);
  assert.equal(harness.current(), requestB);

  harness.applyFailure(requestB, 'B');
  harness.finish(requestB);
  assert.deepEqual(harness.state.messages, ['error-B']);
  assert.equal(harness.state.isLoading, false);
});

test('unmount invalidates ownership before an active request settles', () => {
  const harness = createHarness();
  const request = harness.begin();
  request.abort();
  harness.finish(request);
  harness.applySuccess(request, 'unmounted');
  harness.applyFailure(request, 'unmounted');

  assert.deepEqual(harness.state, {
    profile: 'initial',
    currentField: 'primaryGoal',
    quickReplies: ['first'],
    messages: [],
    isComplete: false,
    isLoading: false,
  });
});

test('onboarding screen gates asynchronous mutations and cleanup by ownership', () => {
  assert.match(onboardingSource, /const ownsRequest = \(\) => ownsOnboardingRequest\(/);
  assert.match(onboardingSource, /if \(!ownsRequest\(\)\) return;\n\n      const updatedProfile/);
  assert.match(onboardingSource, /\} catch \(error\) \{\n      if \(!ownsRequest\(\)\) return;/);
  assert.match(onboardingSource, /\} finally \{\n      if \(!ownsRequest\(\)\) return;/);
  assert.match(onboardingSource, /onboardingController\.current = null;\n  \}, \[\]\);/);
});