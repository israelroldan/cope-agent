/**
 * Month Close Workflow
 *
 * End-of-month financial review: full summary, trends, and next month planning.
 */

import type { WorkflowDefinition, SpecialistTask } from './types.js';
import { getLocalDateString } from '../core/datetime.js';

/**
 * Get current month range
 */
function getMonthRange(): {
  monthStart: string;
  monthEnd: string;
  monthName: string;
  year: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0); // Last day of current month

  const monthName = monthStart.toLocaleString('en-US', { month: 'long' });

  return {
    monthStart: getLocalDateString(monthStart),
    monthEnd: getLocalDateString(monthEnd),
    monthName,
    year,
  };
}

/**
 * Generate specialist tasks for month close
 */
export function getMonthCloseTasks(): SpecialistTask[] {
  const { monthStart, monthEnd, monthName, year } = getMonthRange();

  return [
    {
      specialist: 'finance-agent',
      task: `Complete month-end financial close for ${monthName} ${year} (${monthStart} to ${monthEnd}):

1. **Monthly Spending Summary**
   - Total income received
   - Total spent across all categories
   - Net result (surplus/deficit)

2. **Category Breakdown**
   - Spending by category with % of total
   - Compare each category to budget
   - Identify biggest spending areas

3. **Trends & Patterns**
   - Compare to previous month if available
   - Recurring expenses identified
   - Unusual or one-time expenses

4. **Budget Health**
   - Categories consistently overspent
   - Categories with room to reallocate
   - Underfunded priorities

5. **Account Status**
   - Final balances for each account
   - Credit card status

6. **Next Month Prep**
   - Budget adjustments to consider
   - Known upcoming expenses
   - Goals for next month

Return comprehensive summary for month-end review.`,
    },
  ];
}

export const monthCloseWorkflow: WorkflowDefinition = {
  name: 'month-close',
  description: 'End-of-month financial review with trends and next month planning.',
  triggers: [
    'month close',
    'monthly close',
    'end of month',
    'month end review',
    'monthly review',
    'close the month',
    'monthly summary',
    'month end',
  ],
  category: 'ad-hoc',
  specialists: getMonthCloseTasks(),

  systemPrompt: `You are orchestrating a month-end financial close workflow.

## Process

### 1. Gather Complete Data
Call spawn_specialist with finance-agent to pull full month's YNAB data.

### 2. Analyze the Month
- Total income vs spending
- Category performance
- Trends and patterns

### 3. Reflect on Habits
- What worked this month?
- What needs adjustment?
- Any surprises?

### 4. Plan Next Month
- Budget adjustments needed
- Known upcoming expenses
- One financial goal

## Coaching Approach
- Celebrate progress, no matter how small
- Be specific about what to change
- Keep suggestions actionable and realistic

## Output Format

📅 ${getMonthRange().monthName.toUpperCase()} ${getMonthRange().year} FINANCIAL CLOSE

💵 MONTHLY SUMMARY
   Income:    €[amount]
   Spending:  €[amount]
   Net:       €[+/-amount] [surplus/deficit]

📊 SPENDING BY CATEGORY
   [category]: €[amount] ([%]) - [vs budget status]
   [category]: €[amount] ([%]) - [vs budget status]
   ...

📈 TRENDS
   vs Last Month: [comparison]
   Recurring:     €[amount] in subscriptions/fixed costs
   One-time:      €[amount] in unusual expenses

💳 ACCOUNTS
   [account]: €[balance]
   ...

⚠️ ATTENTION AREAS
   - [categories or habits needing adjustment]

✅ WINS THIS MONTH
   - [positive achievements]

🔮 NEXT MONTH PREP
   Known expenses: [list any known upcoming costs]
   Budget tweaks:  [suggested adjustments]
   Focus:          [one financial goal]

💡 COACHING NOTE
   [Personalized insight or encouragement]`,
};
