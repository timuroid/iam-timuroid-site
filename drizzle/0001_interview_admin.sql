ALTER TABLE leads ADD COLUMN interview_json TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN conversation_json TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN review_status TEXT NOT NULL DEFAULT 'new';
--> statement-breakpoint
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
