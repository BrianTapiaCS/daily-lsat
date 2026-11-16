-- Daily LSAT practice schema.
--
-- The answer key lives on public.questions. Authenticated clients cannot select
-- that table. They receive a question only from get_daily_question(), which
-- omits correct_answer and explanation. submit_daily_attempt() reads the key
-- inside the database and is the only insert path for attempts.
--
-- Cooldown is an absolute 24-hour interval from the submission timestamp.
-- interval '24 hours' is a fixed duration. It is not a local-midnight reset
-- and it is not interval '1 day', which can shift across daylight saving time.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  section text not null check (section = 'Logical Reasoning'),
  question_type text not null check (char_length(btrim(question_type)) > 0),
  difficulty text,
  scenario text,
  question_text text not null check (char_length(btrim(question_text)) > 0),
  answer_choices jsonb not null,
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D', 'E')),
  explanation text not null check (char_length(btrim(explanation)) > 0),
  is_active boolean not null default true,
  bank_order integer not null unique check (bank_order > 0),
  created_at timestamptz not null default now(),
  constraint questions_five_choices check (
    jsonb_typeof(answer_choices) = 'array'
    and jsonb_array_length(answer_choices) = 5
  )
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  selected_answer text not null check (selected_answer in ('A', 'B', 'C', 'D', 'E')),
  is_correct boolean not null,
  time_taken_seconds integer not null check (time_taken_seconds >= 0),
  submitted_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create table public.user_progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_question_id uuid references public.questions (id),
  last_answered_at timestamptz,
  next_available_at timestamptz,
  served_question_id uuid references public.questions (id),
  served_at timestamptz,
  total_completed integer not null default 0 check (total_completed >= 0),
  total_correct integer not null default 0 check (total_correct >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_completion_local_date date,
  updated_at timestamptz not null default now(),
  constraint progress_correct_not_above_total check (total_correct <= total_completed),
  constraint progress_longest_covers_current check (longest_streak >= current_streak)
);

create index attempts_user_submitted_idx
  on public.attempts (user_id, submitted_at desc);

create index questions_active_order_idx
  on public.questions (bank_order)
  where is_active;

create or replace function public.local_date(p_instant timestamptz, p_timezone text)
returns date
language plpgsql
stable
set search_path = public
as $$
begin
  return (p_instant at time zone p_timezone)::date;
exception
  when invalid_parameter_value then
    return (p_instant at time zone 'UTC')::date;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_name is null then
    v_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;
  if v_name is null then
    v_name := 'Student';
  end if;
  v_name := left(v_name, 80);

  insert into public.profiles (id, display_name)
  values (new.id, v_name);

  insert into public.user_progress (user_id)
  values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Even if a write policy is added later, is_correct is derived from the key.
create or replace function public.enforce_attempt_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correct text;
begin
  select correct_answer
    into v_correct
  from public.questions
  where id = new.question_id;

  if v_correct is null then
    raise exception 'question_not_found';
  end if;

  new.is_correct := new.selected_answer = v_correct;
  return new;
end;
$$;

create trigger attempts_enforce_truth
  before insert or update on public.attempts
  for each row execute function public.enforce_attempt_truth();

create or replace function public.review_for_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_question public.questions%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select *
    into v_attempt
  from public.attempts
  where id = p_attempt_id
    and user_id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select *
    into v_question
  from public.questions
  where id = v_attempt.question_id;

  return jsonb_build_object(
    'ok', true,
    'attempt', jsonb_build_object(
      'attemptId', v_attempt.id,
      'selectedAnswer', v_attempt.selected_answer,
      'correctAnswer', v_question.correct_answer,
      'isCorrect', v_attempt.is_correct,
      'explanation', v_question.explanation,
      'timeTakenSeconds', v_attempt.time_taken_seconds,
      'submittedAt', v_attempt.submitted_at,
      'question', jsonb_build_object(
        'id', v_question.id,
        'sourceId', v_question.source_id,
        'section', v_question.section,
        'questionType', v_question.question_type,
        'difficulty', v_question.difficulty,
        'scenario', v_question.scenario,
        'questionText', v_question.question_text,
        'choices', v_question.answer_choices,
        'bankOrder', v_question.bank_order
      )
    )
  );
end;
$$;

