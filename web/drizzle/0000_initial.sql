-- pgvector for reflections.embedding
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"facts" jsonb NOT NULL,
	"free_text" text NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scene_id" text,
	"persona_id" text DEFAULT 'assistant',
	"custom_seed" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_secs" integer,
	"audio_url" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "splash_copy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_name" text NOT NULL,
	"time_of_day" text NOT NULL,
	"headline" text NOT NULL,
	"subtitle" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"vibe" text DEFAULT 'calm' NOT NULL,
	"tone" text DEFAULT 'Warm' NOT NULL,
	"language_mode" text DEFAULT 'hinglish' NOT NULL,
	"pace" text DEFAULT 'Slow' NOT NULL,
	"warmth" integer DEFAULT 7 NOT NULL,
	"memory_enabled" boolean DEFAULT true NOT NULL,
	"auto_summary" boolean DEFAULT true NOT NULL,
	"sleep_nudges" boolean DEFAULT true NOT NULL,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text,
	"email" text,
	"password_hash" text,
	"display_name" text,
	"locale" text DEFAULT 'en-IN',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"guest_cookie_hash" text,
	"ip_hash" text,
	CONSTRAINT "users_guest_cookie_hash_unique" UNIQUE("guest_cookie_hash")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "password_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_expiry_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reflections_user_idx" ON "reflections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "splash_copy_lookup_idx" ON "splash_copy" USING btree ("brand_name","time_of_day");--> statement-breakpoint
CREATE INDEX "transcripts_session_idx" ON "transcripts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "users_clerk_idx" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "users_ip_hash_idx" ON "users" USING btree ("ip_hash","created_at");--> statement-breakpoint
-- Partial unique indexes — not expressible via drizzle-orm's column-level
-- .unique() builder (they need a WHERE clause), so they're hand-maintained
-- raw SQL here rather than declared in schema.ts.
CREATE UNIQUE INDEX IF NOT EXISTS "users_clerk_user_id_unique_idx" ON "users" ("clerk_user_id") WHERE "clerk_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_local_email_unique_idx" ON "users" (lower("email")) WHERE "password_hash" IS NOT NULL;--> statement-breakpoint
-- HNSW index for fast cosine retrieval on reflections.embedding — same
-- reason: drizzle-orm's pgvector index support is still in flux, so this
-- stays hand-maintained raw SQL (see lib/memory.ts for the query side).
CREATE INDEX IF NOT EXISTS "reflections_embedding_idx"
  ON "reflections" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);