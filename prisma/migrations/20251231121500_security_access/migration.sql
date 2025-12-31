create table if not exists "LoginAttempt" (
  "id" text primary key,
  "createdAt" timestamp(3) not null default current_timestamp,
  "email" text not null,
  "userId" text,
  "userRole" "UserRole",
  "provider" text,
  "success" boolean not null,
  "reason" text,
  "ipAddress" text,
  "userAgent" text,
  constraint "LoginAttempt_userId_fkey" foreign key ("userId") references "User"("id") on delete set null on update cascade
);

create index if not exists "LoginAttempt_email_idx" on "LoginAttempt" ("email");
create index if not exists "LoginAttempt_createdAt_idx" on "LoginAttempt" ("createdAt");
create index if not exists "LoginAttempt_userId_idx" on "LoginAttempt" ("userId");
