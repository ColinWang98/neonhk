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
  setFragments: (fragments: SelectedFragment[]) => void;
  addFragment: (fragment: SelectedFragment) => void;
  updateFragment: (id: string, patch: Partial<SelectedFragment>) => void;
  selectFragment: (id: string) => void;
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
  setFragments: (fragments) => set({ fragments }),
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
  selectFragment: (id) =>
    set((state) => {
      const fragment = state.fragments.find((item) => item.id === id);
      if (!fragment) return state;
      return {
        fragments: [fragment, ...state.fragments.filter((item) => item.id !== id)]
      };
    }),
  resetFragments: () => set({ fragments: [] })
}));
