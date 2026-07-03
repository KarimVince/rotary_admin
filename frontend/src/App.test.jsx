import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders without crashing and shows API status once loaded', async () => {
    render(<App />)

    expect(screen.getByText('Rotary Admin')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('API status: ok')).toBeInTheDocument()
    })
  })
})
