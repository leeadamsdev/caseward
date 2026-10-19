import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { server } from "./http";

const unexpectedRequests: string[] = [];

beforeAll(() => {
    server.listen({
        onUnhandledRequest(request) {
            const message = `Unexpected request: ${request.method} ${request.url}`;
            unexpectedRequests.push(message);
            throw new Error(message);
        },
    });
});

afterEach(() => {
    cleanup();
    server.resetHandlers();
    vi.useRealTimers();
    document.cookie = "XSRF-TOKEN=; Max-Age=0; Path=/";
    localStorage.clear();
    // The application catches network errors; an unhandled mock must still fail the test.
    expect(unexpectedRequests.splice(0)).toEqual([]);
});

afterAll(() => {
    server.close();
});
