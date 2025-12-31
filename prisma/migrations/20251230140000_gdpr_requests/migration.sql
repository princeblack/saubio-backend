-- Enums for GDPR workflow
do $$ begin
  create type "GdprRequestType" as enum ('EXPORT','DELETION','RECTIFICATION');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type "GdprRequestStatus" as enum ('PENDING','PROCESSING','COMPLETED','REJECTED');
exception
  when duplicate_object then null;
end $$;

alter type "NotificationType" add value if not exists 'COMPLIANCE';

create table if not exists "GdprRequest" (
  "id" text primary key,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  "type" "GdprRequestType" not null,
  "status" "GdprRequestStatus" not null default 'PENDING',
  "userId" text not null,
  "userRole" "UserRole" not null,
  "userEmail" text not null,
  "reason" text,
  "startedAt" timestamp(3),
  "startedById" text,
  "processedAt" timestamp(3),
  "processedById" text,
  "rejectedAt" timestamp(3),
  "rejectedById" text,
  "rejectReason" text,
  "exportPath" text,
  "exportReadyAt" timestamp(3),
  "exportExpiresAt" timestamp(3),
  "metadata" jsonb,
  constraint "GdprRequest_userId_fkey" foreign key ("userId") references "User"("id") on delete cascade on update cascade,
  constraint "GdprRequest_startedById_fkey" foreign key ("startedById") references "User"("id") on delete set null on update cascade,
  constraint "GdprRequest_processedById_fkey" foreign key ("processedById") references "User"("id") on delete set null on update cascade,
  constraint "GdprRequest_rejectedById_fkey" foreign key ("rejectedById") references "User"("id") on delete set null on update cascade
);

create table if not exists "GdprRequestAudit" (
  "id" text primary key,
  "createdAt" timestamp(3) not null default current_timestamp,
  "requestId" text not null,
  "action" text not null,
  "actorId" text,
  "actorLabel" text,
  "metadata" jsonb,
  constraint "GdprRequestAudit_requestId_fkey" foreign key ("requestId") references "GdprRequest"("id") on delete cascade on update cascade,
  constraint "GdprRequestAudit_actorId_fkey" foreign key ("actorId") references "User"("id") on delete set null on update cascade
);
