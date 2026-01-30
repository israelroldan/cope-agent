/**
 * Budget Review Workflow
 *
 * Weekly financial check-in: spending vs budget, coaching insights.
 */

import type { WorkflowDefinition, SpecialistTask } from './types.js';
import { getLocalDateString } from '../core/datetime.js';

/**
 * Get current week date range
 */
function getWeekRange(): { monday: string; sunday: string; weekNumber: number } {
  const now = new Date();
  const day = now.getDay();

  // Get Monday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  // Get Sunday
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // Week number
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  const weekNumber = Math.ceil(diff / oneWeek);

  return {
    monday: getLocalDateString(monday),
    sunday: getLocalDateString(sunday),
    weekNumber,
  };
}

/**
 * Generate specialist tasks for budget review
 */
export function getBudgetReviewTasks(): SpecialistTask[] {
  const { monday, sunday } = getWeekRange();

  return [
    {
      specialist: 'finance-agent',
      task: `Weekly budget review for ${monday} to ${sunday}:

1. **Spending Summary**
   - Total spent this week by category
   - Compare against budget allocations
   - Flag any overspent categories

2. **Category Health**
   - Which categories are on track?
   - Which need attention?
   - Any underfunded priorities?

3. **Account Balances**
   - Current balance across all accounts
   - Any pending transactions?

4. **Coaching Insights**
   - Spending patterns observed
   - One actionable suggestion for next week

Return structured summary for terminal display.`,
    },
  ];
}

export const budgetReviewWorkflow: WorkflowDefinition = {
  name: 'budget-review',
  description: 'Weekly budget check-in with spending analysis and coaching.',
  triggers: [
    'budget review',
    'weekly budget',
    'how am I spending',
    'budget check',
    'spending review',
    'check my budget',
    'budget status',
  ],
  category: 'weekly',
  specialists: getBudgetReviewTasks(),

  systemPrompt: `You are orchestrating a weekly budget review workflow.

## Process

### 1. Gather Data
Call spawn_specialist with finance-agent to pull YNAB data.

### 2. Analyze Spending
- Compare actual vs budgeted
- Identify patterns (overspending, underspending)
- Note any concerning trends

### 3. Provide Coaching
- Be supportive, not judgmental
- Celebrate wins (stayed under budget, consistent tracking)
- Offer one specific, actionable suggestion

### 4. Set Intention
- What's the one thing to focus on this week?

## Output Format

💰 WEEK ${getWeekRange().weekNumber} BUDGET REVIEW

📊 SPENDING SUMMARY
   Total spent: €[amount]
   Budget remaining: €[amount]

📁 BY CATEGORY
   [category]: €[spent] / €[budget] [status emoji]
   ...

💳 ACCOUNTS
   [account]: €[balance]
   ...

⚠️ ATTENTION
   - [overspent categories or concerns]

✅ WINS
   - [positive observations]

💡 COACHING
   [One specific suggestion for the week ahead]

🎯 FOCUS
   → [one thing to focus on]`,
};
