import { handleDeletePost } from '../../server/handlers.mjs'

export async function DELETE(request) {
  return handleDeletePost(request)
}
