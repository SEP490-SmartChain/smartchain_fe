#!/usr/bin/env node
/**
 * P3 C08 — connected browser harness for the actual ORCA app/router and the actual API.
 *
 * This harness is deliberately dependency-free: Node 22 built-ins only
 * (`child_process`, `node:crypto`, `node:zlib`, global `fetch`/`WebSocket`), driving a local
 * Chrome for Testing binary over the raw Chrome DevTools Protocol (D07: no
 * playwright/puppeteer/lockfile change). Business API responses are never fulfilled or
 * stubbed: every network expectation is recorded from the live app, and persisted effects are
 * asserted through the safe C11 fixture-assert service (`P3_FIXTURE_ASSERT_URL`).
 *
 * Modes
 *   node tests/p3-connected-browser.mjs --dry-run            validate fixture + harness (no env, no browser)
 *   node tests/p3-connected-browser.mjs --list               list scenario ids/titles/roles/steps
 *   node tests/p3-connected-browser.mjs --scenario=<id>      run one scenario + its dependencies
 *   node tests/p3-connected-browser.mjs                      run all scenarios (dependency order)
 *
 * `--dry-run` proves only that the scenario data and the harness schema are internally sound.
 * It never opens a browser and never claims a connected PASS: it stops at
 * `PREPARED — CONNECTED RUN PENDING`. The connected run requires the C11 disposable
 * environment (actual FE dev server, actual API/worker/DB/Redis, fixture-assert service).
 *
 * Exit codes
 *   0  dry-run/list validation passed, or a real connected run had every selected scenario PASS
 *   1  invalid scenario data / failed assertion / timeout / harness error
 *   2  NOT RUN — missing or unusable environment, unreachable FE/API/fixture-assert, or a
 *      scenario-level precondition (for example `P3_N8N_OFFLINE`) was not satisfied
 *
 * Environment (names only are ever printed; secret values are never logged)
 *   Required for a connected run: P3_API_URL, P3_FIXTURE_ASSERT_URL, P3_FIXTURE_ASSERT_TOKEN,
 *   plus P3_<ROLE>_EMAIL / P3_<ROLE>_PASSWORD for every role used by the selected scenarios.
 *   P3_FE_URL defaults to http://127.0.0.1:2324.
 *   Optional: P3_BROWSER_BIN, P3_LOGIN_WORKSPACE_SLUG, P3_BE_SHA, P3_FE_SHA, P3_TRACE,
 *   P3_ARTIFACTS_DIR. Scenario-scoped: P3_N8N_OFFLINE (n8n outage scenario),
 *   P3_WAREHOUSE_STAFF_EMAIL (the WAREHOUSE_STAFF credential env, also rendered by the app).
 *
 * Artifacts (never committed): $P3_ARTIFACTS_DIR or artifacts/p3-connected/<runId>/
 *   run.json, summary.json, trace.jsonl, scenario-<id>.json, <screenshot>.png,
 *   failure-<scenarioId>.png, uploads/, downloads/.
 *
 * Selector strategies for step targets: css | label | role | text | placeholder (plus optional
 * `closest`, `index`, and step-level `within`).
 *
 * Step kinds: login, logout, goto, click, fill, select, upload, waitFor, wait, reload, fault,
 * capture, expectNetwork, expectRequestCount, expectReplayedRequest, expectText, expectHidden,
 * expectUrl, expectDownload, waitForNetwork, fixtureAssert, screenshot. A step kind that cannot
 * be asserted faithfully in this environment fails as UNSUPPORTED_STEP — it is never silently
 * skipped.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { deflateSync } from 'node:zlib';

import {
  ACTOR_SCOPES,
  APP_UNDER_TEST,
  FIXTURE_VERSION,
  ORCA_ROLES,
  REQUIRED_COVERAGE,
  REQUIRED_ENV,
  SCENARIOS,
} from './fixtures/p3-connected-scenarios.mjs';

// ─── constants ────────────────────────────────────────────────────────────────────────────────
const HARNESS_VERSION = 1;
const DEFAULT_FE_URL = 'http://127.0.0.1:2324';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DISPOSABLE_MARKER = '1';
const NAVIGATION_TIMEOUT_MS = 20_000;
const ACTION_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 30_000;
const SCENARIO_TIMEOUT_MS = 300_000;
const NETWORK_ASSERT_TIMEOUT_MS = 15_000;
const REQUEST_COUNT_SETTLE_MS = 2_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const BROWSER_START_TIMEOUT_MS = 25_000;
const CDP_COMMAND_TIMEOUT_MS = 30_000;
const FIXTURE_ASSERT_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 25 * 1024 * 1024;

/** Scenario step kinds this harness implements. Anything else is a dry-run FAILURE. */
const SUPPORTED_STEP_KINDS = new Set([
  'login',
  'logout',
  'goto',
  'click',
  'fill',
  'select',
  'upload',
  'waitFor',
  'wait',
  'reload',
  'fault',
  'capture',
  'expectNetwork',
  'expectRequestCount',
  'expectReplayedRequest',
  'expectText',
  'expectHidden',
  'expectUrl',
  'expectDownload',
  'waitForNetwork',
  'fixtureAssert',
  'screenshot',
]);

/** Steps that can trigger live network traffic; they open a fresh assertion window. */
const ACTION_STEP_KINDS = new Set([
  'login',
  'logout',
  'goto',
  'reload',
  'click',
  'fill',
  'select',
  'upload',
  'fault',
]);

/** Field whitelist per step kind (typo detector for `--dry-run`). */
const STEP_ALLOWED_KEYS = Object.freeze({
  login: ['kind', 'role'],
  logout: ['kind'],
  goto: ['kind', 'path', 'waitForText'],
  click: ['kind', 'target', 'within', 'index'],
  fill: ['kind', 'target', 'within', 'index', 'value'],
  select: ['kind', 'target', 'within', 'index', 'option'],
  upload: ['kind', 'target', 'within', 'index'],
  waitFor: ['kind', 'target', 'within', 'index', 'timeoutMs'],
  wait: ['kind', 'ms'],
  reload: ['kind'],
  fault: ['kind', 'mode', 'urlPattern'],
  capture: ['kind', 'name', 'from', 'pick', 'select'],
  expectNetwork: [
    'kind',
    'description',
    'request',
    'payloadContains',
    'payloadMatches',
    'payloadHasKeys',
    'responseContains',
    'responseHasKeys',
    'responseNumberAtLeast',
    'absentKeys',
    'timeoutMs',
  ],
  expectRequestCount: ['kind', 'description', 'request', 'count', 'min', 'max', 'timeoutMs'],
  expectReplayedRequest: ['kind', 'description', 'request', 'count', 'sameFields', 'timeoutMs'],
  expectText: ['kind', 'description', 'contains', 'matches', 'target', 'timeoutMs'],
  expectHidden: ['kind', 'description', 'target', 'timeoutMs'],
  expectUrl: ['kind', 'description', 'contains', 'timeoutMs'],
  expectDownload: [
    'kind',
    'description',
    'fileNamePattern',
    'header',
    'requireMasked',
    'timeoutMs',
  ],
  waitForNetwork: [
    'kind',
    'description',
    'request',
    'select',
    'notNull',
    'refreshTarget',
    'timeoutMs',
  ],
  fixtureAssert: ['kind', 'key', 'description', 'params'],
  screenshot: ['kind', 'name'],
});

const SELECTOR_STRATEGIES = new Set(['css', 'label', 'role', 'text', 'placeholder']);
const SELECTOR_KEYS = new Set(['strategy', 'value', 'role', 'name', 'closest', 'index']);
const TARGET_KEYS_BY_KIND = Object.freeze({
  css: ['strategy', 'value'],
  label: ['strategy', 'value'],
  text: ['strategy', 'value'],
  placeholder: ['strategy', 'value'],
  role: ['strategy', 'role', 'name'],
});

const LOGIN_EMAIL_SELECTOR = Object.freeze({ strategy: 'css', value: '#login-email' });
const LOGIN_PASSWORD_SELECTOR = Object.freeze({ strategy: 'css', value: '#login-password' });
const LOGIN_WORKSPACE_SELECTOR = Object.freeze({ strategy: 'css', value: '#login-workspace' });
const LOGIN_SUBMIT_SELECTOR = Object.freeze({
  strategy: 'css',
  value: 'form button[type="submit"]',
});
const USER_MENU_NAME_SELECTOR = Object.freeze({
  strategy: 'role',
  role: 'button',
  name: 'Mở menu người dùng',
});
const LOGIN_PATH_PATTERN = '/v1/auth/login$';

const USER_MENU_FALLBACK_SELECTOR = Object.freeze({
  strategy: 'css',
  value: 'button[aria-haspopup="menu"]',
});
const LOGOUT_MENU_ITEM_SELECTOR = Object.freeze({
  strategy: 'role',
  role: 'menuitem',
  name: 'Đăng xuất',
});

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// ─── errors ──────────────────────────────────────────────────────────────────────────────────
/** A scenario assertion or harness invocation step failed (exit 1). */
class StepFailure extends Error {
  constructor(message, code = 'ASSERTION_FAILED', details = undefined) {
    super(message);
    this.name = 'StepFailure';
    this.code = code;
    this.details = details;
  }
}

/** A step kind the harness cannot execute faithfully; never silently skipped. */
class UnsupportedStepError extends StepFailure {
  constructor(message) {
    super(message, 'UNSUPPORTED_STEP');
    this.name = 'UnsupportedStepError';
  }
}

/** Environment isn't there yet (exit 2, "NOT RUN", never PASS). */
class NotRunError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'NotRunError';
    this.code = 'NOT_RUN';
    this.details = details;
  }
}

/** Command line usage problem (exit 2). */
class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.code = 'USAGE';
  }
}

// ─── small utilities ─────────────────────────────────────────────────────────────────────────
const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof RegExp);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isStringArray = (value) => Array.isArray(value) && value.every(isNonEmptyString);

const isIntInRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

const nowIso = () => new Date().toISOString();

const compactSeconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

