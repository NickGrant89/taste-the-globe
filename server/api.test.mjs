process.env.TASTE_FORCE_JSON = '1'
process.env.TASTE_JSON_FILE = `${process.env.TMPDIR || '/tmp'}/taste-globe-${Date.now()}-store.json`

const { handleRequest } = await import('./handlers.mjs')
const { GET: healthGet } = await import('../api/health.js')
const { POST: signupPost } = await import('../api/signup.js')
const { POST: loginPost } = await import('../api/login.js')

function req(method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function read(response) {
  return { status: response.status, body: await response.json() }
}

const health = await read(await healthGet())
if (health.status !== 200 || health.body.ok !== true) throw new Error('health failed')

const boot = await read(await handleRequest(req('GET', '/api/bootstrap')))
if (boot.status !== 200 || boot.body.user !== null) throw new Error('anonymous bootstrap failed')

const email = `nick-${Date.now()}@example.com`
const signup = await read(
  await signupPost(
    req('POST', '/api/signup', {
      body: { email, password: 'password1', name: 'Nick', city: 'London', country: 'United Kingdom' },
    }),
  ),
)
if (signup.status !== 201 || !signup.body.token || signup.body.user?.name !== 'Nick') {
  throw new Error(`signup failed: ${JSON.stringify(signup)}`)
}

const login = await read(await loginPost(req('POST', '/api/login', { body: { email, password: 'password1' } })))
if (login.status !== 200 || !login.body.token) throw new Error('login failed')

const post = await read(
  await handleRequest(
    req('POST', '/api/posts', {
      token: login.body.token,
      body: {
        section: 'recipes',
        title: 'Cardamom buns',
        summary: 'A tray of cardamom buns from a London kitchen.',
        city: 'London',
        country: 'United Kingdom',
        lat: 51.5072,
        lng: -0.1276,
        tags: ['bun'],
      },
    }),
  ),
)
if (post.status !== 201 || post.body.entry?.photo !== '/photos/bun.jpg') {
  throw new Error(`create post failed: ${JSON.stringify(post)}`)
}

const rated = await read(
  await handleRequest(
    req('PUT', '/api/ratings', { token: login.body.token, body: { entryId: post.body.entry.id, value: 5 } }),
  ),
)
if (rated.status !== 200) throw new Error('rating failed')

const authed = await read(await handleRequest(req('GET', '/api/bootstrap', { token: login.body.token })))
if (authed.body.posts.length !== 1 || authed.body.ratings[post.body.entry.id] !== 5) {
  throw new Error('bootstrap after post failed')
}

const denied = await read(await handleRequest(req('POST', '/api/posts', { body: { title: 'Nope' } })))
if (denied.status !== 401) throw new Error('unauthenticated post should 401')

console.log('api handlers ok')
