import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import App from "../../src/App";

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// Mock firebase
vi.mock("../../src/firebase", () => ({
  auth: { currentUser: null },
  db: {},
  firebaseReady: true,
  firebaseInitError: null,
}));

// Mock react-firebase-hooks
vi.mock("react-firebase-hooks/auth", () => ({
  useAuthState: () => [null, false, null], // [user, loading, error]
}));

// Mock ServerContext
vi.mock("../../src/context/ServerContext", () => ({
  ServerProvider: ({ children }: any) => <>{children}</>,
  useServer: () => ({
    isPro: false,
    selectedServerId: null,
    pendingFlagsCount: 0,
    pendingReportsCount: 0,
    isBetaTester: false,
    isTrial: false,
    tier: "free",
  }),
}));

// Mock components that might throw
vi.mock("../../src/components/DiscordConnect", () => ({
  DiscordConnect: () => <div data-testid="discord-connect" />,
  ServerSelector: () => <div data-testid="server-selector" />,
}));
vi.mock("../../src/components/ReportIssueModal", () => ({
  default: () => <div data-testid="report-modal" />,
}));
vi.mock("../../src/components/Logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));

describe("Catch-all Route Rendering", () => {
  it("should render NotFound view for unknown paths without redirecting if unauthenticated", async () => {
    // Set URL to an unknown path
    window.history.pushState({}, "Test page", "/some-random-oauth-callback");

    render(<App />);

    // Check if 404 text is rendered
    expect(await screen.findByText("404")).toBeDefined();
    expect(screen.getByText("Page Not Found")).toBeDefined();
    expect(screen.getByText(/doesn't exist/)).toBeDefined();

    // Because user is null, it should show Log In button
    expect(screen.getByText("Log In")).toBeDefined();
  });
});