const safeSnippet = (text, max = 400) => {
  if (typeof text !== 'string') return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

const readDevtoolsPort = (profileDir) => {
  const file = join(profileDir, 'DevToolsActivePort');
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').split('\n');
  const port = Number.parseInt(lines[0], 10);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { port, browserWsPath: (lines[1] || '').trim() };
};

const makeRunId = () => {
  const stamp = nowIso()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const suffix = createHash('sha256')
    .update(`${process.pid}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 4);
  return `${stamp}-${suffix}`;
};

async function withTimeout(promise, timeoutMs, message, code = 'TIMEOUT') {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new StepFailure(message, code)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntil(check, { timeoutMs, message, intervalMs = 100 }) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      if (error instanceof NotRunError) throw error;
      lastError = error;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      if (lastError) throw lastError;
      throw new StepFailure(message || `Condition not met within ${timeoutMs}ms`);
    }
    await delay(Math.min(intervalMs, remaining));
  }
}

// ─── variable + template resolution ─────────────────────────────────────────────────────────
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const WHOLE_PLACEHOLDER_PATTERN = /^\{\{\s*([^{}]+?)\s*\}\}$/;

/** Variables captured by earlier steps/scenarios plus synthetic upload evidence. */
class VariableScope {
  constructor(env) {
    this.values = new Map();
    this.evidence = null;
    this.env = env;
  }

  set(name, value) {
    this.values.set(name, value);
    return value;
  }

  has(name) {
    if (this.values.has(name)) return true;
    if (name === 'evidence.sha256' || name === 'evidence.fileSizeBytes') {
      return this.evidence !== null;
    }
    return false;
  }

  readEnv(name) {
    const value = this.env(name);
    if (value === null || value === undefined) {
      throw new NotRunError(`Missing required environment variable ${name} for this step`);
    }
    return value;
  }

  resolve(name, scenario) {
    if (name.startsWith('env:')) return this.readEnv(name.slice(4));
    if (name.startsWith('scenario.')) {
      const key = name.slice('scenario.'.length);
      const synthetic = scenario.syntheticData || {};
      if (!Object.prototype.hasOwnProperty.call(synthetic, key)) {
        throw new StepFailure(
          `Scenario ${scenario.id} references {{scenario.${key}}} but syntheticData has no such key`,
          'MISSING_VARIABLE',
        );
      }
      return synthetic[key];
    }
    if (name === 'evidence.sha256' || name === 'evidence.fileSizeBytes') {
      if (!this.evidence) {
        throw new StepFailure(
          `Variable {{${name}}} used before the upload step produced evidence`,
          'MISSING_VARIABLE',
        );
      }
      return name === 'evidence.sha256' ? this.evidence.sha256 : this.evidence.fileSizeBytes;
    }
    if (this.values.has(name)) return this.values.get(name);
    throw new StepFailure(
      `Unknown variable {{${name}}} (no prior capture in scope)`,
      'MISSING_VARIABLE',
    );
  }

  interpolateString(value, scenario) {
    return value.replace(PLACEHOLDER_PATTERN, (_match, name) => {
      const resolved = this.resolve(name.trim(), scenario);
      if (resolved !== null && typeof resolved === 'object') return JSON.stringify(resolved);
      return String(resolved);
    });
  }

  interpolateValue(value, scenario) {
    if (typeof value === 'string') {
      const whole = value.match(WHOLE_PLACEHOLDER_PATTERN);
      if (whole) return this.resolve(whole[1].trim(), scenario);
      return this.interpolateString(value, scenario);
    }
    if (Array.isArray(value)) return value.map((entry) => this.interpolateValue(entry, scenario));
    if (isPlainObject(value)) {
      const output = {};
      for (const [key, entry] of Object.entries(value)) {
        output[key] = this.interpolateValue(entry, scenario);
      }
      return output;
    }
    return value;
  }
}

const collectTemplateNames = (value, output = []) => {
  if (typeof value === 'string') {
    for (const match of value.matchAll(PLACEHOLDER_PATTERN)) output.push(match[1].trim());
  } else if (Array.isArray(value)) {
    for (const entry of value) collectTemplateNames(entry, output);
  } else if (isPlainObject(value)) {
    for (const entry of Object.values(value)) collectTemplateNames(entry, output);
  }
  return output;
};

// ─── JSON path helpers (CDP observation + captures + fixture assertions) ────────────────────
const PATH_TOKEN_PATTERN = /([^.[\]]+)|\[(\d+)\]/g;

const splitJsonPath = (path) => {
  if (!isNonEmptyString(path)) return [];
  const tokens = [];
  for (const match of path.matchAll(PATH_TOKEN_PATTERN)) {
    if (match[2] !== undefined) tokens.push(Number.parseInt(match[2], 10));
    else tokens.push(match[1]);
  }
  return tokens;
};

const readPath = (value, path) => {
  let current = value;
  for (const token of splitJsonPath(path)) {
    if (current === null || current === undefined) return undefined;
    current = current[token];
  }
  return current;
};

const collectKeyPaths = (value, prefix = '', output = []) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectKeyPaths(entry, `${prefix}[${index}]`, output));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      output.push({ key, path: prefix ? `${prefix}.${key}` : key });
      collectKeyPaths(entry, prefix ? `${prefix}.${key}` : key, output);
    }
  }
  return output;
};

const describeValue = (value) => {
  if (value === undefined) return 'undefined';
  if (value instanceof RegExp) return value.toString();
  if (typeof value === 'string') return JSON.stringify(safeSnippet(value, 120));
  try {
    return safeSnippet(JSON.stringify(value), 160);
  } catch {
    return String(value);
  }
};

/** Matcher used by payloadContains/responseContains: scalars, RegExp and `{}` (exists). */
const matchExpectedValue = (actual, expected) => {
  if (expected instanceof RegExp) {
    if (typeof actual !== 'string' && typeof actual !== 'number') {
      return { ok: false, reason: `expected ${expected} but got ${describeValue(actual)}` };
    }
    return expected.test(String(actual))
      ? { ok: true }
      : { ok: false, reason: `${describeValue(actual)} does not match ${expected}` };
  }
  if (isPlainObject(expected) && Object.keys(expected).length === 0) {
    return actual !== undefined && actual !== null
      ? { ok: true }
      : { ok: false, reason: 'path is missing (expected any non-null value)' };
  }
  if (isDeepStrictEqual(actual, expected)) return { ok: true };
  return { ok: false, reason: `expected ${describeValue(expected)} got ${describeValue(actual)}` };
};

/** Shape matcher used by payloadMatches, e.g. {type:'array', maxLength:0}. */
const matchShape = (actual, spec) => {
  if (!isPlainObject(spec)) {
    return matchExpectedValue(actual, spec);
  }
  if (spec.type) {
    const typeChecks = {
      array: Array.isArray(actual),
      string: typeof actual === 'string',
      number: typeof actual === 'number',
      boolean: typeof actual === 'boolean',
      object: isPlainObject(actual),
    };
    if (spec.type in typeChecks && !typeChecks[spec.type]) {
      return { ok: false, reason: `expected type ${spec.type} got ${typeof actual}` };
    }
  }
  if (spec.maxLength !== undefined && Array.isArray(actual) && actual.length > spec.maxLength) {
    return { ok: false, reason: `expected length <= ${spec.maxLength} got ${actual.length}` };
  }
  if (spec.minLength !== undefined && Array.isArray(actual) && actual.length < spec.minLength) {
    return { ok: false, reason: `expected length >= ${spec.minLength} got ${actual.length}` };
  }
  if (spec.length !== undefined) {
    const length = typeof actual === 'string' ? actual.length : actual?.length;
    if (length !== spec.length)
      return { ok: false, reason: `expected length ${spec.length} got ${length}` };
  }
  if (spec.equals !== undefined) return matchExpectedValue(actual, spec.equals);
  return { ok: true };
};

// ─── fixture validation (used by --dry-run; never opens a browser) ──────────────────────────
const KNOWN_PLATFORM_ROLES = Object.freeze([
  'ORCA_ADMIN',
  'OPS_DISPATCHER',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_STAFF',
  'ORCA_ACCOUNTANT',
]);
const KNOWN_TENANT_ROLES = Object.freeze(['SELLER_OWNER', 'SELLER_STAFF']);
const SCENARIO_ID_PATTERN = /^[A-Z][A-Za-z0-9-]*$/;
const SS_ID_PATTERN = /^SS-\d+$/;
const CAPTURE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const SCREENSHOT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const HTTP_METHOD_PATTERN = /^(GET|POST|PUT|PATCH|DELETE)$/;

const KNOWN_ENV_NAMES = (() => {
  const names = new Set([...REQUIRED_ENV.runtime, ...REQUIRED_ENV.optional, 'P3_N8N_OFFLINE']);
  for (const role of ORCA_ROLES) {
    names.add(`P3_${role}_EMAIL`);
    names.add(`P3_${role}_PASSWORD`);
  }
  return names;
})();

const credentialEnvNames = (roles) => {
  const names = [];
  for (const role of roles) {
    names.push(`P3_${role}_EMAIL`, `P3_${role}_PASSWORD`);
  }
  return [...new Set(names)];
};

const routePathValues = () => new Set(Object.values(APP_UNDER_TEST.routes || {}));

const addFixtureError = (errors, where, message) => {
  errors.push(`${where}: ${message}`);
};

const validateRegexSource = (value, where, errors) => {
  if (!isNonEmptyString(value)) {
    addFixtureError(errors, where, 'must be a non-empty regex source string');
    return false;
  }
  try {
    new RegExp(value);
    return true;
  } catch (error) {
    addFixtureError(errors, where, `invalid regex (${error.message})`);
    return false;
  }
};

const validateStringField = (value, where, errors, { pattern = null, max = null } = {}) => {
  if (!isNonEmptyString(value)) {
    addFixtureError(errors, where, 'must be a non-empty string');
    return false;
  }
  if (max !== null && value.length > max) {
    addFixtureError(errors, where, `must be at most ${max} characters`);
    return false;
  }
  if (pattern && !pattern.test(value)) {
    addFixtureError(errors, where, `does not match ${pattern}`);
    return false;
  }
  return true;
};

const validateStringArrayField = (
  value,
  where,
  errors,
  { allowEmpty = false, pattern = null } = {},
) => {
  if (!Array.isArray(value)) {
    addFixtureError(errors, where, 'must be an array');
    return false;
  }
  if (!allowEmpty && value.length === 0) {
    addFixtureError(errors, where, 'must not be empty');
    return false;
  }
  let ok = true;
  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      addFixtureError(errors, `${where}[${index}]`, 'must be a non-empty string');
      ok = false;
    } else if (pattern && !pattern.test(entry)) {
      addFixtureError(errors, `${where}[${index}]`, `does not match ${pattern}`);
      ok = false;
    }
  });
  if (new Set(value).size !== value.length) {
    addFixtureError(errors, where, 'must not contain duplicates');
    ok = false;
  }
  return ok;
};

const validateTimeout = (value, where, errors) => {
  if (value === undefined) return;
  if (!isIntInRange(value, 100, 120_000)) {
    addFixtureError(errors, where, 'must be an integer between 100 and 120000 ms');
  }
};

/** Validates a scenario selector target: css | label | role | text | placeholder. */
function validateSelectorSpec(target, where, errors) {
  if (!isPlainObject(target)) {
    addFixtureError(errors, where, 'must be a selector object');
    return false;
  }
  const strategy = target.strategy;
  if (!SELECTOR_STRATEGIES.has(strategy)) {
    addFixtureError(errors, where, `unknown selector strategy ${JSON.stringify(strategy)}`);
    return false;
  }
  const allowed = new Set([...TARGET_KEYS_BY_KIND[strategy], 'closest', 'index']);
  for (const key of Object.keys(target)) {
    if (!allowed.has(key)) {
      addFixtureError(errors, where, `unknown selector field '${key}' for strategy '${strategy}'`);
    }
  }
  let ok = true;
  if (strategy === 'role') {
    ok = validateStringField(target.role, `${where}.role`, errors) && ok;
    if (
      target.name !== undefined &&
      !isNonEmptyString(target.name) &&
      !(target.name instanceof RegExp)
    ) {
      addFixtureError(errors, `${where}.name`, 'must be a non-empty string or RegExp');
      ok = false;
    }
  } else if (strategy === 'text') {
    if (target.value instanceof RegExp) {
      // Dynamic accessibility text matcher — accepted.
    } else {
      ok = validateStringField(target.value, `${where}.value`, errors) && ok;
    }
  } else {
    ok = validateStringField(target.value, `${where}.value`, errors) && ok;
  }
  if (target.closest !== undefined) {
    ok = validateStringField(target.closest, `${where}.closest`, errors) && ok;
  }
  if (target.index !== undefined && !isIntInRange(target.index, 0, 1000)) {
    addFixtureError(errors, `${where}.index`, 'must be a non-negative integer');
    ok = false;
  }
  return ok;
}

/** Validates a network request matcher ({method, path, status|statusAnyOf}). */
function validateRequestMatcher(request, where, errors, { requireStatus = true } = {}) {
  if (!isPlainObject(request)) {
    addFixtureError(errors, where, 'must be a request matcher object');
    return false;
  }
  let ok = true;
  if (!isNonEmptyString(request.method) || !HTTP_METHOD_PATTERN.test(request.method)) {
    addFixtureError(errors, `${where}.method`, 'must be one of GET/POST/PUT/PATCH/DELETE');
    ok = false;
  }
  ok = validateRegexSource(request.path, `${where}.path`, errors) && ok;
  const hasStatus = request.status !== undefined;
  const hasStatusAnyOf = request.statusAnyOf !== undefined;
  if (hasStatus && hasStatusAnyOf) {
    addFixtureError(errors, where, 'must not combine status and statusAnyOf');
    ok = false;
  }
  if (hasStatus && !isIntInRange(request.status, 100, 599)) {
    addFixtureError(errors, `${where}.status`, 'must be an HTTP status between 100 and 599');
    ok = false;
  }
  if (hasStatusAnyOf) {
    if (!Array.isArray(request.statusAnyOf) || request.statusAnyOf.length === 0) {
      addFixtureError(errors, `${where}.statusAnyOf`, 'must be a non-empty array of HTTP statuses');
      ok = false;
    } else {
      for (const [index, status] of request.statusAnyOf.entries()) {
        if (!isIntInRange(status, 100, 599)) {
          addFixtureError(errors, `${where}.statusAnyOf[${index}]`, 'must be an HTTP status');
          ok = false;
        }
      }
    }
  }
  if (requireStatus && !hasStatus && !hasStatusAnyOf) {
    addFixtureError(errors, where, 'must declare status or statusAnyOf');
    ok = false;
  }
  return ok;
}

const validatePlainObjectField = (value, where, errors) => {
  if (!isPlainObject(value)) {
    addFixtureError(errors, where, 'must be a plain object');
    return false;
  }
  return true;
};

const validateStringRecord = (value, where, errors) => {
  if (!isPlainObject(value)) {
    addFixtureError(errors, where, 'must be a plain object of expected values');
    return false;
  }
  return true;
};

function validateCaptureSelectSpec(select, where, errors) {
  if (!isPlainObject(select)) {
    addFixtureError(errors, where, 'must be a select object');
    return false;
  }
  let ok = validateStringField(select.path, `${where}.path`, errors);
  if (!isPlainObject(select.where)) {
    addFixtureError(errors, `${where}.where`, 'must be a {field, equals} object');
    ok = false;
  } else {
    ok = validateStringField(select.where.field, `${where}.where.field`, errors) && ok;
    if (select.where.equals === undefined) {
      addFixtureError(errors, `${where}.where.equals`, 'must be present');
      ok = false;
    }
  }
  ok = validateStringField(select.then, `${where}.then`, errors) && ok;
  return ok;
}

const STEP_VALIDATORS = Object.freeze({
  login(step, { errors, where, scenario, ctx }) {
    if (!validateStringField(step.role, `${where}.role`, errors)) return;
    if (!ORCA_ROLES.includes(step.role)) {
      addFixtureError(errors, `${where}.role`, `unknown ORCA role ${JSON.stringify(step.role)}`);
      return;
    }
    if (!(scenario.actors || []).some((actor) => actor.role === step.role)) {
      addFixtureError(
        errors,
        `${where}.role`,
        `login role ${step.role} is not declared in scenario.actors`,
      );
    }
    ctx.loggedIn = step.role;
  },

  logout(_step, { errors, where, ctx }) {
    if (!ctx.loggedIn) addFixtureError(errors, where, 'logout step before any login step');
    ctx.loggedIn = null;
  },

  goto(step, { errors, where, ctx }) {
    if (!validateStringField(step.path, `${where}.path`, errors)) return;
    if (!step.path.startsWith('/')) {
      addFixtureError(errors, `${where}.path`, 'must be an absolute FE route path starting with /');
    } else if (!routePathValues().has(step.path)) {
      addFixtureError(
        errors,
        `${where}.path`,
        `route ${step.path} is not listed in APP_UNDER_TEST.routes`,
      );
    }
    if (
      step.waitForText !== undefined &&
      !isNonEmptyString(step.waitForText) &&
      !(step.waitForText instanceof RegExp)
    ) {
      addFixtureError(errors, `${where}.waitForText`, 'must be a non-empty string or RegExp');
    }
    ctx.gotoPath = step.path;
  },

  click(step, info) {
    validateClickLike(step, info, 'click');
  },

  fill(step, info) {
    validateClickLike(step, info, 'fill');
    const { errors, where } = info;
    if (typeof step.value !== 'string' && typeof step.value !== 'number') {
      addFixtureError(errors, `${where}.value`, 'must be a string or number');
    }
  },

  select(step, info) {
    validateClickLike(step, info, 'select');
    const { errors, where } = info;
    if (!isPlainObject(step.option)) {
      addFixtureError(errors, `${where}.option`, 'must be an option object');
      return;
    }
    const optionKeys = Object.keys(step.option);
    const allowed = new Set(['value', 'label', 'index']);
    for (const key of optionKeys) {
      if (!allowed.has(key))
        addFixtureError(errors, `${where}.option`, `unknown option field '${key}'`);
    }
    const defined = optionKeys.filter((key) => allowed.has(key));
    if (defined.length !== 1) {
      addFixtureError(errors, `${where}.option`, 'must define exactly one of value/label/index');
      return;
    }
    if (defined[0] === 'index') {
      if (!isIntInRange(step.option.index, 0, 500)) {
        addFixtureError(errors, `${where}.option.index`, 'must be a non-negative integer');
      }
    } else if (!isNonEmptyString(step.option[defined[0]])) {
      addFixtureError(errors, `${where}.option.${defined[0]}`, 'must be a non-empty string');
    }
  },

  upload(step, info) {
    validateClickLike(step, info, 'upload');
  },

  waitFor(step, info) {
    validateClickLike(step, info, 'waitFor');
    validateTimeout(step.timeoutMs, `${info.where}.timeoutMs`, info.errors);
  },

  wait(step, { errors, where }) {
    if (!isIntInRange(step.ms, 0, 600_000)) {
      addFixtureError(errors, `${where}.ms`, 'must be an integer between 0 and 600000 ms');
    }
  },

  reload(_step, { ctx, errors, where }) {
    if (!ctx.gotoPath) addFixtureError(errors, where, 'reload step before any goto step');
  },

  fault(step, { errors, where, ctx }) {
    const modes = new Set(['block', 'unblock', 'offline', 'online']);
    if (!modes.has(step.mode)) {
      addFixtureError(errors, `${where}.mode`, 'must be one of block|unblock|offline|online');
      return;
    }
    if (step.mode === 'block' || step.mode === 'offline') {
      if (ctx.faultMode) {
        addFixtureError(errors, where, `fault ${step.mode} while fault ${ctx.faultMode} is active`);
      }
      if (step.mode === 'block') {
        validateStringField(step.urlPattern, `${where}.urlPattern`, errors);
      }
      ctx.faultMode = step.mode;
    } else {
      if (!ctx.faultMode)
        addFixtureError(errors, where, `fault ${step.mode} without an active fault`);
      ctx.faultMode = null;
    }
  },

  capture(step, { errors, where, ctx }) {
    if (!validateStringField(step.name, `${where}.name`, errors, { pattern: CAPTURE_NAME_PATTERN }))
      return;
    if (ctx.captures.has(step.name)) {
      addFixtureError(errors, `${where}.name`, `duplicate capture name ${step.name}`);
    }
    ctx.captures.add(step.name);
    validateRequestMatcher(step.from, `${where}.from`, errors, { requireStatus: false });
    const hasPick = step.pick !== undefined;
    const hasSelect = step.select !== undefined;
    if (hasPick === hasSelect) {
      addFixtureError(errors, where, 'capture must define exactly one of pick/select');
      return;
    }
    if (hasPick && !isNonEmptyString(step.pick)) {
      addFixtureError(errors, `${where}.pick`, 'must be a non-empty JSON path');
    }
    if (hasSelect) validateCaptureSelectSpec(step.select, `${where}.select`, errors);
  },

  expectNetwork(step, info) {
    validateExpectationBase(step, info, 'expectNetwork');
    validateRequestMatcher(step.request, `${info.where}.request`, info.errors);
    validateTimeout(step.timeoutMs, `${info.where}.timeoutMs`, info.errors);
    validateNetworkMatchers(step, info.where, info.errors);
  },

  expectRequestCount(step, { errors, where }) {
    validateStringField(step.description, `${where}.description`, errors);
    validateRequestMatcher(step.request, `${where}.request`, errors, { requireStatus: false });
    const bounds = ['count', 'min', 'max'].filter((key) => step[key] !== undefined);
    if (bounds.length === 0) {
      addFixtureError(errors, where, 'must declare count, min or max');
      return;
    }
    if (bounds.includes('count') && bounds.length > 1) {
      addFixtureError(errors, where, 'count must not be combined with min/max');
    }
    for (const key of bounds) {
      if (!isIntInRange(step[key], 0, 100_000)) {
        addFixtureError(errors, `${where}.${key}`, 'must be a non-negative integer');
      }
    }
    if (step.min !== undefined && step.max !== undefined && step.min > step.max) {
      addFixtureError(errors, where, 'min must be <= max');
    }
    validateTimeout(step.timeoutMs, `${where}.timeoutMs`, errors);
  },

  expectReplayedRequest(step, { errors, where }) {
    validateStringField(step.description, `${where}.description`, errors);
    validateRequestMatcher(step.request, `${where}.request`, errors, { requireStatus: false });
    if (!isIntInRange(step.count, 2, 10)) {
      addFixtureError(errors, `${where}.count`, 'must be an integer between 2 and 10');
    }
    validateStringArrayField(step.sameFields, `${where}.sameFields`, errors);
    validateTimeout(step.timeoutMs, `${where}.timeoutMs`, errors);
  },

  expectText(step, { errors, where }) {
    validateStringField(step.description, `${where}.description`, errors);
    const hasContains = step.contains !== undefined;
    const hasMatches = step.matches !== undefined;
    if (hasContains === hasMatches) {
      addFixtureError(errors, where, 'must define exactly one of contains/matches');
      return;
    }
    if (hasContains) validateStringField(step.contains, `${where}.contains`, errors);
    if (hasMatches) validateRegexSource(step.matches, `${where}.matches`, errors);
    if (step.target !== undefined) validateSelectorSpec(step.target, `${where}.target`, errors);
    validateTimeout(step.timeoutMs, `${where}.timeoutMs`, errors);
  },

  expectHidden(step, { errors, where }) {
    validateStringField(step.description, `${where}.description`, errors);
    validateSelectorSpec(step.target, `${where}.target`, errors);
    validateTimeout(step.timeoutMs, `${where}.timeoutMs`, errors);
  },

  expectUrl(step, { errors, where }) {
    validateStringField(step.description, `${where}.description`, errors);
    validateStringField(step.contains, `${where}.contains`, errors);
    validateTimeout(step.timeoutMs, `${where}.timeoutMs`, errors);
  },

  expectDownload(step, { errors, where }) {
    validateStringField(step.description, `${where}.description`, errors);
    validateRegexSource(step.fileNamePattern, `${where}.fileNamePattern`, errors);
    if (step.header !== undefined) {
      validateStringField(step.header, `${where}.header`, errors);
    }
    if (step.requireMasked !== undefined && typeof step.requireMasked !== 'boolean') {
      addFixtureError(errors, `${where}.requireMasked`, 'must be a boolean');
    }
    validateTimeout(step.timeoutMs, `${where}.timeoutMs`, errors);
  },

  waitForNetwork(step, { errors, where }) {
    validateStringField(step.description, `${where}.description`, errors);
    validateRequestMatcher(step.request, `${where}.request`, errors);
    if (step.select !== undefined)
      validateCaptureSelectSpec(step.select, `${where}.select`, errors);
    if (step.notNull !== undefined && typeof step.notNull !== 'boolean') {
      addFixtureError(errors, `${where}.notNull`, 'must be a boolean');
    }
    if (step.refreshTarget !== undefined) {
      validateSelectorSpec(step.refreshTarget, `${where}.refreshTarget`, errors);
    }
    validateTimeout(step.timeoutMs, `${where}.timeoutMs`, errors);
  },

  fixtureAssert(step, { errors, where, ctx }) {
    if (!validateStringField(step.key, `${where}.key`, errors)) return;
    if (!ctx.fixtureKeys.has(step.key)) {
      addFixtureError(
        errors,
        `${where}.key`,
        `fixtureAssert key ${step.key} is not listed in scenario.persistedEffectKeys`,
      );
    }
    validateStringField(step.description, `${where}.description`, errors);
    if (step.params !== undefined) {
      if (!isPlainObject(step.params))
        addFixtureError(errors, `${where}.params`, 'must be a plain object');
    }
  },

  screenshot(step, { errors, where, ctx }) {
    if (
      !validateStringField(step.name, `${where}.name`, errors, { pattern: SCREENSHOT_NAME_PATTERN })
    ) {
      return;
    }
    ctx.screenshots.push(step.name);
  },
});

function validateClickLike(step, { errors, where }, kind) {
  validateSelectorSpec(step.target, `${where}.target`, errors);
  if (step.within !== undefined) validateSelectorSpec(step.within, `${where}.within`, errors);
  if (step.index !== undefined && !isIntInRange(step.index, 0, 1000)) {
    addFixtureError(errors, `${where}.index`, 'must be a non-negative integer');
  }
}

function validateExpectationBase(step, { errors, where }) {
  validateStringField(step.description, `${where}.description`, errors);
}

function validateNetworkMatchers(step, where, errors) {
  if (step.payloadContains !== undefined) {
    if (validateStringRecord(step.payloadContains, `${where}.payloadContains`, errors)) {
      for (const [path, expected] of Object.entries(step.payloadContains)) {
        if (!isNonEmptyString(path))
          addFixtureError(errors, `${where}.payloadContains`, 'empty path');
        if (
          expected !== null &&
          typeof expected === 'object' &&
          !(expected instanceof RegExp) &&
          !Array.isArray(expected)
        ) {
          addFixtureError(
            errors,
            `${where}.payloadContains.${path}`,
            'must be a scalar, RegExp or empty {} path check',
          );
        }
      }
    }
  }
  if (step.payloadMatches !== undefined) {
    validateStringRecord(step.payloadMatches, `${where}.payloadMatches`, errors);
  }
  if (step.payloadHasKeys !== undefined) {
    validateStringArrayField(step.payloadHasKeys, `${where}.payloadHasKeys`, errors);
  }
  if (step.responseContains !== undefined) {
    validateStringRecord(step.responseContains, `${where}.responseContains`, errors);
  }
  if (step.responseHasKeys !== undefined) {
    validateStringArrayField(step.responseHasKeys, `${where}.responseHasKeys`, errors);
  }
  if (step.responseNumberAtLeast !== undefined) {
    if (
      validateStringRecord(step.responseNumberAtLeast, `${where}.responseNumberAtLeast`, errors)
    ) {
      for (const [path, minimum] of Object.entries(step.responseNumberAtLeast)) {
        if (!isNonEmptyString(path) || typeof minimum !== 'number' || Number.isNaN(minimum)) {
          addFixtureError(
            errors,
            `${where}.responseNumberAtLeast.${path}`,
            'must map a path to a numeric minimum',
          );
        }
      }
    }
  }
  if (step.absentKeys !== undefined) {
    validateStringArrayField(step.absentKeys, `${where}.absentKeys`, errors);
  }
}

function validateScenarioStructure(scenario, index, errors, stats, seenIds) {
  if (!isPlainObject(scenario)) {
    addFixtureError(errors, `scenario[${index}]`, 'must be a plain object');
    return null;
  }
  const id = scenario.id;
  const where = `scenario ${isNonEmptyString(id) ? id : `[${index}]`}`;
  if (!validateStringField(id, `${where}.id`, errors, { pattern: SCENARIO_ID_PATTERN }))
    return null;
  if (seenIds.has(id)) addFixtureError(errors, where, `duplicate scenario id ${id}`);
  seenIds.add(id);
  stats.scenarioCount += 1;

  if (!Number.isInteger(scenario.version) || scenario.version < 1) {
    addFixtureError(errors, `${where}.version`, 'must be a positive integer');
  }
  validateStringField(scenario.title, `${where}.title`, errors);
  validateStringField(scenario.screen, `${where}.screen`, errors);

  if (validateStringArrayField(scenario.covers, `${where}.covers`, errors)) {
    for (const bullet of scenario.covers) {
      if (!REQUIRED_COVERAGE.includes(bullet)) {
        addFixtureError(errors, `${where}.covers`, `unknown coverage bullet ${bullet}`);
      }
    }
  }
  validateStringArrayField(scenario.requirements, `${where}.requirements`, errors, {
    pattern: SS_ID_PATTERN,
  });
  if (validateStringArrayField(scenario.routes, `${where}.routes`, errors)) {
    for (const route of scenario.routes) {
      if (!Object.values(APP_UNDER_TEST.routes).includes(route)) {
        addFixtureError(
          errors,
          `${where}.routes`,
          `route ${route} is not in APP_UNDER_TEST.routes`,
        );
      }
    }
  }

  if (!Array.isArray(scenario.actors) || scenario.actors.length === 0) {
    addFixtureError(errors, `${where}.actors`, 'must be a non-empty array');
  } else {
    const roles = new Set();
    scenario.actors.forEach((actor, actorIndex) => {
      const actorWhere = `${where}.actors[${actorIndex}]`;
      if (!isPlainObject(actor)) {
        addFixtureError(errors, actorWhere, 'must be an object');
        return;
      }
      if (!ORCA_ROLES.includes(actor.role)) {
        addFixtureError(
          errors,
          `${actorWhere}.role`,
          `unknown ORCA role ${JSON.stringify(actor.role)}`,
        );
      }
      if (!ACTOR_SCOPES.includes(actor.actorScope)) {
        addFixtureError(errors, `${actorWhere}.actorScope`, 'must be TENANT or PLATFORM');
      }
      if (KNOWN_PLATFORM_ROLES.includes(actor.role) && actor.actorScope !== 'PLATFORM') {
        addFixtureError(errors, `${actorWhere}.actorScope`, `role ${actor.role} is PLATFORM-only`);
      }
      if (KNOWN_TENANT_ROLES.includes(actor.role) && actor.actorScope !== 'TENANT') {
        addFixtureError(errors, `${actorWhere}.actorScope`, `role ${actor.role} is TENANT-only`);
      }
      if (roles.has(actor.role))
        addFixtureError(errors, actorWhere, `duplicate actor role ${actor.role}`);
      roles.add(actor.role);
    });
  }

  if (!Array.isArray(scenario.preconditions)) {
    addFixtureError(errors, `${where}.preconditions`, 'must be an array');
  } else {
    scenario.preconditions.forEach((precondition, preconditionIndex) => {
      const pWhere = `${where}.preconditions[${preconditionIndex}]`;
      if (!isPlainObject(precondition)) {
        addFixtureError(errors, pWhere, 'must be an object');
        return;
      }
      if (precondition.kind === 'env') {
        if (!isNonEmptyString(precondition.name) || !precondition.name.startsWith('P3_')) {
          addFixtureError(errors, `${pWhere}.name`, 'must be a P3_ environment variable name');
        } else if (!KNOWN_ENV_NAMES.has(precondition.name)) {
          addFixtureError(errors, `${pWhere}.name`, `unknown env var ${precondition.name}`);
        }
      } else if (precondition.kind === 'fixture') {
        validateStringField(precondition.key, `${pWhere}.key`, errors, {
          pattern: /^seed\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/,
        });
        validateStringField(precondition.description, `${pWhere}.description`, errors);
      } else {
        addFixtureError(errors, `${pWhere}.kind`, 'must be fixture or env');
      }
    });
  }

  if (scenario.syntheticData !== undefined && !isPlainObject(scenario.syntheticData)) {
    addFixtureError(errors, `${where}.syntheticData`, 'must be a plain object when present');
  }
  if (!isPlainObject(scenario.expected)) {
    addFixtureError(errors, `${where}.expected`, 'must be a plain object');
  } else {
    for (const key of ['ui', 'network', 'persisted']) {
      const value = scenario.expected[key];
      if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
        addFixtureError(errors, `${where}.expected.${key}`, 'must be an array of strings');
      }
    }
  }
  if (
    validateStringArrayField(scenario.persistedEffectKeys, `${where}.persistedEffectKeys`, errors, {
      allowEmpty: true,
    })
  ) {
    const expectedPersisted = scenario.expected?.persisted;
    if (Array.isArray(expectedPersisted)) {
      const left = [...scenario.persistedEffectKeys].sort();
      const right = [...expectedPersisted].sort();
      if (!isDeepStrictEqual(left, right)) {
        addFixtureError(
          errors,
          `${where}.persistedEffectKeys`,
          'must match scenario.expected.persisted exactly',
        );
      }
    }
  }
  if (scenario.destructive !== undefined && typeof scenario.destructive !== 'boolean') {
    addFixtureError(errors, `${where}.destructive`, 'must be a boolean');
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    addFixtureError(errors, `${where}.steps`, 'must be a non-empty array');
    return scenario;
  }
  return scenario;
}

function validateScenarioSteps(scenario, errors, warnings, stats) {
  const where = `${scenario.id}`;
  const ctx = {
    captures: new Set(),
    screenshots: [],
    fixtureKeys: new Set(scenario.persistedEffectKeys || []),
    loggedIn: null,
    faultMode: null,
    gotoPath: null,
  };
  scenario.steps.forEach((step, index) => {
    const stepWhere = `${where}.steps[${index}]`;
    if (!isPlainObject(step)) {
      addFixtureError(errors, stepWhere, 'must be a plain object');
      return;
    }
    const kind = step.kind;
    stats.kindCounts[kind] = (stats.kindCounts[kind] || 0) + 1;
    stats.stepCount += 1;
    if (!SUPPORTED_STEP_KINDS.has(kind)) {
      addFixtureError(errors, stepWhere, `unknown/unsupported step kind ${JSON.stringify(kind)}`);
      return;
    }
    const allowed = STEP_ALLOWED_KEYS[kind];
    for (const key of Object.keys(step)) {
      if (!allowed.includes(key)) addFixtureError(errors, stepWhere, `unknown field '${key}'`);
    }
    const validator = STEP_VALIDATORS[kind];
    try {
      validator(step, { errors, warnings, where: stepWhere, scenario, ctx });
    } catch (error) {
      addFixtureError(errors, stepWhere, `validator crash: ${error.message}`);
    }
  });
  if (ctx.faultMode) {
    addFixtureError(errors, `${where}.steps`, `fault ${ctx.faultMode} was never cleared`);
  }
  const duplicateScreenshots = ctx.screenshots.filter(
    (name, index) => ctx.screenshots.indexOf(name) !== index,
  );
  for (const name of new Set(duplicateScreenshots)) {
    addFixtureError(errors, `${where}.steps`, `duplicate screenshot name ${name}`);
  }
  scenario.__captures = ctx.captures;
  scenario.__screenshots = ctx.screenshots;
}

function validateDependencyGraph(scenarios, errors, warnings) {
  const byId = new Map(
    scenarios
      .filter((scenario) => isPlainObject(scenario) && isNonEmptyString(scenario.id))
      .map((scenario) => [scenario.id, scenario]),
  );
  const declaredOrder = new Map([...byId.keys()].map((id, index) => [id, index]));
  for (const [id, scenario] of byId) {
    if (scenario.dependsOn === undefined) continue;
    if (!validateStringArrayField(scenario.dependsOn, `scenario ${id}.dependsOn`, errors)) continue;
    for (const dependency of scenario.dependsOn) {
      if (dependency === id) {
        addFixtureError(errors, `scenario ${id}.dependsOn`, 'must not depend on itself');
        continue;
      }
      if (!byId.has(dependency)) {
        addFixtureError(errors, `scenario ${id}.dependsOn`, `unknown dependency ${dependency}`);
        continue;
      }
      if ((declaredOrder.get(dependency) ?? 0) > (declaredOrder.get(id) ?? 0)) {
        addFixtureError(
          errors,
          `scenario ${id}.dependsOn`,
          `dependency ${dependency} must be declared before the dependent scenario`,
        );
      }
    }
  }
  // Cycle detection (DFS with colors) so --scenario dependency closures cannot hang.
  const colors = new Map();
  const visit = (id, stack) => {
    if (colors.get(id) === 'gray') {
      addFixtureError(
        errors,
        'scenario dependencies',
        `cycle detected: ${[...stack, id].join(' -> ')}`,
      );
      return;
    }
    if (colors.get(id) === 'black') return;
    colors.set(id, 'gray');
    for (const dependency of byId.get(id)?.dependsOn || []) visit(dependency, [...stack, id]);
    colors.set(id, 'black');
  };
  for (const id of byId.keys()) visit(id, []);

  const destructives = scenarios.filter(
    (scenario) => isPlainObject(scenario) && scenario.destructive,
  );
  for (const scenario of destructives) {
    const position = declaredOrder.get(scenario.id);
    const laterRoots = [...byId.values()].filter(
      (candidate) =>
        candidate.id !== scenario.id &&
        !(candidate.dependsOn || []).includes(scenario.id) &&
        (declaredOrder.get(candidate.id) ?? 0) > position,
    );
    if (laterRoots.length > 0) {
      warnings.push(
        `scenario ${scenario.id} is destructive but declared before ${laterRoots.map((entry) => entry.id).join(', ')}; the runner executes destructive scenarios last`,
      );
    }
  }
}

function validateCoverage(scenarios, errors) {
  const covered = new Set();
  for (const scenario of scenarios) {
    for (const bullet of scenario?.covers || []) covered.add(bullet);
  }
  for (const bullet of REQUIRED_COVERAGE) {
    if (!covered.has(bullet))
      addFixtureError(errors, 'REQUIRED_COVERAGE', `unmapped acceptance bullet ${bullet}`);
  }
  for (const bullet of covered) {
    if (!REQUIRED_COVERAGE.includes(bullet)) {
      addFixtureError(errors, 'REQUIRED_COVERAGE', `scenario covers unknown bullet ${bullet}`);
    }
  }
}

function dependencyClosure(scenario, byId) {
  const seen = new Set();
  const visit = (id) => {
    for (const dependency of byId.get(id)?.dependsOn || []) {
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      visit(dependency);
    }
  };
  visit(scenario.id);
  return seen;
}

function validateVariableResolution(scenarios, errors) {
  const byId = new Map(
    scenarios
      .filter((scenario) => isPlainObject(scenario) && isNonEmptyString(scenario.id))
      .map((scenario) => [scenario.id, scenario]),
  );
  for (const scenario of byId.values()) {
    const defined = new Set();
    for (const dependencyId of dependencyClosure(scenario, byId)) {
      for (const name of byId.get(dependencyId)?.__captures || []) defined.add(name);
    }
    let evidenceDefined = false;
    (scenario.steps || []).forEach((step, index) => {
      if (!isPlainObject(step)) return;
      const where = `${scenario.id}.steps[${index}]`;
      const scenarioWhere = `${where}.description`;
      for (const token of collectTemplateNames(step)) {
        if (token.startsWith('env:')) {
          const name = token.slice('env:'.length);
          if (!KNOWN_ENV_NAMES.has(name)) {
            addFixtureError(errors, scenarioWhere, `unknown environment variable ${name}`);
          }
        } else if (token.startsWith('scenario.')) {
          const key = token.slice('scenario.'.length);
          if (!Object.prototype.hasOwnProperty.call(scenario.syntheticData || {}, key)) {
            addFixtureError(errors, scenarioWhere, `scenario syntheticData has no key '${key}'`);
          }
        } else if (token === 'evidence.sha256' || token === 'evidence.fileSizeBytes') {
          if (!evidenceDefined) {
            addFixtureError(errors, scenarioWhere, `{{${token}}} used before an upload step`);
          }
        } else if (!defined.has(token)) {
          addFixtureError(
            errors,
            scenarioWhere,
            `variable {{${token}}} has no prior capture in this scenario or its dependencies`,
          );
        }
      }
      if (step.kind === 'capture') defined.add(step.name);
      if (step.kind === 'upload') evidenceDefined = true;
    });
  }
}

function validateScreenshotUniqueness(scenarios, errors) {
  const seen = new Map();
  for (const scenario of scenarios) {
    for (const name of scenario?.__screenshots || []) {
      if (seen.has(name)) {
        addFixtureError(
          errors,
          'screenshots',
          `screenshot name ${name} is used by both ${seen.get(name)} and ${scenario.id} (same run artifact directory)`,
        );
      } else {
        seen.set(name, scenario.id);
      }
    }
  }
}

function validatePersistedAssertions(scenarios, errors) {
  for (const scenario of scenarios) {
    const asserted = new Set(
      (scenario.steps || [])
        .filter((step) => isPlainObject(step) && step.kind === 'fixtureAssert')
        .map((step) => step.key),
    );
    for (const key of scenario.persistedEffectKeys || []) {
      if (!asserted.has(key)) {
        addFixtureError(
          errors,
          `scenario ${scenario.id}.persistedEffectKeys`,
          `persisted effect ${key} has no fixtureAssert step`,
        );
      }
    }
    for (const key of asserted) {
      if (!(scenario.persistedEffectKeys || []).includes(key)) {
        addFixtureError(
          errors,
          `scenario ${scenario.id}.steps`,
          `fixtureAssert key ${key} is not listed in persistedEffectKeys`,
        );
      }
    }
  }
}

function validateEnvContract(errors) {
  if (!isPlainObject(REQUIRED_ENV)) {
    addFixtureError(errors, 'REQUIRED_ENV', 'must be a plain object');
    return;
  }
  for (const key of Object.keys(REQUIRED_ENV)) {
    if (!['runtime', 'optional'].includes(key)) {
      addFixtureError(errors, 'REQUIRED_ENV', `unknown section '${key}'`);
    }
  }
  const runtimeOk = validateStringArrayField(REQUIRED_ENV.runtime, 'REQUIRED_ENV.runtime', errors);
  const optionalOk = validateStringArrayField(
    REQUIRED_ENV.optional,
    'REQUIRED_ENV.optional',
    errors,
    {
      allowEmpty: true,
    },
  );
  if (runtimeOk) {
    for (const name of REQUIRED_ENV.runtime) {
      if (!/^P3_[A-Z0-9_]+$/.test(name)) {
        addFixtureError(errors, 'REQUIRED_ENV.runtime', `${name} must look like P3_[A-Z0-9_]+`);
      }
    }
    for (const required of ['P3_API_URL', 'P3_FIXTURE_ASSERT_URL', 'P3_FIXTURE_ASSERT_TOKEN']) {
      if (!REQUIRED_ENV.runtime.includes(required)) {
        addFixtureError(errors, 'REQUIRED_ENV.runtime', `missing ${required}`);
      }
    }
  }
  if (optionalOk) {
    for (const name of REQUIRED_ENV.optional) {
      if (!/^P3_[A-Z0-9_]+$/.test(name)) {
        addFixtureError(errors, 'REQUIRED_ENV.optional', `${name} must look like P3_[A-Z0-9_]+`);
      }
    }
  }
  if (runtimeOk && optionalOk) {
    for (const name of REQUIRED_ENV.runtime) {
      if (REQUIRED_ENV.optional.includes(name)) {
        addFixtureError(errors, 'REQUIRED_ENV', `${name} cannot be both runtime and optional`);
      }
    }
  }
}

function validateAppContract(errors) {
  if (!isPlainObject(APP_UNDER_TEST)) {
    addFixtureError(errors, 'APP_UNDER_TEST', 'must be a plain object');
    return;
  }
  if (!Number.isInteger(APP_UNDER_TEST.fixtureSchemaVersion)) {
    addFixtureError(errors, 'APP_UNDER_TEST.fixtureSchemaVersion', 'must be an integer');
  }
  validateStringField(APP_UNDER_TEST.feApp, 'APP_UNDER_TEST.feApp', errors);
  validateStringField(APP_UNDER_TEST.apiBasePath, 'APP_UNDER_TEST.apiBasePath', errors);
  if (!isPlainObject(APP_UNDER_TEST.routes)) {
    addFixtureError(errors, 'APP_UNDER_TEST.routes', 'must be a plain object');
  } else {
    for (const [name, route] of Object.entries(APP_UNDER_TEST.routes)) {
      if (!isNonEmptyString(route) || !route.startsWith('/')) {
        addFixtureError(errors, `APP_UNDER_TEST.routes.${name}`, 'must be an absolute path');
      }
    }
  }
  validateStringArrayField(
    APP_UNDER_TEST.capabilitiesUsed,
    'APP_UNDER_TEST.capabilitiesUsed',
    errors,
  );
}

function validateFixture() {
  const errors = [];
  const warnings = [];
  const stats = {
    fixtureVersion: FIXTURE_VERSION,
    scenarioCount: 0,
    stepCount: 0,
    kindCounts: {},
    coverage: [...REQUIRED_COVERAGE],
    roles: [],
    envNames: [],
  };

  try {
    if (FIXTURE_VERSION !== 1) {
      addFixtureError(errors, 'FIXTURE_VERSION', `unsupported fixture version ${FIXTURE_VERSION}`);
    }
    if (!Array.isArray(ORCA_ROLES) || ORCA_ROLES.length === 0) {
      addFixtureError(errors, 'ORCA_ROLES', 'must be a non-empty array');
    } else {
      const expectedRoles = new Set([...KNOWN_PLATFORM_ROLES, ...KNOWN_TENANT_ROLES]);
      for (const role of ORCA_ROLES) {
        if (!expectedRoles.has(role)) addFixtureError(errors, 'ORCA_ROLES', `unknown role ${role}`);
      }
      for (const role of expectedRoles) {
        if (!ORCA_ROLES.includes(role))
          addFixtureError(errors, 'ORCA_ROLES', `missing role ${role}`);
      }
    }
    if (
      !Array.isArray(ACTOR_SCOPES) ||
      !isDeepStrictEqual([...ACTOR_SCOPES], ['TENANT', 'PLATFORM'])
    ) {
      addFixtureError(errors, 'ACTOR_SCOPES', "must be exactly ['TENANT', 'PLATFORM']");
    }
    validateStringArrayField(REQUIRED_COVERAGE, 'REQUIRED_COVERAGE', errors);
    validateEnvContract(errors);
    validateAppContract(errors);

    if (!Array.isArray(SCENARIOS)) {
      addFixtureError(errors, 'SCENARIOS', 'must be an array');
    } else {
      const seenIds = new Set();
      for (const [index, scenario] of SCENARIOS.entries()) {
        if (
          validateScenarioStructure(scenario, index, errors, stats, seenIds) &&
          Array.isArray(scenario.steps)
        ) {
          validateScenarioSteps(scenario, errors, warnings, stats);
        }
      }
      const validScenarios = SCENARIOS.filter(isPlainObject);
      if (errors.length === 0) {
        validateDependencyGraph(validScenarios, errors, warnings);
        validateCoverage(validScenarios, errors);
        validateVariableResolution(validScenarios, errors);
        validateScreenshotUniqueness(validScenarios, errors);
        validatePersistedAssertions(validScenarios, errors);
      }
    }
  } catch (error) {
    addFixtureError(
      errors,
      'fixture validation',
      `unexpected crash: ${error.stack || error.message}`,
    );
  }

  stats.roles = Array.isArray(ORCA_ROLES) ? [...ORCA_ROLES] : [];
  const runtimeEnv = Array.isArray(REQUIRED_ENV?.runtime) ? REQUIRED_ENV.runtime : [];
  const optionalEnv = Array.isArray(REQUIRED_ENV?.optional) ? REQUIRED_ENV.optional : [];
  const envNames = new Set([...runtimeEnv, ...optionalEnv]);
  for (const scenario of SCENARIOS.filter(isPlainObject)) {
    for (const actor of scenario.actors || []) {
      for (const name of credentialEnvNames([actor.role])) envNames.add(name);
    }
    for (const precondition of scenario.preconditions || []) {
      if (precondition?.kind === 'env' && isNonEmptyString(precondition.name)) {
        envNames.add(precondition.name);
      }
    }
    for (const token of collectTemplateNames(scenario.steps)) {
      if (token.startsWith('env:')) envNames.add(token.slice('env:'.length));
    }
  }
  stats.envNames = [...envNames].sort();

  return { errors, warnings, stats };
}

function printDryRun(result) {
  const { errors, warnings, stats } = result;
  console.log('P3 C08 — connected browser harness dry run');
  console.log(`harness version ${HARNESS_VERSION} · fixture version ${stats.fixtureVersion}`);
  console.log(`fixture  tests/fixtures/p3-connected-scenarios.mjs`);
  console.log(
    `scenarios ${stats.scenarioCount} · steps ${stats.stepCount} · step kinds ${Object.keys(stats.kindCounts).length}`,
  );
  console.log(
    `step kinds ${Object.entries(stats.kindCounts)
      .map(([kind, count]) => `${kind}×${count}`)
      .join(', ')}`,
  );
  console.log(`roles ${stats.roles.join(', ')}`);
  console.log(
    `coverage ${stats.coverage.length}/${REQUIRED_COVERAGE.length}: ${stats.coverage.join(', ')}`,
  );
  console.log(`env names (no values printed): ${stats.envNames.join(', ')}`);
  console.log(
    'checked: module exports, REQUIRED_ENV shape, scenario schema, selector targets, network request matchers, ' +
      'timeouts, duplicate ids/captures/screenshots, dependency graph + declaration order, variable resolution, ' +
      'fixtureAssert keys, coverage mapping',
  );
  if (warnings.length > 0) {
    console.log(`warnings ${warnings.length}:`);
    for (const warning of warnings) console.log(`  WARN ${warning}`);
  }
  if (errors.length > 0) {
    console.log(`errors ${errors.length}:`);
    for (const error of errors) console.log(`  FAIL ${error}`);
    console.log('validation: FAILED');
    console.log('result: NOT PREPARED — fix the scenario data or the harness schema first');
    return 1;
  }
  console.log('validation: PASS');
  console.log(
    'mode: DRY RUN — no browser launched, no API request sent, no persisted effect asserted',
  );
  console.log('result: PREPARED — CONNECTED RUN PENDING');
  return 0;
}

// ─── environment + scenario ordering ────────────────────────────────────────────────────────
const readEnv = (name) => {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

const isTruthyEnv = (name) => {
  const value = readEnv(name);
  if (value === null) return false;
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
};

function orderSelectedScenarios(scenarioIds, { selectedIds = null } = {}) {
  const byId = new Map(scenarioIds.map((scenario) => [scenario.id, scenario]));
  const ordered = [];
  const state = new Map();
  const visit = (id) => {
    const current = byId.get(id);
    if (!current) throw new StepFailure(`Unknown scenario dependency ${id}`, 'UNKNOWN_SCENARIO');
    const status = state.get(id);
    if (status === 'visiting')
      throw new StepFailure(`Scenario dependency cycle at ${id}`, 'DEPENDENCY_CYCLE');
    if (status === 'done') return;
    state.set(id, 'visiting');
    for (const dependency of current.dependsOn || []) visit(dependency);
    state.set(id, 'done');
    ordered.push(current);
  };
  const roots = selectedIds
    ? scenarioIds.filter((scenario) => selectedIds.has(scenario.id))
    : [...scenarioIds];
  const nonDestructive = roots.filter((scenario) => !scenario.destructive);
  const destructive = roots.filter((scenario) => scenario.destructive);
  for (const scenario of [...nonDestructive, ...destructive]) visit(scenario.id);
  return ordered;
}

function scenarioClosureIds(scenarioId) {
  const byId = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));
  const target = byId.get(scenarioId);
  if (!target) {
    const known = SCENARIOS.map((scenario) => scenario.id).join(', ');
    throw new UsageError(`Unknown scenario '${scenarioId}'. Known scenarios: ${known}`);
  }
  const closure = new Set([scenarioId]);
  const visit = (id) => {
    for (const dependency of byId.get(id)?.dependsOn || []) {
      if (closure.has(dependency)) continue;
      closure.add(dependency);
      visit(dependency);
    }
  };
  visit(scenarioId);
  return closure;
}

/**
 * Split env requirements into global (must exist before launching a browser) and
 * scenario-scoped (a scenario that needs a missing gate is marked NOT RUN, exit 2).
 */
function collectEnvironmentRequirements(orderedScenarios) {
  const globalNames = new Set(['P3_API_URL', 'P3_FIXTURE_ASSERT_URL', 'P3_FIXTURE_ASSERT_TOKEN']);
  const credentialNames = new Set();
  const scenarioScoped = new Map();
  const runtimeNames = new Set(REQUIRED_ENV.runtime);
  const optionalNames = new Set(REQUIRED_ENV.optional);

  for (const scenario of orderedScenarios) {
    for (const actor of scenario.actors || []) {
      for (const name of credentialEnvNames([actor.role])) {
        credentialNames.add(name);
        globalNames.add(name);
      }
    }
    for (const precondition of scenario.preconditions || []) {
      if (precondition?.kind !== 'env' || !isNonEmptyString(precondition.name)) continue;
      if (
        runtimeNames.has(precondition.name) ||
        precondition.name.endsWith('_EMAIL') ||
        precondition.name.endsWith('_PASSWORD')
      ) {
        continue;
      }
      if (!scenarioScoped.has(precondition.name)) scenarioScoped.set(precondition.name, []);
      scenarioScoped.get(precondition.name).push(scenario.id);
    }
    for (const token of collectTemplateNames(scenario.steps)) {
      if (!token.startsWith('env:')) continue;
      const name = token.slice('env:'.length);
      if (!runtimeNames.has(name) && !optionalNames.has(name)) globalNames.add(name);
    }
  }
  return {
    globalNames: [...globalNames].sort(),
    credentialNames: [...credentialNames].sort(),
    scenarioScoped,
  };
}

function validateHttpUrl(name, value, { allowDefault = false } = {}) {
  if (!value) {
    if (allowDefault) return null;
    return `${name} is not set`;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return `${name} must be an http(s) URL`;
    return null;
  } catch {
    return `${name} is not a valid URL`;
  }
}

const isLoopbackHost = (hostname) => LOOPBACK_HOSTS.has(String(hostname || '').toLowerCase());

/**
 * C08 P1 lock: a connected run may only target the disposable local stack. Reject non-http(s)
 * URLs, non-loopback hosts and missing disposable/run markers before any browser or credential
 * is used. The same loopback rule is enforced again for every live request via CDP Fetch.
 */
function validateDisposableUrl(name, value) {
  const baseIssue = validateHttpUrl(name, value);
  if (baseIssue) return baseIssue;
  try {
    const parsed = new URL(value);
    if (!isLoopbackHost(parsed.hostname))
      return `${name} must point at a loopback disposable host (got ${parsed.hostname})`;
    if (parsed.username || parsed.password) return `${name} must not embed credentials`;
    return null;
  } catch {
    return `${name} is not a valid URL`;
  }
}

function validateDisposableEnvironment({
  feUrl,
  apiUrl,
  fixtureAssertUrl,
  disposable,
  runId,
  artifactsBase,
}) {
  const issues = [];
  if (disposable !== DISPOSABLE_MARKER)
    issues.push(
      'P3_DISPOSABLE must be "1": connected C08 only runs against the disposable C11 stack, never a real API',
    );
  if (!runId) issues.push('P3_RUN_ID is required and must bind this run to its fixtures/evidence');
  else if (!RUN_ID_PATTERN.test(runId))
    issues.push('P3_RUN_ID must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$');
  for (const [name, value] of [
    ['P3_FE_URL', feUrl],
    ['P3_API_URL', apiUrl],
    ['P3_FIXTURE_ASSERT_URL', fixtureAssertUrl],
  ]) {
    const issue = validateDisposableUrl(name, value);
    if (issue) issues.push(issue);
  }
  const artifactRoot = join(REPO_ROOT, 'artifacts');
  if (
    !resolve(artifactsBase).startsWith(`${artifactRoot}${sep}`) &&
    resolve(artifactsBase) !== artifactRoot
  )
    issues.push(`P3_ARTIFACTS_DIR must stay inside ${artifactRoot}`);
  return issues;
}

function allowedOriginsFor({ feUrl, apiUrl, fixtureAssertUrl }) {
  const origins = new Set();
  for (const value of [feUrl, apiUrl, fixtureAssertUrl]) {
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Validated earlier; an unparsable URL is reported as a NOT RUN reason.
    }
  }
  return [...origins].sort();
}

/** Resolves the local Chrome for Testing binary approved by D07 (no browser download). */
function resolveBrowserBinary() {
  const explicit = readEnv('P3_BROWSER_BIN');
  const candidates = [
    explicit,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {
      // Keep looking for another approved local binary.
    }
  }
  throw new NotRunError(
    'No Chrome/Chrome-for-Testing binary found. Set P3_BROWSER_BIN to the local Chrome for Testing 151 binary (D07); ' +
      'the harness never downloads a browser or adds a dependency.',
  );
}

async function probeHttpEndpoint(url, { timeoutMs = 10_000 } = {}) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { reachable: true, status: response.status };
  } catch (error) {
    return { reachable: false, error: error.name === 'TimeoutError' ? 'timeout' : error.message };
  }
}

// ─── synthetic evidence PNG (valid image, deterministic, no PII, no dependency) ─────────────
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

function createSyntheticEvidencePng(size = 64) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const offset = rowOffset + 1 + x * 3;
      raw[offset] = (x * 4 + y) % 256;
      raw[offset + 1] = (y * 7 + 32) % 256;
      raw[offset + 2] = ((x ^ y) * 9 + 64) % 256;
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return {
    buffer: png,
    sha256: createHash('sha256').update(png).digest('hex'),
    fileSizeBytes: png.length,
  };
}

// ─── raw CDP client (Node global WebSocket; browser target) ─────────────────────────────────
class CdpError extends Error {
  constructor(method, error) {
    super(`CDP ${method} failed: ${error?.message || 'unknown error'}`);
    this.name = 'CdpError';
    this.code = 'CDP_COMMAND_FAILED';
    this.cdpCode = error?.code ?? null;
    this.method = method;
  }
}

class CdpClient {
  constructor(url, label) {
    this.url = url;
    this.label = label;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.closed = false;
  }

  static async connect(url, { label = 'cdp', timeoutMs = 15_000 } = {}) {
    const client = new CdpClient(url, label);
    await client.open(timeoutMs);
    return client;
  }

  open(timeoutMs) {
    return new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          this.ws?.close();
        } catch {
          // Closing a socket that never opened is best effort.
        }
        rejectPromise(
          new NotRunError(`CDP connection timeout (${this.label}) after ${timeoutMs}ms`),
        );
      }, timeoutMs);
      let socket;
      try {
        socket = new WebSocket(this.url);
      } catch (error) {
        clearTimeout(timer);
        rejectPromise(new NotRunError(`CDP WebSocket could not be created: ${error.message}`));
        return;
      }
      this.ws = socket;
      socket.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise();
      });
      socket.addEventListener('message', (event) => this.handleMessage(event.data));
      socket.addEventListener('close', () => this.handleClose());
      socket.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rejectPromise(new NotRunError(`CDP WebSocket error (${this.label})`));
      });
    });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8'));
    } catch {
      return;
    }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new CdpError(entry.method, message.error));
      else entry.resolve(message.result ?? {});
      return;
    }
    if (message.method) {
      const handlers = this.handlers.get(message.method);
      if (!handlers) return;
      for (const handler of [...handlers]) {
        try {
          handler(message.params ?? {}, message.sessionId ?? null);
        } catch {
          // Event handlers must never crash the harness; step assertions surface failures instead.
        }
      }
    }
  }

  handleClose() {
    if (this.closed) return;
    this.closed = true;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new NotRunError(`CDP connection closed while waiting for ${entry.method}`));
    }
    this.pending.clear();
  }

  send(method, params = {}, { sessionId = undefined, timeoutMs = CDP_COMMAND_TIMEOUT_MS } = {}) {
    if (this.closed || !this.ws || this.ws.readyState !== 1) {
      return Promise.reject(new NotRunError(`CDP connection is not open (cannot send ${method})`));
    }
    const id = (this.nextId += 1);
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(
          new StepFailure(`CDP ${method} timed out after ${timeoutMs}ms`, 'CDP_TIMEOUT'),
        );
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: resolvePromise,
        reject: rejectPromise,
        timer,
      });
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        rejectPromise(new NotRunError(`CDP send failed: ${error.message}`));
      }
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(handler);
    return () => this.handlers.get(method)?.delete(handler);
  }

  close() {
    this.handleClose();
    try {
      this.ws?.close();
    } catch {
      // Best effort during cleanup.
    }
  }
}

// ─── page-side helpers (injected into every new document; no business logic) ───────────────
function pageHelpers() {
  const norm = (value) =>
    (value === null || value === undefined ? '' : String(value)).replace(/\s+/g, ' ').trim();
  const deser = (value) => {
    if (Array.isArray(value)) return value.map(deser);
    if (value && typeof value === 'object') {
      if (typeof value.__regexp__ === 'string')
        return new RegExp(value.__regexp__, value.flags || '');
      const output = {};
      for (const [key, entry] of Object.entries(value)) output[key] = deser(entry);
      return output;
    }
    return value;
  };
  const isVisible = (el) => {
    if (!el || el.nodeType !== 1 || !el.isConnected || el.hidden) return false;
    const style = window.getComputedStyle(el);
    if (
      !style ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const depthOf = (el) => {
    let depth = 0;
    let current = el;
    while (current && current.parentElement) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  };
  const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  const implicitRole = (el) => {
    const explicit = el.getAttribute && el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName;
    if (tag === 'BUTTON') return 'button';
    if (tag === 'A' && el.hasAttribute('href')) return 'link';
    if (
      tag === 'H1' ||
      tag === 'H2' ||
      tag === 'H3' ||
      tag === 'H4' ||
      tag === 'H5' ||
      tag === 'H6'
    ) {
      return 'heading';
    }
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'file') return 'button';
      if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
      if (type === 'search') return 'searchbox';
      return 'textbox';
    }
    return null;
  };
  const accessibleName = (el) => {
    const ariaLabel = el.getAttribute && el.getAttribute('aria-label');
    if (norm(ariaLabel)) return ariaLabel;
    const labelledBy = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((entry) => entry.textContent)
        .join(' ');
      if (norm(text)) return text;
    }
    if (FIELD_TAGS.has(el.tagName)) {
      if (el.labels && el.labels.length > 0) {
        const text = Array.from(el.labels)
          .map((label) => label.textContent)
          .join(' ');
        if (norm(text)) return text;
      }
      const placeholder = el.getAttribute('placeholder');
      if (norm(placeholder)) return placeholder;
      const title = el.getAttribute('title');
      if (norm(title)) return title;
    }
    return norm(el.innerText || el.textContent || '');
  };
  const nameMatches = (actual, expected) => {
    if (expected === undefined || expected === null) return true;
    const normalized = norm(actual);
    if (expected instanceof RegExp) return expected.test(normalized);
    const wanted = norm(expected);
    if (!wanted) return true;
    return normalized === wanted || normalized.includes(wanted);
  };
  const pushUnique = (list, seen, el) => {
    if (el && !seen.has(el)) {
      seen.add(el);
      list.push(el);
    }
  };
  const collect = (spec, root) => {
    const results = [];
    const seen = new Set();
    const scope = root || document;
    if (spec.strategy === 'css') {
      for (const el of scope.querySelectorAll(spec.value)) pushUnique(results, seen, el);
    } else if (spec.strategy === 'label') {
      const wanted = norm(spec.value);
      for (const label of scope.querySelectorAll('label')) {
        if (!norm(label.textContent).includes(wanted)) continue;
        const control =
          label.control || label.querySelector('input,select,textarea,[contenteditable="true"]');
        pushUnique(results, seen, control || label);
      }
      for (const el of scope.querySelectorAll('input,select,textarea')) {
        if (norm(el.getAttribute('aria-label')).includes(wanted)) pushUnique(results, seen, el);
      }
    } else if (spec.strategy === 'role') {
      for (const el of scope.querySelectorAll('*')) {
        if (implicitRole(el) === spec.role && nameMatches(accessibleName(el), spec.name)) {
          pushUnique(results, seen, el);
        }
      }
    } else if (spec.strategy === 'text') {
      const wanted = spec.value;
      const matchesText = (text) => {
        const normalized = norm(text);
        if (wanted instanceof RegExp) return wanted.test(normalized);
        return normalized.includes(norm(wanted));
      };
      for (const el of scope.querySelectorAll('*')) {
        if (FIELD_TAGS.has(el.tagName)) continue;
        if (!matchesText(el.textContent)) continue;
        if (spec.closest) {
          const closest = el.closest(spec.closest);
          if (closest) pushUnique(results, seen, closest);
          continue;
        }
        pushUnique(results, seen, el);
      }
    } else if (spec.strategy === 'placeholder') {
      const wanted = norm(spec.value);
      for (const el of scope.querySelectorAll('input,textarea')) {
        if (norm(el.getAttribute('placeholder')).includes(wanted)) pushUnique(results, seen, el);
      }
    }
    return results;
  };
  const resolveRoot = (rawWithin) => {
    if (!rawWithin) return document;
    const within = deser(rawWithin);
    const matches = collect(within, document);
    const visibleMatches = matches.filter(isVisible);
    const pool = visibleMatches.length > 0 ? visibleMatches : matches;
    return pool[within.index || 0] || null;
  };
  const sortTextMatches = (matches) =>
    matches.sort((left, right) => depthOf(right) - depthOf(left));
  const find = (rawSpec, rawWithin, index) => {
    const spec = deser(rawSpec);
    const root = resolveRoot(rawWithin);
    if (!root) return null;
    let matches = collect(spec, root);
    if (spec.strategy === 'text' && !spec.closest) matches = sortTextMatches(matches);
    const visibleMatches = matches.filter(isVisible);
    const pool = visibleMatches.length > 0 ? visibleMatches : matches;
    return pool[index || 0] || null;
  };
  const probe = (rawSpec, rawWithin, index) => {
    const spec = deser(rawSpec);
    const root = resolveRoot(rawWithin);
    if (!root)
      return { ok: false, reason: 'within target not found', matches: 0, visibleMatches: 0 };
    let matches = collect(spec, root);
    if (spec.strategy === 'text' && !spec.closest) matches = sortTextMatches(matches);
    const visibleMatches = matches.filter(isVisible);
    const pool = visibleMatches.length > 0 ? visibleMatches : matches;
    const chosen = pool[index || 0] || null;
    return {
      ok: Boolean(chosen),
      reason: chosen ? null : matches.length > 0 ? 'matches exist but none visible' : 'no matches',
      matches: matches.length,
      visibleMatches: visibleMatches.length,
      tag: chosen ? chosen.tagName : null,
      text: chosen ? norm(chosen.innerText || chosen.textContent).slice(0, 160) : null,
      strategy: spec.strategy,
      selector:
        spec.strategy === 'role'
          ? `${spec.role}[name=${spec.name === undefined ? '*' : String(spec.name)}]`
          : String(spec.value === undefined ? spec.role : spec.value),
    };
  };
  const bodyText = () => {
    const body = document.body;
    if (!body) return '';
    return String(body.innerText || body.textContent || '');
  };
  const elementText = (el) => (el ? String(el.innerText || el.textContent || '') : '');
  globalThis.__P3__ = { norm, isVisible, find, probe, collect, resolveRoot, bodyText, elementText };
}

const PAGE_HELPERS_SOURCE = `(${pageHelpers.toString()})()`;

const serializeForPage = (value) =>
  JSON.stringify(value, (_key, entry) =>
    entry instanceof RegExp
      ? { __regexp__: entry.source, flags: entry.flags }
      : entry === undefined
        ? null
        : entry,
  );

const describeSelector = (spec) => {
  if (!spec) return '<no selector>';
  if (spec.strategy === 'role') return `role=${spec.role} name=${spec.name ?? '*'}`;
  if (spec.strategy === 'css') return `css=${spec.value}`;
  if (spec.strategy === 'label') return `label=${spec.value}`;
  if (spec.strategy === 'placeholder') return `placeholder=${spec.value}`;
  return `text=${String(spec.value)}`;
};

const FILL_FUNCTION_DECLARATION = `function p3Fill(value) {
  const el = this;
  if (!el || el.nodeType !== 1) return { ok: false, reason: 'target is not an element' };
  const tag = el.tagName;
  const editable = el.isContentEditable === true;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !editable) {
    return { ok: false, reason: 'fill supports input/textarea/contenteditable only (got ' + tag + ')' };
  }
  el.focus();
  if (editable && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    el.textContent = String(value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value), inputType: 'insertText' }));
    return { ok: true, tag, valueLength: String(value).length };
  }
  const prototype = tag === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (!descriptor || !descriptor.set) return { ok: false, reason: 'missing native value setter' };
  descriptor.set.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
  return { ok: true, tag, valueLength: String(value).length };
}`;

const SELECT_FUNCTION_DECLARATION = `function p3Select(option) {
  const el = this;
  if (!el || el.tagName !== 'SELECT') {
    return { ok: false, code: 'UNSUPPORTED_STEP', reason: 'select step only supports native <select> elements (got ' + (el && el.tagName) + ')' };
  }
  const options = Array.from(el.options || []);
  let chosen = null;
  if (option && option.index !== undefined) chosen = options[option.index] || null;
  else if (option && option.value !== undefined) chosen = options.find((entry) => entry.value === String(option.value)) || null;
  else if (option && option.label !== undefined) {
    const wanted = String(option.label).trim();
    chosen = options.find((entry) => String(entry.textContent || '').trim().includes(wanted)) || null;
  }
  if (!chosen) {
    return { ok: false, code: 'OPTION_NOT_FOUND', reason: 'option not found', choices: options.slice(0, 30).map((entry) => entry.value) };
  }
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
  if (descriptor && descriptor.set) descriptor.set.call(el, chosen.value);
  else el.value = chosen.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, tag: el.tagName, selectedValue: chosen.value, selectedLabel: String(chosen.textContent || '').trim() };
}`;

const POINT_FUNCTION_DECLARATION = `function p3Point() {
  const el = this;
  if (!el || el.nodeType !== 1) return null;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const style = window.getComputedStyle(el);
  if (!style || style.visibility === 'hidden' || style.display === 'none') return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height, tag: el.tagName };
}`;

const FILE_INPUT_FUNCTION_DECLARATION = `function p3FileInput() {
  const el = this;
  if (!el || el.nodeType !== 1) return null;
  if (el.tagName === 'INPUT' && String(el.type).toLowerCase() === 'file') return el;
  const nested = el.querySelector ? el.querySelector('input[type="file"]') : null;
  if (nested) return nested;
  if (el.labels) {
    for (const label of Array.from(el.labels)) {
      const candidate = label.querySelector('input[type="file"]');
      if (candidate) return candidate;
    }
  }
  return null;
}`;

// ─── page session: DOM actions, navigation, text, screenshots, login/logout plumbing ────────
/** Pure allowlist used by the CDP guard and by `--self-test-lock`. */
function isAllowedNetworkUrl(rawUrl, allowedOrigins) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    return false;
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol))
    return ['data:', 'blob:', 'about:', 'chrome:', 'devtools:', 'file:'].includes(parsed.protocol);
  if (!isLoopbackHost(parsed.hostname)) return false;
  if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
    const port = parsed.port || (parsed.protocol === 'wss:' ? '443' : '80');
    return [...allowedOrigins].some((origin) => {
      try {
        return new URL(origin).port === port;
      } catch {
        return false;
      }
    });
  }
  return new Set(allowedOrigins).has(parsed.origin);
}

const wildcardMatch = (value, pattern) => {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(value);
};

class PageSession {
  constructor({ cdp, sessionId, cdpVersion, feUrl, artifacts, allowedOrigins = [] }) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.cdpVersion = cdpVersion;
    this.feUrl = feUrl;
    this.artifacts = artifacts;
    this.allowedOrigins = new Set(allowedOrigins);
    this.faultBlockPattern = null;
    this.networkViolations = [];
    this.guardInstalled = false;
    this.recorder = null;
    this.loadWaiters = [];
    this.consoleErrors = [];
    this.dialogs = [];
    this.unsubscribers = [];
    this.lastLoadAt = 0;
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Network.enable');
    await this.installNetworkGuard();
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    try {
      await this.send('Log.enable');
    } catch {
      // Log domain is optional diagnostics only.
    }
    try {
      await this.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
    } catch {
      // Metrics override is cosmetic for screenshots; ignore capability differences.
    }
    try {
      // Page-level download behaviour is the CDP-native fallback if the browser-level
      // Browser.setDownloadBehavior call was rejected by this protocol revision.
      await this.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: this.artifacts.downloadDir,
      });
    } catch {
      // Browser.setDownloadBehavior already configured downloads; keep going.
    }
    this.unsubscribers.push(
      this.on('Page.loadEventFired', () => {
        this.lastLoadAt = Date.now();
        const waiters = this.loadWaiters;
        this.loadWaiters = [];
        for (const resolveWaiter of waiters) resolveWaiter();
      }),
    );
    this.unsubscribers.push(
      this.on('Page.javascriptDialogOpening', (params) => {
        this.dialogs.push({ type: params.type, message: safeSnippet(params.message || '') });
        void this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      }),
    );
    this.unsubscribers.push(
      this.on('Runtime.exceptionThrown', (params) => {
        this.pushConsoleError(this.describeException(params));
      }),
    );
    this.unsubscribers.push(
      this.on('Runtime.consoleAPICalled', (params) => {
        if (params.type !== 'error' && params.type !== 'assert') return;
        const text = (params.args || [])
          .map((arg) => arg.value ?? arg.description ?? arg.type)
          .join(' ');
        this.pushConsoleError(safeSnippet(text, 800));
      }),
    );
  }

  pushConsoleError(message) {
    if (!message) return;
    this.consoleErrors.push({ at: nowIso(), message: safeSnippet(message, 800) });
    if (this.consoleErrors.length > 50) this.consoleErrors.shift();
  }

  describeException(params) {
    const details = params?.exceptionDetails;
    if (!details) return 'Unknown page exception';
    const exception = details.exception;
    const text =
      exception?.description || exception?.value || details.text || 'Unknown page exception';
    return safeSnippet(String(text), 800);
  }

  on(method, handler) {
    return this.cdp.on(method, (params, sessionId) => {
      if (sessionId === this.sessionId) handler(params);
    });
  }

  send(method, params, { timeoutMs = CDP_COMMAND_TIMEOUT_MS } = {}) {
    return this.cdp.send(method, params, { sessionId: this.sessionId, timeoutMs });
  }

  /**
   * P1 runtime lock: every http(s)/ws(s) request is paused and either continued (allowed loopback
   * origin for this run) or failed with BlockedByClient. Fault injection reuses the same pause so
   * the guard can never be disabled by a scenario step.
   */
  async installNetworkGuard() {
    if (this.guardInstalled) return;
    this.guardInstalled = true;
    this.unsubscribers.push(
      this.on('Fetch.requestPaused', (params) => {
        void this.resolvePausedRequest(params);
      }),
    );
    await this.send('Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }],
    });
  }

  isAllowedRequestUrl(rawUrl) {
    return isAllowedNetworkUrl(rawUrl, this.allowedOrigins);
  }

  setFetchBlock(pattern) {
    this.faultBlockPattern = pattern || null;
  }

  async resolvePausedRequest(params) {
    const requestId = params.requestId;
    const url = params.request?.url || '';
    if (!this.isAllowedRequestUrl(url)) {
      this.networkViolations.push({ at: nowIso(), url: safeSnippet(url, 300) });
      await this.send('Fetch.failRequest', {
        requestId,
        errorReason: 'BlockedByClient',
      }).catch(() => {});
      return;
    }
    if (this.faultBlockPattern && wildcardMatch(url, this.faultBlockPattern)) {
      await this.send('Fetch.failRequest', {
        requestId,
        errorReason: 'ConnectionBlocked',
      }).catch(() => {});
      return;
    }
    await this.send('Fetch.continueRequest', { requestId }).catch(() => {});
  }

  async evaluate(
    expression,
    { returnByValue = true, awaitPromise = true, timeoutMs = CDP_COMMAND_TIMEOUT_MS } = {},
  ) {
    const result = await this.send(
      'Runtime.evaluate',
      { expression, returnByValue, awaitPromise, includeCommandLineAPI: false },
      { timeoutMs },
    );
    if (result.exceptionDetails) {
      throw new StepFailure(
        `Page evaluation failed: ${this.describeException({ exceptionDetails: result.exceptionDetails })}`,
        'PAGE_EVALUATION_FAILED',
      );
    }
    return result.result ?? {};
  }

  async evaluateValue(expression, options = {}) {
    const result = await this.evaluate(expression, { returnByValue: true, ...options });
    return result.value;
  }

  ensureHelpersExpression(body) {
    return `(() => {
      if (!globalThis.__P3__) {
        ${PAGE_HELPERS_SOURCE}
      }
      ${body}
    })()`;
  }

  async callOnElement(objectId, functionDeclaration, args = [], { returnByValue = true } = {}) {
    const result = await this.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration,
      arguments: args.map((value) => ({ value })),
      returnByValue,
    });
    if (result.exceptionDetails) {
      throw new StepFailure(
        `Page element call failed: ${this.describeException({ exceptionDetails: result.exceptionDetails })}`,
        'PAGE_EVALUATION_FAILED',
      );
    }
    return result.result ?? {};
  }

  async probe(spec, within = null, index = 0) {
    const result = await this.evaluate(
      this.ensureHelpersExpression(
        `return globalThis.__P3__.probe(${serializeForPage(spec)}, ${within ? serializeForPage(within) : 'null'}, ${Number(index) || 0});`,
      ),
    );
    return result.value ?? null;
  }

  async findObjectId(spec, within = null, index = 0) {
    const result = await this.evaluate(
      this.ensureHelpersExpression(
        `return globalThis.__P3__.find(${serializeForPage(spec)}, ${within ? serializeForPage(within) : 'null'}, ${Number(index) || 0});`,
      ),
      { returnByValue: false },
    );
    if (!result.objectId) {
      const probeInfo = await this.probe(spec, within, index);
      throw new StepFailure(
        `Target not found: ${describeSelector(spec)}` +
          (probeInfo ? ` — matches=${probeInfo.matches} visible=${probeInfo.visibleMatches}` : ''),
        'TARGET_NOT_FOUND',
      );
    }
    return result.objectId;
  }

  async waitForTarget(spec, { within = null, index = 0, timeoutMs = ACTION_TIMEOUT_MS } = {}) {
    let lastProbe = null;
    await waitUntil(
      async () => {
        lastProbe = await this.probe(spec, within, index);
        return lastProbe && lastProbe.visibleMatches > index;
      },
      {
        timeoutMs,
        message: `Target not visible after ${timeoutMs}ms: ${describeSelector(spec)}`,
        intervalMs: 120,
      },
    ).catch((error) => {
      throw new StepFailure(
        `${error.message}${lastProbe ? ` (matches=${lastProbe.matches} visible=${lastProbe.visibleMatches})` : ''}`,
        'TARGET_NOT_VISIBLE',
      );
    });
    return lastProbe;
  }

  async pointOf(objectId) {
    const result = await this.callOnElement(objectId, POINT_FUNCTION_DECLARATION);
    return result.value ?? null;
  }

  async dispatchClick(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  }

  async click(spec, { within = null, index = 0, timeoutMs = ACTION_TIMEOUT_MS } = {}) {
    await this.waitForTarget(spec, { within, index, timeoutMs });
    const objectId = await this.findObjectId(spec, within, index);
    const point = await this.pointOf(objectId);
    if (!point)
      throw new StepFailure(
        `Click target has no clickable box: ${describeSelector(spec)}`,
        'TARGET_NOT_VISIBLE',
      );
    await this.dispatchClick(point.x, point.y);
    return { tag: point.tag, x: Math.round(point.x), y: Math.round(point.y) };
  }

  async fill(spec, { within = null, index = 0, value, timeoutMs = ACTION_TIMEOUT_MS } = {}) {
    const safeValue = value === null || value === undefined ? '' : String(value);
    await this.waitForTarget(spec, { within, index, timeoutMs });
    const objectId = await this.findObjectId(spec, within, index);
    const result = await this.callOnElement(objectId, FILL_FUNCTION_DECLARATION, [safeValue]);
    if (!result.value?.ok) {
      throw new StepFailure(
        `Fill failed for ${describeSelector(spec)}: ${result.value?.reason || 'unknown reason'}`,
        result.value?.code || 'FILL_FAILED',
      );
    }
    return { tag: result.value.tag, valueLength: result.value.valueLength };
  }

  async select(spec, { within = null, index = 0, option, timeoutMs = ACTION_TIMEOUT_MS } = {}) {
    await this.waitForTarget(spec, { within, index, timeoutMs });
    const objectId = await this.findObjectId(spec, within, index);
    const result = await this.callOnElement(objectId, SELECT_FUNCTION_DECLARATION, [option || {}]);
    if (!result.value?.ok) {
      const code = result.value?.code === 'UNSUPPORTED_STEP' ? 'UNSUPPORTED_STEP' : 'SELECT_FAILED';
      throw new StepFailure(
        `Select failed for ${describeSelector(spec)}: ${result.value?.reason || 'unknown reason'}` +
          (result.value?.choices ? ` (choices: ${result.value.choices.join(', ')})` : ''),
        code,
      );
    }
    return { selectedValue: result.value.selectedValue, selectedLabel: result.value.selectedLabel };
  }

  async upload(spec, { within = null, index = 0, filePath, timeoutMs = ACTION_TIMEOUT_MS } = {}) {
    await this.waitForTarget(spec, { within, index, timeoutMs });
    const objectId = await this.findObjectId(spec, within, index);
    const fileObject = await this.callOnElement(objectId, FILE_INPUT_FUNCTION_DECLARATION, [], {
      returnByValue: false,
    });
    if (!fileObject.objectId) {
      throw new StepFailure(
        `Upload target ${describeSelector(spec)} has no input[type=file] descendant`,
        'UNSUPPORTED_STEP',
      );
    }
    const node = await this.send('DOM.requestNode', { objectId: fileObject.objectId });
    if (!node?.nodeId) throw new StepFailure('DOM.requestNode returned no nodeId for file input');
    await this.send('DOM.setFileInputFiles', { files: [filePath], nodeId: node.nodeId });
    return { filePath };
  }

  async elementText(spec, { within = null, index = 0 } = {}) {
    const objectId = await this.findObjectId(spec, within, index);
    const result = await this.callOnElement(
      objectId,
      `function p3Text() { return this.innerText || this.textContent || ''; }`,
    );
    return String(result.value ?? '');
  }

  async bodyText() {
    const result = await this.evaluate(
      this.ensureHelpersExpression('return globalThis.__P3__.bodyText();'),
    );
    return String(result.value ?? '');
  }

  async currentUrl() {
    return String((await this.evaluateValue('location.href')) ?? '');
  }

  async waitForCondition(expression, { timeoutMs = NAVIGATION_TIMEOUT_MS, message } = {}) {
    await waitUntil(() => this.evaluateValue(expression), {
      timeoutMs,
      message: message || `Page condition not met within ${timeoutMs}ms: ${expression}`,
      intervalMs: 120,
    });
  }

  waitForLoad(timeoutMs = NAVIGATION_TIMEOUT_MS) {
    return new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        rejectPromise(
          new StepFailure(`Page load timed out after ${timeoutMs}ms`, 'NAVIGATION_TIMEOUT'),
        );
      }, timeoutMs);
      this.loadWaiters.push(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise();
      });
    });
  }

  async navigate(url, { timeoutMs = NAVIGATION_TIMEOUT_MS } = {}) {
    const loaded = this.waitForLoad(timeoutMs);
    try {
      const navigation = await this.send('Page.navigate', { url }, { timeoutMs });
      if (navigation.errorText) {
        throw new StepFailure(
          `Navigation to ${url} failed: ${navigation.errorText}`,
          'NAVIGATION_FAILED',
        );
      }
      await loaded;
      return navigation;
    } catch (error) {
      // Never leave an unhandled load-waiter rejection behind when navigation fails early.
      loaded.catch(() => {});
      throw error;
    }
  }

  async reload({ timeoutMs = NAVIGATION_TIMEOUT_MS } = {}) {
    const loaded = this.waitForLoad(timeoutMs);
    try {
      await this.send('Page.reload', { ignoreCache: false }, { timeoutMs });
      await loaded;
    } catch (error) {
      loaded.catch(() => {});
      throw error;
    }
  }

  async setLocale(locale) {
    await this.navigate(new URL('/', this.feUrl).toString());
    await this.evaluate(`localStorage.setItem('APP_LOCALE', ${JSON.stringify(locale)}); true`);
  }

  async screenshot(name) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    if (!result?.data)
      throw new StepFailure(`Screenshot ${name} returned no data`, 'SCREENSHOT_FAILED');
    const buffer = Buffer.from(result.data, 'base64');
    if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new StepFailure(`Screenshot ${name} is not a PNG`, 'SCREENSHOT_FAILED');
    }
    const filePath = join(this.artifacts.runDir, `${name}.png`);
    await writeFile(filePath, buffer);
    return { filePath, bytes: buffer.length };
  }

  async close() {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }

  // ── login/logout plumbing for the `login`/`logout` step kinds (no business assertions here) ─
  async login({ role, credentials, workspaceSlug, timeoutMs = LOGIN_TIMEOUT_MS }) {
    await this.navigate(new URL('/login', this.feUrl).toString(), { timeoutMs });
    let loginFormVisible = await this.isTargetVisible(LOGIN_EMAIL_SELECTOR, {
      timeoutMs: 8_000,
    }).catch(() => false);
    if (!loginFormVisible) {
      // A previous scenario may have left this browser context authenticated; a full context per
      // scenario normally prevents that, but the reusable path keeps the step deterministic.
      await this.logout({ timeoutMs: 15_000 });
      await this.navigate(new URL('/login', this.feUrl).toString(), { timeoutMs });
      loginFormVisible = await this.isTargetVisible(LOGIN_EMAIL_SELECTOR, { timeoutMs }).catch(
        () => false,
      );
    }
    if (!loginFormVisible) {
      throw new StepFailure(
        `Login form was not visible at /login for role ${role}`,
        'LOGIN_FORM_MISSING',
      );
    }
    await this.fill(LOGIN_EMAIL_SELECTOR, { value: credentials.email });
    await this.fill(LOGIN_PASSWORD_SELECTOR, { value: credentials.password });
    if (workspaceSlug) await this.fill(LOGIN_WORKSPACE_SELECTOR, { value: workspaceSlug });
    await this.click(LOGIN_SUBMIT_SELECTOR, { timeoutMs });
    let loginRecord = await this.waitForLoginResponse({ timeoutMs });
    if (loginRecord.status === 409) {
      if (!workspaceSlug) {
        throw new NotRunError(
          `Login for role ${role} requires a workspace slug (HTTP 409 CONFLICT). Set P3_LOGIN_WORKSPACE_SLUG for this disposable environment.`,
        );
      }
      await this.fill(LOGIN_WORKSPACE_SELECTOR, { value: workspaceSlug });
      await this.click(LOGIN_SUBMIT_SELECTOR, { timeoutMs });
      loginRecord = await this.waitForLoginResponse({ timeoutMs });
    }
    if (loginRecord.status !== 200) {
      throw new StepFailure(
        `Login for role ${role} returned HTTP ${loginRecord.status} (expected 200)`,
        'LOGIN_REJECTED',
      );
    }
    await this.waitForCondition(`location.pathname !== '/login'`, {
      timeoutMs,
      message: `Login for role ${role} did not leave /login (session was not established)`,
    });
    return { role, loginStatus: loginRecord.status };
  }

  async waitForLoginResponse({ timeoutMs = LOGIN_TIMEOUT_MS } = {}) {
    const loginRegex = new RegExp(LOGIN_PATH_PATTERN);
    let lastCandidate = null;
    return waitUntil(
      () => {
        const candidates = this.recorder
          .recordsAfter(0)
          .filter(
            (record) =>
              record.method === 'POST' &&
              loginRegex.test(record.pathname) &&
              record.status !== null,
          );
        lastCandidate = candidates[candidates.length - 1] || null;
        if (lastCandidate && (lastCandidate.status === 200 || lastCandidate.status === 409)) {
          return lastCandidate;
        }
        return null;
      },
      {
        timeoutMs,
        intervalMs: 100,
        message:
          `No login response (POST /v1/auth/login 200/409) within ${timeoutMs}ms` +
          (lastCandidate ? `; last status ${lastCandidate.status}` : ''),
      },
    );
  }

  async isTargetVisible(spec, { timeoutMs = 2_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const probe = await this.probe(spec);
      if (probe?.visibleMatches > 0) return true;
      if (Date.now() >= deadline) return false;
      await delay(100);
    }
  }

  async logout({ timeoutMs = 15_000 } = {}) {
    const menuProbe = await this.probe(USER_MENU_NAME_SELECTOR);
    if (!menuProbe || menuProbe.visibleMatches === 0) {
      const fallback = await this.probe(USER_MENU_FALLBACK_SELECTOR);
      if (!fallback || fallback.visibleMatches === 0) {
        return false; // Not authenticated in this context — nothing to log out.
      }
      await this.click(USER_MENU_FALLBACK_SELECTOR, {
        index: fallback.visibleMatches - 1,
        timeoutMs,
      });
    } else {
      await this.click(USER_MENU_NAME_SELECTOR, { timeoutMs });
    }
    const logoutItemVisible = await this.isTargetVisible(LOGOUT_MENU_ITEM_SELECTOR, {
      timeoutMs: 5_000,
    });
    if (!logoutItemVisible) {
      throw new StepFailure(
        'Logout menu item did not appear after opening the user menu',
        'LOGOUT_MENU_MISSING',
      );
    }
    await this.click(LOGOUT_MENU_ITEM_SELECTOR, { timeoutMs });
    await this.waitForCondition(
      `Boolean(document.querySelector(${JSON.stringify('#login-email')})) || location.pathname === '/login'`,
      { timeoutMs, message: 'Logout did not return the app to /login' },
    );
    return true;
  }
}

// ─── live network recorder (CDP Network domain; business responses are never mocked) ───────
class NetworkRecorder {
  constructor(page) {
    this.page = page;
    this.records = [];
    this.byRequestId = new Map();
    this.seq = 0;
    this.regexCache = new Map();
    this.unsubscribers = [];
  }

  attach() {
    this.unsubscribers.push(
      this.page.on('Network.requestWillBeSent', (params) => this.onRequest(params)),
      this.page.on('Network.responseReceived', (params) => this.onResponse(params)),
      this.page.on('Network.loadingFinished', (params) => this.onFinished(params)),
      this.page.on('Network.loadingFailed', (params) => this.onFailed(params)),
    );
  }

  detach() {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }

  reset() {
    this.records = [];
    this.byRequestId.clear();
  }

  recordsAfter(seq) {
    return this.records.filter((record) => record.seq >= seq);
  }

  onRequest({ requestId, request, type, wallTime }) {
    let url = null;
    try {
      url = new URL(request.url);
    } catch {
      url = null;
    }
    const record = {
      seq: (this.seq += 1),
      requestId,
      method: String(request.method || 'GET').toUpperCase(),
      url: request.url,
      pathname: url ? url.pathname : String(request.url),
      search: url ? url.search : '',
      host: url ? url.host : '',
      resourceType: type || request.type || '',
      postData: request.postData ?? null,
      hasPostData: request.hasPostData === true,
      status: null,
      statusText: null,
      responseHeaders: null,
      mimeType: null,
      failed: false,
      errorText: null,
      redirectStatus: null,
      requestedAt: nowIso(),
      wallTime: wallTime ?? null,
      finished: false,
      bodyPromise: null,
    };
    this.records.push(record);
    this.byRequestId.set(requestId, record);
  }

  onResponse({ requestId, response, type }) {
    const record = this.byRequestId.get(requestId);
    if (!record) return;
    if (response?.redirectURL) record.redirectStatus = response.status;
    record.status = response?.status ?? null;
    record.statusText = response?.statusText ?? null;
    record.mimeType = response?.mimeType ?? null;
    record.responseHeaders = response?.headers ?? null;
    record.resourceType = type || record.resourceType;
  }

  onFinished({ requestId }) {
    const record = this.byRequestId.get(requestId);
    if (!record || record.finished) return;
    record.finished = true;
    record.bodyPromise = this.fetchBody(record.requestId);
  }

  onFailed({ requestId, errorText, blockedReason, type }) {
    const record = this.byRequestId.get(requestId);
    if (!record) return;
    record.failed = true;
    record.errorText = `${errorText || 'request failed'}${blockedReason ? ` (${blockedReason})` : ''}`;
    record.resourceType = type || record.resourceType;
  }

  async fetchBody(requestId) {
    try {
      const result = await this.page.send(
        'Network.getResponseBody',
        { requestId },
        { timeoutMs: 10_000 },
      );
      const base64Encoded = result.base64Encoded === true;
      const buffer = Buffer.from(result.body ?? '', base64Encoded ? 'base64' : 'utf8');
      if (buffer.length > MAX_BODY_BYTES) return { tooLarge: true, base64Encoded };
      return {
        base64Encoded,
        buffer,
        text: base64Encoded ? buffer.toString('utf8') : String(result.body ?? ''),
      };
    } catch (error) {
      return { error: error.message, base64Encoded: false };
    }
  }

  regexFor(source) {
    if (this.regexCache.has(source)) return this.regexCache.get(source);
    const compiled = new RegExp(source);
    this.regexCache.set(source, compiled);
    return compiled;
  }

  matching(requestSpec) {
    const regex = this.regexFor(requestSpec.path);
    const method = String(requestSpec.method || '').toUpperCase();
    return this.records.filter(
      (record) => (!method || record.method === method) && regex.test(record.pathname),
    );
  }

  statusMatches(record, requestSpec) {
    if (requestSpec.status !== undefined) return record.status === requestSpec.status;
    if (Array.isArray(requestSpec.statusAnyOf))
      return requestSpec.statusAnyOf.includes(record.status);
    return record.status !== null;
  }

  async bodyOf(record, { timeoutMs = 10_000 } = {}) {
    if (!record.bodyPromise) {
      throw new StepFailure(
        `No response body recorded for ${record.method} ${record.pathname} (request still pending or failed)`,
        'NETWORK_BODY_UNAVAILABLE',
      );
    }
    const raw = await withTimeout(
      record.bodyPromise,
      timeoutMs,
      `Response body timeout for ${record.pathname}`,
      'NETWORK_BODY_TIMEOUT',
    );
    if (raw?.error) {
      throw new StepFailure(
        `Response body unavailable for ${record.pathname}: ${raw.error}`,
        'NETWORK_BODY_UNAVAILABLE',
      );
    }
    if (raw?.tooLarge) {
      throw new StepFailure(
        `Response body too large for ${record.pathname}`,
        'NETWORK_BODY_TOO_LARGE',
      );
    }
    return raw;
  }

  async textOf(record, options = {}) {
    const raw = await this.bodyOf(record, options);
    if (typeof raw.text === 'string') return raw.text;
    return raw.buffer.toString('utf8');
  }

  async jsonOf(record, options = {}) {
    const text = await this.textOf(record, options);
    try {
      return JSON.parse(text);
    } catch {
      throw new StepFailure(
        `Response for ${record.method} ${record.pathname} is not JSON (content-type: ${record.mimeType ?? 'unknown'})`,
        'NETWORK_BODY_NOT_JSON',
      );
    }
  }

  async waitForRecord(predicate, { timeoutMs = NETWORK_ASSERT_TIMEOUT_MS, message } = {}) {
    let lastCandidates = [];
    return waitUntil(
      () => {
        lastCandidates = this.records.filter(predicate);
        return lastCandidates[lastCandidates.length - 1] || null;
      },
      {
        timeoutMs,
        intervalMs: 100,
        message:
          message ||
          `No matching network record within ${timeoutMs}ms` +
            (lastCandidates.length
              ? `; last status ${lastCandidates[lastCandidates.length - 1].status}`
              : ''),
      },
    );
  }

  describeRecent(limit = 8) {
    return this.records
      .slice(-limit)
      .map(
        (record) =>
          `${record.seq}:${record.method} ${record.pathname} → ${record.status ?? (record.failed ? `FAILED(${record.errorText})` : 'pending')}`,
      )
      .join(' | ');
  }
}

const mustHavePath = (value, path) => {
  let current = value;
  for (const token of splitJsonPath(path)) {
    if (current === null || current === undefined) return { found: false, value: undefined };
    if (typeof current === 'object' && !Object.prototype.hasOwnProperty.call(current, token)) {
      return { found: false, value: undefined };
    }
    current = current[token];
  }
  return { found: true, value: current };
};

class NetworkVerifier {
  constructor(recorder, { scenarioId }) {
    this.recorder = recorder;
    this.scenarioId = scenarioId;
    this.reset();
  }

  reset() {
    this.cursor = -1;
    this.actionSeq = 0;
    this.lastActionSeq = 0;
    this.actionPending = false;
    this.consumed = new Set();
  }

  noteAction() {
    // Next record sequence that can be produced by the action; records already captured before
    // the action (including the most recent one) must never satisfy a fresh assertion.
    this.actionSeq = this.recorder.seq + 1;
    this.lastActionSeq = this.actionSeq;
    this.actionPending = true;
  }

  markMatched(record) {
    this.consumed.add(record.seq);
    this.cursor = Math.max(this.cursor, record.seq);
    this.actionPending = false;
  }

  parsePayload(record) {
    if (!record.postData) {
      throw new StepFailure(
        `Request ${record.method} ${record.pathname} carried no JSON payload (postData absent)`,
        'PAYLOAD_UNAVAILABLE',
      );
    }
    try {
      return JSON.parse(record.postData);
    } catch {
      throw new StepFailure(
        `Request ${record.method} ${record.pathname} payload is not JSON`,
        'PAYLOAD_NOT_JSON',
      );
    }
  }

  candidateRecords(requestSpec) {
    const all = this.recorder
      .matching(requestSpec)
      .filter((record) => !this.consumed.has(record.seq));
    if (this.actionPending) return all.filter((record) => record.seq >= this.actionSeq);
    return all.filter((record) => record.seq > this.cursor || record.seq >= this.lastActionSeq);
  }

  async expectNetwork(step) {
    const timeoutMs = step.timeoutMs ?? NETWORK_ASSERT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    for (;;) {
      const candidates = this.candidateRecords(step.request);
      for (const record of [...candidates].reverse()) {
        try {
          const detail = await this.verifyRecord(record, step);
          this.markMatched(record);
          return {
            description: step.description,
            requestId: record.requestId,
            method: record.method,
            path: record.pathname,
            status: record.status,
            ...detail,
          };
        } catch (error) {
          if (error instanceof NotRunError) throw error;
          lastError = error;
        }
      }
      if (Date.now() >= deadline) break;
      await delay(100);
    }
    throw new StepFailure(
      `Network assertion failed: "${step.description}" — ${step.request.method} ${step.request.path}` +
        ` after ${timeoutMs}ms` +
        (lastError
          ? `; closest match error: ${lastError.message}`
          : '; no candidate request seen') +
        `; recent traffic: ${this.recorder.describeRecent()}`,
      'NETWORK_ASSERTION_FAILED',
    );
  }

  async verifyRecord(record, step) {
    const requestSpec = step.request;
    if (!this.recorder.statusMatches(record, requestSpec)) {
      const expected = requestSpec.status ?? `one of ${(requestSpec.statusAnyOf || []).join('/')}`;
      throw new StepFailure(
        `status mismatch for ${record.method} ${record.pathname}: expected ${expected} got ` +
          `${record.status ?? (record.failed ? `failed (${record.errorText})` : 'pending')}`,
        'NETWORK_STATUS_MISMATCH',
      );
    }
    const needsPayload =
      step.payloadContains !== undefined ||
      step.payloadMatches !== undefined ||
      step.payloadHasKeys !== undefined;
    const needsBody =
      step.responseContains !== undefined ||
      step.responseHasKeys !== undefined ||
      step.responseNumberAtLeast !== undefined ||
      step.absentKeys !== undefined;
    let payload = null;
    let body = null;
    if (needsPayload) payload = this.parsePayload(record);
    if (needsBody) body = await this.recorder.jsonOf(record);

    if (step.payloadHasKeys) {
      for (const path of step.payloadHasKeys) {
        const result = mustHavePath(payload, path);
        if (!result.found) {
          throw new StepFailure(
            `payload is missing required key '${path}' (top-level keys: ${Object.keys(payload).join(', ')})`,
            'PAYLOAD_KEY_MISSING',
          );
        }
      }
    }
    if (step.payloadContains) {
      for (const [path, expected] of Object.entries(step.payloadContains)) {
        const actual = readPath(payload, path);
        const verdict = matchExpectedValue(actual, expected);
        if (!verdict.ok) {
          throw new StepFailure(`payload '${path}': ${verdict.reason}`, 'PAYLOAD_MISMATCH');
        }
      }
    }
    if (step.payloadMatches) {
      for (const [path, spec] of Object.entries(step.payloadMatches)) {
        const verdict = matchShape(readPath(payload, path), spec);
        if (!verdict.ok) {
          throw new StepFailure(`payload '${path}': ${verdict.reason}`, 'PAYLOAD_SHAPE_MISMATCH');
        }
      }
    }
    if (step.responseHasKeys) {
      for (const path of step.responseHasKeys) {
        const result = mustHavePath(body, path);
        if (!result.found) {
          throw new StepFailure(
            `response is missing required key '${path}'`,
            'RESPONSE_KEY_MISSING',
          );
        }
      }
    }
    if (step.responseContains) {
      for (const [path, expected] of Object.entries(step.responseContains)) {
        const actual = readPath(body, path);
        const verdict = matchExpectedValue(actual, expected);
        if (!verdict.ok) {
          throw new StepFailure(`response '${path}': ${verdict.reason}`, 'RESPONSE_MISMATCH');
        }
      }
    }
    if (step.responseNumberAtLeast) {
      for (const [path, minimum] of Object.entries(step.responseNumberAtLeast)) {
        const actual = readPath(body, path);
        if (typeof actual !== 'number' || actual < minimum) {
          throw new StepFailure(
            `response '${path}': expected number >= ${minimum}, got ${describeValue(actual)}`,
            'RESPONSE_NUMBER_MISMATCH',
          );
        }
      }
    }
    if (step.absentKeys) {
      const flatKeys = collectKeyPaths(body);
      for (const key of step.absentKeys) {
        const hits = flatKeys.filter((entry) => entry.key === key);
        if (hits.length > 0) {
          throw new StepFailure(
            `response must not contain key '${key}' but it appears at ${hits.map((hit) => hit.path).join(', ')}`,
            'RESPONSE_FORBIDDEN_KEY',
          );
        }
      }
    }
    return {};
  }

  async expectRequestCount(step) {
    const timeoutMs = step.timeoutMs ?? NETWORK_ASSERT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    const evaluate = (count) => {
      if (step.count !== undefined) {
        if (count === step.count) return { pass: true };
        if (count > step.count)
          return {
            pass: false,
            fatal: true,
            reason: `expected exactly ${step.count}, got ${count}+`,
          };
        return { pass: false };
      }
      if (count > (step.max ?? Number.POSITIVE_INFINITY)) {
        return { pass: false, fatal: true, reason: `expected at most ${step.max}, got ${count}` };
      }
      if (count < (step.min ?? 0)) return { pass: false };
      return { pass: true };
    };
    // Absence assertions get a bounded settle window so a late second POST cannot slip through.
    await delay(REQUEST_COUNT_SETTLE_MS);
    for (;;) {
      const count = this.recorder.matching(step.request).length;
      const verdict = evaluate(count);
      if (verdict.pass) {
        await delay(500);
        const confirmed = this.recorder.matching(step.request).length;
        const confirmedVerdict = evaluate(confirmed);
        if (confirmedVerdict.pass) {
          return { description: step.description, count: confirmed };
        }
        if (confirmedVerdict.fatal) {
          throw new StepFailure(
            `Request count assertion failed: "${step.description}" — ${confirmedVerdict.reason}`,
            'REQUEST_COUNT_MISMATCH',
          );
        }
      } else if (verdict.fatal) {
        throw new StepFailure(
          `Request count assertion failed: "${step.description}" — ${verdict.reason}`,
          'REQUEST_COUNT_MISMATCH',
        );
      }
      if (Date.now() >= deadline) {
        throw new StepFailure(
          `Request count assertion failed: "${step.description}" — ${step.request.method} ${step.request.path}; ` +
            `expected ${step.count ?? `[${step.min ?? 0},${step.max ?? '∞'}]`} got ${count}; recent traffic: ${this.recorder.describeRecent()}`,
          'REQUEST_COUNT_MISMATCH',
        );
      }
      await delay(100);
    }
  }

  async expectReplayedRequest(step) {
    const timeoutMs = step.timeoutMs ?? NETWORK_ASSERT_TIMEOUT_MS;
    await waitUntil(() => this.recorder.matching(step.request).length >= step.count, {
      timeoutMs,
      intervalMs: 100,
      message:
        `Expected ${step.count} replayed ${step.request.method} ${step.request.path} requests, saw ` +
        `${this.recorder.matching(step.request).length}`,
    });
    await delay(750);
    const records = this.recorder.matching(step.request);
    if (records.length !== step.count) {
      throw new StepFailure(
        `Replay assertion failed: "${step.description}" — expected exactly ${step.count} requests, got ${records.length}`,
        'REPLAY_COUNT_MISMATCH',
      );
    }
    const payloads = records.map((record) => {
      try {
        return this.parsePayload(record);
      } catch (error) {
        throw new StepFailure(
          `Replay assertion could not read payload of ${record.requestId}: ${error.message}`,
          'REPLAY_PAYLOAD_UNAVAILABLE',
        );
      }
    });
    for (const field of step.sameFields) {
      const values = payloads.map((payload) => readPath(payload, field));
      const missingIndex = values.findIndex((value) => value === undefined);
      if (missingIndex >= 0) {
        throw new StepFailure(
          `Replay assertion: field '${field}' is missing from request #${missingIndex + 1}`,
          'REPLAY_FIELD_MISSING',
        );
      }
      for (let index = 1; index < values.length; index += 1) {
        if (!isDeepStrictEqual(values[0], values[index])) {
          throw new StepFailure(
            `Replay assertion failed: field '${field}' differs between request #1 (${describeValue(values[0])}) ` +
              `and request #${index + 1} (${describeValue(values[index])})`,
            'REPLAY_FIELD_MISMATCH',
          );
        }
      }
    }
    const latest = records[records.length - 1];
    this.markMatched(latest);
    return {
      description: step.description,
      count: records.length,
      requestIds: records.map((record) => record.requestId),
    };
  }

  async waitForNetwork(step) {
    const timeoutMs = step.timeoutMs ?? NETWORK_ASSERT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    for (;;) {
      const candidates = this.candidateRecords(step.request);
      for (const record of [...candidates].reverse()) {
        try {
          if (!this.recorder.statusMatches(record, step.request)) {
            throw new StepFailure(
              `status mismatch (got ${record.status ?? (record.failed ? 'failed' : 'pending')})`,
            );
          }
          let selected = null;
          if (step.select) {
            const body = await this.recorder.jsonOf(record);
            const rows = readPath(body, step.select.path);
            if (!Array.isArray(rows)) {
              throw new StepFailure(`select path '${step.select.path}' is not an array`);
            }
            const want = step.select.where.equals;
            const row = rows.find((entry) => {
              const actual = readPath(entry, step.select.where.field);
              if (actual === want) return true;
              return actual !== undefined && want !== undefined && String(actual) === String(want);
            });
            if (!row)
              throw new StepFailure(
                `no row where ${step.select.where.field} equals the expected value`,
              );
            selected = readPath(row, step.select.then);
            if (step.notNull && (selected === null || selected === undefined)) {
              throw new StepFailure(`selected value '${step.select.then}' is still null`);
            }
          }
          this.markMatched(record);
          return {
            description: step.description,
            requestId: record.requestId,
            status: record.status,
            selected,
          };
        } catch (error) {
          if (error instanceof NotRunError) throw error;
          lastError = error;
        }
      }
      if (Date.now() >= deadline) {
        throw new StepFailure(
          `waitForNetwork failed: "${step.description}" — ${step.request.method} ${step.request.path}` +
            (lastError ? `; ${lastError.message}` : '; no candidate request') +
            `; recent traffic: ${this.recorder.describeRecent()}`,
          'WAIT_FOR_NETWORK_FAILED',
        );
      }
      await delay(100);
    }
  }

  async capture(step) {
    const timeoutMs = NETWORK_ASSERT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    for (;;) {
      const records = this.recorder.matching(step.from);
      for (const record of [...records].reverse()) {
        try {
          const body = await this.recorder.jsonOf(record);
          let value;
          if (step.pick) {
            value = readPath(body, step.pick);
            if (value === undefined) {
              throw new StepFailure(
                `pick path '${step.pick}' is missing in ${record.method} ${record.pathname}`,
              );
            }
          } else {
            const rows = readPath(body, step.select.path);
            if (!Array.isArray(rows)) {
              throw new StepFailure(`select path '${step.select.path}' is not an array`);
            }
            const want = step.select.where.equals;
            const row = rows.find((entry) => {
              const actual = readPath(entry, step.select.where.field);
              if (actual === want) return true;
              return actual !== undefined && want !== undefined && String(actual) === String(want);
            });
            if (!row)
              throw new StepFailure(
                `no row where ${step.select.where.field} matches in ${record.pathname}`,
              );
            value = readPath(row, step.select.then);
            if (value === undefined) {
              throw new StepFailure(`select.then path '${step.select.then}' is missing`);
            }
          }
          if (value === null) throw new StepFailure(`captured value for ${step.name} is null`);
          return { value, requestId: record.requestId, path: record.pathname };
        } catch (error) {
          if (error instanceof NotRunError) throw error;
          lastError = error;
        }
      }
      if (Date.now() >= deadline) {
        throw new StepFailure(
          `Capture ${step.name} failed from ${step.from.method} ${step.from.path}: ` +
            (lastError?.message || 'no matching response body') +
            `; recent traffic: ${this.recorder.describeRecent()}`,
          'CAPTURE_FAILED',
        );
      }
      await delay(100);
    }
  }
}

