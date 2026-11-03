SET local check_function_bodies = off;

CREATE TABLE "public"."user_workspaces" (
  "user_id"          uuid                     NOT NULL,
  "subjects"         jsonb                    DEFAULT '[]'::jsonb,
  "schedule"         jsonb                    DEFAULT '{}'::jsonb,
  "logs"             jsonb                    DEFAULT '[]'::jsonb,
  "annotations"      jsonb                    DEFAULT '{}'::jsonb,
  "academy_progress" jsonb                    DEFAULT '[]'::jsonb,
  "updated_at"       timestamp with time zone DEFAULT now(),
  "user_email"       text,
  "can_upload_media" boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "user_workspaces_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."user_workspaces"
  ENABLE ROW LEVEL SECURITY;

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
$function$;

REVOKE ALL ON FUNCTION "public"."enforce_workspace_media_security"() FROM PUBLIC, "anon", "authenticated";

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

ALTER TABLE "public"."user_workspaces"
  ADD CONSTRAINT "user_workspaces_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE TRIGGER trg_enforce_workspace_media_security
  BEFORE INSERT OR UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_media_security();

CREATE TRIGGER trg_protect_vip_status
  BEFORE UPDATE ON public.user_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_vip_status_column();

CREATE POLICY "Users can insert own workspace" ON "public"."user_workspaces"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own workspace" ON "public"."user_workspaces"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own workspace" ON "public"."user_workspaces"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Allow VIP users to upload media" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.user_workspaces w
  WHERE ((w.user_id = auth.uid()) AND (w.can_upload_media = true))))));

CREATE POLICY "Users can delete their own lecture media" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

CREATE POLICY "Users can update their own lecture media" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))))
  WITH CHECK (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

CREATE POLICY "Users can upload their own lecture media" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid))));

CREATE POLICY "Users can view own lecture media" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'lecture_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

REVOKE ALL ON FUNCTION "public"."enforce_workspace_media_security"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_media_security"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_media_security"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."protect_vip_status_column"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."protect_vip_status_column"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_vip_status_column"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_vip_status_column"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_workspaces" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."user_workspaces" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_workspaces" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_workspaces" TO "service_role";

