"use client";

import { create } from "zustand";
import type { GeneratedPersona, SelectedFragment, StorySession, StreetImage } from "@/types";

type ExplorerState = {
  images: StreetImage[];
  selectedImage?: StreetImage;
  fragments: SelectedFragment[];
  storySession?: StorySession;
  personas: GeneratedPersona[];
  selectedPersona?: GeneratedPersona;
  setImages: (images: StreetImage[]) => void;
  setSelectedImage: (image?: StreetImage) => void;
  setStorySession: (session?: StorySession) => void;
  setPersonas: (personas: GeneratedPersona[]) => void;
  setSelectedPersona: (persona?: GeneratedPersona) => void;
  addFragment: (fragment: SelectedFragment) => void;
  updateFragment: (id: string, patch: Partial<SelectedFragment>) => void;
  resetFragments: () => void;
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  images: [],
  fragments: [],
  personas: [],
  setImages: (images) => set({ images }),
  setSelectedImage: (selectedImage) => set({ selectedImage }),
  setStorySession: (storySession) => set({ storySession }),
  setPersonas: (personas) => set({ personas }),
  setSelectedPersona: (selectedPersona) => set({ selectedPersona }),
  addFragment: (fragment) =>
    set((state) => ({
      fragments: [fragment, ...state.fragments]
    })),
  updateFragment: (id, patch) =>
    set((state) => ({
      fragments: state.fragments.map((fragment) =>
        fragment.id === id ? { ...fragment, ...patch } : fragment
      )
    })),
  resetFragments: () => set({ fragments: [] })
}));
