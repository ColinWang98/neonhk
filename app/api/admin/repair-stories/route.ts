import { NextRequest, NextResponse } from "next/server";
import { logAiGeneration } from "@/lib/aiGenerationLogs";
import { runFragmentStoryGraph } from "@/lib/agentGraph/fragmentStoryGraph";
import { listFragmentsForNarrativeRepair, persistFragment } from "@/lib/fragments";
import { geminiDiagnostics } from "@/lib/gemini";
import { narrativeCacheVersion } from "@/lib/narrativeCache";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { getStorySession } from "@/lib/storySessions";
import type {
  GeneratedPersona,
  NarrativeGeneration,
  SelectedFragment,
  StorySession,
  StreetImage
} from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type RepairStoriesRequest = {
  sessionId?: string;
  fragmentId?: string;
  personaId?: string;
  beforeSelectedAt?: string;
  limit?: number;
  scanLimit?: number;
  force?: boolean;
  dryRun?: boolean;
};

type RepairResult = {
  fragmentId: string;
  sessionId: string;
  personaId?: string;
  status: "repaired" | "dry_run" | "skipped" | "failed";
  reason?: string;
  repairedByJudge?: boolean;
  validationWarnings?: string[];
  agentRuns?: Array<{
    agentName: string;
    status: string;
    durationMs?: number;
    errorMessage?: string;
  }>;
};

export async function POST(request: NextRequest) {
  const configuredToken = process.env.STORY_REPAIR_TOKEN?.trim();
  if (!configuredToken) {
    return NextResponse.json(
      { error: "STORY_REPAIR_TOKEN is not configured. Set it before running story repairs." },
      { status: 503 }
    );
  }

  const providedToken = request.headers.get("x-admin-repair-token")?.trim() || request.nextUrl.searchParams.get("token")?.trim();
  if (providedToken !== configuredToken) {
    return NextResponse.json({ error: "Unauthorized story repair request." }, { status: 401 });
  }

  const body = await readRepairBody(request);
  const config = runtimeConfigFromHeaders(request.headers);
  const repairLimit = clampInteger(body.limit, 1, 25, 5);
  const scanLimit = clampInteger(body.scanLimit, repairLimit, 200, Math.max(50, repairLimit * 5));
  const candidates = await listFragmentsForNarrativeRepair({
    sessionId: body.sessionId,
    fragmentId: body.fragmentId,
    beforeSelectedAt: body.beforeSelectedAt,
    limit: scanLimit,
    config
  });

  const results: RepairResult[] = [];
  let repairedCount = 0;
  let dryRunCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let hitRepairLimit = false;

  for (const candidate of candidates) {
    if (repairedCount + dryRunCount >= repairLimit) {
      hitRepairLimit = true;
      break;
    }

    const session = await getStorySession(candidate.sessionId, config);
    if (!session) {
      failedCount += 1;
      results.push({
        fragmentId: candidate.fragment.id,
        sessionId: candidate.sessionId,
        status: "failed",
        reason: "Story session was not found for this fragment."
      });
      continue;
    }

    const personaIds = collectRepairPersonaIds(candidate.fragment, session, body);
    if (personaIds.length === 0) {
      skippedCount += 1;
      results.push({
        fragmentId: candidate.fragment.id,
        sessionId: candidate.sessionId,
        status: "skipped",
        reason: body.force ? "No generated story exists for this fragment." : "No stale generated story exists for this fragment."
      });
      continue;
    }

    for (const personaId of personaIds) {
      if (repairedCount + dryRunCount >= repairLimit) {
        hitRepairLimit = true;
        break;
      }

      const persona = resolvePersona(personaId, candidate.fragment, session);
      if (!persona && personaId !== "default") {
        failedCount += 1;
        results.push({
          fragmentId: candidate.fragment.id,
          sessionId: candidate.sessionId,
          personaId,
          status: "failed",
          reason: "Persona data was not found, so this story cannot be regenerated safely."
        });
        continue;
      }

      if (body.dryRun) {
        dryRunCount += 1;
        results.push({
          fragmentId: candidate.fragment.id,
          sessionId: candidate.sessionId,
          personaId,
          status: "dry_run",
          reason: "This generated story would be repaired."
        });
        continue;
      }

      try {
        const result = await repairOneStory({
          fragment: candidate.fragment,
          session,
          persona,
          personaId,
          config
        });
        repairedCount += 1;
        results.push({
          fragmentId: candidate.fragment.id,
          sessionId: candidate.sessionId,
          personaId,
          status: "repaired",
          repairedByJudge: result.repaired,
          validationWarnings: result.generation.narrativeValidation?.warnings || [],
          agentRuns: result.generation.agentRuns
        });
        candidate.fragment = result.fragment;
      } catch (error) {
        failedCount += 1;
        results.push({
          fragmentId: candidate.fragment.id,
          sessionId: candidate.sessionId,
          personaId,
          status: "failed",
          reason: error instanceof Error ? error.message : "Story repair failed."
        });
      }
    }
  }
  const lastScannedFragment = candidates.at(-1)?.fragment;
  const nextBeforeSelectedAt =
    hitRepairLimit ? body.beforeSelectedAt || null : candidates.length >= scanLimit ? lastScannedFragment?.selectedAt || null : null;

  return NextResponse.json({
    targetVersion: narrativeCacheVersion,
    dryRun: Boolean(body.dryRun),
    scanned: candidates.length,
    repaired: repairedCount,
    dryRunMatched: dryRunCount,
    skipped: skippedCount,
    failed: failedCount,
    limit: repairLimit,
    scanLimit,
    beforeSelectedAt: body.beforeSelectedAt || null,
    nextBeforeSelectedAt,
    hasMore: hitRepairLimit || Boolean(nextBeforeSelectedAt),
    results
  });
}

