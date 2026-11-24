-- Validate new email accounts before profile creation, including direct Auth requests.
-- Accounts for the sales team must be provisioned and verified before activating
-- their entry in private.sales_staff. Existing accounts are not rewritten.
create function private.validate_new_email_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  full_name text;
begin
  if new.email is null or new.email = '' then
    return new;
  end if;

  if exists (
    select 1 from private.sales_staff as staff
    where lower(staff.email) = lower(new.email)
  ) then
    raise exception 'Não foi possível criar a conta.' using errcode = '23514';
  end if;

  if new.raw_app_meta_data ->> 'provider' = 'email' then
    full_name := regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      '^[[:space:]]+|[[:space:]]+$', '', 'g'
    );
    if jsonb_typeof(new.raw_user_meta_data -> 'full_name') is distinct from 'string'
       or char_length(full_name) not between 2 and 120
       or octet_length(new.email) > 254 then
      raise exception 'Dados de cadastro inválidos.' using errcode = '23514';
    end if;
    new.raw_user_meta_data := jsonb_set(new.raw_user_meta_data, '{full_name}', to_jsonb(full_name));
  end if;

  return new;
end;
$$;

revoke all on function private.validate_new_email_account() from public, anon, authenticated;

create trigger validate_new_email_account
before insert on auth.users
for each row execute function private.validate_new_email_account();
