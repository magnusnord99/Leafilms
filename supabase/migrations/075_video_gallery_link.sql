alter table video_reviews
  add column if not exists gallery_id uuid references selection_galleries(id) on delete set null;

create index if not exists video_reviews_gallery_id_idx on video_reviews (gallery_id);
