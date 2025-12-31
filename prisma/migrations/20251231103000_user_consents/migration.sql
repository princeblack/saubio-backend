create table if not exists "UserConsent" (
  "id" text primary key,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  "userId" text not null unique,
  "consentMarketing" boolean not null default false,
  "consentStats" boolean not null default false,
  "consentPreferences" boolean not null default false,
  "consentNecessary" boolean not null default true,
  "source" text,
  "channel" text,
  "capturedAt" timestamp(3),
  "firstCapturedAt" timestamp(3),
  constraint "UserConsent_userId_fkey" foreign key ("userId") references "User"("id") on delete cascade on update cascade
);

create table if not exists "UserConsentHistory" (
  "id" text primary key,
  "createdAt" timestamp(3) not null default current_timestamp,
  "consentId" text not null,
  "userId" text not null,
  "actorId" text,
  "actorLabel" text,
  "consentMarketing" boolean not null,
  "consentStats" boolean not null,
  "consentPreferences" boolean not null,
  "consentNecessary" boolean not null,
  "source" text,
  "channel" text,
  "ipAddress" text,
  "userAgent" text,
  "notes" text,
  "capturedAt" timestamp(3),
  constraint "UserConsentHistory_consentId_fkey" foreign key ("consentId") references "UserConsent"("id") on delete cascade on update cascade,
  constraint "UserConsentHistory_userId_fkey" foreign key ("userId") references "User"("id") on delete cascade on update cascade,
  constraint "UserConsentHistory_actorId_fkey" foreign key ("actorId") references "User"("id") on delete set null on update cascade
);

create index if not exists "UserConsentHistory_userId_idx" on "UserConsentHistory" ("userId");
create index if not exists "UserConsentHistory_actorId_idx" on "UserConsentHistory" ("actorId");
