import { useEffect, useState } from "react";
import type { RetryWindow } from "~/lib/api";

export function useRetryCountdown(retry: RetryWindow | undefined) {
    const [now, setNow] = useState(0);
    const retryAt = retry?.retryAt;

    useEffect(() => {
        if (retryAt === undefined) return;
        const timer = setInterval(() => {
            const time = Date.now();
            setNow(time);
            if (time >= retryAt) clearInterval(timer);
        }, 250);
        return () => {
            clearInterval(timer);
        };
    }, [retryAt]);

    return retry
        ? Math.max(
              0,
              Math.ceil(
                  (retry.retryAt - Math.max(now, retry.receivedAt)) / 1000,
              ),
          )
        : 0;
}
