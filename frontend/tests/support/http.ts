import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export function csrfCookie(token = "test=token") {
    return http.get("http://localhost/sanctum/csrf-cookie", () => {
        // Node's fetch does not apply response cookies to jsdom's cookie jar.
        document.cookie = `XSRF-TOKEN=${encodeURIComponent(token)}; Path=/`;
        return new HttpResponse(null, { status: 204 });
    });
}

export const server = setupServer(csrfCookie());
