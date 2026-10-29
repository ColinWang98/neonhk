# Spoken story editing references

The application uses a short delivery check inside the existing writer, opening,
repair and judge prompts. It does not install a global agent skill, run repository
scripts, add a provider, or make an extra editing API call.

The check draws on these MIT-licensed skills, reviewed on 2026-10-29:

- Humanizer, Siqi Chen: https://github.com/blader/humanizer
  - Reviewed root SKILL.md, version 3.1.0.
  - License: https://github.com/blader/humanizer/blob/main/LICENSE
- Humanizer-zh, op7418: https://github.com/op7418/Humanizer-zh
  - Reviewed root SKILL.md, revision 2026-09-23.
  - License: https://github.com/op7418/Humanizer-zh/blob/main/LICENSE

The runtime wording is project-specific, not a bundled copy of either skill.
Borrowed editing principles include preserving claims and attribution, retaining
the speaker's voice, reading prose aloud, and fixing repetitive structures in
context rather than applying a word blacklist. No external examples or personal
experiences are imported as evidence.

Street-view stories additionally retain the project's evidence boundaries:
fictional experiences cannot identify visible people, assign ownership to their
objects, or turn a source contributor's recollection into narrator testimony.
Naturalness is judged separately from factual support. A more fluent story is
not automatically more accurate.

Only final story text is used for subtitles and speech. Internal editing notes,
checklists and judge comments are never appended to the audio track.