// ─── fixture-assert service client (safe persisted-effect assertion; never an app backdoor) ─
class FixtureAssertClient {
  constructor({ url, token, scenarioId, runId, timeoutMs = FIXTURE_ASSERT_TIMEOUT_MS }) {
    this.url = url;
    this.token = token;
    this.scenarioId = scenarioId;
    this.runId = runId;
    this.timeoutMs = timeoutMs;
  }

  async assert(key, params = {}) {
    const body = { key, params, scenarioId: this.scenarioId, runId: this.runId };
    let response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new NotRunError(
        `fixture-assert service unreachable at ${this.url} for key ${key}: ` +
          (error.name === 'TimeoutError' ? `timeout after ${this.timeoutMs}ms` : error.message),
      );
    }
    const text = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new NotRunError(
        `fixture-assert service rejected P3_FIXTURE_ASSERT_TOKEN (HTTP ${response.status})`,
      );
    }
    if (response.status >= 500) {
      throw new NotRunError(
        `fixture-assert service error for key ${key} (HTTP ${response.status})`,
      );
    }
    if (!response.ok) {
      throw new StepFailure(
        `fixture-assert ${key} returned HTTP ${response.status}: ${safeSnippet(text)}`,
        'FIXTURE_ASSERT_HTTP',
      );
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new StepFailure(
        `fixture-assert ${key} response is not JSON: ${safeSnippet(text)}`,
        'FIXTURE_ASSERT_NOT_JSON',
      );
    }
    if (payload?.ok !== true) {
      throw new StepFailure(
        `fixture-assert ${key} was not confirmed (expected {ok:true}): ${safeSnippet(JSON.stringify(payload))}`,
        'FIXTURE_ASSERT_REJECTED',
      );
    }
    if (payload.runId !== this.runId) {
      throw new StepFailure(
        `fixture-assert ${key} answered for run ${String(payload.runId)} instead of ${this.runId}; refusing cross-run evidence`,
        'FIXTURE_ASSERT_RUN_MISMATCH',
      );
    }
    return { key, confirmed: true };
  }
}

