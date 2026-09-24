import { Router } from 'express';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from './config.js';
import { logOperationalFailure } from './http.js';

const openrouter = createOpenRouter({
  apiKey: config.openRouterApiKey,
});

const MODEL = config.openRouterOnboardingModel;

export type OnboardingTextGenerator = (prompt: string) => Promise<{ text: string }>;

const generateOnboardingText: OnboardingTextGenerator = async (prompt) => {
  const response = await generateText({
    model: openrouter(MODEL),
    prompt,
    temperature: 0,
  });
  return { text: response.text };
};

type OnboardingField =
  | 'primaryGoal'
  | 'units'
  | 'age'
  | 'gender'
  | 'height'
  | 'currentWeight'
  | 'targetWeight'
  | 'employmentStatus'
  | 'workLocation'
  | 'scheduleType'
  | 'nutritionTargets'
  | 'dailyCalories'
  | 'proteinGrams'
  | 'carbsGrams'
  | 'fatsGrams'
  | 'dailySteps'
  | 'deepWorkHours'
  | 'calendarSyncEnabled'
  | 'complete';

type ProfileDraft = Record<string, unknown>;

interface RecentMessage {
  role: 'assistant' | 'user';
  text: string;
}

type MessageIntent = 'answer' | 'question' | 'uncertain' | 'answer_and_question';

const FLOW: OnboardingField[] = [
  'primaryGoal',
  'units',
  'age',
  'gender',
  'height',
  'currentWeight',
  'targetWeight',
  'employmentStatus',
  'workLocation',
  'scheduleType',
  'nutritionTargets',
  'dailyCalories',
  'proteinGrams',
  'carbsGrams',
  'fatsGrams',
  'dailySteps',
  'deepWorkHours',
  'calendarSyncEnabled',
  'complete',
];

const quickRepliesFor = (field: OnboardingField, profile: ProfileDraft): string[] => {
  switch (field) {
    case 'primaryGoal':
      return ['Fitness', 'Nutrition', 'Productivity', 'A mix of everything'];
    case 'units':
      return ['KG / CM', 'LBS / FT'];
    case 'gender':
      return ['Male', 'Female', 'Prefer not to say'];
    case 'employmentStatus':
      return [];
    case 'workLocation':
      return profile.employmentStatus === 'Employed'
        ? ['Remote', 'In Office', 'Hybrid']
        : [];
    case 'scheduleType':
      return ['Set Shift', 'Asynchronous'];
    case 'nutritionTargets':
      return ['Recommend them for me', 'I know my targets'];
    case 'calendarSyncEnabled':
      return ['Yes', 'Not right now'];
    default:
      return [];
  }
};

