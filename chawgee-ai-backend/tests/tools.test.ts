import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentTools } from '../src/tools.js';

const executionOptions = {
  toolCallId: 'test-tool-call',
  messages: [],
  context: undefined,
};

test('addCalendarEvent remains executable with its declared input', async () => {
  const result = await agentTools.addCalendarEvent.execute({
    title: 'Morning workout',
    startTime: '2026-09-24T07:00:00.000Z',
    durationMinutes: 45,
    category: 'fitness',
  }, executionOptions);

  assert.deepEqual(result, {
    action: 'ADD_CALENDAR_EVENT',
    title: 'Morning workout',
    startTime: '2026-09-24T07:00:00.000Z',
    durationMinutes: 45,
    category: 'fitness',
  });
});

test('updateBiometrics remains executable with its declared input', async () => {
  const result = await agentTools.updateBiometrics.execute({ currentWeight: 70.5, notes: 'Weekly check-in' }, executionOptions);

  assert.equal(result.action, 'UPDATE_BIOMETRICS');
  assert.deepEqual(result.biometrics, { currentWeight: 70.5, notes: 'Weekly check-in' });
  assert.equal(typeof result.timestamp, 'string');
  assert.equal(Number.isNaN(Date.parse(result.timestamp)), false);
});

test('adjustNutritionPlan remains executable with its declared input', async () => {
  const result = await agentTools.adjustNutritionPlan.execute({
    newCalorieTarget: 2200,
    reasoning: 'Increase fuel for training volume.',
  }, executionOptions);

  assert.deepEqual(result, {
    action: 'ADJUST_NUTRITION_PLAN',
    newCalorieTarget: 2200,
    reasoning: 'Increase fuel for training volume.',
  });
});