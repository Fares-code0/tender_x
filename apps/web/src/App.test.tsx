import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { pingSchema } from '@tender/shared';

describe('App', () => {
  it('renders the Arabic title', () => {
    render(<App />);
    expect(screen.getByText('نظام إدارة المناقصات')).toBeInTheDocument();
  });

  it('imports shared zod schema successfully (M0.5)', () => {
    expect(pingSchema.safeParse({ message: 'مرحبا' }).success).toBe(true);
  });
});
