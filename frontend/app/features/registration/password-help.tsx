import { Popover } from "@base-ui/react/popover";
import { CircleHelp, X } from "lucide-react";
import { Button } from "~/components/ui/button";

export function PasswordHelp() {
    return (
        <Popover.Root>
            <Popover.Trigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        className="size-6 rounded-full"
                    />
                }
                aria-label="Password requirements"
            >
                <CircleHelp className="size-4" aria-hidden="true" />
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner
                    side="bottom"
                    align="start"
                    sideOffset={8}
                    collisionPadding={16}
                    className="z-50"
                >
                    <Popover.Popup className="max-h-(--available-height) w-80 max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-y-auto rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <Popover.Title className="font-semibold">
                                Password requirements
                            </Popover.Title>
                            <Popover.Close
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="size-6 shrink-0 rounded-md"
                                    />
                                }
                                aria-label="Close password help"
                            >
                                <X className="size-4" aria-hidden="true" />
                            </Popover.Close>
                        </div>
                        <Popover.Description render={<div />}>
                            <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                                <li>15–128 characters</li>
                                <li>
                                    Spaces and Unicode characters are supported
                                </li>
                                <li>
                                    No mandatory uppercase, number, or symbol
                                    rules
                                </li>
                            </ul>
                        </Popover.Description>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