// ─── scenario executor: interpolates steps, drives the page, asserts live network/effects ───
class ScenarioExecutor {
  constructor({
    scenario,
    page,
    recorder,
    verifier,
    variables,
    artifacts,
    fixtureAssertUrl,
    fixtureAssertToken,
    runId,
    workspaceSlug,
    traceSink,
    traceNetwork = false,
  }) {
    this.scenario = scenario;
    this.page = page;
    this.recorder = recorder;
    this.verifier = verifier;
    this.variables = variables;
    this.artifacts = artifacts;
    this.fixtureAssertUrl = fixtureAssertUrl;
    this.fixtureAssertToken = fixtureAssertToken;
    this.runId = runId;
    this.workspaceSlug = workspaceSlug;
    this.traceSink = traceSink;
    this.traceNetwork = traceNetwork;
    this.startedAt = nowIso();
    this.startedMs = Date.now();
    this.result = {
      id: scenario.id,
      title: scenario.title,
      screen: scenario.screen,
      version: scenario.version,
      covers: scenario.covers,
      roles: (scenario.actors || []).map((actor) => `${actor.role}@${actor.actorScope}`),
      dependsOn: scenario.dependsOn || [],
      status: 'FAIL',
      startedAt: this.startedAt,
      durationMs: 0,
      steps: [],
      screenshots: [],
      fixtureAsserts: [],
      requestIds: [],
      consoleErrors: [],
      error: null,
    };
  }

