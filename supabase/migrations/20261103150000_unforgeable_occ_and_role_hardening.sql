-- ============================================================================
-- Exo Academic Platform — Phase 4.2.2 & 4.2.3 Forward Security Migration
-- Migration: 20261103150000_unforgeable_occ_and_role_hardening.sql
--
-- Official Technical References & Standards:
--   - PostgreSQL SECURITY DEFINER Functions & Execution Roles (CURRENT_USER vs SESSION_USER):
--     https://www.postgresql.org/docs/16/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
--   - PostgreSQL Row Security Policies (CURRENT_USER validation & NOBYPASSRLS):
--     https://www.postgresql.org/docs/16/ddl-rowsecurity.html
--   - PostgreSQL ALTER DEFAULT PRIVILEGES (Global vs Schema-Scoped & Role Isolation):
--     https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html
--   - PostgreSQL Transaction IDs & XID8 (pg_current_xact_id()):
--     https://www.postgresql.org/docs/16/functions-info.html
--
-- Security Rationale & Objectives:
--   1. Remediation of Custom GUC Forgery:
--      In the previous migration (20261103140000_fix_security_and_privileges.sql),
--      enforce_workspace_write_via_rpc() and RLS policies relied on session GUC checks:
--        current_setting(legacy_guc_flag, true) = 'true'
--      Because custom GUC parameters can be set by any SQL session (via SET or
--      pg_catalog.set_config()), that flag is forgeable if authenticated role
--      ever receives direct DML privileges.
--   2. Dual-Layer Unforgeable Replacement Architecture:
--      Layer A: Dedicated NOLOGIN Definer Role ("exo_occ_rpc_definer")
--               - Role cannot log in (NOLOGIN), cannot be assumed by client SQL
--                 (REVOKE exo_occ_rpc_definer FROM anon, authenticated), and does
--                 not bypass RLS (NOBYPASSRLS).
--               - Owns public.sync_workspace_with_concurrency().
--               - RLS WITH CHECK on public.user_workspaces strictly requires:
--                 (CURRENT_USER = 'exo_occ_rpc_definer'::name).
--      Layer B: Private Transaction Write-Context Table ("exo_internal"."occ_active_write_context")
--               - Inaccessible to PUBLIC, anon, and authenticated.
--               - Authorizes the exact (txid, user_id, write_op) only for the
--                 instantaneous duration of the DML statement inside the RPC.
--               - Automatically deleted before returning, blocking same-transaction
--                 piggyback attacks.
--   3. Zero dependencies on legacy session GUC flags remain in RLS, triggers, or RPCs.
--   4. Safe and idempotent to apply on top of 20261103140000_fix_security_and_privileges.sql.
-- ============================================================================

SET local check_function_bodies = off;

-- ============================================================================
-- 1. DEDICATED NOLOGIN RPC DEFINER ROLE & PRIVATE OCC WRITE CONTEXT SCHEMA
-- ============================================================================

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
-- 2. SCHEMA AND TABLE GRANTS FOR DEDICATED DEFINER ROLE
-- ============================================================================

GRANT USAGE ON SCHEMA "public" TO "exo_occ_rpc_definer";
GRANT USAGE ON SCHEMA "auth" TO "exo_occ_rpc_definer";
GRANT SELECT ON TABLE "auth"."users" TO "exo_occ_rpc_definer";

REVOKE ALL ON TABLE "public"."user_workspaces" FROM "exo_occ_rpc_definer";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."user_workspaces" TO "exo_occ_rpc_definer";

-- Default privileges for objects created by exo_occ_rpc_definer
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

-- ============================================================================
-- 3. UNFORGEABLE RLS POLICIES (CURRENT_USER = 'exo_occ_rpc_definer')
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

-- ============================================================================
-- 4. UNFORGEABLE DATABASE-LEVEL OCC WRITE GUARD TRIGGER
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.handle_user_workspace_updated_at() TO "exo_occ_rpc_definer";

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
-- 5. ATOMIC CONCURRENCY-CONTROLLED RPC (OWNED BY exo_occ_rpc_definer)
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
