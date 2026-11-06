import type { ActivityKind } from "@/types/activity";

export function ActivityMotif({ kind }: { kind: ActivityKind }) {
  return <span className={`activity-motif motif-${kind}`} aria-hidden="true">
    <svg viewBox="0 0 240 128" fill="none">
      {kind === "quiz" && <g className="motif-answers">
        <rect x="57" y="15" width="130" height="98" rx="9" fill="white" />
        <rect x="70" y="30" width="78" height="5" rx="2.5" fill="currentColor" opacity=".4" />
        {[48, 68, 88].map((y, i) => <g key={y}><rect x="70" y={y} width="104" height="14" rx="4" fill="currentColor" opacity={i === 1 ? ".2" : ".06"} /><circle cx="80" cy={y + 7} r="3" stroke="currentColor" opacity=".7" />{i === 1 && <path d="m78 75 2 2 4-4" stroke="currentColor" strokeWidth="1.5" />}</g>)}
      </g>}
      {kind === "wheel" && <g className="motif-wheel"><circle cx="120" cy="64" r="47" fill="white" />{[0,60,120,180,240,300].map((angle,i) => <path key={angle} d="M120 64 L120 20 A44 44 0 0 1 158.1 42 Z" fill="currentColor" opacity={i % 2 ? ".12" : ".3"} transform={`rotate(${angle} 120 64)`} />)}<circle cx="120" cy="64" r="12" fill="white" /><circle cx="120" cy="64" r="4" fill="currentColor" /><path d="m114 10 6 12 6-12" fill="currentColor" /></g>}
      {kind === "timeline" && <g className="motif-events"><path d="M25 65H215" stroke="currentColor" strokeWidth="2" opacity=".35" />{[44,95,146,197].map((x,i) => <g key={x}><circle cx={x} cy="65" r="5" fill="currentColor" /><path d={`M${x} 65v${i % 2 ? 17 : -17}`} stroke="currentColor" /><rect x={x-17} y={i % 2 ? 83 : 25} width="34" height="20" rx="4" fill="white" /><path d={`M${x-9} ${i % 2 ? 93 : 35}h18`} stroke="currentColor" strokeWidth="3" opacity=".4" /></g>)}</g>}
      {kind === "decisions" && <g className="motif-paths"><path d="M120 35v22M120 57H65v25M120 57h55v25" stroke="currentColor" strokeWidth="2" opacity=".45" /><rect x="98" y="10" width="44" height="30" rx="7" fill="white" /><path d="m114 25 4 4 9-9" stroke="currentColor" strokeWidth="2" /><rect x="39" y="82" width="52" height="30" rx="7" fill="white" /><rect x="149" y="82" width="52" height="30" rx="7" fill="currentColor" opacity=".25" /><path d="M55 97h20M165 97h20" stroke="currentColor" strokeWidth="2" /></g>}
      {kind === "recommended" && <g className="motif-recommend"><rect x="55" y="20" width="60" height="85" rx="7" fill="white" /><path d="M69 42h32M69 53h24M69 64h29M69 75h19" stroke="currentColor" opacity=".5" strokeWidth="3" /><path d="M125 64h24m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" /><path d="m179 34 7 19 19 7-19 7-7 19-7-19-19-7 19-7 7-19Z" fill="currentColor" /><circle cx="202" cy="29" r="4" fill="currentColor" opacity=".4" /></g>}
    </svg>
  </span>;
}
