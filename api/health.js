import { handleHealth } from '../server/handlers.mjs'

export async function GET() {
  return handleHealth()
}
