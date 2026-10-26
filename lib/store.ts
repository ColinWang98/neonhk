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
  restoreFragments: (fragments: SelectedFragment[], selectionInProgress?: boolean) => void;
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
  restoreFragments: (fragments, selectionInProgress = false) =>
    set((state) => {
      const currentIds = new Set(state.fragments.map((fragment) => fragment.id));
      const savedById = new Map(fragments.map((fragment) => [fragment.id, fragment]));
      const current = state.fragments.map((fragment) => {
        const interrupted = fragment.status === "cropping" || fragment.status === "analyzing" || fragment.status === "generating";
        return !selectionInProgress && interrupted ? savedById.get(fragment.id) || fragment : fragment;
      });
      return { fragments: [...current, ...fragments.filter((fragment) => !currentIds.has(fragment.id))] };
    }),
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
