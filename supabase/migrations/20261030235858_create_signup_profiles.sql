-- Create a least-privilege app profile for each newly registered Supabase user.
-- Role is intentionally fixed to job_applicant; browser metadata never grants authority.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.create_signup_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, language)
  VALUES (
    NEW.id,
    left(coalesce(nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), ''), 120),
    'job_applicant',
    CASE
      WHEN NEW.raw_user_meta_data ->> 'language' IN ('en', 'rw')
        THEN NEW.raw_user_meta_data ->> 'language'
      ELSE 'en'
    END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.create_signup_profile() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ireme_create_profile_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.create_signup_profile();