  credentialFor(role) {
    const email = readEnv(`P3_${role}_EMAIL`);
    const password = readEnv(`P3_${role}_PASSWORD`);
    if (!email || !password) {
      throw new NotRunError(
        `Missing credentials for role ${role}: set P3_${role}_EMAIL and P3_${role}_PASSWORD (values are never logged)`,
      );
    }
    return { email, password };
  }

  async run() {
    try {
      await this.page.setLocale('vi');
      for (const [index, rawStep] of this.scenario.steps.entries()) {
        if (Date.now() - this.startedMs > SCENARIO_TIMEOUT_MS) {
          throw new StepFailure(
            `Scenario ${this.scenario.id} exceeded the ${SCENARIO_TIMEOUT_MS}ms budget at step ${index}`,
            'SCENARIO_TIMEOUT',
          );
        }
        const step = this.variables.interpolateValue(rawStep, this.scenario);
        const started = Date.now();
        const traceRecord = {
          at: nowIso(),
          runId: this.runId,
          scenarioId: this.scenario.id,
          step: index,
          kind: step.kind,
          description: step.description || step.name || undefined,
        };
        if (ACTION_STEP_KINDS.has(step.kind)) this.verifier.noteAction();
        try {
          const detail = await this.dispatch(step);
          const durationMs = Date.now() - started;
          if (step.kind === 'login') {
            // Fresh segment after authentication: previous-session traffic must not satisfy asserts.
            this.recorder.reset();
            this.verifier.reset();
          }
          const stepResult = {
            step: index,
            kind: step.kind,
            ok: true,
            durationMs,
            detail: sanitizeDetail(detail),
          };
          this.result.steps.push(stepResult);
          this.result.requestIds.push(...collectRequestIds(detail));
          this.traceSink.push({ ...traceRecord, ok: true, durationMs });
          if (this.traceNetwork) this.pushNetworkTrace(traceRecord);
          continue;
        } catch (error) {
          const durationMs = Date.now() - started;
          const stepResult = {
            step: index,
            kind: step.kind,
            ok: false,
            durationMs,
            code: error.code || 'ERROR',
            error: safeSnippet(error.message, 1000),
          };
          this.result.steps.push(stepResult);
          this.traceSink.push({ ...traceRecord, ok: false, durationMs, code: stepResult.code });
          throw Object.assign(error, { stepIndex: index, stepKind: step.kind });
        }
      }
      this.result.status = 'PASS';
    } catch (error) {
      if (error instanceof NotRunError) {
        this.result.status = 'NOT RUN';
        this.result.error = {
          code: 'NOT_RUN',
          message: safeSnippet(error.message, 1000),
          step: error.stepIndex ?? null,
          kind: error.stepKind ?? null,
        };
      } else {
        this.result.status = 'FAIL';
        this.result.error = {
          code: error.code || 'ERROR',
          message: safeSnippet(error.message, 1500),
          step: error.stepIndex ?? null,
          kind: error.stepKind ?? null,
        };
      }
      const failureName = `failure-${this.scenario.id}`;
      try {
        const shot = await this.page.screenshot(failureName);
        this.result.screenshots.push({
          name: failureName,
          file: basename(shot.filePath),
          bytes: shot.bytes,
        });
      } catch {
        // Failure evidence is best effort; the FAIL status and error message are authoritative.
      }
    } finally {
      this.result.durationMs = Date.now() - this.startedMs;
      this.result.consoleErrors = [...(this.page.consoleErrors || [])];
      this.result.finishedAt = nowIso();
      this.result.fixtureAsserts = this.result.steps
        .filter((entry) => entry.kind === 'fixtureAssert' && entry.ok)
        .map((entry) => entry.detail?.key)
        .filter(Boolean);
    }
    return this.result;
  }

