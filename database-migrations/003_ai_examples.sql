-- AI Examples table for storing text generation examples

CREATE TABLE ai_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type TEXT NOT NULL,        -- 'goal', 'concept', etc.
  project_type TEXT NOT NULL,        -- 'event', 'branding', 'documentary'
  example_text TEXT NOT NULL,
  quality_score INTEGER DEFAULT 5,   -- 1-10 rating
  usage_count INTEGER DEFAULT 0,     -- How many times used
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_examples_lookup ON ai_examples(section_type, project_type);

-- Insert existing hardcoded examples

-- GOAL - EVENT
INSERT INTO ai_examples (section_type, project_type, example_text) VALUES
('goal', 'event', 'Målet med dette prosjektet er å skape innhold som fanger essensen av eventet og inspirerer flere til å delta. Vi ønsker å nå ut til målgruppen gjennom visuelt engasjerende innhold som deles organisk på sosiale medier. Gjennom autentisk storytelling skal vi øke engasjementet og styrke merkevaren.'),
('goal', 'event', 'Hovedmålet er å dokumentere høydepunktene fra arrangementet på en måte som formidler energi og stemning til publikum som ikke var tilstede. Vi sikter mot å skape innhold som kan brukes til å markedsføre fremtidige events og bygge forventninger i målgruppen.'),
('goal', 'event', 'Vi skal produsere innhold som øker synligheten til eventet og skaper buzz i sosiale medier. Målet er å nå ut til både eksisterende og nye publikummere, og posisjonere arrangementet som et must-see event i bransjen.');

-- GOAL - BRANDING
INSERT INTO ai_examples (section_type, project_type, example_text) VALUES
('goal', 'branding', 'Hovedmålet er å utvikle visuell identitet som kommuniserer merkevarens verdier på en autentisk og minneverdig måte. Vi ønsker å skape innhold som skiller kunden ut fra konkurrentene og bygger tillit hos målgruppen.'),
('goal', 'branding', 'Prosjektet skal styrke merkevarens posisjon i markedet gjennom profesjonelt og konsistent visuelt innhold. Vi sikter mot å øke merkevaregjenkjenning med 30% og skape emosjonell tilknytning til produktene.'),
('goal', 'branding', 'Målet er å etablere en sterk visuell profil som reflekterer merkevarens DNA og resonerer med målgruppen. Gjennom kreativt storytelling skal vi differensiere kunden i et konkurranseutsatt marked.');

-- GOAL - DOCUMENTARY
INSERT INTO ai_examples (section_type, project_type, example_text) VALUES
('goal', 'documentary', 'Vi skal fortelle en autentisk og engasjerende historie som berører publikum og skaper forståelse for tematikken. Målet er å produsere innhold som både informerer og inspirerer, og som kan brukes til å skape debatt og bevissthet.'),
('goal', 'documentary', 'Prosjektet har som mål å dokumentere viktige hendelser og historier på en respektfull og profesjonell måte. Vi ønsker å gi stemme til de som ikke blir hørt og belyse samfunnsrelevante temaer.'),
('goal', 'documentary', 'Gjennom dokumentarisk tilnærming skal vi skape innhold som vekker empati og engasjement. Målet er å nå ut til et bredt publikum og bidra til økt forståelse av komplekse temaer.');

-- CONCEPT - EVENT
INSERT INTO ai_examples (section_type, project_type, example_text) VALUES
('concept', 'event', 'Konseptet bygger på dynamisk filming som fanger de spontane øyeblikkene og energien fra eventet. Vi kombinerer cinematic filming med rask turn-around for sosiale medier, og sikrer at innholdet når ut mens det fortsatt er relevant.'),
('concept', 'event', 'Vi benytter en multi-kamera setup for å fange eventet fra ulike perspektiver, med fokus på både oversiktsbilder og intime close-ups av deltagere. Innholdet redigeres med høyt tempo og moderne musikk for å formidle energi.'),
('concept', 'event', 'Konseptet er inspirert av dokumentarisk stil med personlige intervjuer og atmosfæriske b-roll. Vi skaper en narrativ rød tråd gjennom eventet som gjør seeren til en del av opplevelsen.');

-- CONCEPT - BRANDING
INSERT INTO ai_examples (section_type, project_type, example_text) VALUES
('concept', 'branding', 'Vi utvikler et visuelt språk som er cleant, moderne og tidløst. Konseptet kombinerer produktfotografi med lifestyle-elementer som viser merkevaren i bruk hos målgruppen. Fargepaletten er minimal med strategisk bruk av merkevarens signaturfarger.'),
('concept', 'branding', 'Konseptet bygger på autentisk storytelling der vi viser mennesker bak merkevaren. Gjennom behind-the-scenes og personlige historier skaper vi emosjonell tilknytning. Visuelt holder vi det naturlig med myk lighting og organiske komposisjoner.'),
('concept', 'branding', 'Vi benytter en premium tilnærming med fokus på detaljer og kvalitet. Konseptet kombinerer slow-motion product shots med lifestyle-fotografering som kommuniserer aspirasjon og eksklusivitet.');

-- CONCEPT - DOCUMENTARY
INSERT INTO ai_examples (section_type, project_type, example_text) VALUES
('concept', 'documentary', 'Konseptet er basert på observerende dokumentarisk stil der vi følger hovedpersonene over tid. Vi lar historien utvikle seg naturlig uten påvirkning, og bygger narrativ gjennom editing. Visuelt holder vi det rått og autentisk med handheld kamera og naturlig lys.'),
('concept', 'documentary', 'Vi benytter en hybrid tilnærming som kombinerer intervjuer, arkivmateriale og ny filming. Konseptet bygger opp mot en klimaks som engasjerer seeren følelsesmessig. Lyddesign og musikk er nøye valgt for å forsterke historien.'),
('concept', 'documentary', 'Konseptet tar utgangspunkt i cinematic dokumentar med fokus på visuell storytelling. Vi bruker tid på å bygge tillit med personene vi filmer, og fanger intime øyeblikk som viser menneskelighet og sårbarhet.');

