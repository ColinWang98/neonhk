"use client";

import L from "leaflet";
import { Camera } from "lucide-react";
import { useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import type { StreetImage } from "@/types";

type Props = {
  images: StreetImage[];
  selectedImage?: StreetImage;
  provider: "mapillary" | "google";
  onLocationClick: (lat: number, lng: number) => void;
  onImageSelect: (image: StreetImage) => void;
};

const markerIcon = new L.DivIcon({
  className: "",
  html: '<div class="h-4 w-4 rounded-full border-2 border-white bg-[#256f86] shadow"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const selectedMarkerIcon = new L.DivIcon({
  className: "",
  html: '<div class="h-5 w-5 rounded-full border-2 border-white bg-[#a0712b] shadow"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

function ClickHandler({ onLocationClick }: { onLocationClick: Props["onLocationClick"] }) {
  useMapEvents({
    click(event) {
      onLocationClick(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

export function LeafletMap({ images, selectedImage, provider, onLocationClick, onImageSelect }: Props) {
  const center = useMemo<[number, number]>(() => {
    if (selectedImage) return [selectedImage.lat, selectedImage.lng];
    if (images[0]) return [images[0].lat, images[0].lng];
    return [22.303, 114.172];
  }, [images, selectedImage]);

  return (
    <div className="relative h-full overflow-hidden rounded-md border border-ink/10 bg-field">
      <MapContainer center={center} zoom={17} scrollWheelZoom className="z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onLocationClick={onLocationClick} />
        {images.map((image) => (
          <Marker
            key={image.id}
            position={[image.lat, image.lng]}
            icon={selectedImage?.id === image.id ? selectedMarkerIcon : markerIcon}
            eventHandlers={{
              click: () => onImageSelect(image)
            }}
          >
            <Tooltip direction="top">
              <div className="flex items-center gap-1 text-xs">
                <Camera className="h-3 w-3" />
                {image.capturedAt ? new Date(image.capturedAt).toLocaleDateString() : image.id}
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-md bg-white/95 px-3 py-2 text-xs text-ink shadow">
        Click the map to search nearby {provider === "google" ? "Google Street View" : "Mapillary"} images.
      </div>
    </div>
  );
}
