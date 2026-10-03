import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const leads=sqliteTable('leads',{
  id:text('id').primaryKey(),requestId:text('request_id').notNull(),name:text('name').notNull(),contact:text('contact').notNull(),message:text('message').notNull(),source:text('source').notNull(),consentAt:text('consent_at').notNull(),createdAt:text('created_at').notNull(),interviewJson:text('interview_json').notNull().default('{}'),conversationJson:text('conversation_json').notNull().default('[]'),reviewStatus:text('review_status').notNull().default('new')
},table=>[uniqueIndex('leads_request_id_unique').on(table.requestId)]);
export const rateLimits=sqliteTable('rate_limits',{
  id:text('id').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()
});

export const adminSessions=sqliteTable('admin_sessions',{tokenHash:text('token_hash').primaryKey(),csrf:text('csrf').notNull(),expiresAt:integer('expires_at').notNull()});