const questionFor = (field: OnboardingField, profile: ProfileDraft): string => {
  const weightUnit = profile.weightUnit === 'lbs' ? 'lbs' : 'kg';
  const heightUnit = profile.heightUnit === 'ft' ? 'feet/inches' : 'cm';

  const missingManualMacros = [
    profile.dailyCalories === undefined ? 'daily calories' : null,
    profile.proteinGrams === undefined ? 'protein' : null,
    profile.carbsGrams === undefined ? 'carbs' : null,
    profile.fatsGrams === undefined ? 'fat' : null,
  ].filter(Boolean) as string[];

  switch (field) {
    case 'primaryGoal':
      return 'What would you most like help improving?';

    case 'units':
      return 'Before we get into your numbers, which measurement system do you prefer?';

    // Physical profile is intentionally grouped. The model can extract any or
    // all of these facts from one natural reply, and the server will ask only
    // for whatever is still missing afterward.
    case 'age':
      return `Tell me a little about you: your age, gender, and height in ${heightUnit}. You can answer all three together.`;

    case 'gender':
      return `And how would you like me to record your gender? If you haven't given me your height yet, you can include that too in ${heightUnit}.`;

    case 'height':
      return `What is your height in ${heightUnit}?`;

    // Current and desired weight belong in the same conversational turn.
    case 'currentWeight':
      return `What is your current weight in ${weightUnit}, and where would you ideally like your weight to be? You can also describe it naturally, like how much you want to lose or gain.`;

    case 'targetWeight':
      return `Where would you ideally like your weight to be? You can give me a target in ${weightUnit} or describe how much you'd like to lose or gain.`;

    // Work context is one concept. A single answer such as "I work remotely
    // with flexible hours" can satisfy all three fields.
    case 'employmentStatus':
      return 'Tell me about your usual work or school routine — whether you’re employed, studying, or neither, where you normally work from, and whether your schedule is fixed or flexible.';

    case 'workLocation':
      return 'Where do you usually work from, and is your schedule mostly fixed or flexible?';

    case 'scheduleType':
      return 'Is your schedule mostly a set shift, or is it more asynchronous and flexible?';

    case 'nutritionTargets':
      return 'For nutrition, do you already know the calorie and macro targets you want to use, or would you like me to recommend a starting point? If you know them, you can give me calories, protein, carbs, and fat together.';

    // Manual macros are grouped instead of four separate interview questions.
    case 'dailyCalories':
    case 'proteinGrams':
    case 'carbsGrams':
    case 'fatsGrams': {
      if (missingManualMacros.length > 1) {
        return `I still need your ${missingManualMacros.join(', ')} targets. You can give them all in one message.`;
      }
      if (field === 'dailyCalories') {
        return 'What daily calorie target would you like to use?';
      }
      if (field === 'proteinGrams') {
        return 'What daily protein target would you like to use, in grams?';
      }
      if (field === 'carbsGrams') {
        return 'What daily carbohydrate target would you like to use, in grams?';
      }
      return 'What daily fat target would you like to use, in grams?';
    }

    // Daily movement + focus targets are grouped.
    case 'dailySteps':
      return 'For your daily targets, what step goal feels realistic, and how many hours of focused or deep work would you like to aim for?';

    case 'deepWorkHours':
      return 'How many hours of focused or deep work would you like to aim for each day?';

    case 'calendarSyncEnabled':
      return 'Would you like me to use your calendar when making schedule and productivity suggestions?';

    case 'complete':
      return 'That gives me enough to build your starting profile.';

    default:
      return 'Tell me a little more.';
  }
};


const toKg = (weight: number, unit: unknown): number =>
  unit === 'lbs' ? weight * 0.45359237 : weight;

const toCm = (height: number, unit: unknown): number =>
  unit === 'ft' ? height * 30.48 : height;

const roundTo = (value: number, step: number): number =>
  Math.max(step, Math.round(value / step) * step);

const recommendNutritionTargets = (profile: ProfileDraft): ProfileDraft | null => {
  const age = toNumber(profile.age);
  const height = toNumber(profile.height);
  const weight = toNumber(profile.currentWeight);

  if (!age || !height || !weight) return null;

  const kg = toKg(weight, profile.weightUnit);
  const cm = toCm(height, profile.heightUnit);
  const gender = String(profile.gender ?? '').toLowerCase();

  // Mifflin-St Jeor is used only as a conservative starting estimate.
  // If gender is unspecified, use the midpoint of the male/female constants.
  const sexConstant =
    gender === 'male' ? 5 :
    gender === 'female' ? -161 :
    -78;

  const bmr = 10 * kg + 6.25 * cm - 5 * age + sexConstant;

  // Onboarding does not yet collect a reliable activity factor, so use a
  // modest baseline and present this as a starting estimate, not a prescription.
  const maintenance = bmr * 1.35;

  const targetWeight = toNumber(profile.targetWeight);
  const targetKg = targetWeight
    ? toKg(targetWeight, profile.weightUnit)
    : kg;

  let calorieAdjustment = 0;
  if (targetKg < kg - 0.5) calorieAdjustment = -300;
  if (targetKg > kg + 0.5) calorieAdjustment = 250;

  const dailyCalories = roundTo(
    Math.min(5000, Math.max(1200, maintenance + calorieAdjustment)),
    50
  );

  const proteinGrams = roundTo(kg * 1.6, 5);
  const fatsGrams = roundTo(Math.max(kg * 0.7, (dailyCalories * 0.25) / 9), 5);
  const remainingCalories = Math.max(
    0,
    dailyCalories - proteinGrams * 4 - fatsGrams * 9
  );
  const carbsGrams = roundTo(remainingCalories / 4, 5);

  return {
    dailyCalories,
    proteinGrams,
    carbsGrams,
    fatsGrams,
    nutritionTargetsSource: 'recommended',
  };
};

