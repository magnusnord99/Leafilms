import { sqlRetriever } from './sql'

export interface Retriever {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
  execute(input: Record<string, unknown>): Promise<unknown>
}

export const retrievers: Retriever[] = [sqlRetriever]
