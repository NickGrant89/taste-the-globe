import { handleCreatePost } from '../server/handlers.mjs'

export async function POST(request) {
  return handleCreatePost(request)
}
