do $$ begin
  create type "SecurityIncidentStatus" as enum ('OPEN','IN_PROGRESS','RESOLVED','CLOSED');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type "SecurityIncidentCategory" as enum ('AUTH','PERMISSIONS','WEBHOOK','PAYMENT','ADMIN','OTHER');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type "SecurityIncidentSeverity" as enum ('LOW','MEDIUM','HIGH','CRITICAL');
exception
  when duplicate_object then null;
end $$;

create table if not exists "SecurityIncident" (
  "id" text primary key,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  "title" text not null,
  "description" text not null,
  "status" "SecurityIncidentStatus" not null default 'OPEN',
  "category" "SecurityIncidentCategory" not null default 'OTHER',
  "severity" "SecurityIncidentSeverity" not null default 'MEDIUM',
  "assignedToId" text,
  "resolvedAt" timestamp(3),
  "resolvedById" text,
  constraint "SecurityIncident_assignedToId_fkey" foreign key ("assignedToId") references "User"("id") on delete set null on update cascade,
  constraint "SecurityIncident_resolvedById_fkey" foreign key ("resolvedById") references "User"("id") on delete set null on update cascade
);

create table if not exists "SecurityIncidentTimeline" (
  "id" text primary key,
  "createdAt" timestamp(3) not null default current_timestamp,
  "incidentId" text not null,
  "actorId" text,
  "actorLabel" text,
  "action" text not null,
  "message" text,
  "metadata" jsonb,
  constraint "SecurityIncidentTimeline_incidentId_fkey" foreign key ("incidentId") references "SecurityIncident"("id") on delete cascade on update cascade,
  constraint "SecurityIncidentTimeline_actorId_fkey" foreign key ("actorId") references "User"("id") on delete set null on update cascade
);

do $$ begin
  create type "SecurityLogCategory" as enum ('AUTH','PERMISSIONS','WEBHOOK','PAYMENT','ADMIN','OTHER');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type "SecurityLogLevel" as enum ('INFO','WARN','ERROR');
exception
  when duplicate_object then null;
end $$;

create table if not exists "SecurityLog" (
  "id" text primary key,
  "createdAt" timestamp(3) not null default current_timestamp,
  "category" "SecurityLogCategory" not null default 'OTHER',
  "level" "SecurityLogLevel" not null default 'INFO',
  "message" text not null,
  "requestId" text,
  "actorId" text,
  "actorEmail" text,
  "metadata" jsonb
);