const nextFieldAfter = (field: OnboardingField, updates: ProfileDraft): OnboardingField => {
  if (field === 'nutritionTargets') {
    return updates.nutritionTargetsSource === 'recommended'
      ? 'dailySteps'
      : 'dailyCalories';
  }

  let index = FLOW.indexOf(field);
  if (index < 0) return 'primaryGoal';

  let next = FLOW[index + 1] ?? 'complete';

  // Skip work location when it is irrelevant or was already answered naturally
  // in the same response (for example, "I work remotely").
  if (
    next === 'workLocation' &&
    (
      updates.employmentStatus !== 'Employed' ||
      ['Remote', 'In Office', 'Hybrid'].includes(String(updates.workLocation))
    )
  ) {
    next = 'scheduleType';
  }

  return next;
};

const parseJsonObject = (text: string): Record<string, unknown> => {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('Model did not return JSON.');

  return JSON.parse(cleaned.slice(first, last + 1));
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return undefined;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};


const sanitizeSemanticUpdates = (
  raw: Record<string, unknown>,
  currentProfile: ProfileDraft
): ProfileDraft => {
  const updates: ProfileDraft = {};

  if (typeof raw.primaryGoal === 'string' && raw.primaryGoal.trim()) {
    updates.primaryGoal = raw.primaryGoal.trim().slice(0, 120);
  }

  const rawHeightUnit =
    raw.heightUnit === 'ft' || raw.heightUnit === 'cm'
      ? raw.heightUnit
      : undefined;
  const rawWeightUnit =
    raw.weightUnit === 'lbs' || raw.weightUnit === 'kg'
      ? raw.weightUnit
      : undefined;

  // Unit-system changes are accepted only as a complete pair. This keeps
  // subsequent questions deterministic and prevents partial unit drift.
  if (rawHeightUnit && rawWeightUnit) {
    updates.heightUnit = rawHeightUnit;
    updates.weightUnit = rawWeightUnit;
  }

  const age = toNumber(raw.age);
  if (age !== undefined && age >= 13 && age <= 120) {
    updates.age = Math.round(age);
  }

  if (typeof raw.gender === 'string' && raw.gender.trim()) {
    updates.gender = raw.gender.trim().slice(0, 60);
  }

  const height = toNumber(raw.height);
  if (height !== undefined && height > 0) {
    updates.height = height;
  }

  const currentWeight = toNumber(raw.currentWeight);
  if (currentWeight !== undefined && currentWeight > 0) {
    updates.currentWeight = currentWeight;
  }

  const targetWeight = toNumber(raw.targetWeight);
  if (targetWeight !== undefined && targetWeight > 0) {
    updates.targetWeight = targetWeight;
  }

  if (
    ['Employed', 'Unemployed', 'Student'].includes(
      String(raw.employmentStatus)
    )
  ) {
    updates.employmentStatus = raw.employmentStatus;
  }

  if (
    ['Remote', 'In Office', 'Hybrid'].includes(
      String(raw.workLocation)
    )
  ) {
    updates.workLocation = raw.workLocation;
  }

  if (
    ['Set Shift', 'Asynchronous'].includes(
      String(raw.scheduleType)
    )
  ) {
    updates.scheduleType = raw.scheduleType;
  }

  const nutritionSource = String(
    raw.nutritionTargetsSource ?? raw.nutritionTargets ?? ''
  ).toLowerCase();

  if (['recommended', 'recommend'].includes(nutritionSource)) {
    updates.nutritionTargetsSource = 'recommended';
  } else if (['manual', 'known', 'know'].includes(nutritionSource)) {
    updates.nutritionTargetsSource = 'manual';
  }

  const dailyCalories = toNumber(raw.dailyCalories);
  if (
    dailyCalories !== undefined &&
    dailyCalories >= 500 &&
    dailyCalories <= 10000
  ) {
    updates.dailyCalories = Math.round(dailyCalories);
  }

  const proteinGrams = toNumber(raw.proteinGrams);
  if (
    proteinGrams !== undefined &&
    proteinGrams >= 0 &&
    proteinGrams <= 1000
  ) {
    updates.proteinGrams = Math.round(proteinGrams);
  }

  const carbsGrams = toNumber(raw.carbsGrams);
  if (
    carbsGrams !== undefined &&
    carbsGrams >= 0 &&
    carbsGrams <= 1500
  ) {
    updates.carbsGrams = Math.round(carbsGrams);
  }

  const fatsGrams = toNumber(raw.fatsGrams);
  if (
    fatsGrams !== undefined &&
    fatsGrams >= 0 &&
    fatsGrams <= 500
  ) {
    updates.fatsGrams = Math.round(fatsGrams);
  }

  const dailySteps = toNumber(raw.dailySteps);
  if (
    dailySteps !== undefined &&
    dailySteps >= 100 &&
    dailySteps <= 100000
  ) {
    updates.dailySteps = Math.round(dailySteps);
  }

  const deepWorkHours = toNumber(raw.deepWorkHours);
  if (
    deepWorkHours !== undefined &&
    deepWorkHours >= 0 &&
    deepWorkHours <= 24
  ) {
    updates.deepWorkHours = deepWorkHours;
  }

  if (typeof raw.calendarSyncEnabled === 'boolean') {
    updates.calendarSyncEnabled = raw.calendarSyncEnabled;
  }

  // Never keep a location that conflicts with a clearly non-employed status.
  if (
    updates.employmentStatus &&
    updates.employmentStatus !== 'Employed'
  ) {
    delete updates.workLocation;
  }

  return updates;
};

