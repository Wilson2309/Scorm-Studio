-- Read-only aggregate evidence. Never returns account IDs, names, email addresses or tokens.
-- Existing profiles and confirmed flags do not certify a new registration/callback UI test.
select jsonb_build_object(
  'auth_users', count(*),
  'confirmed_email_users', count(*) filter (where u.email_confirmed_at is not null),
  'users_with_profiles', count(p.id),
  'teacher_profiles', count(*) filter (where p.role = 'TEACHER'),
  'admin_profiles', count(*) filter (where p.role = 'ADMIN'),
  'users_without_profile', count(*) filter (where p.id is null),
  'new_registration_test', 'NOT_PROVEN_BY_AGGREGATES'
) as account_summary
from auth.users u left join public.profiles p on p.id = u.id;
