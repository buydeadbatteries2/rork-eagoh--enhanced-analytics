/**
 * Domain Guard — reusable middleware for all AI session entry points.
 *
 * Every AI request must pass through this validation BEFORE Edge is spent.
 * If the prompt's detected domain does not match the EAGOH's forged domain,
 * the request is rejected with a polite message and zero Edge cost.
 *
 * Uses keyword-based detection — fast, local, no API call needed.
 */

import {
  getDomain,
  getDomainRejection,
  isPromptInDomain,
  type IntelligenceDomain,
} from "./domains";

/** Result of a domain-guard check. */
export type DomainGuardResult =
  | { ok: true; domain: IntelligenceDomain; domainId: string }
  | { ok: false; error: string; rejectionMessage: string };

/**
 * Validate that a user prompt matches the given EAGOH's domain.
 *
 * Call this BEFORE spending any Edge or calling any AI service. If the
 * result is `ok: false`, display the `rejectionMessage` and abort.
 *
 * @param eagohDomainId — the EAGOH's `domain` field (e.g. "sports")
 * @param prompt — the user's input text to validate
 * @param requireMatch — if true, reject when no match; if false, allow
 *   (useful for admin/testing, defaults to true)
 */
export function guardDomainRequest(
  eagohDomainId: string | undefined | null,
  prompt: string,
  requireMatch: boolean = true,
): DomainGuardResult {
  if (!eagohDomainId) {
    return {
      ok: false,
      error: "no_domain",
      rejectionMessage: "This EAGOH has no intelligence domain assigned. Forge an EAGOH with a domain first.",
    };
  }

  const domain = getDomain(eagohDomainId);
  if (!domain) {
    return {
      ok: false,
      error: "unknown_domain",
      rejectionMessage: "This EAGOH's domain is not recognized.",
    };
  }

  if (!requireMatch) {
    return { ok: true, domain, domainId: eagohDomainId };
  }

  const isMatch = isPromptInDomain(prompt, eagohDomainId);
  if (!isMatch) {
    return {
      ok: false,
      error: "domain_mismatch",
      rejectionMessage: getDomainRejection(eagohDomainId),
    };
  }

  return { ok: true, domain, domainId: eagohDomainId };
}

/**
 * Name all the session types that must pass through the domain guard.
 * These are the entry points protected against out-of-domain requests.
 */
export const PROTECTED_SESSION_TYPES = [
  "quick-check",
  "quick-analytics",
  "standard",
  "oracle",
  "premium-event",
] as const;
export type ProtectedSessionType = (typeof PROTECTED_SESSION_TYPES)[number];

/**
 * Quick convenience check — returns true if a prompt is safe (in domain)
 * for the given EAGOH. Equivalent to calling guardDomainRequest and
 * checking `ok`.
 */
export function canAnswerInDomain(
  eagohDomainId: string | undefined | null,
  prompt: string,
): boolean {
  return guardDomainRequest(eagohDomainId, prompt).ok;
}