const hasValue = (value: unknown): boolean =>
  value !== undefined &&
  value !== null &&
  !(typeof value === 'string' && value.trim() === '');

const fieldIsSatisfied = (
  field: OnboardingField,
  profile: ProfileDraft
): boolean => {
  switch (field) {
    case 'primaryGoal':
      return hasValue(profile.primaryGoal);

    case 'units':
      return (
        ['cm', 'ft'].includes(String(profile.heightUnit)) &&
        ['kg', 'lbs'].includes(String(profile.weightUnit))
      );

    case 'age':
      return hasValue(profile.age);

    case 'gender':
      return hasValue(profile.gender);

    case 'height':
      return hasValue(profile.height);

    case 'currentWeight':
      return hasValue(profile.currentWeight);

    case 'targetWeight':
      return hasValue(profile.targetWeight);

    case 'employmentStatus':
      return hasValue(profile.employmentStatus);

    case 'workLocation':
      return (
        profile.employmentStatus !== 'Employed' ||
        hasValue(profile.workLocation)
      );

    case 'scheduleType':
      return hasValue(profile.scheduleType);

    case 'nutritionTargets':
      return hasValue(profile.nutritionTargetsSource);

    case 'dailyCalories':
    case 'proteinGrams':
    case 'carbsGrams':
    case 'fatsGrams':
      return (
        profile.nutritionTargetsSource === 'recommended' ||
        hasValue(profile[field])
      );

    case 'dailySteps':
      return hasValue(profile.dailySteps);

    case 'deepWorkHours':
      return hasValue(profile.deepWorkHours);

    case 'calendarSyncEnabled':
      return typeof profile.calendarSyncEnabled === 'boolean';

    case 'complete':
      return true;

    default:
      return false;
  }
};

const nextMissingField = (
  profile: ProfileDraft,
  startAt?: OnboardingField
): OnboardingField => {
  const startIndex = startAt ? Math.max(FLOW.indexOf(startAt), 0) : 0;

  for (let i = startIndex; i < FLOW.length; i += 1) {
    const field = FLOW[i];

    if (field === 'complete') return 'complete';
    if (!fieldIsSatisfied(field, profile)) return field;
  }

  return 'complete';
};


