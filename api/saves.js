import { handleCreateSave } from '../server/handlers.mjs'

export async function POST(request) {
  return handleCreateSave(request)
}
