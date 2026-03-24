"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ConfirmDialogOptions = {
  title?: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

type ConfirmDialogState = ConfirmDialogOptions & {
  open: boolean
}

const ConfirmDialogContext = React.createContext<ConfirmDialogContextValue | null>(null)

const DEFAULT_OPTIONS: Omit<ConfirmDialogOptions, "description"> = {
  title: "Please confirm",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  variant: "default",
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmDialogState | null>(null)
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null)

  const closeDialog = React.useCallback((value: boolean) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setState(null)
  }, [])

  const confirm = React.useCallback((options: ConfirmDialogOptions) => {
    if (resolverRef.current) {
      resolverRef.current(false)
    }

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setState({
        ...DEFAULT_OPTIONS,
        ...options,
        open: true,
      })
    })
  }, [])

  React.useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(false)
        resolverRef.current = null
      }
    }
  }, [])

  const value = React.useMemo<ConfirmDialogContextValue>(() => ({ confirm }), [confirm])

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(state?.open)}
        onOpenChange={(open) => {
          if (!open) closeDialog(false)
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{state?.title ?? DEFAULT_OPTIONS.title}</DialogTitle>
            <DialogDescription>{state?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeDialog(false)}>
              {state?.cancelLabel ?? DEFAULT_OPTIONS.cancelLabel}
            </Button>
            <Button
              variant={state?.variant === "destructive" ? "destructive" : "default"}
              onClick={() => closeDialog(true)}
            >
              {state?.confirmLabel ?? DEFAULT_OPTIONS.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirm() {
  const context = React.useContext(ConfirmDialogContext)

  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider")
  }

  return context.confirm
}
