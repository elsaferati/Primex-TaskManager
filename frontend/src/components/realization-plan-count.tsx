export function RealizationPlanCount({ planned, extra }: { planned: number; extra: number }) {
  return <span className="whitespace-nowrap tabular-nums" title={`${planned} të planifikuara + ${extra} detyra ekstra`}>
    {extra > 0 ? `${planned}+${extra}` : planned}
  </span>
}
