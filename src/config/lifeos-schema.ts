/**
 * LifeOS Database Schema
 *
 * Centralized configuration for Israel's personal Notion LifeOS databases.
 * This is the single source of truth for database IDs and property schemas.
 */

export const LIFEOS_DATABASES = {
  TASKS: 'collection://2dff8fbf-cf75-81ec-9d5a-000bd513a35c',
  NOTES: 'collection://2dff8fbf-cf75-8171-b984-000b1a6487f3',
  DECISIONS: 'collection://8df780cc-91fe-4c51-9c59-d8f20c7dbd7b',
  JOURNAL: 'collection://2dff8fbf-cf75-816e-8222-000ba6610bff',
  GOALS: 'collection://2dff8fbf-cf75-811f-a2e7-000b753d5c5a',
} as const;

export type LifeOSDatabase = keyof typeof LIFEOS_DATABASES;

/**
 * Property schemas for each LifeOS database
 * Used for agent prompts and validation
 */
export const LIFEOS_SCHEMA = {
  tasks: {
    titleProperty: 'Task',
    properties: {
      Status: { type: 'status', values: ['Not started', 'In progress', 'Done'] },
      Priority: { type: 'select', values: ['High Priority', 'Medium Priority', 'Low Priority'] },
      Date: { type: 'date' },
      Completed: { type: 'checkbox' },
      'Waiting On': { type: 'text' },
      Project: { type: 'relation', target: 'Projects database' },
    },
  },
  notes: {
    titleProperty: 'Note',
    properties: {
      Status: { type: 'select', values: ['Inbox', 'To Review', 'Archive'] },
      Tags: { type: 'multi_select' },
      'Created time': { type: 'created_time' },
      'Last edited time': { type: 'last_edited_time' },
    },
  },
  decisions: {
    titleProperty: 'Decision',
    properties: {
      Context: { type: 'text' },
      Date: { type: 'date' },
      Rationale: { type: 'text' },
      Outcome: { type: 'select', values: ['Pending', 'Successful', 'Mixed', 'Revisit', 'Failed'] },
      Tags: { type: 'multi_select', values: ['Work', 'Personal', 'Technical', 'Strategic'] },
    },
  },
  journal: {
    titleProperty: 'Entry',
    properties: {
      Date: { type: 'date' },
      Mood: { type: 'multi_select', values: ['Normal', 'Super Happy', 'Worried', 'Anxious', 'Disappointed', 'Grateful', 'Sad', 'Happy'] },
      Rating: { type: 'select', values: ['⭐⭐⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐', '⭐⭐', '⭐'] },
      'Photo of the day': { type: 'file' },
    },
  },
  goals: {
    titleProperty: 'Goal',
    properties: {
      Status: { type: 'status', values: ['Not started', 'In progress', 'Done'] },
      Priority: { type: 'select', values: ['P1', 'P2', 'P3'] },
      Progress: { type: 'number', format: 'percent' },
      Deadline: { type: 'date' },
      Tags: { type: 'multi_select' },
    },
  },
} as const;
