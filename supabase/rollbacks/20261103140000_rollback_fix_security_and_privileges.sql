-- ============================================================================
-- Exo Academic Platform — Legacy Baseline Rollback Script (UNSAFE FOR PRODUCTION)
-- File: supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql
-- Location: supabase/rollbacks/ (Strictly isolated outside supabase/migrations/)
--
-- CRITICAL SECURITY WARNING — DO NOT USE AS AN AUTOMATIC EMERGENCY PROCEDURE:
--   This script strictly restores the pre-Phase-4.1 baseline schema state
--   (matching 20261103133622_remote_schema.sql) for historical/audit symmetry only.
--   Executing this script RE-INTRODUCES known security vulnerabilities:
--     1. Re-enables the permissive storage policy ("Users can upload their own lecture media")
--        on storage.objects, allowing non-VIP users to bypass can_upload_media = true.
--     2. Restores excessive table grants (TRUNCATE, TRIGGER, REFERENCES, MAINTAIN, DELETE)
--        on public.user_workspaces to anon and authenticated roles.
--     3. Restores broad default privileges in schema public to anon and authenticated.
--     4. Removes server-enforced updated_at, revision column, OCC guard trigger,
--        and sync_workspace_with_concurrency() RPC.
--     5. Restores PUBLIC execute grants on protect_vip_status_column().
--
-- SAFE ALTERNATIVE FOR EMERGENCY ROLLBACK:
--   Use `supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql` instead!
--   That script relaxes only the strict RPC-only write constraint while preserving
--   all account isolation, RLS policies, VIP storage checks, and least-privilege grants.
--
-- EXECUTION SAFETY GATE:
--   To prevent accidental or automated execution, this script aborts unless the
--   session explicitly sets:
--     SET LOCAL exo.allow_unsafe_legacy_rollback = 'I_ACCEPT_SECURITY_DOWNGRADE';
--
-- KNOWN REVERSIBILITY LIMITATION:
--   The baseline exported migration (20261103133622_remote_schema.sql) did NOT contain
--   the original storage.buckets DDL definition for 'lecture_media'.
--   During rollback, the bucket is intentionally NOT dropped (to prevent destroying user media).
-- ============================================================================

SET local check_function_bodies = off;

DO $$
BEGIN
  IF COALESCE(pg_catalog.current_setting('exo.allow_unsafe_legacy_rollback', true), '') <> 'I_ACCEPT_SECURITY_DOWNGRADE' THEN
    RAISE EXCEPTION 'UNSAFE_ROLLBACK_BLOCKED: 20261103140000_rollback_fix_security_and_privileges.sql restores legacy vulnerabilities (VIP bypass & excessive grants). For a safe emergency rollback that preserves security and isolation, run supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql instead. To force this legacy baseline rollback for testing, run: SET LOCAL exo.allow_unsafe_legacy_rollback = ''I_ACCEPT_SECURITY_DOWNGRADE'';'
      USING ERRCODE = '42501';
  END IF;
END
$$;

-- ============================================================================
-- 1. ROLLBACK STORAGE POLICIES (Matches Baseline 20261103133622_remote_schema.sql)
-- ============================================================================

DROP POLICY IF EXISTS "Allow VIP users to update media" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can update their own lecture media" ON "storage"."objects";
CREATE POLICY "Users can update their own lecture media" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))))
  WITH CHECK (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

DROP POLICY IF EXISTS "Users can upload their own lecture media" ON "storage"."objects";
CREATE POLICY "Users can upload their own lecture media" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

-- ============================================================================
-- 2. ROLLBACK USER_WORKSPACES POLICIES & PRIVILEGES (Matches Baseline)
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can insert own workspace" ON "public"."user_workspaces"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can update own workspace" ON "public"."user_workspaces"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own workspace" ON "public"."user_workspaces";
CREATE POLICY "Users can view own workspace" ON "public"."user_workspaces"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_workspaces" TO "anon", "authenticated";
REVOKE ALL ON TABLE "public"."user_workspaces" FROM "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_workspaces" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_workspaces" TO "service_role";

-- ============================================================================
-- 3. ROLLBACK DEFAULT PRIVILEGES (Matches Baseline)
-- ============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ============================================================================
-- 4. ROLLBACK TRIGGERS, REVISION COLUMN & CONCURRENCY RPC
-- ============================================================================

DROP FUNCTION IF EXISTS public.sync_workspace_with_concurrency(jsonb, integer);

DROP TRIGGER IF EXISTS trg_enforce_workspace_write_via_rpc ON public.user_workspaces;
DROP FUNCTION IF EXISTS public.enforce_workspace_write_via_rpc();

DROP TRIGGER IF EXISTS trg_user_workspaces_updated_at ON public.user_workspaces;
DROP FUNCTION IF EXISTS public.handle_user_workspace_updated_at();

ALTER TABLE "public"."user_workspaces" DROP COLUMN IF EXISTS "revision";

-- ============================================================================
-- 5. ROLLBACK FUNCTION DEFINITIONS & EXECUTE GRANTS (Matches Baseline)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_vip_status_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    NEW.can_upload_media := OLD.can_upload_media;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."protect_vip_status_column"() TO PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."protect_vip_status_column"() FROM "postgres";
GRANT EXECUTE ON FUNCTION "public"."protect_vip_status_column"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."protect_vip_status_column"() TO "service_role";

CREATE OR REPLACE FUNCTION public.enforce_workspace_media_security()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
BEGIN
  NEW.user_email := COALESCE(
    (SELECT lower(email) FROM auth.users WHERE id = NEW.user_id),
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
$function$;

REVOKE ALL ON FUNCTION "public"."enforce_workspace_media_security"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."enforce_workspace_media_security"() FROM "postgres";
GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_media_security"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_media_security"() TO "service_role";

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
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
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";
GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
