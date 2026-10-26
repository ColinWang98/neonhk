# DeepSeek vision and story services

Set `DEEPSEEK_API_KEY` on the server, including Vercel Production. No browser key or Gemini key is required.

- Full-scene analysis, fragment analysis and visual-map verification use `deepseek-flash`, fixed in `lib/visionModel.ts` because image support is required.
- Images are sent as OpenAI-compatible `image_url` parts containing inline image data, using `detail: "original"` rather than low-resolution mode.
- Text generation remains DeepSeek, using `DEEPSEEK_MODEL` when configured and `deepseek-flash` otherwise. Requests explicitly disable thinking, preserving the non-thinking behavior of the previous `deepseek-chat` default.
- Existing JSON output, evidence boundaries, privacy decisions and voice services are unchanged. Provider/API failures propagate; malformed candidate-verification output no longer silently skips verification.
- `DEEPSEEK_BASE_URL` and `DEEPSEEK_TIMEOUT_MS` remain available on the server. A model change does not fix database schema errors such as a missing `updated_at` column.

Official references: [Vision](https://api-docs.deepseek.com/guides/vision/), [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/).
