type PrimeflowEmbedPageProps = {
  src: string
  title: string
}

export function PrimeflowEmbedPage({ src, title }: PrimeflowEmbedPageProps) {
  return (
    <div className="h-[calc(100vh-6rem)] min-h-[640px] overflow-hidden bg-white">
      <iframe src={src} title={title} className="h-full w-full border-0" />
    </div>
  )
}
