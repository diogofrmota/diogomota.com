-- 018_repeating_tasks: a task can repeat (bins, plants, rent). Ticked off, it
-- comes back with its next due date instead of moving to Done (lib/tasks.ts).
-- One of 'daily', 'weekly', 'monthly', 'yearly', or null; the app checks it.
ALTER TABLE tasks ADD COLUMN repeat text;
