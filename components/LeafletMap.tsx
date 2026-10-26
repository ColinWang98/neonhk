"use client";

import L from "leaflet";
import { Camera } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import type { StorySession, StreetImage } from "@/types";

type Props = {
  images: StreetImage[];
  selectedImage?: StreetImage;
  provider: StreetImage["provider"];
  savedSessions?: StorySession[];
  onLocationClick: (lat: number, lng: number) => void;
  onImageSelect: (image: StreetImage) => void;
  onSavedSessionSelect?: (session: StorySession) => void;
};

const markerIcon = new L.DivIcon({
  className: "",
  html: '<div class="h-4 w-4 rounded-full border-2 border-white bg-signal shadow"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const selectedMarkerIcon = new L.DivIcon({
  className: "",
  html: '<div class="h-5 w-5 rounded-full border-2 border-white bg-[#a52e2e] shadow"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const savedSessionIcon = new L.DivIcon({
  className: "",
  html: '<div class="h-5 w-5 rounded-full border-2 border-white bg-[#208b57] shadow"><div class="mx-auto mt-[5px] h-1.5 w-1.5 rounded-full bg-white/90"></div></div>',
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

export function LeafletMap({
  images,
  selectedImage,
  provider,
  savedSessions = [],
  onLocationClick,
  onImageSelect,
  onSavedSessionSelect
}: Props) {
  const [mounted, setMounted] = useState(false);
  const center = useMemo<[number, number]>(() => {
    if (selectedImage) return [selectedImage.lat, selectedImage.lng];
    if (images[0]) return [images[0].lat, images[0].lng];
    return [22.303, 114.172];
  }, [images, selectedImage]);
  const mapKey = `${provider}:${center[0].toFixed(5)}:${center[1].toFixed(5)}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative h-full overflow-hidden bg-field">
      {mounted ? (
        <MapContainer key={mapKey} center={center} zoom={17} scrollWheelZoom className="z-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onLocationClick={onLocationClick} />
          {savedSessions.map((session) => (
            <Marker
              key={session.id}
              position={[session.lat, session.lng]}
              icon={savedSessionIcon}
              eventHandlers={{
                click: () => onSavedSessionSelect?.(session)
              }}
            >
              <Tooltip direction="top">
                <div className="text-xs">
                  <div className="font-medium">Saved street story</div>
                  <div>{new Date(session.createdAt).toLocaleString()}</div>
                </div>
              </Tooltip>
            </Marker>
          ))}
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
      ) : null}
    </div>
  );
}
