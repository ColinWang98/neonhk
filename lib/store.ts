"use client";

import { create } from "zustand";
import type { SelectedFragment, StreetImage } from "@/types";

type ExplorerState = {
  images: StreetImage[];
  selectedImage?: StreetImage;
  fragments: SelectedFragment[];
  setImages: (images: StreetImage[]) => void;
  setSelectedImage: (image?: StreetImage) => void;
  addFragment: (fragment: SelectedFragment) => void;
  updateFragment: (id: string, patch: Partial<SelectedFragment>) => void;
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  images: [],
  fragments: [],
  setImages: (images) => set({ images }),
  setSelectedImage: (selectedImage) => set({ selectedImage }),
  addFragment: (fragment) =>
    set((state) => ({
      fragments: [fragment, ...state.fragments]
    })),
  updateFragment: (id, patch) =>
    set((state) => ({
      fragments: state.fragments.map((fragment) =>
        fragment.id === id ? { ...fragment, ...patch } : fragment
      )
    }))
}));