  async dispatch(step) {
    switch (step.kind) {
      case 'login':
        return this.page.login({
          role: step.role,
          credentials: this.credentialFor(step.role),
          workspaceSlug: this.workspaceSlug,
        });
      case 'logout':
        return this.page.logout();
      case 'goto':
        return this.goto(step);
      case 'click':
        return this.page.click(step.target, {
          within: step.within || null,
          index: step.index ?? 0,
        });
      case 'fill':
        return this.page.fill(step.target, {
          within: step.within || null,
          index: step.index ?? 0,
          value: step.value,
        });
      case 'select':
        return this.page.select(step.target, {
          within: step.within || null,
          index: step.index ?? 0,
          option: step.option,
        });
      case 'upload':
        return this.upload(step);
      case 'waitFor':
        return this.page.waitForTarget(step.target, {
          within: step.within || null,
          index: step.index ?? 0,
          timeoutMs: step.timeoutMs ?? ACTION_TIMEOUT_MS,
        });
      case 'wait':
        await delay(step.ms);
        return { waitedMs: step.ms };
      case 'reload':
        await this.page.reload();
        return { url: await this.page.currentUrl() };
      case 'fault':
        return this.applyFault(step);
      case 'capture': {
        const captured = await this.verifier.capture(step);
        this.variables.set(step.name, captured.value);
        return {
          name: step.name,
          requestId: captured.requestId,
          path: captured.path,
          valuePreview: describeValue(captured.value),
        };
      }
      case 'expectNetwork':
        return this.verifier.expectNetwork(step);
      case 'expectRequestCount':
        return this.verifier.expectRequestCount(step);
      case 'expectReplayedRequest':
        return this.verifier.expectReplayedRequest(step);
      case 'expectText':
        return this.expectText(step);
      case 'expectHidden':
        return this.expectHidden(step);
      case 'expectUrl':
        return this.expectUrl(step);
      case 'expectDownload':
        return this.expectDownload(step);
      case 'waitForNetwork':
        return this.verifier.waitForNetwork(step);
      case 'fixtureAssert':
        return this.fixtureAssert(step);
      case 'screenshot': {
        const shot = await this.page.screenshot(step.name);
        this.result.screenshots.push({
          name: step.name,
          file: basename(shot.filePath),
          bytes: shot.bytes,
        });
        return { name: step.name, file: basename(shot.filePath), bytes: shot.bytes };
      }
      default:
        throw new UnsupportedStepError(
          `Step kind '${step.kind}' is not implemented by the harness`,
        );
    }
  }

