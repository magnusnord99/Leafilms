ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS sales_flyer_id uuid REFERENCES public.sales_flyers(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_sales_flyer_unique ON public.conversations(sales_flyer_id);

-- Restriktive policyer supplerer eksisterende deltaker-policyer. Kunder og
-- anonyme kan aldri lese eller melde seg inn i interne flyer-samtaler.
CREATE POLICY "Flyer conversations require staff" ON public.conversations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (sales_flyer_id IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'sales', 'production')
  ))
  WITH CHECK (sales_flyer_id IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'sales', 'production')
  ));

CREATE POLICY "Flyer participant rows require staff" ON public.conversation_participants
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'sales', 'production'))
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.sales_flyer_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'sales', 'production'))
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.sales_flyer_id IS NULL));

CREATE POLICY "Flyer messages require staff" ON public.conversation_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'sales', 'production'))
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.sales_flyer_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'sales', 'production'))
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.sales_flyer_id IS NULL));
