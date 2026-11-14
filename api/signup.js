import { handleSignup } from '../server/handlers.mjs'

export async function POST(request) {
  return handleSignup(request)
}
