import { handleLogin } from '../server/handlers.mjs'

export async function POST(request) {
  return handleLogin(request)
}
