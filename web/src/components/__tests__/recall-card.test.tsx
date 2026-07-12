import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { RecallCard } from '@/components/recall-card';

afterEach(() => cleanup());

describe('RecallCard', () => {
  it('renders the supplied copy', () => {
    render(<RecallCard copy="You talked here before. Want to continue?" />);
    expect(screen.getByText('You talked here before. Want to continue?')).toBeInTheDocument();
  });
});
