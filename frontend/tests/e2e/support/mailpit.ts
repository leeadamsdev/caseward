import { expect, type APIRequestContext } from "@playwright/test";
import { isRecord } from "../../../app/lib/api";

export async function capturedMail(request: APIRequestContext, query: string) {
    let messageId: string | undefined;
    await expect
        .poll(
            async () => {
                const response = await request.get(
                    "http://mailpit:8025/api/v1/search",
                    { params: { query } },
                );
                expect(response.ok()).toBe(true);
                const body: unknown = await response.json();
                if (!isRecord(body) || !Array.isArray(body.messages))
                    throw new Error("Invalid Mailpit search response");
                const message: unknown = body.messages[0];
                if (message === undefined) return false;
                if (!isRecord(message) || typeof message.ID !== "string")
                    throw new Error("Invalid Mailpit message ID");
                messageId = message.ID;
                return true;
            },
            { timeout: 10_000 },
        )
        .toBe(true);
    if (!messageId) throw new Error("Email was not captured");
    const response = await request.get(
        `http://mailpit:8025/api/v1/message/${messageId}`,
    );
    expect(response.ok()).toBe(true);
    const message: unknown = await response.json();
    if (
        !isRecord(message) ||
        typeof message.HTML !== "string" ||
        typeof message.Text !== "string" ||
        typeof message.Subject !== "string"
    )
        throw new Error("Invalid Mailpit email content");
    return { html: message.HTML, text: message.Text, subject: message.Subject };
}
