-- Future normalized PostgreSQL schema.
-- The current application still uses app_state JSONB; do not run this migration
-- without switching server persistence in the same release.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(24) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(40) NOT NULL,
  bio VARCHAR(160) NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id,user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id UUID REFERENCES users(id),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  attachment JSONB,
  client_id UUID,
  reply_to UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ NOT NULL,
  edited_at TIMESTAMPTZ,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  pinned_at TIMESTAMPTZ,
  pinned_by UUID REFERENCES users(id),
  CHECK ((to_user_id IS NOT NULL) <> (group_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS messages_private_idx ON messages(from_user_id,to_user_id,created_at);
CREATE INDEX IF NOT EXISTS messages_group_idx ON messages(group_id,created_at);
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  PRIMARY KEY(message_id,user_id,emoji)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,message_id)
);
CREATE TABLE IF NOT EXISTS hidden_messages (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,message_id)
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  UNIQUE(user_id,subscription)
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  foreground_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  sound_notifications BOOLEAN NOT NULL DEFAULT TRUE
);