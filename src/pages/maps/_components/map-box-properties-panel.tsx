import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import MapBoxColorControls from "./map-box-color-controls.tsx";

type MapBoxPropertiesPanelProps = {
  color: string;
  onColorChange: (color: string) => void;
  disabled?: boolean;
};

export default function MapBoxPropertiesPanel({
  color,
  onColorChange,
  disabled = false,
}: MapBoxPropertiesPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Selected rectangle</CardTitle>
      </CardHeader>
      <CardContent>
        <MapBoxColorControls
          color={color}
          onColorChange={onColorChange}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  );
}
