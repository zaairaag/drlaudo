import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Logo } from './Logo';

afterEach(cleanup);

describe('Marca Dr. Laudo', () => {
  it('apresenta o logo completo com wordmark editorial', () => {
    render(<Logo variant="full" />);
    expect(screen.getByText('Dr.')).toBeVisible();
    expect(screen.getByText('Laudo')).toBeVisible();
  });

  it('no modo mark inclui texto oculto acessível', () => {
    render(<Logo variant="mark" />);
    expect(screen.getByText('Dr. Laudo')).toHaveClass('sr-only');
  });
});
