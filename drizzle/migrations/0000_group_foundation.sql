CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name text NOT NULL DEFAULT 'Pilote', avatar_url text);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE FUNCTION public.create_pilot_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.profiles(id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))); RETURN NEW; END; $$;
CREATE TRIGGER create_pilot_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_pilot_profile();
CREATE TABLE public.group_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, payload jsonb NOT NULL, author_id uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_records TO authenticated;
GRANT ALL ON public.group_records TO service_role;
ALTER TABLE public.group_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_read ON public.group_records FOR SELECT TO authenticated USING (true);
CREATE POLICY group_insert ON public.group_records FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY group_update ON public.group_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY group_delete ON public.group_records FOR DELETE TO authenticated USING (author_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_records;
INSERT INTO public.group_records(kind,payload) VALUES
('message','{"name":"Maxime","text":"Qui est chaud pour une sortie dimanche dans les Vosges ? 🏍️","time":"18:32","pilot":"M"}'),
('message','{"name":"Lucas","text":"Carrément ! Je connais une boucle sympa au départ du lac de Gérardmer.","time":"18:34","pilot":"L"}'),
('message','{"name":"Thomas","text":"Le quad est prêt 💪 On se retrouve à 9h au parking du lac ?","time":"18:36","pilot":"T"}'),
('vehicle','{"name":"Beta RR 300","owner":"Maxime","pilot":"M","cc":300,"type":"Enduro","image":"red","hours":124.5,"km":2840,"maintenance":["Vidange boîte · 110 h","Filtre à air · 122 h"],"alert":"Vidange à prévoir dans 5 h"}'),
('vehicle','{"name":"KTM 350 EXC-F","owner":"Lucas","pilot":"L","cc":350,"type":"Enduro","image":"orange","hours":86.2,"km":1950,"maintenance":["Vidange moteur · 80 h","Kit chaîne · 75 h"],"alert":"Prête à rouler"}'),
('vehicle','{"name":"Yamaha Raptor 700","owner":"Thomas","pilot":"T","cc":686,"type":"Quad","image":"quad","hours":162,"km":3620,"maintenance":["Vidange moteur · 150 h","Pneus arrière · 155 h"],"alert":"Prêt à rouler"}');