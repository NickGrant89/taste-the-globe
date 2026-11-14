import { handleRating } from '../server/handlers.mjs'

export async function PUT(request) {
  return handleRating(request)
}
