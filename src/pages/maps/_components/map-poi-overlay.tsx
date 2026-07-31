import { SPRINGFIELD_POIS, type MapPoi } from "@/lib/maps/springfield-pois";

const POI_TEXT_SHADOW =
  "0 0 2px #000, 0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000";

type MapPoiOverlayProps = {
  pois?: MapPoi[];
};

export default function MapPoiOverlay({ pois = SPRINGFIELD_POIS }: MapPoiOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[5] select-none"
      aria-hidden
    >
      {pois.map((poi) => {
        const fontScale = poi.fontScale ?? 1;

        return (
          <div
            key={poi.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-center font-black uppercase leading-none tracking-wide text-white [container-type:inline-size]"
            style={{
              left: `${poi.x * 100}%`,
              top: `${poi.y * 100}%`,
              width: `${poi.width * 100}%`,
              fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif",
            }}
          >
            <span
              className="block whitespace-nowrap"
              style={{
                fontSize: `clamp(0.45rem, calc(${5.2 * fontScale}cqi), 1.05rem)`,
                textShadow: POI_TEXT_SHADOW,
              }}
            >
              {poi.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
