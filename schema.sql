


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






CREATE OR REPLACE FUNCTION "public"."enforce_workspace_media_security"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  NEW.user_email := COALESCE(
    (SELECT lower(email) FROM auth.users WHERE id = NEW.user_id),
    NEW.user_email
  );

  -- منع تغيير حالة التفعيل من المتصفح (لا يتغير إلا من لوحة تحكم Supabase الخاصة بك)
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


ALTER FUNCTION "public"."enforce_workspace_media_security"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_vip_status_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    NEW.can_upload_media := OLD.can_upload_media;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_vip_status_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
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
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."user_workspaces" (
    "user_id" "uuid" NOT NULL,
    "subjects" "jsonb" DEFAULT '[]'::"jsonb",
    "schedule" "jsonb" DEFAULT '{}'::"jsonb",
    "logs" "jsonb" DEFAULT '[]'::"jsonb",
    "annotations" "jsonb" DEFAULT '{}'::"jsonb",
    "academy_progress" "jsonb" DEFAULT '[]'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_email" "text",
    "can_upload_media" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."user_workspaces"
    ADD CONSTRAINT "user_workspaces_pkey" PRIMARY KEY ("user_id");



CREATE OR REPLACE TRIGGER "trg_enforce_workspace_media_security" BEFORE INSERT OR UPDATE ON "public"."user_workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_workspace_media_security"();



CREATE OR REPLACE TRIGGER "trg_protect_vip_status" BEFORE UPDATE ON "public"."user_workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."protect_vip_status_column"();



ALTER TABLE ONLY "public"."user_workspaces"
    ADD CONSTRAINT "user_workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can insert own workspace" ON "public"."user_workspaces" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own workspace" ON "public"."user_workspaces" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own workspace" ON "public"."user_workspaces" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_workspaces" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."enforce_workspace_media_security"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_workspace_media_security"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_vip_status_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_vip_status_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_vip_status_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."user_workspaces" TO "anon";
GRANT ALL ON TABLE "public"."user_workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."user_workspaces" TO "service_role";









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



































