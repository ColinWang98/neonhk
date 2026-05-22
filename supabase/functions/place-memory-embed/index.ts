import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run: (input: string, options: { mean_pool: boolean; normalize: boolean }) => Promise<number[] | Float32Array>;
    };
  };
};

const model = new Supabase.ai.Session("gte-small");

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: { message: "Method not allowed." } }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const input = Array.isArray(body.input) ? body.input : [body.input];
    const cleaned = input
      .map((item: unknown) => String(item || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 16);

    if (!cleaned.length) {
      return json({ embeddings: [] });
    }

    const embeddings: number[][] = [];
    for (const text of cleaned) {
      const embedding = await model.run(text, {
        mean_pool: true,
        normalize: true
      });
      embeddings.push(Array.from(embedding as number[]).map((value) => Number(value)));
    }

    return json({ embeddings });
  } catch (error) {
    return json({
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive"
    }
  });
}
