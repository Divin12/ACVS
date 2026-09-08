// The tricolor brand bar (DRC flag colors, drawn from the Ministry seal).
// Per Design.md §2, the three vertical bars (blue/yellow/red) belong in
// chrome, not in any status badge — they identify the institution, not
// the certificate state.

export default function TricolorStrip({ orientation = 'horizontal' }) {
  if (orientation === 'vertical') {
    return (
      <div
        aria-hidden="true"
        className="hidden md:flex flex-col h-12 w-1.5 rounded-sm overflow-hidden"
      >
        <div className="flex-1 bg-congo-blue" />
        <div className="flex-1 bg-congo-yellow" />
        <div className="flex-1 bg-congo-red" />
      </div>
    )
  }
  return (
    <div aria-hidden="true" className="flex h-1 w-full">
      <div className="flex-1 bg-congo-blue" />
      <div className="flex-1 bg-congo-yellow" />
      <div className="flex-1 bg-congo-red" />
    </div>
  )
}
