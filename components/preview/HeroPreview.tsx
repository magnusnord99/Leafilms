import { Heading, Text } from '@/components/ui'

type HeroPreviewProps = {
  client?: string
  projectTitle?: string
}

export function HeroPreview({ client, projectTitle }: HeroPreviewProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-8 bg-black">
      <div className="max-w-4xl mx-auto text-center">
        <Heading as="h1" size="xl" className="mb-6">
          {client || projectTitle || 'Kundenavn'}
        </Heading>
        <Text variant="lead" className="text-gray-400">
          Innholdsproduksjon
        </Text>
      </div>
    </div>
  )
}

