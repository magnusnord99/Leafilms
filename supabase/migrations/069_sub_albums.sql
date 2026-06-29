alter table selection_albums
  add column if not exists parent_album_id uuid references selection_albums(id) on delete cascade;

create index if not exists idx_selection_albums_parent on selection_albums(parent_album_id);
