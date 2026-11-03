-- ============================================================================
-- Exo Academic Platform — Phase 4.1 Security & Concurrency Forward Migration
-- File: supabase/migrations/20261103140000_fix_security_and_privileges.sql
--
-- Official Technical References & Standards:
--   - PostgreSQL Row Security Policies (Permissive OR combination & Table-level Grants):
--     https://www.postgresql.org/docs/current/ddl-rowsecurity.html
--   - PostgreSQL SECURITY DEFINER Safe Writing (pg_catalog search_path hardening):
--     https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
--   - Supabase Storage Access Control & Private Buckets:
--     https://supabase.com/docs/guides/storage/security/access-control
--
-- Key Fixes:
--   1. Ensures storage bucket 'lecture_media' is explicitly private (public = false).
--   2. Resolves confirmed VIP storage policy bypass on storage.objects by dropping
--      permissive upload policy and strictly requiring can_upload_media = true for
--      both INSERT and UPDATE operations.
--   3. Revokes excessive database grants (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, DELETE)
--      from anon and authenticated roles on public.user_workspaces.
--   4. Revokes unsafe default privileges in public schema for role postgres.
--   5. Implements server-enforced updated_at trigger and revision column for
--      optimistic concurrency control across multi-device synchronizations.
--   6. Implements atomic concurrency-controlled RPC sync_workspace_with_concurrency
--      that rejects mismatched or missing revisions, safely handles concurrent
--      first-time workspace creation, and returns lightweight metadata only.
--   7. Fixes COALESCE SQL syntax: uses standard SQL COALESCE construct.
--   8. Hardens all SECURITY DEFINER functions with pg_catalog first in search_path
--      and schema-qualified object references.
--   9. Enforces least privilege on all internal trigger functions.
--
-- Reversibility: Reversible via supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql
-- Safety: Non-destructive, preserves all existing user records and columns.
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
  public = false;

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
-- 2. REVOKE EXCESSIVE TABLE PRIVILEGES ON USER_WORKSPACES
-- ============================================================================

REVOKE ALL ON TABLE "public"."user_workspaces" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "anon";
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."user_workspaces" TO "authenticated";

-- ============================================================================
-- 3. REVOKE UNSAFE DEFAULT PRIVILEGES IN PUBLIC SCHEMA
-- ============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon", "authenticated";

-- ============================================================================
-- 4. SERVER-ENFORCED UPDATED_AT AND OPTIMISTIC CONCURRENCY REVISION
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

REVOKE ALL ON FUNCTION public.handle_user_workspace_updated_at() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION public.handle_user_workspace_updated_at() TO "postgres", "service_role";

DROP TRIGGER IF EXISTS trg_user_workspaces_updated_at ON public.user_workspaces;
CREATE TRIGGER trg_user_workspaces_updated_at
  BEFORE UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_workspace_updated_at();

-- ============================================================================
-- 5. ATOMIC CONCURRENCY-CONTROLLED WORKSPACE SYNC RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_workspace_with_concurrency(
  p_payload jsonb,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current_rev integer;
  v_updated_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Attempt to lock the existing workspace row for this user
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

    -- Update row with payload data (using valid COALESCE syntax)
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

  -- 3. Handle concurrent first-time workspace creation safely
  ELSE
    BEGIN
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
    EXCEPTION
      WHEN unique_violation THEN
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

REVOKE ALL ON FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) TO "authenticated";

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

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO "postgres", "service_role";
