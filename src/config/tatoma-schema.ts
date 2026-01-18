/**
 * Tatoma Work Notion Schema
 *
 * Centralized configuration for the Tatoma work Notion workspace.
 * This is the single source of truth for work database IDs and property schemas.
 */

export const TATOMA_DATABASES = {
  CLIENTS_PROJECTS: '1bbbfa85607e81f19c28cc806fe7a6e5',
  TASKS: '1bbbfa85607e80a598cad61fb3bccec1',
  PLAYBOOK: '2e1bfa85607e803cb830c771f636cee5',
  PARTNERS_NETWORK: '1bbbfa85607e80d697bbf28bcd2e132f',
} as const;

export type TatomaDatabase = keyof typeof TATOMA_DATABASES;

/**
 * Property schemas for each Tatoma database
 * Used for agent prompts and validation
 */
export const TATOMA_SCHEMA = {
  clientsProjects: {
    titleProperty: 'Client',
    properties: {
      Project: { type: 'text' },
      'Contact Person': { type: 'text' },
      Owner: { type: 'person' },
      Budget: { type: 'number', format: 'euro' },
      Spent: { type: 'number', format: 'euro' },
      Planning: { type: 'date' },
      Proposition: { type: 'select', values: ['Go Weekly', 'Tatoma'] },
      Circle: { type: 'select', values: ['Agency Circle'] },
      Status: { type: 'status', values: ['In progress', 'On hold', 'Coming up', 'Completed', 'Cancelled'] },
    },
  },
  tasks: {
    titleProperty: 'Name',
    properties: {
      Status: { type: 'status', values: ['To Do', 'In progress', 'Done 🙌'] },
      Assignee: { type: 'person' },
      Deadline: { type: 'date' },
      Comments: { type: 'text' },
      'Date Created': { type: 'created_time' },
    },
  },
  playbook: {
    titleProperty: 'Page',
    properties: {
      Engagement: { type: 'multi_select', values: ['Kickstarter', 'Accelerator', 'Leader'] },
      Phase: { type: 'multi_select', values: ['Align', 'Activate', 'Adopt'] },
      Version: { type: 'number' },
      Owner: { type: 'person' },
      'Last edited time': { type: 'last_edited_time' },
      Verification: { type: 'verification' },
    },
  },
  partnersNetwork: {
    titleProperty: 'Name',
    properties: {
      Company: { type: 'text' },
      Connection: { type: 'person' },
      Email: { type: 'email' },
      Phone: { type: 'phone_number' },
      Location: { type: 'text' },
      'Last Contacted': { type: 'date' },
      Circle: { type: 'select', values: ['Financial Services', 'Agency'] },
      'Expert Domain': {
        type: 'multi_select',
        values: ['execution sprints', 'consultancy', 'tech', 'UX', 'data', 'creative thinking', 'Design', 'Marketing', 'GTM', 'policy']
      },
      'Role (potential)': {
        type: 'multi_select',
        values: ['Execution Partner', 'AI Expert', 'Franchise Partner', 'Circle Lead', 'Network partner', 'Case Study', 'Investor / Advisor', 'Designer', 'Strategic Facilitator']
      },
      Source: { type: 'select', values: ['Personal Duncan', 'Elevator 2018', 'DDA', 'Potential Collab'] },
      Status: { type: 'select', values: ['Inner circle', 'Outer circle'] },
    },
  },
} as const;
