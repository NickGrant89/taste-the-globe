import { handleMe } from '../server/handlers.mjs'

export async function PATCH(request) {
  return handleMe(request)
}
