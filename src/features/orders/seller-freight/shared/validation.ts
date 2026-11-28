import type { KeyboardEvent } from 'react';

import { normalizeMoneyForQuote } from './input';

export interface ParcelIntValidationResult {
  readonly value: number | null;
  readonly isEmpty: boolean;
  readonly error?: string;
}

export interface VndValidationResult {
  readonly value: string | null;
  readonly isEmpty: boolean;
  readonly error?: string;
}

const NON_NEGATIVE_INT_REGEX = /^\d+$/;
const VND_AMOUNT_REGEX = /^(0|[1-9]\d{0,11})$/;
const MAX_VND_DIGITS = 12;

export function preventInvalidIntegerKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
  if (['e', 'E', '+', '-', '.', ','].includes(event.key)) {
    event.preventDefault();
  }
}

export function validateParcelIntegerField(
  raw: string,
  opts: {
    readonly label: string;
    readonly min: number;
    readonly max: number;
    readonly unit?: string;
  },
): ParcelIntValidationResult {
  const trimmed = raw.trim();
  const suffix = opts.unit ? ` ${opts.unit}` : '';
  const minText = opts.min.toLocaleString('vi-VN');
  const maxText = opts.max.toLocaleString('vi-VN');

  if (trimmed.length === 0) {
    return {
      value: null,
      isEmpty: true,
      error: `${opts.label} là bắt buộc (${minText} – ${maxText}${suffix}).`,
    };
  }
  if (trimmed.startsWith('-')) {
    return {
      value: null,
      isEmpty: false,
      error: `${opts.label} phải lớn hơn 0.`,
    };
  }
  if (!NON_NEGATIVE_INT_REGEX.test(trimmed)) {
    return {
      value: null,
      isEmpty: false,
      error: `${opts.label} phải là số nguyên (không nhập số thập phân hoặc ký tự khác).`,
    };
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < opts.min || parsed > opts.max) {
    return {
      value: null,
      isEmpty: false,
      error: `${opts.label} phải từ ${minText} đến ${maxText}${suffix}.`,
    };
  }
  return { value: parsed, isEmpty: false };
}

export function validateExplicitVndField(raw: string, label: string): VndValidationResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      value: null,
      isEmpty: true,
      error: `Nhập ${label} (hoặc chọn 0 ₫ nếu bằng 0).`,
    };
  }
  if (trimmed.startsWith('-')) {
    return {
      value: null,
      isEmpty: false,
      error: `${label} không được là số âm.`,
    };
  }
  const normalized = normalizeMoneyForQuote(trimmed);
  if (NON_NEGATIVE_INT_REGEX.test(normalized) && normalized.length > MAX_VND_DIGITS) {
    return {
      value: null,
      isEmpty: false,
      error: `${label} tối đa 999.999.999.999 ₫.`,
    };
  }
  if (!VND_AMOUNT_REGEX.test(normalized)) {
    return {
      value: null,
      isEmpty: false,
      error: `${label} phải là số nguyên VND hợp lệ (ví dụ: 200000 hoặc 200.000).`,
    };
  }
  return { value: normalized, isEmpty: false };
}

export function validateOptionalVndField(raw: string, label: string): VndValidationResult {
  if (raw.trim().length === 0) {
    return { value: null, isEmpty: true };
  }
  return validateExplicitVndField(raw, label);
}
