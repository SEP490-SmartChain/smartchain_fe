/**
 * Hệ số chia mặc định trong SRS Report 3 §3.9.1: Wvol = (L × W × H) / 5000,
 * với kích thước tính bằng cm và kết quả bằng kg. Mỗi dịch vụ hãng có thể có
 * hệ số riêng nên hàm nhận `divisor` tường minh.
 */
export const DEFAULT_VOLUMETRIC_DIVISOR = 5000;

function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Trả `null` khi còn kích thước chưa hợp lệ để UI không hiển thị số sai. */
export function calculateVolumetricWeightKg(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  divisor: number = DEFAULT_VOLUMETRIC_DIVISOR,
): number | null {
  if (![lengthCm, widthCm, heightCm, divisor].every(isPositiveNumber)) return null;
  return (lengthCm * widthCm * heightCm) / divisor;
}
