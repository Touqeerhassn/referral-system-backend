import { pgTable, text, timestamp, real, integer, uniqueIndex } from 'drizzle-orm/pg-core';

// 1. Business Table
export const businesses = pgTable('businesses', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    subsStatus: text('subs_status').notNull().default('Guest'), // 'Guest' | 'Subscribed'
    createdAt: timestamp('created_at').defaultNow(),
});

// 2. Campaign Table
export const campaigns = pgTable('campaigns', {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    startDateTime: timestamp('start_date_time').notNull(),
    endDateTime: timestamp('end_date_time').notNull(),
    tier1Pct: real('tier1_pct').notNull().default(20),
    tier2Pct: real('tier2_pct').notNull().default(10),
    tier3Pct: real('tier3_pct').notNull().default(5),
    maxDiscountCapPct: real('max_discount_cap_pct').notNull().default(50),
    createdAt: timestamp('created_at').defaultNow(),
});

// 3. Participants Table
export const participants = pgTable('participants', {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    referralCode: text('referral_code').notNull().unique(),
    referredById: text('referred_by_id'), // Self-reference: parent participant id
    orderStatus: text('order_status').notNull().default('pending'), // 'pending' | 'confirmed'
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    uniqueParticipantPerCampaign: uniqueIndex('camp_phone_idx').on(table.campaignId, table.phone),
}));

// 4. Referral Ledger Table
export const referralLedger = pgTable('referral_ledger', {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    beneficiaryId: text('beneficiary_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
    triggerParticipantId: text('trigger_participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
    tierLevel: integer('tier_level').notNull(), // 1, 2, or 3
    discountPercent: real('discount_percent').notNull(),
    status: text('status').notNull().default('confirmed'),
    createdAt: timestamp('created_at').defaultNow(),
});