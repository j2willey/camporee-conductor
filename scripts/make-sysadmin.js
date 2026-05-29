#!/usr/bin/env node
/**
 * One-time CLI: grant sysadmin to a Clerk user by email.
 * Usage: node scripts/make-sysadmin.js user@example.com
 */
import dotenv from 'dotenv';
import { createClerkClient } from '@clerk/express';
import { openConductorDb, runMigrations } from '../src/db/migrate.js';

dotenv.config();

const email = process.argv[2];
if (!email) {
    console.error('Usage: node scripts/make-sysadmin.js <email>');
    process.exit(1);
}

if (!process.env.CLERK_SECRET_KEY) {
    console.error('CLERK_SECRET_KEY is not set in .env');
    process.exit(1);
}

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const response = await clerk.users.getUserList({ emailAddress: [email] });
const users = response.data ?? response;

if (!users.length) {
    console.error(`No Clerk user found for: ${email}`);
    process.exit(1);
}

const user = users[0];
const userId = user.id;
const db = openConductorDb();
runMigrations(db);

const now = Math.floor(Date.now() / 1000);
db.prepare(`
    INSERT INTO user_profiles (user_id, is_sysadmin, created_at, last_active)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET is_sysadmin = 1
`).run(userId, now, now);

console.log(`✓ Sysadmin granted`);
console.log(`  Email:   ${email}`);
console.log(`  User ID: ${userId}`);
