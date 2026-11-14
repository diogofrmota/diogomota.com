-- Allow tasks to be assigned to multiple people. Keep assignee_id for older
-- releases during a deploy or rollback, and copy their writes into the new table.
CREATE TABLE task_assignees (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

INSERT INTO task_assignees (task_id, user_id)
SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL;

CREATE FUNCTION sync_task_assignee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN RETURN NEW; END IF;
    DELETE FROM task_assignees WHERE task_id = NEW.id AND user_id = OLD.assignee_id;
  END IF;
  IF NEW.assignee_id IS NOT NULL THEN
    INSERT INTO task_assignees (task_id, user_id) VALUES (NEW.id, NEW.assignee_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_sync_assignee AFTER INSERT OR UPDATE OF assignee_id ON tasks
FOR EACH ROW EXECUTE FUNCTION sync_task_assignee();
