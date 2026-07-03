import { http, HttpResponse } from 'msw'

const API_BASE_URL = 'http://localhost:8000/api'

export const handlers = [
  http.get(`${API_BASE_URL}/health`, () => {
    return HttpResponse.json({ status: 'ok' })
  }),
]
