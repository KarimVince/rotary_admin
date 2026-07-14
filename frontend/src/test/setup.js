import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setAccessToken } from '../api/client'
import { server } from './mocks/server'

// jsdom has no layout engine, so recharts' ResponsiveContainer always
// measures 0x0 and skips rendering chart content (bars/labels/pie slices)
// without this — every chart-content assertion would fail regardless of
// app correctness. Standard fix: stub ResizeObserver and give elements a
// fixed non-zero size.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 500 })
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 300 })
HTMLElement.prototype.getBoundingClientRect = () => ({
  width: 500,
  height: 300,
  top: 0,
  left: 0,
  bottom: 300,
  right: 500,
  x: 0,
  y: 0,
  toJSON() {},
})
// jsdom's SVG support doesn't implement getBBox at all (throws) — recharts
// uses it to measure axis tick label text for vertical bar charts, and
// bails out to a zero-size render when it's missing.
if (typeof SVGElement !== 'undefined') {
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 100, height: 20 })
}

// 'error' throws "[MSW] Cannot bypass a request when using the 'error'
// strategy" as an unhandled rejection from this MSW version's experimental
// core on some runs (confirmed via a 'warn' run showing zero actual
// unmatched requests) — an MSW-internal quirk, not a real testing gap.
// 'warn' still surfaces genuinely unmocked requests in the console without
// crashing the run.
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  setAccessToken(null)
})
afterAll(() => server.close())