  pushNetworkTrace(traceRecord) {
    this.traceSink.push({
      at: nowIso(),
      runId: this.runId,
      scenarioId: this.scenario.id,
      step: traceRecord.step,
      kind: 'network-snapshot',
      records: this.recorder.records.slice(-12).map((record) => ({
        requestId: record.requestId,
        method: record.method,
        path: record.pathname,
        status: record.status,
        failed: record.failed,
      })),
    });
  }

  async goto(step) {
    const targetUrl = new URL(step.path, this.page.feUrl).toString();
    if (!this.page.isAllowedRequestUrl(targetUrl))
      throw new StepFailure(
        `goto target ${targetUrl} is outside the disposable allowlist`,
        'NAVIGATION_ORIGIN_BLOCKED',
      );
    await this.page.navigate(targetUrl);
    const landedUrl = await this.page.currentUrl();
    if (!this.page.isAllowedRequestUrl(landedUrl))
      throw new StepFailure(
        `navigation landed on ${landedUrl} outside the disposable allowlist`,
        'NAVIGATION_ORIGIN_BLOCKED',
      );
    if (step.waitForText !== undefined) {
      const expected = step.waitForText;
      await waitUntil(
        async () => {
          const text = await this.page.bodyText();
          if (expected instanceof RegExp) return expected.test(text);
          return text.includes(expected);
        },
        {
          timeoutMs: ACTION_TIMEOUT_MS,
          intervalMs: 150,
          message: `goto ${step.path} did not render expected text ${String(expected)}`,
        },
      );
    }
    return { path: step.path, url: await this.page.currentUrl() };
  }

  async upload(step) {
    const evidence = this.artifacts.evidence;
    await this.page.upload(step.target, {
      within: step.within || null,
      index: step.index ?? 0,
      filePath: evidence.path,
    });
    this.variables.evidence = {
      sha256: evidence.sha256,
      fileSizeBytes: evidence.fileSizeBytes,
    };
    return {
      sha256: evidence.sha256,
      fileSizeBytes: evidence.fileSizeBytes,
      fileName: basename(evidence.path),
    };
  }

  async applyFault(step) {
    const mode = step.mode;
    if (mode === 'block') {
      // The same Fetch pause enforces the disposable origin allowlist for every request; a fault
      // can never disable that guard. Blocked requests never reach the server.
      this.page.setFetchBlock(step.urlPattern);
      this.faultBackend = 'Fetch.failRequest';
      return { mode, via: this.faultBackend, urlPattern: step.urlPattern };
    }
    if (mode === 'unblock') {
      this.page.setFetchBlock(null);
      this.faultBackend = null;
      return { mode, via: 'Fetch.continueRequest' };
    }
    if (mode === 'offline' || mode === 'online') {
      await this.page.send('Network.emulateNetworkConditions', {
        offline: mode === 'offline',
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      this.faultBackend = mode === 'offline' ? 'Network.emulateNetworkConditions' : null;
      return { mode, via: 'Network.emulateNetworkConditions' };
    }
    throw new UnsupportedStepError(`fault mode '${mode}' is not supported`);
  }

  async enableFetchBlock(urlPattern) {
    this.unsubscribeFetchPaused = this.page.on('Fetch.requestPaused', (params) => {
      const url = params.request?.url || '';
      const wildcard = urlPattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      const matches =
        new RegExp(`^${wildcard}$`).test(url) || url.includes(urlPattern.replaceAll('*', ''));
      if (matches) {
        void this.page
          .send('Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'ConnectionBlocked',
          })
          .catch(() => {});
      } else {
        void this.page
          .send('Fetch.continueRequest', { requestId: params.requestId })
          .catch(() => {});
      }
    });
    await this.page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }],
    });
  }

  async expectText(step) {
    const timeoutMs = step.timeoutMs ?? ACTION_TIMEOUT_MS;
    const matcher =
      step.contains !== undefined
        ? (text) => text.includes(step.contains)
        : (text) => new RegExp(step.matches).test(text);
    try {
      await waitUntil(
        async () => {
          const text = step.target
            ? await this.page.elementText(step.target)
            : await this.page.bodyText();
          return matcher(text);
        },
        {
          timeoutMs,
          intervalMs: 150,
          message: `Text assertion failed: "${step.description}"`,
        },
      );
    } catch (error) {
      const snippet = safeSnippet(await this.page.bodyText().catch(() => ''), 700);
      throw new StepFailure(
        `Text assertion failed: "${step.description}"${step.contains ? ` (contains: ${step.contains})` : ` (matches: ${step.matches})`}` +
          `; page text: ${snippet}`,
        'TEXT_ASSERTION_FAILED',
      );
    }
    return { description: step.description };
  }

  async expectHidden(step) {
    const timeoutMs = step.timeoutMs ?? ACTION_TIMEOUT_MS;
    let lastProbe = null;
    await waitUntil(
      async () => {
        lastProbe = await this.page.probe(step.target);
        return lastProbe && lastProbe.visibleMatches === 0;
      },
      {
        timeoutMs,
        intervalMs: 150,
        message: `Hidden assertion failed: "${step.description}"`,
      },
    ).catch(() => {
      throw new StepFailure(
        `Hidden assertion failed: "${step.description}" — target is still visible` +
          (lastProbe ? ` (matches=${lastProbe.matches} visible=${lastProbe.visibleMatches})` : ''),
        'HIDDEN_ASSERTION_FAILED',
      );
    });
    return { description: step.description };
  }

  async expectUrl(step) {
    const timeoutMs = step.timeoutMs ?? ACTION_TIMEOUT_MS;
    let lastUrl = '';
    await waitUntil(
      async () => {
        lastUrl = await this.page.currentUrl();
        return lastUrl.includes(step.contains);
      },
      {
        timeoutMs,
        intervalMs: 120,
        message: `URL assertion failed: "${step.description}"`,
      },
    ).catch(() => {
      throw new StepFailure(
        `URL assertion failed: "${step.description}" — expected '${step.contains}' in ${lastUrl}`,
        'URL_ASSERTION_FAILED',
      );
    });
    return { description: step.description, url: lastUrl };
  }

  async expectDownload(step) {
    const timeoutMs = step.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    for (;;) {
      const file = await this.findDownloadedFile(step.fileNamePattern);
      if (file) {
        try {
          const content = await readFile(file.path, 'utf8');
          const summary = this.validateCsv(step, content, file.name);
          return {
            description: step.description,
            source: 'download-directory',
            file: file.name,
            ...summary,
          };
        } catch (error) {
          lastError = error;
        }
      }
      const networkFile = await this.findNetworkDownload(step.fileNamePattern);
      if (networkFile) {
        try {
          const summary = this.validateCsv(step, networkFile.text, networkFile.name);
          return {
            description: step.description,
            source: 'network-response-body',
            requestId: networkFile.requestId,
            file: networkFile.name,
            ...summary,
          };
        } catch (error) {
          lastError = error;
        }
      }
      if (Date.now() >= deadline) {
        const files = await readdirSafe(this.artifacts.downloadDir);
        throw new StepFailure(
          `Download assertion failed: "${step.description}" — no CSV matching ${step.fileNamePattern} after ${timeoutMs}ms` +
            `; download dir files: [${files.join(', ')}]` +
            (lastError ? `; last content error: ${lastError.message}` : ''),
          'DOWNLOAD_FAILED',
        );
      }
      await delay(200);
    }
  }

  async findDownloadedFile(fileNamePattern) {
    const regex = new RegExp(fileNamePattern);
    const names = await readdirSafe(this.artifacts.downloadDir);
    const candidates = [];
    for (const name of names) {
      if (name.endsWith('.crdownload') || !regex.test(name)) continue;
      const path = join(this.artifacts.downloadDir, name);
      try {
        const first = await stat(path);
        if (!first.isFile() || first.size === 0) continue;
        candidates.push({ path, name, size: first.size, mtimeMs: first.mtimeMs });
      } catch {
        // File disappeared mid-scan (download rename); retry on the next poll.
      }
    }
    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
    for (const candidate of candidates) {
      const before = await stat(candidate.path).catch(() => null);
      await delay(120);
      const after = await stat(candidate.path).catch(() => null);
      if (before && after && before.size === after.size && after.size === candidate.size) {
        return candidate;
      }
    }
    return null;
  }

  async findNetworkDownload(fileNamePattern) {
    const regex = new RegExp(fileNamePattern);
    const records = this.recorder.records.filter((record) => record.finished).reverse();
    for (const record of records) {
      const headers = record.responseHeaders || {};
      const disposition = String(
        headers['content-disposition'] || headers['Content-Disposition'] || '',
      );
      const mime = String(record.mimeType || '');
      const looksLikeFile =
        disposition.includes('attachment') ||
        mime.includes('text/csv') ||
        mime.includes('application/csv');
      if (!looksLikeFile) continue;
      const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const name = (nameMatch?.[1] || basename(record.pathname)).trim();
      if (!regex.test(name)) continue;
      try {
        return { name, text: await this.recorder.textOf(record), requestId: record.requestId };
      } catch {
        // Try an older exported response; the step-level timeout bounds the search.
      }
    }
    return null;
  }

  validateCsv(step, rawContent, fileName) {
    const content = String(rawContent || '').replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      throw new StepFailure(`Downloaded ${fileName} is empty`, 'DOWNLOAD_EMPTY');
    }
    const header = lines[0].trim();
    if (step.header !== undefined && header !== step.header) {
      throw new StepFailure(
        `Downloaded ${fileName} header mismatch: expected '${step.header}' got '${header}'`,
        'DOWNLOAD_HEADER_MISMATCH',
      );
    }
    const rows = lines.slice(1);
    if (rows.length === 0) {
      throw new StepFailure(
        `Downloaded ${fileName} has a header but no data rows`,
        'DOWNLOAD_NO_ROWS',
      );
    }
    if (step.requireMasked) {
      const cells = rows.flatMap((row) =>
        row.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')),
      );
      const unmasked = cells.filter((cell) => /^\+?\d{9,12}$/.test(cell));
      if (unmasked.length > 0) {
        throw new StepFailure(
          `Downloaded ${fileName} contains ${unmasked.length} unmasked phone-like cell(s)`,
          'DOWNLOAD_PII_UNMASKED',
        );
      }
      if (!rows.some((row) => row.includes('*'))) {
        throw new StepFailure(
          `Downloaded ${fileName} has no masked cell marker`,
          'DOWNLOAD_NOT_MASKED',
        );
      }
    }
    return { header, rows: rows.length };
  }

  async fixtureAssert(step) {
    const client = new FixtureAssertClient({
      url: this.fixtureAssertUrl,
      token: this.fixtureAssertToken,
      scenarioId: this.scenario.id,
      runId: this.runId,
    });
    return client.assert(step.key, step.params || {});
  }
}

const sanitizeDetail = (detail) => {
  if (detail === null || detail === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(detail));
  } catch {
    return undefined;
  }
};

const collectRequestIds = (detail) => {
  if (!detail || typeof detail !== 'object') return [];
  const ids = [];
  if (typeof detail.requestId === 'string') ids.push(detail.requestId);
  if (Array.isArray(detail.requestIds))
    ids.push(...detail.requestIds.filter((id) => typeof id === 'string'));
  return ids;
};

const readdirSafe = async (path) => {
  try {
    return (await readdir(path)).sort();
  } catch {
    return [];
  }
};

// ─── browser launch + disposable context lifecycle ─────────────────────────────────────────
async function launchBrowser(binaryPath, profileDir) {
  const isHeadlessShell = /headless[_-]shell/i.test(binaryPath);
  const args = [
    ...(isHeadlessShell ? [] : ['--headless=new']),
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-extensions',
    '--mute-audio',
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--force-device-scale-factor=1',
    'about:blank',
  ];
  const child = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderrLines = [];
  child.stderr.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (!line.trim()) continue;
      stderrLines.push(line.trim());
      if (stderrLines.length > 80) stderrLines.shift();
    }
  });
  child.stdout.on('data', () => {});
  let spawnError = null;
  child.once('error', (error) => {
    spawnError = error;
  });
  const exited = new Promise((resolvePromise) => {
    child.once('exit', (code, signal) => resolvePromise({ code, signal }));
  });
  return {
    child,
    exited,
    binaryPath,
    stderrTail: () => stderrLines.join('\n'),
    spawnError: () => spawnError,
  };
}

