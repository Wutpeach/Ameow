import type {
  SiteSessionPolicyEvaluation,
} from "../src/types/siteSession.js";

const normalizeCookieValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const listMissingRequiredCookieKeys = (
  cookies: Record<string, string>,
  requiredKeys: readonly string[],
): string[] => requiredKeys.filter((key) => !normalizeCookieValue(cookies[key]));

export const hasAnyLoginCookie = (
  cookies: Record<string, string>,
  loginKeys: readonly string[],
): boolean => loginKeys.length === 0 || loginKeys.some((key) => Boolean(normalizeCookieValue(cookies[key])));

export const evaluateSiteSessionPolicy = ({
  cookies,
  requiredKeys,
  loginKeys,
}: {
  cookies: Record<string, string>;
  requiredKeys: readonly string[];
  loginKeys: readonly string[];
}): SiteSessionPolicyEvaluation => {
  const cookieCount = Object.keys(cookies).length;
  const missingRequiredKeys = listMissingRequiredCookieKeys(cookies, requiredKeys);
  const hasLoginCookie = hasAnyLoginCookie(cookies, loginKeys);

  if (cookieCount === 0) {
    return {
      availability: "missing",
      reason: "no_snapshot",
      missingRequiredKeys,
    };
  }

  if (missingRequiredKeys.length > 0) {
    return {
      availability: "partial",
      reason: "missing_required_cookie",
      missingRequiredKeys,
    };
  }

  if (!hasLoginCookie) {
    return {
      availability: "partial",
      reason: "missing_login_cookie",
      missingRequiredKeys,
    };
  }

  return {
    availability: "ready",
    reason: "ready",
    missingRequiredKeys,
  };
};
