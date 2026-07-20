-- Public transfer links are resolved server-side with the service client after
-- filtering on the unguessable token. Direct Data API access must remain closed:
-- a SELECT policy cannot tell whether the caller supplied the matching token,
-- and an UPDATE policy cannot limit the caller to download_count.

DROP POLICY IF EXISTS "Anon kan lese lenke via token" ON public.transfer_links;
DROP POLICY IF EXISTS "Anon kan lese leveranse via gyldig lenke" ON public.transfers;
DROP POLICY IF EXISTS "Anon kan oppdatere nedlastingsteller via gyldig lenke" ON public.transfers;
