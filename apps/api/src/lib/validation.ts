import {
  VALIDATION_MESSAGES,
  type ValidationIssue,
  type ValidationLocation,
  type ValidationRule,
} from '@drlaudo/contract';
import type { z } from 'zod';
import { invalid } from '../errors.ts';

/** Semantic precedence: the first applicable rule wins for a single path. */
const RULE_PRECEDENCE: readonly ValidationRule[] = [
  'REQUIRED',
  'INVALID_TYPE',
  'TOO_SHORT',
  'TOO_LONG',
  'INVALID_FORMAT',
  'EMPTY_PATCH',
  'UNEXPECTED_BODY',
  'INVALID_JSON',
  'DUPLICATE_QUERY',
  'UNKNOWN_FIELD',
];

const LOCATION_ORDER: Record<ValidationLocation, number> = {
  params: 0,
  query: 1,
  body: 2,
};

export function makeIssue(
  location: ValidationLocation,
  path: string[],
  rule: ValidationRule,
): ValidationIssue {
  // `ValidationIssue` is a discriminated union of rule/message pairs; a single
  // cast keeps the canonical mapping in one place.
  return { location, path, rule, message: VALIDATION_MESSAGES[rule] } as ValidationIssue;
}

function issueFromZod(
  zodIssue: z.core.$ZodIssue,
  location: ValidationLocation,
  raw: unknown,
): ValidationIssue[] {
  const path = zodIssue.path.map((segment) => String(segment));
  switch (zodIssue.code) {
    case 'invalid_type': {
      if (path.length === 0 && raw === undefined) return [makeIssue(location, [], 'REQUIRED')];
      const [key] = path;
      const rawHasKey = path.length === 1
        && key !== undefined
        && typeof raw === 'object'
        && raw !== null
        && !Array.isArray(raw)
        && Object.hasOwn(raw, key);
      if (path.length === 1 && !rawHasKey) {
        return [makeIssue(location, path, 'REQUIRED')];
      }
      return [makeIssue(location, path, 'INVALID_TYPE')];
    }
    case 'too_small':
      return [makeIssue(location, path, zodIssue.origin === 'string' ? 'TOO_SHORT' : 'INVALID_TYPE')];
    case 'too_big':
      return [makeIssue(location, path, zodIssue.origin === 'string' ? 'TOO_LONG' : 'INVALID_TYPE')];
    case 'invalid_format':
      return [makeIssue(location, path, 'INVALID_FORMAT')];
    case 'unrecognized_keys':
      return zodIssue.keys.map((key) => makeIssue(location, [key], 'UNKNOWN_FIELD'));
    case 'custom': {
      const rule = (zodIssue.params as { rule?: ValidationRule } | undefined)?.rule;
      return [makeIssue(location, path, rule ?? 'INVALID_FORMAT')];
    }
    default:
      return [makeIssue(location, path, 'INVALID_FORMAT')];
  }
}

function comparePaths(left: string[], right: string[]): number {
  const size = Math.min(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    const a = left[index] ?? '';
    const b = right[index] ?? '';
    let aIndex = 0;
    let bIndex = 0;
    for (;;) {
      const aPoint = a.codePointAt(aIndex);
      const bPoint = b.codePointAt(bIndex);
      if (aPoint === undefined) {
        if (bPoint !== undefined) return -1;
        break;
      }
      if (bPoint === undefined) return 1;
      if (aPoint !== bPoint) return aPoint - bPoint;
      aIndex += aPoint > 0xffff ? 2 : 1;
      bIndex += bPoint > 0xffff ? 2 : 1;
    }
  }
  return left.length - right.length;
}

/** Deduplicate per location+path, then sort for a deterministic response. */
export function normalizeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const byKey = new Map<string, ValidationIssue>();
  for (const issue of issues) {
    const key = JSON.stringify([issue.location, issue.path]);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, issue);
      continue;
    }
    const precedence = RULE_PRECEDENCE.indexOf(issue.rule);
    if (precedence >= 0 && precedence < RULE_PRECEDENCE.indexOf(current.rule)) {
      byKey.set(key, issue);
    }
  }
  return [...byKey.values()].sort((left, right) => {
    const location = LOCATION_ORDER[left.location] - LOCATION_ORDER[right.location];
    if (location !== 0) return location;
    const path = comparePaths(left.path, right.path);
    if (path !== 0) return path;
    return left.rule < right.rule ? -1 : left.rule > right.rule ? 1 : 0;
  });
}

export function issuesFromZod(
  error: z.ZodError,
  location: ValidationLocation,
  raw: unknown,
): ValidationIssue[] {
  return normalizeIssues(
    error.issues.flatMap((zodIssue) => issueFromZod(zodIssue as z.core.$ZodIssue, location, raw)),
  );
}

export function validationError(
  issues: ValidationIssue[] | ValidationIssue,
): ReturnType<typeof invalid> {
  return invalid(Array.isArray(issues) ? normalizeIssues(issues) : [issues]);
}
