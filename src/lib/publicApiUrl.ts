const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/;
const LOOPBACK_IPV6_HOSTS = new Set(['[::1]', '[::]']);

/** Máy chủ của doanh nghiệp không gọi tới được các địa chỉ nội bộ/loopback này. */
function isNonPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (LOOPBACK_IPV6_HOSTS.has(host)) return true;

  const ipv4 = IPV4_PATTERN.exec(host);
  if (!ipv4) return false;
  const first = Number(ipv4[1]);
  const second = Number(ipv4[2]);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

/**
 * Địa chỉ đầy đủ mà hệ thống bên ngoài (ERP/POS/website) gọi tới SmartChain API,
 * lấy từ `VITE_PUBLIC_API_URL` (URL tuyệt đối, gồm cả `/api`).
 *
 * Chỉ chấp nhận HTTPS tới tên miền/địa chỉ công khai: ERP chạy trên máy chủ của
 * doanh nghiệp nên `localhost` hay IP nội bộ là vô nghĩa với nó, và API key gửi
 * trong header không được đi qua HTTP thường. Trả `null` khi chưa có địa chỉ hợp
 * lệ để UI không hiển thị một địa chỉ sai.
 */
export function buildPublicApiUrl(
  path: string,
  baseUrl: unknown = import.meta.env.VITE_PUBLIC_API_URL,
): string | null {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') return null;

  let base: URL;
  try {
    base = new URL(baseUrl.trim());
  } catch {
    return null;
  }
  if (base.protocol !== 'https:' || isNonPublicHost(base.hostname)) return null;

  const basePath = base.pathname.replace(/\/+$/, '');
  const endpointPath = path.replace(/^\/+/, '');
  return `${base.origin}${basePath}/${endpointPath}`;
}
