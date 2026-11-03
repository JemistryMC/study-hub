-- ============================================================================
-- Exo Academic Platform — Phase 4.1 & 4.2 Security & Concurrency Migration
-- File: supabase/migrations/20261103140000_fix_security_and_privileges.sql
--
-- Official Technical References & Standards:
--   - PostgreSQL Row Security Policies (Permissive OR combination & Table-level Grants):
--     https://www.postgresql.org/docs/current/ddl-rowsecurity.html
--   - PostgreSQL ALTER DEFAULT PRIVILEGES (Global vs Schema-Scoped & PUBLIC EXECUTE):
--     https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html
--   - PostgreSQL SECURITY DEFINER Safe Writing (pg_catalog search_path hardening):
--     https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
--   - Supabase Storage Access Control & Private Buckets:
--     https://supabase.com/docs/guides/storage/security/access-control
--
-- Key Fixes (Phase 4.1 & Phase 4.2):
--   1. Ensures storage bucket 'lecture_media' is explicitly private (public = false).
--   2. Resolves confirmed VIP storage policy bypass on storage.objects by dropping
--      permissive upload policy and strictly requiring can_upload_media = true for
--      both INSERT and UPDATE operations.
--   3. Revokes excessive database grants (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN,
--      DELETE, INSERT, UPDATE) from anon and authenticated roles on
--      public.user_workspaces; grants only SELECT to authenticated, enforcing all
--      client writes exclusively through sync_workspace_with_concurrency().
--   4. Revokes unsafe default privileges (including PUBLIC function EXECUTE) both
--      globally and in schema public for role postgres.
--   5. Implements server-enforced updated_at trigger, revision column, and
--      database-level direct-write guard (enforce_workspace_write_via_rpc) for
--      strict optimistic concurrency control across multi-device synchronizations.
--   6. Implements atomic concurrency-controlled RPC sync_workspace_with_concurrency
--      that rejects mismatched or missing revisions, safely handles concurrent
--      first-time workspace creation, and returns lightweight metadata only.
--   7. Hardens all SECURITY DEFINER functions with pg_catalog first in search_path
--      and revokes PUBLIC/anon/authenticated EXECUTE on internal trigger functions.
--
-- Rollback Options:
--   - Safe Rollback (Recommended): supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql
--   - Legacy Baseline Rollback (Requires explicit downgrade flag):
--     supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql
-- ============================================================================

SET local check_function_bodies = off;

-- ============================================================================
-- 1. STORAGE BUCKET CONFIGURATION & VIP POLICY ENFORCEMENT
-- ============================================================================

