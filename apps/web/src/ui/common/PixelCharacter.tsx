const OUTLINE = "#14121f";

export function PixelCharacter({
  roleColor,
  skin,
  hair,
  longHair,
  className,
}: {
  roleColor: string;
  skin: string;
  hair: string;
  longHair: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 32" shapeRendering="crispEdges" aria-hidden="true" className={className}>
      {longHair ? (
        <>
          <rect x="3" y="5" width="3" height="11" fill={hair} stroke={OUTLINE} strokeWidth="1" />
          <rect x="18" y="5" width="3" height="11" fill={hair} stroke={OUTLINE} strokeWidth="1" />
        </>
      ) : (
        <>
          <rect x="4" y="5" width="2" height="3" fill={hair} stroke={OUTLINE} strokeWidth="1" />
          <rect x="18" y="5" width="2" height="3" fill={hair} stroke={OUTLINE} strokeWidth="1" />
        </>
      )}
      <rect x="6" y={longHair ? 2 : 3} width="12" height={longHair ? 4 : 3} fill={hair} stroke={OUTLINE} strokeWidth="1" />
      <rect x="6" y="6" width="12" height="8" fill={skin} stroke={OUTLINE} strokeWidth="1" />
      <rect x="9" y="11" width="2" height="2" fill={OUTLINE} />
      <rect x="15" y="11" width="2" height="2" fill={OUTLINE} />
      <rect x="4" y="14" width="16" height="12" fill={roleColor} stroke={OUTLINE} strokeWidth="1" />
      <rect x="0" y="15" width="4" height="10" fill={roleColor} stroke={OUTLINE} strokeWidth="1" />
      <rect x="20" y="15" width="4" height="10" fill={roleColor} stroke={OUTLINE} strokeWidth="1" />
    </svg>
  );
}
