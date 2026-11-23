-- 032_task_assignee_id: who a task is for is task_assignees alone (021_task_assignees.sql).
-- contract: tasks.assignee_id, unread since v2.0.11
-- v2.0.11 stopped reading and writing it, and 031_task_assignee_trigger.sql
-- dropped the trigger that copied it into task_assignees. Images before v2.0.11
-- write it, so a rollback to one of those no longer works. Its index and
-- foreign key go with it.
ALTER TABLE tasks DROP COLUMN assignee_id;