async function repairOneStory(params: {
  fragment: SelectedFragment;
  session: StorySession;
  persona?: GeneratedPersona;
  personaId: string;
  config: ReturnType<typeof runtimeConfigFromHeaders>;
}) {
  if (!params.fragment.visionDescription) {
    throw new Error("Fragment has no vision description.");
  }

  const startedAt = performance.now();
  const diagnostics = geminiDiagnostics();
  const placeContext = params.fragment.placeContext || params.session.placeContext;
  const image = sessionToStreetImage(params.session);
  const graphResult = await runFragmentStoryGraph({
    fragmentId: params.fragment.id,
    sessionId: params.session.id,
    visionDescription: params.fragment.visionDescription,
    persona: params.persona,
    placeContext,
    image,
    cropImageUrl: params.fragment.cropImageUrl,
    panoramaPov: params.fragment.panoramaPov,
    config: params.config
  });

  const generation: NarrativeGeneration = {
    personaId: params.personaId,
    version: narrativeCacheVersion,
    narratives: graphResult.narratives,
    evidencePacket: graphResult.evidencePacket,
    personaFragmentPlan: graphResult.personaFragmentPlan,
    narrativeBlocks: graphResult.narrativeBlocks,
    narrativeValidation: graphResult.narrativeValidation,
    agentRuns: graphResult.agentRuns,
    createdAt: new Date().toISOString()
  };
  const narrativeGenerations = {
    ...(params.fragment.narrativeGenerations || {}),
    [params.personaId]: generation
  };
  const personaFragmentPlans = {
    ...(params.fragment.personaFragmentPlans || {}),
    [params.personaId]: graphResult.personaFragmentPlan
  };
  const shouldUpdateActiveStory =
    params.fragment.narrativePersonaId === params.personaId ||
    !params.fragment.narrativePersonaId ||
    Object.keys(params.fragment.narrativeGenerations || {}).length <= 1;

  await persistFragment(
    {
      id: params.fragment.id,
      visionDescription: params.fragment.visionDescription,
      placeContext,
      evidencePacket: graphResult.evidencePacket,
      personaFragmentPlans,
      narrativeGenerations,
      ...(shouldUpdateActiveStory
        ? {
            narratives: graphResult.narratives,
            narrativePersonaId: params.personaId,
            narrativeBlocks: graphResult.narrativeBlocks,
            narrativeValidation: graphResult.narrativeValidation
          }
        : {}),
      status: "ready"
    },
    params.config
  );
  await logAiGeneration(
    {
      sessionId: params.session.id,
      fragmentId: params.fragment.id,
      stage: "narrative_repair",
      provider: diagnostics.provider,
      model: diagnostics.model,
      status: "success",
      inputSummary: {
        personaId: params.personaId,
        previousVersion: params.fragment.narrativeGenerations?.[params.personaId]?.version ?? null,
        targetVersion: narrativeCacheVersion,
        forceVerifierRefresh: true
      },
      output: {
        validation: graphResult.narrativeValidation,
        repaired: graphResult.repaired,
        agentRuns: graphResult.agentRuns
      },
      durationMs: Math.round(performance.now() - startedAt)
    },
    params.config
  );

  const fragment: SelectedFragment = {
    ...params.fragment,
    placeContext,
    evidencePacket: graphResult.evidencePacket,
    personaFragmentPlans,
    narrativeGenerations,
    ...(shouldUpdateActiveStory
      ? {
          narratives: graphResult.narratives,
          narrativePersonaId: params.personaId,
          narrativeBlocks: graphResult.narrativeBlocks,
          narrativeValidation: graphResult.narrativeValidation
        }
      : {}),
    status: "ready"
  };

  return { fragment, generation, repaired: graphResult.repaired };
}

