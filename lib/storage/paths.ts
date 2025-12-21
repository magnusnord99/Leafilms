/**
 * Hjelpefunksjoner for å generere filstier i Supabase Storage
 * Struktur: customers/[customer-name]/[project-title]/[type]/[filename]
 */

/**
 * Sanitize string for use in file paths
 * Fjerner spesialtegn og erstatter med underscore
 */
export function sanitizePath(str: string): string {
  return str
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '')
    .substring(0, 50) // Maks 50 tegn
}

/**
 * Generer base path for kunde og prosjekt
 */
export function getCustomerProjectPath(customerName: string, projectTitle: string): string {
  const customerPath = sanitizePath(customerName)
  const projectPath = sanitizePath(projectTitle)
  return `customers/${customerPath}/${projectPath}`
}

/**
 * Generer path for tilbud (quote) PDF
 */
export function getQuotePath(customerName: string, projectTitle: string, filename?: string, version?: string): string {
  const basePath = getCustomerProjectPath(customerName, projectTitle)
  // Hvis filename er satt, bruk den direkte (den er allerede unik)
  // Hvis ikke, generer unikt filnavn basert på prosjekttittel, versjon og timestamp
  if (filename) {
    return `${basePath}/quotes/${filename}`
  }
  
  const versionSuffix = version ? `_${version}` : ''
  const timestamp = Date.now()
  const sanitizedProject = sanitizePath(projectTitle).substring(0, 20)
  const defaultFilename = `pristilbud_${sanitizedProject}${versionSuffix}_${timestamp}.pdf`
  return `${basePath}/quotes/${defaultFilename}`
}

/**
 * Generer path for kontrakt PDF
 */
export function getContractPath(customerName: string, projectTitle: string, filename?: string): string {
  const basePath = getCustomerProjectPath(customerName, projectTitle)
  const defaultFilename = filename || `kontrakt_${Date.now()}.pdf`
  return `${basePath}/contracts/${defaultFilename}`
}

/**
 * Generer path for prosjektbeskrivelse PDF (hvis nødvendig senere)
 */
export function getProjectDescriptionPath(customerName: string, projectTitle: string, filename?: string): string {
  const basePath = getCustomerProjectPath(customerName, projectTitle)
  const defaultFilename = filename || `prosjektbeskrivelse_${Date.now()}.pdf`
  return `${basePath}/${defaultFilename}`
}

