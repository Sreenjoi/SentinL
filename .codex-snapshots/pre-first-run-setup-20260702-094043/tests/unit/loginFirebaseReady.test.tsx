import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BrowserRouter } from 'react-router-dom';
import Login from '../../src/components/Login';
import * as firebaseAuth from 'firebase/auth';

// Mock dependencies
vi.mock('../../src/firebase', () => ({
  auth: null,
  db: null,
  firebaseReady: false,
  firebaseInitError: new Error('Firebase configuration is missing.')
}));

vi.mock('firebase/auth', () => ({
  getRedirectResult: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => [null, false]
}));

describe('Login Component without Firebase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders error panel when firebaseReady is false', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    
    expect(screen.getByText('Setup Required')).toBeInTheDocument();
    expect(screen.getByText('Firebase configuration is missing.')).toBeInTheDocument();
  });

  it('does not call Firebase auth functions when firebaseReady is false', async () => {
    // Note: since the error panel renders early, the login form shouldn't even be there.
    // But if we tried to somehow call submit, we'd ensure it has an early return.
    
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    
    // getRedirectResult shouldn't be called because early return in useEffect
    expect(firebaseAuth.getRedirectResult).not.toHaveBeenCalled();
  });
});
