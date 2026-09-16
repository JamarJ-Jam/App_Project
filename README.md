# Chawgee

**Chawgee is an AI-powered personal performance and accountability platform designed to help users turn their goals, schedules, habits, and daily data into actionable decisions.**

Rather than functioning as a traditional habit tracker, Chawgee acts as an intelligent personal assistant that understands what a user is trying to accomplish and helps them determine what to do next.

## What is Chawgee?

Most productivity, fitness, and nutrition apps operate independently. Your calendar knows your schedule, your fitness app knows your workouts, your nutrition tracker knows what you eat, and your task manager knows what you need to accomplish.

Chawgee is being built to connect these areas.

The platform combines information about a user's:

- Fitness and physical goals
- Nutrition
- Productivity and deep work
- Tasks and priorities
- Calendar and available time
- Personal goals
- Daily progress

Chawgee uses this context to generate personalized guidance, identify opportunities in the user's schedule, monitor progress, and help users make better decisions throughout their day.

## Chawgee AI

At the center of the platform is **Chawgee**, an agentic AI assistant.

Chawgee is designed to do more than answer questions. It uses information from across the application to understand the user's current situation, goals, and constraints.

This allows Chawgee to eventually help users:

- Generate personalized daily briefings
- Analyze progress toward goals
- Identify available time in a user's schedule
- Recommend when important tasks should be completed
- Suggest adjustments when plans fall behind
- Analyze workout and nutrition progress
- Recognize patterns across multiple days
- Help users create realistic goals when they are unsure where to start
- Adapt recommendations as more information becomes available

The long-term goal is for Chawgee to function as a **personal accountability and performance agent** rather than simply another chatbot inside an app.

## Core Areas

### Dashboard

The Dashboard provides a high-level view of the user's day and current progress.

It brings together important information such as fitness progress, nutrition, productivity, upcoming activities, and AI-generated insights.

### Fitness

The Fitness system allows users to manage workouts, exercises, biometrics, and fitness goals while maintaining a history of their progress.

Chawgee can use this information to better understand the user's physical goals and provide relevant recommendations.

### Nutrition

Nutrition tracking allows users to compare their daily intake against personalized targets.

The goal is to connect nutrition decisions with fitness goals, daily activity, and longer-term progress rather than treating calorie tracking as an isolated metric.

### Efficiency

Efficiency focuses on how users spend their time.

It is being designed around tasks, priorities, deep-work targets, completion tracking, daily timelines, and eventually intelligent scheduling.

This information gives Chawgee the context necessary to understand both **what the user wants to accomplish and when they realistically have time to accomplish it.**

### Calendar Intelligence

Calendar integration will allow Chawgee to understand meetings, commitments, tasks, workouts, and available time.

Rather than simply displaying calendar events, Chawgee will use the schedule as context when generating recommendations and helping users plan their day.

## Personalized Onboarding

Chawgee uses conversational onboarding to understand the user's goals and circumstances.

Instead of requiring users to already know things such as ideal calorie targets, productivity strategies, or fitness terminology, Chawgee is designed to explain unfamiliar concepts, provide reasonable options, and help users establish realistic starting points.

The information gathered during onboarding becomes part of the context used to personalize the rest of the application.

## Technology

Chawgee is currently being developed using:

**Frontend**
- React Native
- Expo
- TypeScript
- Expo Router

**Backend**
- Node.js
- Express
- TypeScript

**AI**
- Vercel AI SDK
- OpenRouter
- Large Language Models with tool-calling capabilities

The application uses a separate AI backend responsible for processing user context, communicating with language models, and coordinating Chawgee's AI capabilities.

## Project Structure

```text
App_Project/
├── niche-habit-tracker/      # React Native / Expo application
└── chawgee-ai-backend/       # Chawgee AI and API backend
