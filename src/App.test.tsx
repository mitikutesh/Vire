import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

// Also serves as the harness smoke test: jsdom + RTL + jest-dom matchers.
describe('App', () => {
  it('renders the Vire wordmark', () => {
    render(<App />);
    expect(screen.getByText('Vire')).toBeInTheDocument();
  });
});
