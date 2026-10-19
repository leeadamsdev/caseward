import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Button } from "./button";

export function Modal({
    open,
    onOpenChange,
    busy,
    title,
    description,
    trigger,
    children,
    finalFocus,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    busy: boolean;
    title: string;
    description: string;
    trigger: ReactElement;
    children: ReactNode;
    finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
}) {
    return (
        <Dialog.Root
            open={open}
            onOpenChange={(next, details) => {
                if (busy) details.cancel();
                else onOpenChange(next);
            }}
        >
            <Dialog.Trigger render={trigger} />
            <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-xs transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
                <Dialog.Popup
                    finalFocus={finalFocus}
                    className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-120 -translate-1/2 overflow-y-auto rounded-2xl border bg-popover p-6 text-popover-foreground shadow-xl transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none sm:p-8"
                >
                    <Dialog.Title className="pr-10 text-xl font-semibold tracking-tight">
                        {title}
                    </Dialog.Title>
                    <Dialog.Description className="mt-2 mb-6 text-sm wrap-anywhere text-muted-foreground">
                        {description}
                    </Dialog.Description>
                    {children}
                    <Dialog.Close
                        disabled={busy}
                        render={
                            <Button
                                variant="ghost"
                                className="absolute top-3 right-3 size-11 rounded-lg"
                                aria-label="Close dialog"
                            />
                        }
                    >
                        <X className="size-5" aria-hidden="true" />
                    </Dialog.Close>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