function collectRepairPersonaIds(fragment: SelectedFragment, session: StorySession, body: RepairStoriesRequest) {
  const ids = new Set<string>();
  if (body.personaId?.trim()) {
    ids.add(body.personaId.trim());
  } else {
    for (const personaId of Object.keys(fragment.narrativeGenerations || {})) {
      ids.add(personaId);
    }
    if (fragment.narrativePersonaId) {
      ids.add(fragment.narrativePersonaId);
    }
    if (ids.size === 0 && fragment.narratives) {
      ids.add(session.selectedPersona?.id || "default");
    }
  }

  return Array.from(ids).filter((personaId) => shouldRepairPersonaStory(fragment, personaId, body));
}

function shouldRepairPersonaStory(fragment: SelectedFragment, personaId: string, body: RepairStoriesRequest) {
  const generation = fragment.narrativeGenerations?.[personaId];
  const hasTopLevelStory = Boolean(fragment.narratives && (fragment.narrativePersonaId === personaId || !fragment.narrativePersonaId));
  if (body.force) {
    return Boolean(generation || hasTopLevelStory || body.personaId);
  }
  if (generation) {
    return generation.version !== narrativeCacheVersion;
  }
  return hasTopLevelStory;
}

function resolvePersona(personaId: string, fragment: SelectedFragment, session: StorySession) {
  const personas = [
    session.selectedPersona,
    ...(session.personas || []),
    ...(fragment.personas || [])
  ].filter(isPersona);
  return personas.find((persona) => persona.id === personaId);
}

function isPersona(value: GeneratedPersona | undefined | null): value is GeneratedPersona {
  return Boolean(value?.id && value.name);
}

function sessionToStreetImage(session: StorySession): StreetImage {
  return {
    id: session.imageId,
    provider: session.provider,
    lat: session.lat,
    lng: session.lng,
    panoId: session.panoId || (session.provider === "google" ? session.imageId : undefined),
    thumbUrl: ""
  };
}

async function readRepairBody(request: NextRequest): Promise<RepairStoriesRequest> {
  try {
    return (await request.json()) as RepairStoriesRequest;
  } catch {
    return {};
  }
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
