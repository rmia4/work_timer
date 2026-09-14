import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const tasks=sqliteTable('tasks',{
 id:text('id').primaryKey(), owner:text('owner').notNull(), day:text('day').notNull(),
 title:text('title').notNull(), note:text('note').notNull().default(''), result:text('result').notNull().default(''),
 target:integer('target').notNull().default(0), elapsed:integer('elapsed').notNull().default(0), started:integer('started'),
 startedAt:integer('started_at'), endedAt:integer('ended_at'),
 status:text('status').notNull().default('done'),version:integer('version').notNull().default(0),
 created:integer('created').notNull()
},t=>[index('tasks_owner_day').on(t.owner,t.day),uniqueIndex('tasks_one_active').on(t.owner).where(sql`${t.status} != 'done'`)]);
export const codeSessions=sqliteTable('code_sessions',{
 tokenHash:text('token_hash').primaryKey(),owner:text('owner').notNull(),expires:integer('expires').notNull()
},t=>[index('code_sessions_expiry').on(t.expires)]);
export const codeLimits=sqliteTable('code_limits',{
 id:text('id').primaryKey(),window:integer('window').notNull(),attempts:integer('attempts').notNull()
});
export const memos=sqliteTable('memos',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),title:text('title').notNull().default(''),
 body:text('body').notNull().default(''),position:integer('position').notNull(),version:integer('version').notNull().default(0),
 created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[index('memos_owner_position').on(t.owner,t.position)]);
