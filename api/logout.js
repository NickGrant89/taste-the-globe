import { handleLogout } from '../server/handlers.mjs'

export async function POST(request) {
  return handleLogout(request)
}
