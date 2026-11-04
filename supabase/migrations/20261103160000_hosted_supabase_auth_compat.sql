-- ============================================================================
-- Exo Academic Platform — Phase 4.2.4 Forward Security Migration
-- Migration: 20261103160000_hosted_supabase_auth_compat.sql
--
-- Official Technical References & Standards:
--   - Supabase Knowledge Base: Permission errors when granting custom roles access to the auth schema:
--     https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema
--   - PostgreSQL SECURITY DEFINER Functions & search_path Best Practices:
--     https://www.postgresql.org/docs/16/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
--   - PostgreSQL Row Security Policies (CURRENT_USER validation & NOBYPASSRLS):
--     https://www.postgresql.org/docs/16/ddl-rowsecurity.html
--
-- Security Rationale & Objectives:
--   1. Hosted Supabase Managed Auth Schema Isolation:
--      In hosted Supabase, the "auth" schema is owned by "supabase_admin", and auth
--      objects are owned by "supabase_auth_admin". The hosted "postgres" role is
--      granted USAGE on "auth" WITHOUT GRANT OPTION. Attempting to delegate
--      USAGE on "auth" from "postgres" to a custom role (such as "exo_occ_rpc_definer")
--      fails or has no effect in managed environments.
--   2. Narrow SECURITY DEFINER Identity Helper ("exo_internal"."current_request_uid()"):
--      To eliminate any direct "auth" schema dependency for "exo_occ_rpc_definer",
--      this migration introduces a minimal helper function in the private
--      "exo_internal" schema, owned by "postgres", with a fixed empty search_path
--      (SET search_path = '').
--   3. Consistent Identity Resolution Across Definer Execution Context:
--      Direct auth.uid() references are replaced with exo_internal.current_request_uid()
--      in:
--        a. public.sync_workspace_with_concurrency() (owned by exo_occ_rpc_definer)
--        b. RLS policy "Users can view own workspace" (SELECT)
--        c. RLS policy "Users can insert own workspace" (INSERT)
--        d. RLS policy "Users can update own workspace" (UPDATE)
--   4. Least Privilege Schema & Function Grants:
--      - "exo_occ_rpc_definer" has ZERO direct USAGE on schema "auth".
--      - "exo_internal" remains completely hidden from the Supabase Data API.
--      - EXECUTE on the identity helper is granted strictly to postgres, service_role,
--        authenticated, and exo_occ_rpc_definer; revoked from PUBLIC and anon.
-- ============================================================================

SET local check_function_bodies = off;

-- ============================================================================
-- 1. REVOKE DIRECT AUTH SCHEMA PRIVILEGES FROM DEDICATED DEFINER ROLE
-- ============================================================================

DO $$
BEGIN
  -- Revoke any direct auth schema grants from exo_occ_rpc_definer
  REVOKE ALL ON TABLE "auth"."users" FROM "exo_occ_rpc_definer";
  REVOKE USAGE ON SCHEMA "auth" FROM "exo_occ_rpc_definer";
EXCEPTION
  WHEN OTHERS THEN NULL;
END
$$;

-- ============================================================================
-- 2. NARROW SECURITY DEFINER IDENTITY HELPER IN PRIVATE SCHEMA
-- ============================================================================

CREATE OR REPLACE FUNCTION "exo_internal"."current_request_uid"()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid();
$$;

ALTER FUNCTION "exo_internal"."current_request_uid"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "exo_internal"."current_request_uid"() FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "exo_internal"."current_request_uid"() TO "postgres", "service_role", "authenticated", "exo_occ_rpc_definer";

-- Ensure minimum schema USAGE on exo_internal for roles evaluating RLS or RPCs
GRANT USAGE ON SCHEMA "exo_internal" TO "authenticated", "exo_occ_rpc_definer";

-- ============================================================================
-- 3. REVISION & WORKSPACE OCC ROW LEVEL SECURITY POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can view own workspace" ON "public"."user_workspaces"
  FOR SELECT
  TO "authenticated", "exo_occ_rpc_definer"
  USING ((exo_internal.current_request_uid() = user_id));

DROP POLICY IF EXISTS "Users can insert own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can insert own workspace" ON "public"."user_workspaces"
  FOR INSERT
  TO "authenticated", "exo_occ_rpc_definer"
  WITH CHECK (
    (exo_internal.current_request_uid() = user_id)
    AND (CURRENT_USER = 'exo_occ_rpc_definer'::name)
  );

DROP POLICY IF EXISTS "Users can update own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can update own workspace" ON "public"."user_workspaces"
  FOR UPDATE
  TO "authenticated", "exo_occ_rpc_definer"
  USING ((exo_internal.current_request_uid() = user_id))
  WITH CHECK (
    (exo_internal.current_request_uid() = user_id)
    AND (CURRENT_USER = 'exo_occ_rpc_definer'::name)
  );

-- ============================================================================
-- 4. HARDENED OCC RPC (NO AUTH SCHEMA DEPENDENCY)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_workspace_with_concurrency(
  p_payload jsonb,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, exo_internal
AS $$
DECLARE
  v_uid uuid := exo_internal.current_request_uid();
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

    -- Update row with payload data (strictly bound to v_uid from request context)
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
GRANT EXECUTE ON FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) TO "authenticated", "postgres", "service_role";