-- Ensure the lecture_media bucket exists and is explicitly PRIVATE (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lecture_media',
  'lecture_media',
  false,
  52428800, -- 50 MiB limit
  ARRAY['application/pdf', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/x-m4a', 'audio/aac']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop the overly permissive upload policy that bypassed the VIP check
DROP POLICY IF EXISTS "Users can upload their own lecture media" ON "storage"."objects";

-- Enforce strict VIP verification for uploads (INSERT)
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

-- Enforce strict VIP verification for overwriting/updating media (UPDATE)
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

-- ============================================================================
-- 2. DEDICATED NOLOGIN RPC DEFINER ROLE & PRIVATE OCC WRITE CONTEXT SCHEMA
-- ============================================================================
-- Security Rationale (Phase 4.2.2 GUC Forgery Remediation):
--   Custom PostgreSQL GUC session variables set via set_config() or SET
--   can be modified by any SQL session and therefore cannot serve as an
--   unforgeable proof of SECURITY DEFINER RPC execution.
--   Instead, we combine two unforgeable database-enforced mechanisms:
--     1. A dedicated NOLOGIN, NOINHERIT, NOBYPASSRLS role ("exo_occ_rpc_definer")
--        that owns public.sync_workspace_with_concurrency() and is revoked from
--        PUBLIC, anon, and authenticated (so clients cannot SET ROLE to it).
--     2. A private schema & table ("exo_internal"."occ_active_write_context")
--        inaccessible to PUBLIC, anon, and authenticated, recording the active
--        transaction XID (pg_current_xact_id()), target user_id, and write_op
--        solely for the duration of the DML statement inside the OCC RPC.

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

CREATE SCHEMA IF NOT EXISTS "exo_internal" AUTHORIZATION "postgres";
REVOKE ALL ON SCHEMA "exo_internal" FROM PUBLIC, "anon", "authenticated";
GRANT USAGE ON SCHEMA "exo_internal" TO "postgres", "service_role", "exo_occ_rpc_definer";

CREATE TABLE IF NOT EXISTS "exo_internal"."occ_active_write_context" (
  "txid" xid8 NOT NULL,
  "user_id" uuid NOT NULL,
  "write_op" text NOT NULL,
  CONSTRAINT "occ_active_write_context_pkey" PRIMARY KEY ("txid", "user_id"),
  CONSTRAINT "occ_active_write_context_op_check" CHECK ("write_op" IN ('INSERT', 'UPDATE'))
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

-- ============================================================================
-- 3. REVOKE EXCESSIVE TABLE PRIVILEGES & HARDEN RLS ON USER_WORKSPACES
-- ============================================================================

GRANT USAGE ON SCHEMA "public" TO "exo_occ_rpc_definer";
GRANT USAGE ON SCHEMA "auth" TO "exo_occ_rpc_definer";
GRANT SELECT ON TABLE "auth"."users" TO "exo_occ_rpc_definer";

REVOKE ALL ON TABLE "public"."user_workspaces" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "anon";
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "authenticated";
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "service_role";
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "exo_occ_rpc_definer";
-- Only SELECT is granted directly to authenticated; all client writes MUST pass
-- through sync_workspace_with_concurrency() owned by exo_occ_rpc_definer.
GRANT SELECT ON TABLE "public"."user_workspaces" TO "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."user_workspaces" TO "exo_occ_rpc_definer";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_workspaces" TO "postgres", "service_role";

-- Scope RLS policies to authenticated & exo_occ_rpc_definer and require
-- effective role CURRENT_USER = 'exo_occ_rpc_definer' (unforgeable by client SQL)
-- for INSERT and UPDATE row checks.
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

-- ============================================================================
-- 4. REVOKE UNSAFE DEFAULT PRIVILEGES (GLOBAL & IN SCHEMA PUBLIC)
-- ============================================================================
-- Note: In PostgreSQL, newly created functions grant EXECUTE to PUBLIC by default.
-- Revoking only from "anon", "authenticated" is insufficient unless PUBLIC is also
-- revoked both globally (all schemas) and in schema "public".

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
-- 5. SERVER-ENFORCED UPDATED_AT, REVISION & UNFORGEABLE OCC WRITE GUARD
-- ============================================================================

ALTER TABLE "public"."user_workspaces"
  ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;

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

DROP TRIGGER IF EXISTS trg_user_workspaces_updated_at ON public.user_workspaces;
CREATE TRIGGER trg_user_workspaces_updated_at
  BEFORE UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_workspace_updated_at();

-- Unforgeable database-level guard preventing any direct INSERT/UPDATE from
-- bypassing sync_workspace_with_concurrency(), even if a client sets arbitrary
-- custom GUC session variables or temporarily holds table grants.
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

DROP TRIGGER IF EXISTS trg_enforce_workspace_write_via_rpc ON public.user_workspaces;
CREATE TRIGGER trg_enforce_workspace_write_via_rpc
  BEFORE INSERT OR UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_write_via_rpc();

-- ============================================================================
-- 6. ATOMIC CONCURRENCY-CONTROLLED WORKSPACE SYNC RPC (OWNED BY NOLOGIN DEFINER)
-- ============================================================================

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
-- 6. HARDEN EXISTING SECURITY DEFINER TRIGGER FUNCTIONS
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
