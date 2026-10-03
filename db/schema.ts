import {sqliteTable,text,integer,uniqueIndex,index} from 'drizzle-orm/sqlite-core';
export const leads=sqliteTable('leads',{
  id:text('id').primaryKey(),requestId:text('request_id').notNull(),name:text('name').notNull(),contact:text('contact').notNull(),message:text('message').notNull(),source:text('source').notNull(),consentAt:text('consent_at').notNull(),createdAt:text('created_at').notNull(),interviewJson:text('interview_json').notNull().default('{}'),conversationJson:text('conversation_json').notNull().default('[]'),reviewStatus:text('review_status').notNull().default('new')
},table=>[uniqueIndex('leads_request_id_unique').on(table.requestId)]);
export const rateLimits=sqliteTable('rate_limits',{
  id:text('id').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()
});

export const adminSessions=sqliteTable('admin_sessions',{tokenHash:text('token_hash').primaryKey(),csrf:text('csrf').notNull(),expiresAt:integer('expires_at').notNull()});

export const visitorSessions=sqliteTable('visitor_sessions',{id:text('id').primaryKey(),visitorHash:text('visitor_hash').notNull(),visitorLabel:text('visitor_label').notNull(),startedAt:text('started_at').notNull(),updatedAt:text('updated_at').notNull(),endedAt:text('ended_at'),channel:text('channel').notNull().default('text'),pagePath:text('page_path').notNull().default('/'),device:text('device').notNull().default(''),userAgent:text('user_agent').notNull().default('')},table=>[index('visitor_sessions_updated').on(table.updatedAt),index('visitor_sessions_visitor').on(table.visitorHash,table.startedAt)]);
export const conversationMessages=sqliteTable('conversation_messages',{id:integer('id').primaryKey({autoIncrement:true}),sessionId:text('session_id').notNull().references(()=>visitorSessions.id),eventId:text('event_id').notNull(),role:text('role').notNull(),content:text('content').notNull(),channel:text('channel').notNull(),model:text('model').notNull().default(''),source:text('source').notNull().default('browser'),isFinal:integer('is_final').notNull().default(1),createdAt:text('created_at').notNull()},table=>[uniqueIndex('conversation_event_unique').on(table.sessionId,table.eventId),index('conversation_messages_session').on(table.sessionId,table.id)]);
