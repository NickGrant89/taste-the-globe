import { handleBootstrap } from '../server/handlers.mjs'

export async function GET(request) {
  return handleBootstrap(request)
}