export const createOnboardingRouter = (generateTextForOnboarding: OnboardingTextGenerator = generateOnboardingText): Router => {
  const router = Router();

  router.post('/api/chawgee/onboarding', async (req, res) => {
  try {
    const message = String(req.body?.message ?? '').trim();
    const expectedField = req.body?.expectedField as OnboardingField;
    const profile = (req.body?.profile ?? {}) as ProfileDraft;
    const recentMessages = Array.isArray(req.body?.recentMessages)
      ? (req.body.recentMessages as RecentMessage[])
          .filter(
            (item) =>
              item &&
              (item.role === 'assistant' || item.role === 'user') &&
              typeof item.text === 'string'
          )
          .slice(-8)
      : [];

    if (!message || !FLOW.includes(expectedField)) {
      return res.status(400).json({
        error: 'message and a valid expectedField are required',
      });
    }

    const extractionPrompt = `
You are Chawgee, a capable conversational onboarding assistant.

Your job is to understand what the user MEANS in the context of the whole conversation, not to mechanically extract the first literal value they mention.

Return ONLY valid JSON:
{
  "intent": "answer" | "question" | "uncertain" | "answer_and_question",
  "updates": {},
  "assistantLead": "string"
}

Interpretation principles:
- Use normal language understanding and the existing profile context.
- A user's response may contain one or several meaningful profile facts, a side question, or a combination of these.
- Extract every profile fact that is clearly supported by the user's meaning, even when it relates to an earlier part of the conversation.
- When the current question asks about several related things, treat the user's reply as a normal conversational answer: capture every clearly stated item, then let the server ask only for anything still missing.
- When a value is expressed relatively, infer the intended profile value from established context when the meaning is clear.
- Do not confuse a change amount with an absolute profile value.
- Use Existing profile as conversation context, while treating the user's latest message as the newest information when it clearly changes a profile value.
- If meaning is ambiguous, omit the uncertain update instead of guessing.
- If the user asks for help deciding, treat that as uncertainty/help-seeking rather than a failed answer.
- The server validates and stores profile updates, so return semantic meaning rather than implementation commentary.

Profile schema:
- primaryGoal: string
- heightUnit: "cm" | "ft"
- weightUnit: "kg" | "lbs"
- age: number
- gender: string
- height: number
- currentWeight: number
- targetWeight: number
- employmentStatus: "Employed" | "Unemployed" | "Student"
- workLocation: "Remote" | "In Office" | "Hybrid"
- scheduleType: "Set Shift" | "Asynchronous"
- nutritionTargetsSource: "recommended" | "manual"
- dailyCalories: number
- proteinGrams: number
- carbsGrams: number
- fatsGrams: number
- dailySteps: number
- deepWorkHours: number
- calendarSyncEnabled: boolean

Unit rule:
- If the user establishes a measurement system, return BOTH heightUnit and weightUnit together.
- Respect the unit system already stored in Existing profile unless the user explicitly changes it.
- Height stored with heightUnit="ft" should be decimal feet when needed.

assistantLead rules:
- React naturally to what the user actually said in 0-2 short sentences.
- Answer side questions briefly when appropriate.
- Do not ask the next onboarding question; the server will append it.
- Avoid scripted acknowledgements and repetitive openings.
- Never start with "Got it", "Thanks for sharing", "Perfect", "Great", or "Understood".
- Do not mechanically repeat the user's answer.
- If the user is uncertain, help them rather than treating the message as invalid.
- For health-related questions, keep guidance general and non-diagnostic.

Current expected onboarding item: ${expectedField}
Current question: ${JSON.stringify(questionFor(expectedField, profile))}
Existing profile: ${JSON.stringify(profile)}
Recent conversation: ${JSON.stringify(recentMessages)}
User message: ${JSON.stringify(message)}
`.trim();

    const extraction = await generateTextForOnboarding(extractionPrompt);

    const interpretation = parseJsonObject(extraction.text);
    const assistantLead =
      typeof interpretation.assistantLead === 'string'
        ? interpretation.assistantLead.trim()
        : '';

    const intent = (
      ['answer', 'question', 'uncertain', 'answer_and_question'].includes(
        String(interpretation.intent)
      )
        ? interpretation.intent
        : 'answer'
    ) as MessageIntent;

    const extractedUpdates =
      interpretation.updates &&
      typeof interpretation.updates === 'object' &&
      !Array.isArray(interpretation.updates)
        ? (interpretation.updates as Record<string, unknown>)
        : {};

    let profileUpdates = sanitizeSemanticUpdates(
      extractedUpdates,
      profile
    );

    const preliminaryMerged = {
      ...profile,
      ...profileUpdates,
    };

    if (
      preliminaryMerged.nutritionTargetsSource === 'recommended' &&
      (
        !hasValue(preliminaryMerged.dailyCalories) ||
        !hasValue(preliminaryMerged.proteinGrams) ||
        !hasValue(preliminaryMerged.carbsGrams) ||
        !hasValue(preliminaryMerged.fatsGrams)
      )
    ) {
      const recommended = recommendNutritionTargets(preliminaryMerged);

      if (recommended) {
        profileUpdates = {
          ...profileUpdates,
          ...recommended,
        };
      }
    }


    if (Object.keys(profileUpdates).length === 0) {
      if (expectedField === 'complete') {
        return res.json({
          assistantMessage:
            assistantLead ||
            'Your starting profile is ready. You can make any other changes here before launching, or update them later from your account.',
          profileUpdates: {},
          nextField: 'complete',
          quickReplies: [],
          isComplete: true,
        });
      }

      const currentQuestion = questionFor(expectedField, profile);
      const assistantMessage = [assistantLead, currentQuestion]
        .filter(Boolean)
        .join(' ');

      return res.json({
        assistantMessage,
        profileUpdates: {},
        nextField: expectedField,
        quickReplies: quickRepliesFor(expectedField, profile),
        isComplete: false,
      });
    }

    const merged = { ...profile, ...profileUpdates };

    // Advance to the first genuinely missing item rather than blindly moving
    // one step at a time. This lets one natural response satisfy multiple
    // onboarding questions without asking for the same information again.
    const currentIndex = Math.max(FLOW.indexOf(expectedField), 0);
    const nextField =
      expectedField === 'complete'
        ? nextMissingField(merged)
        : nextMissingField(
            merged,
            FLOW[currentIndex + 1] ?? 'complete'
          );
    const isComplete = nextField === 'complete';

    const nextQuestion = isComplete
      ? ''
      : questionFor(nextField, merged);

    let lead = assistantLead;

    if (
      profileUpdates.nutritionTargetsSource === 'recommended' &&
      hasValue(profileUpdates.dailyCalories) &&
      hasValue(profileUpdates.proteinGrams) &&
      hasValue(profileUpdates.carbsGrams) &&
      hasValue(profileUpdates.fatsGrams)
    ) {
      lead =
        `I’d start you around ${profileUpdates.dailyCalories} kcal, ` +
        `${profileUpdates.proteinGrams} g protein, ${profileUpdates.carbsGrams} g carbs, ` +
        `and ${profileUpdates.fatsGrams} g fat. These are starting estimates, so we can adjust them as we learn what works for you.`;
    }

    if (isComplete && !lead) {
      lead = 'That gives me enough to build your starting profile.';
    }

    const assistantMessage = [lead, nextQuestion]
      .filter(Boolean)
      .join(' ');

    return res.json({
      assistantMessage,
      profileUpdates,
      nextField,
      quickReplies: isComplete ? [] : quickRepliesFor(nextField, merged),
      isComplete,
    });
  } catch {
    logOperationalFailure('Chawgee onboarding request');
    return res.status(500).json({
      error: 'Unable to process onboarding response.',
    });
  }
  });

  return router;
};

const router = createOnboardingRouter();
export default router;
