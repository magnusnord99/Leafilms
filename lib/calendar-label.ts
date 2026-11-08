// Rene hjelpefunksjoner for kalendernavn-mal — delt mellom lib/actions/calendar.ts
// (server actions, må kun eksportere async-funksjoner) og admin-UI-et som viser
// standardnavnet som plassholder (feedback 89524e2d).

// Etter migrasjon 186 er customers.name allerede kontonavnet (firma eller privatperson).
// company-feltet er fjernet — vi leser kun name.
export function companyLabel(customer: { name: string | null } | null | undefined): string | null {
  return customer?.name || null
}

// Standard kalendernavn for en oppgave når ingen har overstyrt det manuelt:
// "POSTPROD - <oppgavetittel> - <firmanavn>" for post-produksjon, siden det er der
// behovet ble meldt inn — andre steg beholder bare oppgavetittelen som før.
export function buildTaskCalendarLabel(title: string, pipelineStage: string, company: string | null): string {
  if (pipelineStage === 'post_prod' && company) return `POSTPROD - ${title} - ${company}`
  return title
}
