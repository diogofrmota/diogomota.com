-- 017_calendar_feeds_invite_links: subscribing to Shared's calendar from another
-- calendar app, and invite links that say who sent them.

-- One secret calendar link per user (app/api/calendar/[token]): what their space
-- has planned, for Google, Apple or Outlook calendars to subscribe to. A new link
-- replaces the old one, which then stops working. The token is shown again in
-- Settings, so it is kept as it is; it only reads the space's calendar.
CREATE TABLE calendar_feeds (
  user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Who made an invite, for its link's page ("Ana invited you"). Null for the ones
-- made before, and when that member's account is gone.
ALTER TABLE invites ADD COLUMN created_by uuid REFERENCES users (id) ON DELETE SET NULL;
