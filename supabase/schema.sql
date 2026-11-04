-- ============================================================================
-- Exo Academic Platform — Canonical Final Database Schema (supabase/schema.sql)
-- Represents the complete, hardened database state after all migrations
-- (20261103133622_remote_schema.sql + 20261103140000_fix_security_and_privileges.sql)
--
-- Initializing a fresh database from this file produces the exact final state
-- with revision-based optimistic concurrency control, hardened SECURITY DEFINER
-- functions, private storage bucket & VIP policies, and least-privilege grants.
-- ============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- ============================================================================
-- 1. DEDICATED NOLOGIN RPC DEFINER ROLE & DEFAULT PRIVILEGES HARDENING
-- ============================================================================
-- Applied before creating functions/tables so no object ever inherits unsafe
-- PUBLIC, anon, or authenticated privileges during fresh schema bootstrap.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'exo_occ_rpc_definer') THEN
    CREATE ROLE "exo_occ_rpc_definer" NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE "exo_occ_rpc_definer" NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

REVOKE "exo_occ_rpc_definer" FROM "anon", "authenticated";
GRANT "exo_occ_rpc_definer" TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

-- ============================================================================
-- 2. PRIVATE INTERNAL WRITE-CONTEXT SCHEMA & TABLES
-- ============================================================================

SET default_tablespace = '';
SET default_table_access_method = "heap";

CREATE SCHEMA IF NOT EXISTS "exo_internal" AUTHORIZATION "postgres";
REVOKE ALL ON SCHEMA "exo_internal" FROM PUBLIC, "anon", "authenticated";
GRANT USAGE ON SCHEMA "exo_internal" TO "postgres", "service_role", "exo_occ_rpc_definer";

