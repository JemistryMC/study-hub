-- ============================================================================
-- Exo Academic Platform — Phase 4.2 Safe Emergency Rollback Script
-- File: supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql
--
-- PURPOSE:
--   Provides a SAFE emergency rollback alternative if an operational issue ever
--   requires relaxing strict RPC-only optimistic concurrency control without
--   re-introducing the security vulnerabilities of the legacy baseline.
--
-- WHAT THIS SAFE ROLLBACK PRESERVES:
--   1. Preserves strict cross-account RLS isolation on public.user_workspaces
--      (auth.uid() = user_id for SELECT, INSERT, UPDATE, scoped to authenticated).
--   2. Preserves private storage bucket ('lecture_media', public = false) and
--      strict VIP upload/update policies (can_upload_media = true).
--   3. Preserves least-privilege table grants (NO TRUNCATE, DELETE, REFERENCES,
--      TRIGGER, or MAINTAIN for anon or authenticated; anon has ZERO access).
--   4. Preserves global and schema-level ALTER DEFAULT PRIVILEGES revoking
--      PUBLIC, anon, and authenticated from future functions, tables, and sequences.
--   5. Preserves hardened SECURITY DEFINER functions (SET search_path = pg_catalog, ...)
--      and revokes PUBLIC/anon/authenticated EXECUTE on internal trigger functions.
--   6. Preserves the revision column and server-enforced updated_at trigger so no
--      column or data is lost.
--
-- WHAT THIS SAFE ROLLBACK RELAXES:
--   - Removes trg_enforce_workspace_write_via_rpc and allows authenticated users
--     to perform RLS-checked INSERT/UPDATE on their own row (auth.uid() = user_id)
--     either via sync_workspace_with_concurrency() OR standard PostgREST upsert.
-- ============================================================================

SET local check_function_bodies = off;

-- 1. Remove strict RPC-only write trigger while keeping updated_at & VIP protection triggers
DROP TRIGGER IF EXISTS trg_enforce_workspace_write_via_rpc ON public.user_workspaces;
DROP FUNCTION IF EXISTS public.enforce_workspace_write_via_rpc();

-- 2. Allow RLS-checked INSERT and UPDATE on own row for authenticated (never anon!)
REVOKE ALL ON TABLE "public"."user_workspaces" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."user_workspaces" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_workspaces" TO "postgres", "service_role";

DROP POLICY IF EXISTS "Users can view own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can view own workspace" ON "public"."user_workspaces"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can insert own workspace" ON "public"."user_workspaces"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can update own workspace" ON "public"."user_workspaces"
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

-- 3. Re-assert global & schema default privilege hardening
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";