async function waitForDevToolsEndpoint(
  profileDir,
  { launched, timeoutMs = BROWSER_START_TIMEOUT_MS },
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (launched.spawnError()) {
      throw new NotRunError(`Chrome could not be spawned: ${launched.spawnError().message}`);
    }
    const info = readDevtoolsPort(profileDir);
    if (info) {
      if (info.browserWsPath) {
        return { port: info.port, wsUrl: `ws://127.0.0.1:${info.port}${info.browserWsPath}` };
      }
      try {
        const response = await fetch(`http://127.0.0.1:${info.port}/json/version`, {
          signal: AbortSignal.timeout(2_000),
        });
        const payload = await response.json();
        if (payload?.webSocketDebuggerUrl) {
          return { port: info.port, wsUrl: payload.webSocketDebuggerUrl };
        }
      } catch {
        // DevToolsActivePort exists but the endpoint is not ready yet.
      }
    }
    const exited = await Promise.race([
      launched.exited.then(() => true),
      delay(50).then(() => false),
    ]);
    if (exited) {
      throw new NotRunError(
        `Chrome exited before the CDP endpoint became available.\n${launched.stderrTail()}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new NotRunError(
        `CDP endpoint was not available after ${timeoutMs}ms (DevToolsActivePort missing).\n${launched.stderrTail()}`,
      );
    }
    await delay(100);
  }
}

async function createScenarioBrowserContext(browserCdp, { downloadDir }) {
  const created = await browserCdp.send('Target.createBrowserContext', {
    disposeOnDetach: false,
  });
  const browserContextId = created.browserContextId;
  if (!browserContextId)
    throw new NotRunError('CDP Target.createBrowserContext returned no browserContextId');
  try {
    await browserCdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
      eventsEnabled: true,
      browserContextId,
    });
  } catch {
    // Fallback for protocol revisions without per-context download behaviour.
    try {
      await browserCdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
      });
    } catch {
      // Page-level fallback is attempted in PageSession when the context is created.
    }
  }
  const target = await browserCdp.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId,
  });
  const attached = await browserCdp.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  });
  if (!attached.sessionId) throw new NotRunError('CDP Target.attachToTarget returned no sessionId');
  return {
    browserContextId,
    targetId: target.targetId,
    sessionId: attached.sessionId,
    downloadDir,
  };
}

async function disposeScenarioBrowserContext(browserCdp, context) {
  if (!context) return;
  try {
    await browserCdp.send('Target.disposeBrowserContext', {
      browserContextId: context.browserContextId,
    });
  } catch {
    try {
      await browserCdp.send('Target.closeTarget', { targetId: context.targetId });
    } catch {
      // Context disposal is cleanup; a dead browser is handled by the run cleanup.
    }
  }
}

function baseScenarioResult(scenario, error) {
  const notRun = error instanceof NotRunError;
  return {
    id: scenario.id,
    title: scenario.title,
    screen: scenario.screen,
    version: scenario.version,
    covers: scenario.covers,
    roles: (scenario.actors || []).map((actor) => `${actor.role}@${actor.actorScope}`),
    dependsOn: scenario.dependsOn || [],
    status: notRun ? 'NOT RUN' : 'FAIL',
    startedAt: nowIso(),
    finishedAt: nowIso(),
    durationMs: 0,
    steps: [],
    screenshots: [],
    fixtureAsserts: [],
    requestIds: [],
    consoleErrors: [],
    error: {
      code: error?.code || 'ERROR',
      message: safeSnippet(error?.message || String(error), 1500),
    },
  };
}

async function runScenarioInBrowser({ scenario, browserCdp, runId, runCtx, config }) {
  const scenarioStarted = Date.now();
  const downloadDir = join(runCtx.artifacts.runDir, 'downloads', scenario.id);
  await mkdir(downloadDir, { recursive: true });
  let context = null;
  let page = null;
  try {
    for (const precondition of scenario.preconditions || []) {
      if (precondition.kind !== 'env') continue;
      const name = precondition.name;
      if (name.endsWith('_EMAIL') || name.endsWith('_PASSWORD')) continue;
      if (!readEnv(name)) {
        throw new NotRunError(
          `Scenario precondition not met: ${name} is not set` +
            (precondition.description ? ` — ${precondition.description}` : ''),
        );
      }
      if (name === 'P3_N8N_OFFLINE' && !isTruthyEnv(name)) {
        throw new NotRunError(
          'Scenario precondition not met: P3_N8N_OFFLINE must be enabled (truthy) for the n8n outage scenario',
        );
      }
    }

    context = await createScenarioBrowserContext(browserCdp, { downloadDir });
    page = new PageSession({
      cdp: browserCdp,
      sessionId: context.sessionId,
      feUrl: config.feUrl,
      artifacts: { runDir: runCtx.artifacts.runDir, downloadDir },
      allowedOrigins: config.allowedOrigins || [],
    });
    await page.init();
    const recorder = new NetworkRecorder(page);
    recorder.attach();
    page.recorder = recorder;
    const verifier = new NetworkVerifier(recorder, { scenarioId: scenario.id });
    const executor = new ScenarioExecutor({
      scenario,
      page,
      recorder,
      verifier,
      variables: runCtx.variables,
      artifacts: runCtx.artifacts,
      fixtureAssertUrl: config.fixtureAssertUrl,
      fixtureAssertToken: config.fixtureAssertToken,
      runId,
      workspaceSlug: config.workspaceSlug,
      traceSink: runCtx.trace,
      traceNetwork: config.traceNetwork === true,
    });
    const result = await executor.run();
    if (page.networkViolations.length > 0) {
      const unique = [...new Set(page.networkViolations.map((entry) => entry.url))];
      throw new StepFailure(
        `${page.networkViolations.length} request(s) outside the disposable allowlist were blocked: ${unique.join(', ')}`,
        'NETWORK_ORIGIN_BLOCKED',
      );
    }
    result.durationMs = Date.now() - scenarioStarted;
    recorder.detach();
    await page.close();
    await writeFile(
      join(runCtx.artifacts.runDir, `scenario-${scenario.id}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    return result;
  } catch (error) {
    const result = baseScenarioResult(scenario, error);
    result.durationMs = Date.now() - scenarioStarted;
    if (page?.consoleErrors?.length) result.consoleErrors = [...page.consoleErrors];
    await writeFile(
      join(runCtx.artifacts.runDir, `scenario-${scenario.id}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    return result;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browserCdp && context) await disposeScenarioBrowserContext(browserCdp, context);
  }
}

// ─── connected run orchestration ────────────────────────────────────────────────────────────
function printNotRun(reasons) {
  console.log('');
  console.log(
    'NOT RUN — connected environment is not ready; no browser was launched and no PASS was recorded.',
  );
  for (const reason of reasons) console.log(`  - ${reason}`);
  console.log('Fix the disposable C11 environment (or the credential env names) and rerun.');
  console.log('This is a NOT RUN result (exit 2), not a skipped PASS.');
}

function readOptionalSha(name) {
  const value = readEnv(name);
  return value || 'UNRECORDED';
}

/** `--check-env`: validate the disposable lock without launching a browser or touching fixtures. */
function runEnvironmentCheck() {
  const feUrl = readEnv('P3_FE_URL') || DEFAULT_FE_URL;
  const apiUrl = readEnv('P3_API_URL');
  const fixtureAssertUrl = readEnv('P3_FIXTURE_ASSERT_URL');
  const artifactsBase = readEnv('P3_ARTIFACTS_DIR')
    ? resolve(REPO_ROOT, readEnv('P3_ARTIFACTS_DIR'))
    : join(REPO_ROOT, 'artifacts', 'p3-connected');
  const issues = validateDisposableEnvironment({
    feUrl,
    apiUrl,
    fixtureAssertUrl,
    disposable: readEnv('P3_DISPOSABLE'),
    runId: readEnv('P3_RUN_ID'),
    artifactsBase,
  });
  if (issues.length > 0) {
    printNotRun(issues);
    return 2;
  }
  console.log('PASS — disposable C08 environment lock is valid');
  console.log(`  runId ${readEnv('P3_RUN_ID')}`);
  console.log(`  FE ${feUrl}`);
  console.log(`  API ${apiUrl}`);
  console.log(`  fixture-assert ${fixtureAssertUrl}`);
  console.log(
    `  allowed origins ${allowedOriginsFor({ feUrl, apiUrl, fixtureAssertUrl }).join(', ')}`,
  );
  return 0;
}

/** Deterministic self-test of the P1 allowlist/environment lock (no browser, no env needed). */
function runLockSelfTest() {
  const origins = ['http://127.0.0.1:2324', 'http://127.0.0.1:3000', 'http://127.0.0.1:3999'];
  const artifactsBase = join(REPO_ROOT, 'artifacts', 'p3-connected');
  const baseEnv = {
    feUrl: 'http://127.0.0.1:2324',
    apiUrl: 'http://127.0.0.1:3000',
    fixtureAssertUrl: 'http://127.0.0.1:3999',
    disposable: '1',
    runId: 'run-20261113-01',
    artifactsBase,
  };
  const checks = [
    [
      'allowed FE origin',
      isAllowedNetworkUrl('http://127.0.0.1:2324/v1/warehouses', origins) === true,
    ],
    [
      'allowed API origin',
      isAllowedNetworkUrl('http://127.0.0.1:3000/api/v1/shipments', origins) === true,
    ],
    [
      'allowed configured localhost origin',
      isAllowedNetworkUrl('http://localhost:3000/api', ['http://localhost:3000']) === true,
    ],
    [
      'blocks unconfigured host alias on same port',
      isAllowedNetworkUrl('http://localhost:3000/api', origins) === false,
    ],
    ['allowed FE websocket', isAllowedNetworkUrl('ws://127.0.0.1:2324/?token=x', origins) === true],
    ['allowed data URL', isAllowedNetworkUrl('data:image/png;base64,AAAA', origins) === true],
    ['blocks external https', isAllowedNetworkUrl('https://evil.example/steal', origins) === false],
    ['blocks LAN IP', isAllowedNetworkUrl('http://192.168.1.5:3000/api', origins) === false],
    [
      'blocks loopback wrong port',
      isAllowedNetworkUrl('http://127.0.0.1:9999/api', origins) === false,
    ],
    ['blocks non-http scheme', isAllowedNetworkUrl('ftp://127.0.0.1/resource', origins) === false],
    ['blocks relative/absent URL', isAllowedNetworkUrl('', origins) === false],
    ['valid disposable environment passes', validateDisposableEnvironment(baseEnv).length === 0],
    [
      'rejects non-disposable marker',
      validateDisposableEnvironment({ ...baseEnv, disposable: '0' }).length === 1,
    ],
    [
      'rejects unsafe run id',
      validateDisposableEnvironment({ ...baseEnv, runId: '../other-run' }).length === 1,
    ],
    [
      'rejects external API origin',
      validateDisposableEnvironment({ ...baseEnv, apiUrl: 'https://evil.example' }).length === 1,
    ],
    [
      'rejects artifacts outside repo',
      validateDisposableEnvironment({ ...baseEnv, artifactsBase: '/tmp/p3-artifacts' }).length ===
        1,
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log('');
  if (failed.length > 0) {
    console.error(`LOCK SELF-TEST: FAIL (${failed.length}/${checks.length})`);
    return 1;
  }
  console.log(`LOCK SELF-TEST: PASS (${checks.length} checks, no browser launched)`);
  return 0;
}

async function runConnected(options) {
  let ordered;
  try {
    const targetIds = options.scenario ? scenarioClosureIds(options.scenario) : null;
    ordered = orderSelectedScenarios(SCENARIOS, { selectedIds: targetIds });
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`error: ${error.message}`);
      return 2;
    }
    throw error;
  }

  const envRequirements = collectEnvironmentRequirements(ordered);
  const feUrl = readEnv('P3_FE_URL') || DEFAULT_FE_URL;
  const apiUrl = readEnv('P3_API_URL');
  const fixtureAssertUrl = readEnv('P3_FIXTURE_ASSERT_URL');
  const fixtureAssertToken = readEnv('P3_FIXTURE_ASSERT_TOKEN');
  const workspaceSlug = readEnv('P3_LOGIN_WORKSPACE_SLUG');
  const disposable = readEnv('P3_DISPOSABLE');
  const requestedRunId = readEnv('P3_RUN_ID');
  const artifactsBase = readEnv('P3_ARTIFACTS_DIR')
    ? resolve(REPO_ROOT, readEnv('P3_ARTIFACTS_DIR'))
    : join(REPO_ROOT, 'artifacts', 'p3-connected');

  const notRunReasons = [];
  for (const name of envRequirements.globalNames) {
    if (!readEnv(name)) notRunReasons.push(`missing env ${name}`);
  }
  notRunReasons.push(
    ...validateDisposableEnvironment({
      feUrl,
      apiUrl,
      fixtureAssertUrl,
      disposable,
      runId: requestedRunId,
      artifactsBase,
    }),
  );
  let browserBinary = null;
  if (notRunReasons.length === 0) {
    try {
      browserBinary = resolveBrowserBinary();
    } catch (error) {
      notRunReasons.push(error.message);
    }
  }
  if (notRunReasons.length === 0) {
    const feProbe = await probeHttpEndpoint(feUrl);
    if (!feProbe.reachable) {
      notRunReasons.push(
        `FE ${feUrl} is unreachable (${feProbe.error}); start the actual Vite dev app first`,
      );
    }
    const apiProbe = await probeHttpEndpoint(apiUrl);
    if (!apiProbe.reachable) {
      notRunReasons.push(
        `API ${apiUrl} is unreachable (${apiProbe.error}); start the disposable C11 API first`,
      );
    }
  }
  if (notRunReasons.length > 0) {
    printNotRun(notRunReasons);
    return 2;
  }

  const runId = requestedRunId;
  const allowedOrigins = allowedOriginsFor({ feUrl, apiUrl, fixtureAssertUrl });
  const runDir = join(artifactsBase, runId);
  const uploadDir = join(runDir, 'uploads');
  const evidencePng = createSyntheticEvidencePng();
  const evidencePath = join(uploadDir, 'evidence-synthetic.png');
  await mkdir(uploadDir, { recursive: true });
  await writeFile(evidencePath, evidencePng.buffer);
  await writeFile(
    join(uploadDir, 'evidence.json'),
    `${JSON.stringify(
      {
        file: 'evidence-synthetic.png',
        sha256: evidencePng.sha256,
        fileSizeBytes: evidencePng.fileSizeBytes,
        note: 'Deterministic synthetic 64x64 PNG generated by the harness; no PII.',
      },
      null,
      2,
    )}\n`,
  );

  const trace = [];
  const tracePath = join(runDir, 'trace.jsonl');
  const runCtx = {
    artifacts: {
      runDir,
      downloadDir: join(runDir, 'downloads'),
      evidence: {
        path: evidencePath,
        sha256: evidencePng.sha256,
        fileSizeBytes: evidencePng.fileSizeBytes,
      },
    },
    variables: new VariableScope(readEnv),
    trace,
  };
  const config = {
    feUrl,
    apiUrl,
    fixtureAssertUrl,
    fixtureAssertToken,
    workspaceSlug,
    traceNetwork: isTruthyEnv('P3_TRACE'),
    allowedOrigins,
  };

  const envManifest = {
    runtimeRequired: envRequirements.globalNames,
    present: envRequirements.globalNames.filter((name) => Boolean(readEnv(name))),
    missing: envRequirements.globalNames.filter((name) => !readEnv(name)),
    credentialsRequired: envRequirements.credentialNames,
    credentialsPresent: envRequirements.credentialNames.filter((name) => Boolean(readEnv(name))),
    scenarioScoped: [...envRequirements.scenarioScoped.entries()].map(([name, scenarioIds]) => ({
      name,
      present: Boolean(readEnv(name)),
      scenarioIds,
    })),
    optional: REQUIRED_ENV.optional.map((name) => ({ name, present: Boolean(readEnv(name)) })),
    values: 'NEVER LOGGED — only variable names and presence are recorded',
  };
  const runManifest = {
    harness: 'p3-connected-browser',
    harnessVersion: HARNESS_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    runId,
    status: 'RUNNING',
    mode: options.scenario ? `scenario:${options.scenario}` : 'all',
    startedAt: nowIso(),
    finishedAt: null,
    feUrl,
    apiUrl,
    sha: { fe: readOptionalSha('P3_FE_SHA'), be: readOptionalSha('P3_BE_SHA') },
    browser: { binary: basename(browserBinary), product: null, protocolVersion: null },
    env: envManifest,
    disposableLock: {
      marker: 'P3_DISPOSABLE=1',
      runId,
      allowedOrigins,
      rule: 'Only loopback origins for this run may receive browser traffic; any other request is blocked and fails the scenario.',
    },
    scenarios: ordered.map((scenario) => scenario.id),
    artifacts: {
      runDir,
      trace: 'trace.jsonl',
      screenshots: '<name>.png',
      downloads: 'downloads/<scenarioId>/',
      uploads: 'uploads/',
    },
    note: 'No business API response is mocked. Status is only PASS when every selected scenario asserted live UI/network/persisted effects.',
  };
  await writeFile(join(runDir, 'run.json'), `${JSON.stringify(runManifest, null, 2)}\n`);

  const tmpProfile = await mkdtemp(join(tmpdir(), `p3-c08-${runId}-`));
  let launched = null;
  let browserCdp = null;
  const results = [];
  let exitCode = 1;
  const cleanup = async () => {
    try {
      if (browserCdp) browserCdp.close();
    } catch {
      // ignore
    }
    try {
      if (launched && launched.child && launched.child.exitCode === null) {
        launched.child.kill('SIGTERM');
        await Promise.race([launched.exited, delay(5_000)]);
        if (launched.child.exitCode === null) launched.child.kill('SIGKILL');
      }
    } catch {
      // ignore
    }
    try {
      await rm(tmpProfile, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };
  activeCleanup = cleanup;
  try {
    launched = await launchBrowser(browserBinary, tmpProfile);
    const endpoint = await waitForDevToolsEndpoint(tmpProfile, { launched });
    browserCdp = await CdpClient.connect(endpoint.wsUrl, { label: 'browser' });
    const version = await browserCdp.send('Browser.getVersion');
    runManifest.browser = {
      binary: basename(browserBinary),
      product: version.product,
      protocolVersion: version.protocolVersion,
      userAgent: version.userAgent,
    };

    console.log('P3 C08 connected run');
    console.log(`runId ${runId}`);
    console.log(`FE ${feUrl} · API ${apiUrl}`);
    console.log(`browser ${version.product} · CDP ${version.protocolVersion}`);
    console.log(`scenarios ${ordered.length} · mode ${runManifest.mode}`);
    console.log('');

    for (const [index, scenario] of ordered.entries()) {
      const dependencyFailures = (scenario.dependsOn || []).filter((dependencyId) => {
        const dependencyResult = results.find((entry) => entry.id === dependencyId);
        return !dependencyResult || dependencyResult.status !== 'PASS';
      });
      let result;
      if (dependencyFailures.length > 0) {
        result = baseScenarioResult(
          scenario,
          new NotRunError(
            `Skipped because dependency scenario(s) did not PASS: ${dependencyFailures.join(', ')}`,
          ),
        );
        result.durationMs = 0;
        await writeFile(
          join(runDir, `scenario-${scenario.id}.json`),
          `${JSON.stringify(result, null, 2)}\n`,
        );
      } else {
        console.log(`RUN  [${index + 1}/${ordered.length}] ${scenario.id} — ${scenario.title}`);
        result = await runScenarioInBrowser({ scenario, browserCdp, runId, runCtx, config });
      }
      results.push(result);
      await writeFile(
        tracePath,
        trace.length > 0 ? `${trace.map((entry) => JSON.stringify(entry)).join('\n')}\n` : '',
      );
      const statusLabel =
        result.status === 'PASS' ? 'PASS ' : result.status === 'NOT RUN' ? 'NOT RUN' : 'FAIL ';
      const errorSuffix = result.error
        ? ` — ${result.error.kind ? `${result.error.kind}@step${result.error.step}: ` : ''}${safeSnippet(result.error.message, 220)}`
        : '';
      console.log(
        `${statusLabel} ${scenario.id} · ${result.steps.length} steps · ${compactSeconds(result.durationMs)}${errorSuffix}`,
      );
    }

    const failed = results.filter((result) => result.status === 'FAIL');
    const notRun = results.filter((result) => result.status === 'NOT RUN');
    const passed = results.filter((result) => result.status === 'PASS');
    const coveredByPass = new Set();
    const coveredByAny = new Set();
    for (const result of results) {
      const scenario = SCENARIOS.find((entry) => entry.id === result.id);
      for (const bullet of scenario?.covers || []) {
        coveredByAny.add(bullet);
        if (result.status === 'PASS') coveredByPass.add(bullet);
      }
    }
    const summaryStatus = failed.length > 0 ? 'FAIL' : notRun.length > 0 ? 'NOT RUN' : 'PASS';
    const summary = {
      harness: 'p3-connected-browser',
      harnessVersion: HARNESS_VERSION,
      fixtureVersion: FIXTURE_VERSION,
      runId,
      mode: runManifest.mode,
      status: summaryStatus,
      startedAt: runManifest.startedAt,
      finishedAt: nowIso(),
      durationMs: Date.now() - Date.parse(runManifest.startedAt),
      sha: runManifest.sha,
      browser: runManifest.browser,
      env: envManifest,
      disposableLock: {
        marker: 'P3_DISPOSABLE=1',
        runId,
        allowedOrigins,
        rule: 'Only loopback origins for this run may receive browser traffic; any other request is blocked and fails the scenario.',
      },
      counts: {
        total: results.length,
        pass: passed.length,
        fail: failed.length,
        notRun: notRun.length,
      },
      coverage: {
        required: [...REQUIRED_COVERAGE],
        passed: [...coveredByPass].sort(),
        exercisedNotPassed: [...coveredByAny].filter((bullet) => !coveredByPass.has(bullet)).sort(),
        missing: REQUIRED_COVERAGE.filter((bullet) => !coveredByAny.has(bullet)),
      },
      results: results.map((result) => ({
        id: result.id,
        status: result.status,
        durationMs: result.durationMs,
        steps: result.steps.length,
        screenshots: result.screenshots.map((shot) => shot.file),
        fixtureAsserts: result.fixtureAsserts,
        requestIds: result.requestIds,
        error: result.error,
      })),
      artifacts: { runDir, trace: tracePath },
      note: 'No business API was mocked. A PASS here means every selected scenario asserted its live UI, network and fixture-assert effects.',
    };
    await writeFile(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    runManifest.status = summaryStatus;
    runManifest.finishedAt = summary.finishedAt;
    await writeFile(join(runDir, 'run.json'), `${JSON.stringify(runManifest, null, 2)}\n`);

    console.log('');
    console.log(
      `RESULT ${summaryStatus} · PASS ${passed.length} · FAIL ${failed.length} · NOT RUN ${notRun.length} · total ${results.length}`,
    );
    const coverageMissing = summary.coverage.missing;
    const coveragePending = summary.coverage.exercisedNotPassed;
    console.log(
      `coverage ${coveredByPass.size}/${REQUIRED_COVERAGE.length} passed` +
        (coveragePending.length ? ` · exercised-not-passed: ${coveragePending.join(', ')}` : '') +
        (coverageMissing.length ? ` · missing: ${coverageMissing.join(', ')}` : ''),
    );
    console.log(`artifacts ${runDir}`);
    if (summaryStatus === 'PASS') {
      console.log(
        'Connected acceptance PASS for the selected scenarios (single local run only — not CI/UAT proof).',
      );
      exitCode = 0;
    } else if (summaryStatus === 'NOT RUN') {
      console.log(
        'Connected run did not complete: NOT RUN (environment/preconditions). No PASS is recorded.',
      );
      exitCode = 2;
    } else {
      console.log(
        'Connected run FAILED; inspect scenario-<id>.json + failure screenshots. No PASS is recorded.',
      );
      exitCode = 1;
    }
  } catch (error) {
    const notRun = error instanceof NotRunError;
    const summary = {
      harness: 'p3-connected-browser',
      harnessVersion: HARNESS_VERSION,
      fixtureVersion: FIXTURE_VERSION,
      runId,
      mode: runManifest.mode,
      status: notRun ? 'NOT RUN' : 'FAIL',
      startedAt: runManifest.startedAt,
      finishedAt: nowIso(),
      error: { code: error.code || 'ERROR', message: safeSnippet(error.message, 2000) },
      results,
      artifacts: { runDir, trace: tracePath },
    };
    await writeFile(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`).catch(
      () => {},
    );
    console.error('');
    console.error(`${notRun ? 'NOT RUN' : 'FAIL'} — ${error.message}`);
    console.error(`artifacts ${runDir}`);
    exitCode = notRun ? 2 : 1;
  } finally {
    await cleanup();
    activeCleanup = null;
  }
  return exitCode;
}

let activeCleanup = null;

async function handleSignal(signal) {
  console.error(`\n${signal} received — cleaning up the disposable browser/profile before exit.`);
  try {
    await activeCleanup?.();
  } finally {
    process.exit(130);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────────────────────
function printUsage() {
  console.log('P3 C08 connected browser harness');
  console.log('');
  console.log('Usage:');
  console.log(
    '  node tests/p3-connected-browser.mjs --dry-run            validate scenario data + harness schema (no env/browser)',
    '  node tests/p3-connected-browser.mjs --check-env          validate the disposable stack lock (no browser)',
    '  node tests/p3-connected-browser.mjs --self-test-lock     deterministic allowlist/lock self-test (no env/browser)',
  );
  console.log(
    '  node tests/p3-connected-browser.mjs --list               list scenario ids/titles/roles/steps',
  );
  console.log(
    '  node tests/p3-connected-browser.mjs --scenario=<id>      run one scenario and its dependencies',
  );
  console.log(
    '  node tests/p3-connected-browser.mjs                      run all scenarios in dependency order',
  );
  console.log('');
  console.log(
    'Exit codes: 0 PASS/valid, 1 FAIL/validation error, 2 NOT RUN (environment not ready).',
  );
}

function parseArgs(argv) {
  const options = { mode: 'run', scenario: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.mode = 'dry-run';
    } else if (arg === '--check-env') {
      options.mode = 'check-env';
    } else if (arg === '--self-test-lock') {
      options.mode = 'self-test-lock';
    } else if (arg === '--list') {
      options.mode = 'list';
    } else if (arg === '--help' || arg === '-h') {
      options.mode = 'help';
    } else if (arg === '--scenario') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--'))
        throw new UsageError('--scenario requires a scenario id');
      options.scenario = value;
      index += 1;
    } else if (arg.startsWith('--scenario=')) {
      const value = arg.slice('--scenario='.length);
      if (!value) throw new UsageError('--scenario requires a scenario id');
      options.scenario = value;
    } else {
      throw new UsageError(`Unknown argument '${arg}'`);
    }
  }
  if (options.mode !== 'run' && options.scenario) {
    throw new UsageError('--scenario cannot be combined with --dry-run or --list');
  }
  return options;
}

function printScenarioList() {
  console.log(
    `P3 C08 connected scenarios — fixture v${FIXTURE_VERSION} · ${SCENARIOS.length} scenarios`,
  );
  console.log('');
  for (const [index, scenario] of SCENARIOS.entries()) {
    const roles = (scenario.actors || [])
      .map((actor) => `${actor.role}@${actor.actorScope}`)
      .join(', ');
    console.log(`${String(index + 1).padStart(2, '0')}. ${scenario.id} — ${scenario.title}`);
    console.log(
      `    screen: ${scenario.screen} · roles: ${roles} · steps: ${scenario.steps.length} · depends: ${(scenario.dependsOn || []).join(', ') || '-'} · covers: ${scenario.covers.join(', ')}`,
    );
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`error: ${error.message}`);
      printUsage();
      return 2;
    }
    throw error;
  }
  if (options.mode === 'help') {
    printUsage();
    return 0;
  }
  if (options.mode === 'list') {
    printScenarioList();
    return 0;
  }
  if (options.mode === 'dry-run') {
    return printDryRun(validateFixture());
  }
  if (options.mode === 'check-env') {
    return runEnvironmentCheck();
  }
  if (options.mode === 'self-test-lock') {
    return runLockSelfTest();
  }
  return runConnected(options);
}

const isMainModule = () => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(resolve(entry)).href === import.meta.url;
  } catch {
    return false;
  }
};

if (isMainModule()) {
  process.once('SIGINT', () => void handleSignal('SIGINT'));
  process.once('SIGTERM', () => void handleSignal('SIGTERM'));
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`fatal: ${error.stack || error.message}`);
      process.exitCode = error instanceof NotRunError ? 2 : 1;
    });
}
