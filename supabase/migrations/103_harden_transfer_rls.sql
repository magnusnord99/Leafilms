-- Transfer metadata and recipient details are private. Public download pages
-- resolve the unguessable token server-side with the service client.

DROP POLICY IF EXISTS "Admin kan se alle leveranser" ON public.transfers;
DROP POLICY IF EXISTS "Admin kan opprette leveranser" ON public.transfers;
DROP POLICY IF EXISTS "Admin kan oppdatere egne leveranser" ON public.transfers;
DROP POLICY IF EXISTS "Admin kan slette egne leveranser" ON public.transfers;
DROP POLICY IF EXISTS "Anon kan lese leveranse via gyldig lenke" ON public.transfers;
DROP POLICY IF EXISTS "Anon kan oppdatere nedlastingsteller via gyldig lenke" ON public.transfers;
DROP POLICY IF EXISTS "Staff kan administrere leveranser" ON public.transfers;

CREATE POLICY "Staff kan administrere leveranser"
  ON public.transfers
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin kan se alle lenker" ON public.transfer_links;
DROP POLICY IF EXISTS "Admin kan opprette lenker" ON public.transfer_links;
DROP POLICY IF EXISTS "Anon kan lese lenke via token" ON public.transfer_links;
DROP POLICY IF EXISTS "Staff kan administrere leveranselenker" ON public.transfer_links;

CREATE POLICY "Staff kan administrere leveranselenker"
  ON public.transfer_links
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
