import OpenAI from 'openai'

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function translateText(text: string, targetLanguage: 'no' | 'en', openai: OpenAI): Promise<string> {
  if (!text || !text.trim()) return text

  const systemPrompt = targetLanguage === 'en'
    ? 'You are a professional translator. Translate the following text to English. Preserve formatting and tone. Return only the translated text, nothing else.'
    : 'Du er en profesjonell oversetter. Oversett følgende tekst til norsk bokmål. Bevar formattering og tone. Returner kun den oversatte teksten, ingenting annet.'

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    temperature: 0.3,
    max_tokens: 600
  })

  return completion.choices[0].message.content?.trim() || text
}
