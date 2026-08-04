export default function AppLoading() {
  return (
    <div className="flex min-h-[12rem] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        <span>Loading...</span>
      </div>
    </div>
  )
}
