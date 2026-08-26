import {
  classifyVerificationCommand,
  extractVerificationClaims,
  inferVerificationOutcome,
} from '../core/verification.js';

export const detector = {
  id: 'V001',
  name: 'CLAIM_WITHOUT_EVIDENCE',
  version: 2,
};

export function detectClaimWithoutEvidence(events) {
  const calls = new Map();
  const verificationResults = [];
  const incidents = [];

  for (const event of events) {
    if (event.kind === 'tool.call' && event.toolUseId) {
      calls.set(event.toolUseId, event);
      continue;
    }

    if (event.kind === 'tool.result') {
      const call = calls.get(event.toolUseId);
      if (!call) continue;
      const verificationKind = classifyVerificationCommand(call.command ?? '');
      if (!verificationKind) continue;

      verificationResults.push({
        kind: verificationKind,
        call,
        result: event,
        observation: inferVerificationOutcome({
          output: event.output,
          exitCode: event.exitCode,
          isError: event.isError,
        }),
      });
      continue;
    }

    if (event.kind !== 'message.assistant' || !event.text) continue;

    for (const claim of extractVerificationClaims(event.text)) {
      const candidate = [...verificationResults]
        .reverse()
        .find((item) => item.kind === claim.kind && item.result.sequence < event.sequence);

      if (!candidate || candidate.observation.outcome !== 'fail') continue;

      incidents.push({
        detectorId: detector.id,
        detectorName: detector.name,
        detectorVersion: detector.version,
        evidenceClass: 'A',
        title: `${claim.kind} success claim contradicted by verification`,
        summary: `Assistant claimed "${claim.text}" after a failing ${claim.kind} command.`,
        claim: {
          kind: claim.kind,
          text: claim.text,
          event: event.rawRef,
        },
        evidence: [
          {
            type: 'verification_command',
            command: candidate.call.command,
            event: candidate.call.rawRef,
          },
          {
            type: 'verification_result',
            exitCode: candidate.result.exitCode,
            isError: candidate.result.isError,
            outcome: candidate.observation.outcome,
            outcomeSource: candidate.observation.source,
            outcomeEvidence: candidate.observation.evidence,
            output: candidate.result.output,
            event: candidate.result.rawRef,
          },
        ],
      });
    }
  }

  return incidents;
}
