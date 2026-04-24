import * as React from "react"

import * as React from "react"

import { cn } from "@/lib/utils"

type TextareaProps = React.ComponentProps<"textarea"> & {
  autoResize?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ autoResize = false, className, onChange, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node

        if (typeof forwardedRef === "function") {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      },
      [forwardedRef]
    )

    const resize = React.useCallback(() => {
      if (!autoResize || !internalRef.current) return
      internalRef.current.style.height = "0px"
      internalRef.current.style.height = `${internalRef.current.scrollHeight}px`
    }, [autoResize])

    React.useLayoutEffect(() => {
      resize()
    }, [resize, props.value])

    return (
      <textarea
        ref={setRefs}
        data-slot="textarea"
        className={cn(
          "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        onChange={(event) => {
          onChange?.(event)
          resize()
        }}
        {...props}
      />
    )
  }
)

Textarea.displayName = "Textarea"

export { Textarea }


