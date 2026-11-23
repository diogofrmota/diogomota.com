-- 031_task_assignee_trigger: who a task is for is task_assignees alone.
-- contract: the tasks_sync_assignee trigger and its function (021_task_assignees.sql),
-- which copied tasks.assignee_id into task_assignees for releases from before
-- that table. Every image a rollback can still run (v1.2.17 on, since 030)
-- writes task_assignees itself; this release no longer reads or writes
-- tasks.assignee_id, which a later contract migration drops.
DROP TRIGGER tasks_sync_assignee ON tasks;
DROP FUNCTION sync_task_assignee();