CREATE TABLE IF NOT EXISTS "exo_internal"."occ_active_write_context" (
    "txid" "xid8" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "write_op" "text" NOT NULL,
    CONSTRAINT "occ_active_write_context_pkey" PRIMARY KEY ("txid", "user_id"),
    CONSTRAINT "occ_active_write_context_op_check" CHECK (("write_op" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text"])))
);

ALTER TABLE "exo_internal"."occ_active_write_context" OWNER TO "postgres";
ALTER TABLE "exo_internal"."occ_active_write_context" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "exo_internal"."occ_active_write_context" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "exo_internal"."occ_active_write_context" TO "postgres", "service_role", "exo_occ_rpc_definer";

DROP POLICY IF EXISTS "occ_rpc_definer_manage_write_context" ON "exo_internal"."occ_active_write_context";
CREATE POLICY "occ_rpc_definer_manage_write_context" ON "exo_internal"."occ_active_write_context"
  FOR ALL
  TO "postgres", "service_role", "exo_occ_rpc_definer"
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "public"."user_workspaces" (
    "user_id" "uuid" NOT NULL,
    "subjects" "jsonb" DEFAULT '[]'::"jsonb",
    "schedule" "jsonb" DEFAULT '{}'::"jsonb",
    "logs" "jsonb" DEFAULT '[]'::"jsonb",
    "annotations" "jsonb" DEFAULT '{}'::"jsonb",
    "academy_progress" "jsonb" DEFAULT '[]'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_email" "text",
    "can_upload_media" boolean DEFAULT false NOT NULL,
    "revision" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "user_workspaces_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."user_workspaces" OWNER TO "postgres";
ALTER TABLE "public"."user_workspaces" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. HARDENED SECURITY DEFINER TRIGGER FUNCTIONS & CONCURRENCY RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_workspace_media_security()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, auth
  AS $$
BEGIN
  NEW.user_email := COALESCE(
    (SELECT pg_catalog.lower(email) FROM auth.users WHERE id = NEW.user_id),
    NEW.user_email
  );

  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.can_upload_media := false;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.can_upload_media := COALESCE(OLD.can_upload_media, false);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_workspace_media_security() OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.enforce_workspace_media_security() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION public.enforce_workspace_media_security() TO "postgres", "service_role";

CREATE OR REPLACE FUNCTION public.protect_vip_status_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF pg_catalog.current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    NEW.can_upload_media := OLD.can_upload_media;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_vip_status_column() OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.protect_vip_status_column() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION public.protect_vip_status_column() TO "postgres", "service_role";

CREATE OR REPLACE FUNCTION public.handle_user_workspace_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  NEW.revision := COALESCE(OLD.revision, 0) + 1;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_user_workspace_updated_at() OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.handle_user_workspace_updated_at() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION public.handle_user_workspace_updated_at() TO "postgres", "service_role", "exo_occ_rpc_definer";

CREATE OR REPLACE FUNCTION public.enforce_workspace_write_via_rpc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, exo_internal
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM exo_internal.occ_active_write_context c
    WHERE c.txid = pg_catalog.pg_current_xact_id()
      AND c.user_id = NEW.user_id
      AND c.write_op = TG_OP
  ) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
     OR pg_catalog.current_setting('request.jwt.claim.role', true) IN ('anon', 'authenticated')
     OR current_user IN ('anon', 'authenticated')
     OR session_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'OCC_BYPASS_FORBIDDEN: Direct INSERT or UPDATE on public.user_workspaces is prohibited; use sync_workspace_with_concurrency(p_payload, p_expected_revision)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_workspace_write_via_rpc() OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.enforce_workspace_write_via_rpc() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION public.enforce_workspace_write_via_rpc() TO "postgres", "service_role", "exo_occ_rpc_definer";

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE pg_catalog.format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'rls_auto_enable: failed to enable RLS on %: %', cmd.object_identity, SQLERRM;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION public.rls_auto_enable() OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO "postgres", "service_role";

CREATE OR REPLACE FUNCTION public.sync_workspace_with_concurrency(
  p_payload jsonb,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, exo_internal
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_txid xid8 := pg_catalog.pg_current_xact_id();
  v_current_rev integer;
  v_updated_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid workspace payload: expected JSON object' USING ERRCODE = '22023';
  END IF;

  -- 1. Attempt to lock the existing workspace row for this authenticated user
  SELECT revision, updated_at
  INTO v_current_rev, v_updated_at
  FROM public.user_workspaces
  WHERE user_id = v_uid
  FOR UPDATE;

  -- 2. Handle existing workspace update
  IF FOUND THEN
    -- Concurrency check: Reject NULL or mismatched expected revision
    IF p_expected_revision IS NULL OR p_expected_revision <> v_current_rev THEN
      RETURN jsonb_build_object(
        'status', 'conflict',
        'current_revision', v_current_rev,
        'current_updated_at', v_updated_at,
        'message', 'Workspace has been modified by another device (revision mismatch)'
      );
    END IF;

    -- Authorize single statement in unforgeable private write-context table
    INSERT INTO exo_internal.occ_active_write_context (txid, user_id, write_op)
    VALUES (v_txid, v_uid, 'UPDATE')
    ON CONFLICT (txid, user_id) DO UPDATE SET write_op = EXCLUDED.write_op;

    -- Update row with payload data (strictly bound to v_uid = auth.uid())
    UPDATE public.user_workspaces
    SET
      subjects = COALESCE(p_payload->'subjects', subjects),
      schedule = COALESCE(p_payload->'schedule', schedule),
      logs = COALESCE(p_payload->'logs', logs),
      annotations = CASE
        WHEN p_payload ? 'annotations' THEN p_payload->'annotations'
        ELSE annotations
      END,
      academy_progress = COALESCE(p_payload->'academy_progress', academy_progress),
      user_email = COALESCE(p_payload->>'user_email', user_email)
    WHERE user_id = v_uid
    RETURNING revision, updated_at INTO v_current_rev, v_updated_at;

    DELETE FROM exo_internal.occ_active_write_context
    WHERE txid = v_txid AND user_id = v_uid;

  -- 3. Handle concurrent first-time workspace creation safely
  ELSE
    -- For first-time creation, expected revision must be NULL or 1
    IF p_expected_revision IS NOT NULL AND p_expected_revision <> 1 THEN
      RETURN jsonb_build_object(
        'status', 'conflict',
        'current_revision', 0,
        'current_updated_at', NULL,
        'message', 'Workspace does not exist for stale revision > 1'
      );
    END IF;

    BEGIN
      INSERT INTO exo_internal.occ_active_write_context (txid, user_id, write_op)
      VALUES (v_txid, v_uid, 'INSERT')
      ON CONFLICT (txid, user_id) DO UPDATE SET write_op = EXCLUDED.write_op;

      INSERT INTO public.user_workspaces (
        user_id,
        user_email,
        subjects,
        schedule,
        logs,
        annotations,
        academy_progress,
        revision
      ) VALUES (
        v_uid,
        p_payload->>'user_email',
        COALESCE(p_payload->'subjects', '[]'::jsonb),
        COALESCE(p_payload->'schedule', '{}'::jsonb),
        COALESCE(p_payload->'logs', '[]'::jsonb),
        COALESCE(p_payload->'annotations', '{}'::jsonb),
        COALESCE(p_payload->'academy_progress', '[]'::jsonb),
        1
      )
      RETURNING revision, updated_at INTO v_current_rev, v_updated_at;

      DELETE FROM exo_internal.occ_active_write_context
      WHERE txid = v_txid AND user_id = v_uid;
    EXCEPTION
      WHEN unique_violation THEN
        DELETE FROM exo_internal.occ_active_write_context
        WHERE txid = v_txid AND user_id = v_uid;

        SELECT revision, updated_at
        INTO v_current_rev, v_updated_at
        FROM public.user_workspaces
        WHERE user_id = v_uid
        FOR UPDATE;

        RETURN jsonb_build_object(
          'status', 'conflict',
          'current_revision', v_current_rev,
          'current_updated_at', v_updated_at,
          'message', 'Concurrent workspace initialization detected'
        );
    END;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'revision', v_current_rev,
    'updated_at', v_updated_at
  );
END;
$$;

ALTER FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) OWNER TO "exo_occ_rpc_definer";
REVOKE ALL ON FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) TO "authenticated", "service_role", "postgres", "exo_occ_rpc_definer";

