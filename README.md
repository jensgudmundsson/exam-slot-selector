# Exam Slot Selector (Supabase + GitHub Pages)

This app is a static site that uses Supabase for shared data storage.

## 1) Create a Supabase project

1. Create a new Supabase project.
2. In **SQL Editor**, run the schema below.
3. In **Project Settings → API**, copy the **Project URL** and **anon public** key.

## 2) SQL schema

```sql
create table if not exists dates (
  id text primary key,
  date date not null,
  day text not null
);

create table if not exists slots (
  id text primary key,
  label text not null,
  period text not null
);

create table if not exists users (
  id text primary key
);

create table if not exists preferences (
  user_id text not null references users (id) on delete cascade,
  slot_id text not null,
  rank integer not null,
  primary key (user_id, slot_id)
);

create unique index if not exists preferences_user_rank_idx
  on preferences (user_id, rank);

create table if not exists allocation (
  run_id bigint not null,
  user_id text not null references users (id) on delete cascade,
  slot_id text,
  order_index integer not null
);

create index if not exists allocation_run_idx
  on allocation (run_id);
```

### If you already ran the old schema
The app stores slot instances as `dateId-slotId`, so `preferences.slot_id` is not a foreign key to `slots.id`.
Run this migration once to drop the old foreign keys:

```sql
alter table preferences drop constraint if exists preferences_slot_id_fkey;
alter table allocation drop constraint if exists allocation_slot_id_fkey;
```

### RLS (testing only)
For simple testing, you can **disable RLS** on these tables or add public policies.

Example policies (testing only):
```sql
alter table dates enable row level security;
alter table slots enable row level security;
alter table users enable row level security;
alter table preferences enable row level security;
alter table allocation enable row level security;

create policy "public read dates" on dates for select using (true);
create policy "public write dates" on dates for insert with check (true);
create policy "public delete dates" on dates for delete using (true);

create policy "public read slots" on slots for select using (true);
create policy "public write slots" on slots for insert with check (true);
create policy "public delete slots" on slots for delete using (true);

create policy "public read users" on users for select using (true);
create policy "public write users" on users for insert with check (true);
create policy "public delete users" on users for delete using (true);

create policy "public read preferences" on preferences for select using (true);
create policy "public write preferences" on preferences for insert with check (true);
create policy "public delete preferences" on preferences for delete using (true);

create policy "public read allocation" on allocation for select using (true);
create policy "public write allocation" on allocation for insert with check (true);
create policy "public delete allocation" on allocation for delete using (true);
```

## 3) Configure the frontend

Update `config.js`:

```js
window.SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

## 4) Deploy to GitHub Pages

1. Create a GitHub repository and add the `exam-slot-selector` files.
2. In GitHub, go to **Settings → Pages**.
3. Select **Deploy from a branch** and choose the branch + root folder.
4. Save. GitHub Pages will provide a public URL.
