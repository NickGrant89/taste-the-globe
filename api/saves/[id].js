import { handleDeleteSave } from '../../server/handlers.mjs'

export async function DELETE(request) {
  return handleDeleteSave(request)
}