-- ============================================================================
-- 4. TRIGGERS & EVENT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_enforce_workspace_write_via_rpc ON public.user_workspaces;
CREATE TRIGGER trg_enforce_workspace_write_via_rpc
  BEFORE INSERT OR UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_write_via_rpc();

DROP TRIGGER IF EXISTS trg_enforce_workspace_media_security ON public.user_workspaces;
CREATE TRIGGER trg_enforce_workspace_media_security
  BEFORE INSERT OR UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_media_security();

DROP TRIGGER IF EXISTS trg_protect_vip_status ON public.user_workspaces;
CREATE TRIGGER trg_protect_vip_status
  BEFORE UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_vip_status_column();

DROP TRIGGER IF EXISTS trg_user_workspaces_updated_at ON public.user_workspaces;
CREATE TRIGGER trg_user_workspaces_updated_at
  BEFORE UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_workspace_updated_at();

DROP EVENT TRIGGER IF EXISTS "ensure_rls";
CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

-- ============================================================================
-- 5. ROW LEVEL SECURITY POLICIES (USER_WORKSPACES & STORAGE.OBJECTS)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can view own workspace" ON "public"."user_workspaces"
  FOR SELECT
  TO "authenticated", "exo_occ_rpc_definer"
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can insert own workspace" ON "public"."user_workspaces"
  FOR INSERT
  TO "authenticated", "exo_occ_rpc_definer"
  WITH CHECK (
    (auth.uid() = user_id)
    AND (CURRENT_USER = 'exo_occ_rpc_definer'::name)
  );

DROP POLICY IF EXISTS "Users can update own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can update own workspace" ON "public"."user_workspaces"
  FOR UPDATE
  TO "authenticated", "exo_occ_rpc_definer"
  USING ((auth.uid() = user_id))
  WITH CHECK (
    (auth.uid() = user_id)
    AND (CURRENT_USER = 'exo_occ_rpc_definer'::name)
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lecture_media',
  'lecture_media',
  false,
  52428800,
  ARRAY['application/pdf', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/x-m4a', 'audio/aac']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload their own lecture media" ON "storage"."objects";
DROP POLICY IF EXISTS "Allow VIP users to upload media" ON "storage"."objects";
CREATE POLICY "Allow VIP users to upload media" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    (bucket_id = 'lecture_media'::text)
    AND ((storage.foldername(name))[1] = (auth.uid())::text)
    AND (EXISTS (
      SELECT 1 FROM public.user_workspaces w
      WHERE w.user_id = auth.uid() AND w.can_upload_media = true
    ))
  );

DROP POLICY IF EXISTS "Users can update their own lecture media" ON "storage"."objects";
DROP POLICY IF EXISTS "Allow VIP users to update media" ON "storage"."objects";
CREATE POLICY "Allow VIP users to update media" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (
    (bucket_id = 'lecture_media'::text)
    AND ((storage.foldername(name))[1] = (auth.uid())::text)
    AND (EXISTS (
      SELECT 1 FROM public.user_workspaces w
      WHERE w.user_id = auth.uid() AND w.can_upload_media = true
    ))
  )
  WITH CHECK (
    (bucket_id = 'lecture_media'::text)
    AND ((storage.foldername(name))[1] = (auth.uid())::text)
    AND (EXISTS (
      SELECT 1 FROM public.user_workspaces w
      WHERE w.user_id = auth.uid() AND w.can_upload_media = true
    ))
  );

DROP POLICY IF EXISTS "Users can delete their own lecture media" ON "storage"."objects";
CREATE POLICY "Users can delete their own lecture media" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (
    (bucket_id = 'lecture_media'::text)
    AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))
  );

DROP POLICY IF EXISTS "Users can view own lecture media" ON "storage"."objects";
CREATE POLICY "Users can view own lecture media" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (
    (bucket_id = 'lecture_media'::text)
    AND ((storage.foldername(name))[1] = (auth.uid())::text)
  );

-- ============================================================================
-- 6. SCHEMA & TABLE GRANTS (LEAST PRIVILEGE)
-- ============================================================================

GRANT USAGE ON SCHEMA "public" TO "postgres", "anon", "authenticated", "service_role", "exo_occ_rpc_definer";
GRANT USAGE ON SCHEMA "auth" TO "exo_occ_rpc_definer";
GRANT SELECT ON TABLE "auth"."users" TO "exo_occ_rpc_definer";

REVOKE ALL ON TABLE "public"."user_workspaces" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "anon";
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "authenticated";
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "exo_occ_rpc_definer";
GRANT SELECT ON TABLE "public"."user_workspaces" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_workspaces" TO "postgres", "service_role";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."user_workspaces" TO "exo_occ_rpc_definer";
