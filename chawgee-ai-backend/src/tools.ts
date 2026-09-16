import { tool } from 'ai';
import { z } from 'zod';

// 1. Schemas
const addCalendarEventSchema = z.object({
  title: z.string().describe('Title of the event or task'),
  startTime: z.string().describe('ISO timestamp for event start'),
  durationMinutes: z.number().describe('Duration of the event in minutes'),
  category: z.enum(['fitness', 'deep_work', 'nutrition', 'recovery']),
});

const updateBiometricsSchema = z.object({
  currentWeight: z.number().optional(),
  targetWeight: z.number().optional(),
  bodyFatPercentage: z.number().optional(),
  notes: z.string().optional().describe('Context for the biometric change'),
});

const adjustNutritionPlanSchema = z.object({
  newCalorieTarget: z.number(),
  reasoning: z.string().describe('Explanation of why the adjustment will produce better results'),
});

// 2. Exported Tools
export const agentTools = {
  addCalendarEvent: tool({
    description: 'Add a scheduled event, deep work block, or workout to the user calendar.',
    parameters: addCalendarEventSchema,
    execute: async (input: z.infer<typeof addCalendarEventSchema>) => {
      const { title, startTime, durationMinutes, category } = input;
      return { action: 'ADD_CALENDAR_EVENT', title, startTime, durationMinutes, category };
    },
  }),

  updateBiometrics: tool({
    description: 'Update user biometric stats immediately when tracked or changed.',
    parameters: updateBiometricsSchema,
    execute: async (biometrics: z.infer<typeof updateBiometricsSchema>) => {
      return { action: 'UPDATE_BIOMETRICS', biometrics, timestamp: new Date().toISOString() };
    },
  }),

  adjustNutritionPlan: tool({
    description: 'Modify daily caloric intake and macro targets based on fitness performance results.',
    parameters: adjustNutritionPlanSchema,
    execute: async (input: z.infer<typeof adjustNutritionPlanSchema>) => {
      const { newCalorieTarget, reasoning } = input;
      return { action: 'ADJUST_NUTRITION_PLAN', newCalorieTarget, reasoning };
    },
  }),
};