create or replace function public.get_daily_question()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_progress public.user_progress%rowtype;
  v_question public.questions%rowtype;
  v_question_id uuid;
  v_keep_served boolean := false;
  v_last_id uuid;
  v_review jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    return jsonb_build_object('status', 'profile_missing');
  end if;

  insert into public.user_progress (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select *
    into v_progress
  from public.user_progress
  where user_id = v_uid
  for update;

  if v_progress.next_available_at is not null and v_progress.next_available_at > v_now then
    select id
      into v_last_id
    from public.attempts
    where user_id = v_uid
    order by submitted_at desc
    limit 1;

    v_review := null;
    if v_last_id is not null then
      v_review := public.review_for_attempt(v_last_id) -> 'attempt';
    end if;

    return jsonb_build_object(
      'status', 'locked',
      'serverNow', v_now,
      'nextAvailableAt', v_progress.next_available_at,
      'lastAttempt', v_review
    );
  end if;

  if v_progress.served_question_id is not null
     and not exists (
       select 1
       from public.attempts
       where user_id = v_uid
         and question_id = v_progress.served_question_id
     )
     and exists (
       select 1
       from public.questions
       where id = v_progress.served_question_id
         and is_active
     )
  then
    v_question_id := v_progress.served_question_id;
    v_keep_served := true;
  else
    select id
      into v_question_id
    from public.questions
    where is_active
      and not exists (
        select 1
        from public.attempts
        where user_id = v_uid
          and question_id = questions.id
      )
    order by bank_order
    limit 1;
  end if;

  if v_question_id is null then
    return jsonb_build_object('status', 'exhausted', 'serverNow', v_now);
  end if;

  if not v_keep_served then
    update public.user_progress
    set served_question_id = v_question_id,
        served_at = v_now,
        updated_at = v_now
    where user_id = v_uid;
  end if;

  select *
    into v_question
  from public.questions
  where id = v_question_id;

  select served_at
    into v_now
  from public.user_progress
  where user_id = v_uid;

  -- available payload
  -- Question body returned before submission. The key and the write-up stay out.
  return jsonb_build_object(
    'status', 'available',
    'serverNow', clock_timestamp(),
    'servedAt', v_now,
    'question', jsonb_build_object(
      'id', v_question.id,
      'sourceId', v_question.source_id,
      'section', v_question.section,
      'questionType', v_question.question_type,
      'difficulty', v_question.difficulty,
      'scenario', v_question.scenario,
      'questionText', v_question.question_text,
      'choices', v_question.answer_choices,
      'bankOrder', v_question.bank_order
    )
  );
  -- end available payload
end;
$$;

create or replace function public.submit_daily_attempt(
  p_question_id uuid,
  p_selected_answer text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_progress public.user_progress%rowtype;
  v_profile public.profiles%rowtype;
  v_correct text;
  v_active boolean;
  v_selected text := upper(btrim(coalesce(p_selected_answer, '')));
  v_is_correct boolean;
  v_seconds integer;
  v_next timestamptz;
  v_today date;
  v_streak integer;
  v_attempt_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if v_selected not in ('A', 'B', 'C', 'D', 'E') then
    return jsonb_build_object('ok', false, 'error', 'invalid_answer');
  end if;

  select *
    into v_profile
  from public.profiles
  where id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  select *
    into v_progress
  from public.user_progress
  where user_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  if v_progress.next_available_at is not null and v_progress.next_available_at > v_now then
    return jsonb_build_object(
      'ok', false,
      'error', 'cooldown',
      'serverNow', v_now,
      'nextAvailableAt', v_progress.next_available_at
    );
  end if;

  if v_progress.served_question_id is null or v_progress.served_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_served');
  end if;

  if p_question_id is distinct from v_progress.served_question_id then
    return jsonb_build_object('ok', false, 'error', 'not_current');
  end if;

  if exists (
    select 1
    from public.attempts
    where user_id = v_uid
      and question_id = p_question_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  select correct_answer, is_active
    into v_correct, v_active
  from public.questions
  where id = p_question_id;

  if v_correct is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not v_active then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;

  v_is_correct := v_selected = v_correct;
  v_seconds := greatest(0, floor(extract(epoch from (v_now - v_progress.served_at)))::integer);
  v_next := v_now + interval '24 hours';
  v_today := public.local_date(v_now, v_profile.timezone);

  if v_progress.last_completion_local_date is null then
    v_streak := 1;
  elsif v_progress.last_completion_local_date = v_today then
    v_streak := v_progress.current_streak;
  elsif v_progress.last_completion_local_date = (v_today - 1) then
    v_streak := v_progress.current_streak + 1;
  else
    v_streak := 1;
  end if;

  insert into public.attempts (
    user_id,
    question_id,
    selected_answer,
    is_correct,
    time_taken_seconds,
    submitted_at
  )
  values (
    v_uid,
    p_question_id,
    v_selected,
    v_is_correct,
    v_seconds,
    v_now
  )
  returning id into v_attempt_id;

  update public.user_progress
  set last_question_id = p_question_id,
      last_answered_at = v_now,
      next_available_at = v_next,
      served_question_id = null,
      served_at = null,
      total_completed = total_completed + 1,
      total_correct = total_correct + case when v_is_correct then 1 else 0 end,
      current_streak = v_streak,
      longest_streak = greatest(longest_streak, v_streak),
      last_completion_local_date = v_today,
      updated_at = v_now
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'serverNow', v_now,
    'nextAvailableAt', v_next,
    'attempt', public.review_for_attempt(v_attempt_id) -> 'attempt'
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
end;
$$;

create or replace function public.get_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_profile public.profiles%rowtype;
  v_progress public.user_progress%rowtype;
  v_categories jsonb;
  v_recent jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  select * into v_progress from public.user_progress where user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'questionType'), '[]'::jsonb)
    into v_categories
  from (
    select jsonb_build_object(
      'questionType', q.question_type,
      'total', count(*)::integer,
      'correct', count(*) filter (where a.is_correct)::integer
    ) as item
    from public.attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = v_uid
    group by q.question_type
  ) grouped;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_recent
  from (
    select jsonb_build_object(
      'attemptId', a.id,
      'sourceId', q.source_id,
      'questionType', q.question_type,
      'difficulty', q.difficulty,
      'isCorrect', a.is_correct,
      'submittedAt', a.submitted_at,
      'timeTakenSeconds', a.time_taken_seconds
    ) as item
    from public.attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = v_uid
    order by a.submitted_at desc
    limit 8
  ) recent;

  return jsonb_build_object(
    'ok', true,
    'serverNow', v_now,
    'displayName', v_profile.display_name,
    'timezone', v_profile.timezone,
    'totalCompleted', v_progress.total_completed,
    'totalCorrect', v_progress.total_correct,
    'currentStreak', v_progress.current_streak,
    'longestStreak', v_progress.longest_streak,
    'lastCompletionLocalDate', v_progress.last_completion_local_date,
    'nextAvailableAt', v_progress.next_available_at,
    'questionAvailable', v_progress.next_available_at is null or v_progress.next_available_at <= v_now,
    'byCategory', v_categories,
    'recent', v_recent
  );
end;
$$;

create or replace function public.get_history(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select count(*)::integer
    into v_total
  from public.attempts
  where user_id = v_uid;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_items
  from (
    select jsonb_build_object(
      'attemptId', a.id,
      'sourceId', q.source_id,
      'questionType', q.question_type,
      'difficulty', q.difficulty,
      'section', q.section,
      'isCorrect', a.is_correct,
      'submittedAt', a.submitted_at,
      'timeTakenSeconds', a.time_taken_seconds,
      'bankOrder', q.bank_order
    ) as item
    from public.attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = v_uid
    order by a.submitted_at desc
    limit v_limit
    offset v_offset
  ) page;

  return jsonb_build_object(
    'ok', true,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items
  );
end;
$$;

create or replace function public.update_profile(p_display_name text, p_timezone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_zone text := btrim(coalesce(p_timezone, ''));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  begin
    perform (clock_timestamp() at time zone v_zone);
  exception
    when invalid_parameter_value then
      return jsonb_build_object('ok', false, 'error', 'invalid_timezone');
  end;

  update public.profiles
  set display_name = v_name,
      timezone = v_zone
  where id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  return jsonb_build_object('ok', true, 'displayName', v_name, 'timezone', v_zone);
end;
$$;

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.user_progress enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy attempts_select_own
  on public.attempts
  for select
  to authenticated
  using (user_id = auth.uid());

create policy progress_select_own
  on public.user_progress
  for select
  to authenticated
  using (user_id = auth.uid());

-- No insert, update, or delete policies. Writes go through security definer
-- functions so a user cannot edit is_correct, streaks, or the cooldown.
-- questions has no select policy, so the answer key is not readable by clients.

revoke all on public.questions from public, anon, authenticated;
revoke all on public.profiles from public, anon, authenticated;
revoke all on public.attempts from public, anon, authenticated;
revoke all on public.user_progress from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.attempts to authenticated;
grant select on public.user_progress to authenticated;

revoke all on function public.local_date(timestamptz, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_attempt_truth() from public, anon, authenticated;
revoke all on function public.review_for_attempt(uuid) from public, anon, authenticated;
revoke all on function public.get_daily_question() from public, anon, authenticated;
revoke all on function public.submit_daily_attempt(uuid, text) from public, anon, authenticated;
revoke all on function public.get_progress() from public, anon, authenticated;
revoke all on function public.get_history(integer, integer) from public, anon, authenticated;
revoke all on function public.update_profile(text, text) from public, anon, authenticated;

grant execute on function public.get_daily_question() to authenticated;
grant execute on function public.submit_daily_attempt(uuid, text) to authenticated;
grant execute on function public.get_progress() to authenticated;
grant execute on function public.get_history(integer, integer) to authenticated;
grant execute on function public.update_profile(text, text) to authenticated;
-- History detail. The function only returns an attempt owned by auth.uid().
grant execute on function public.review_for_attempt(uuid) to authenticated;
