import { useState, useRef, useEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { LandingCanvasHandle } from './LandingCanvas';

gsap.registerPlugin(ScrollTrigger);

// ── 6 Narrative Spatial Stops with Dynamic Left/Right Alternating HUD Layout ──
// • Kho bên TRÁI (Tồn Kho Mù, Rate Shopping)  -> Camera dạt sang phải, Thẻ chữ hiện bên PHẢI (align: 'right')
// • Kho bên PHẢI (Trễ Hạn, Smart Routing)      -> Camera dạt sang trái, Thẻ chữ hiện bên TRÁI (align: 'left')
// • Lõi SmartChain ở GIỮA                     -> Thẻ chữ hiện bên TRÁI (align: 'left')
export const SPATIAL_STOPS = [
  {
    id: 0,
    nodeCode: 'GLOBAL',
    tag: 'TỔNG QUAN HỆ THỐNG',
    title: 'Mạng Lưới Điều Phối Logistics Đa Kho Thông Minh',
    subtitle: 'Đồng bộ đa điểm · Tối ưu tự động',
    description: '',
    nodeBadge: '4 NÚT HOẠT ĐỘNG · 1 TRUNG TÂM SMARTCHAIN',
    accentColor: '#00E599',
    align: 'left' as const,
    stats: [],
    hudPills: [],
    cta: '',
    ctaLink: '',
    // Initial global high-floating camera
    cam: { pos: [0, 7.5, 9.5] as [number, number, number], target: [0, 0.65, 0] as [number, number, number] },
  },
  {
    id: 1,
    nodeCode: 'PAIN-01',
    tag: 'NỖI ĐAU 01 · VẬN HÀNH THỦ CÔNG',
    title: 'Tồn Kho Mù & Chọn Kho Bằng Tay',
    subtitle: '10.000+ đơn/ngày · Quản lý trên Excel 50 cột',
    description:
      'Hàng hóa nằm phân tán ở nhiều kho nhưng hệ thống không liên thông. Đội ngũ vận hành phải gọi điện thoại kiểm tra từng kho, phân loại đơn thủ công dẫn đến nghẽn kho và xuất hàng chậm trễ.',
    nodeBadge: '⚠️ NGUY CƠ: QUÁ TẢI CỤC BỘ',
    accentColor: '#FFB800',
    align: 'right' as const, // Thẻ chữ bên PHẢI
    stats: [
      { value: '85%', label: 'Lãng phí chia tay' },
      { value: '50+', label: 'Cột Excel thủ công' },
      { value: '3 ngày', label: 'Thời gian xử lý' },
    ],
    hudPills: [
      { icon: '📋', text: 'Tồn kho không đồng bộ thời gian thực giữa các sàn TMĐT và kho vật lý' },
      { icon: '⚠️', text: 'Nguy cơ cạn hàng ảo hoặc bán vượt quá số lượng tồn thực tế (Overselling)' },
    ],
    cta: 'Khám phá cách SmartChain xử lý',
    ctaLink: '#features',
    // Node ở [-2.6, 0, -2.6]. Camera nhìn sang [-1.2, ...] -> Kho nằm trọn vẹn ở nửa bên TRÁI!
    cam: { pos: [-1.2, 4.0, 1.4] as [number, number, number], target: [-1.2, 0.8, -2.6] as [number, number, number] },
  },
  {
    id: 2,
    nodeCode: 'PAIN-02',
    tag: 'NỖI ĐAU 02 · LỆCH TUYẾN & ĐƠN KẸT',
    title: 'Giao Hàng Xa, Trễ Hạn & Hoàn Đơn',
    subtitle: 'Đơn kẹt > 48h · Chi phí vận chuyển tăng gấp 3',
    description:
      'Khách ở Cần Thơ nhưng đơn lại xuất từ kho Bắc Ninh do thiếu dữ liệu định tuyến. Thời gian giao kéo dài 4–5 ngày khiến khách hủy đơn, tỷ lệ hoàn hàng (RTO) lên tới 18.5%, biên lợi nhuận bốc hơi.',
    nodeBadge: '⚠️ NGHỄN TUYẾN & TỶ LỆ HOÀN CAO',
    accentColor: '#FF4444',
    align: 'left' as const, // Thẻ chữ bên TRÁI
    stats: [
      { value: '+4.2d', label: 'Thời gian trễ hẹn' },
      { value: '18.5%', label: 'Tỷ lệ hoàn RTO' },
      { value: '-30%', label: 'Lợi nhuận ròng' },
    ],
    hudPills: [
      { icon: '⏱️', text: 'Giao hàng trễ khiến khách hàng mất kiên nhẫn và từ chối nhận hàng (RTO)' },
      { icon: '💸', text: 'Doanh nghiệp gánh thêm 2 lần chi phí vận chuyển chiều đi và chiều về' },
    ],
    cta: 'Xem giải pháp Smart Routing',
    ctaLink: '#features',
    // Node ở [2.6, 0, -2.6]. Camera nhìn sang [1.2, ...] -> Kho nằm trọn vẹn ở nửa bên PHẢI!
    cam: { pos: [1.2, 4.0, 1.4] as [number, number, number], target: [1.2, 0.8, -2.6] as [number, number, number] },
  },
  {
    id: 3,
    nodeCode: 'SOL-01',
    tag: 'GIẢI PHÁP 01 · ĐỊNH TUYẾN THÔNG MINH',
    title: 'Smart Routing: Tối Ưu Kho Gần Nhất',
    subtitle: 'Khoảng cách Haversine < 50ms · Tự động tách Sub-Orders',
    description:
      'SmartChain quét tọa độ người nhận và tồn kho 4 Hub trong dưới 50ms. Tự động chọn kho gần nhất còn hàng. Nếu đơn gồm nhiều sản phẩm ở các kho khác nhau, hệ thống tự động tách Sub-Orders và chia tiền COD chuẩn xác 0đ sai lệch.',
    nodeBadge: '⚡ TỐI ƯU HÓA ĐỊNH TUYẾN',
    accentColor: '#A855F7', // Distinct Cyber Violet
    align: 'left' as const, // Thẻ chữ bên TRÁI
    stats: [
      { value: '< 50ms', label: 'Tốc độ định tuyến' },
      { value: '-40%', label: 'Thời gian xử lý' },
      { value: '0đ', label: 'Sai lệch tiền COD' },
    ],
    hudPills: [
      { icon: '⚡', text: 'Tự động định vị kho xuất hàng tối ưu nhất theo tọa độ thực tế' },
      { icon: '🔀', text: 'Tự động tách đơn & phân bổ tiền thu hộ COD chuẩn xác tuyệt đối' },
    ],
    cta: 'Xem chi tiết Smart Routing',
    ctaLink: '#features',
    // Node ở [2.6, 0, 2.6]. Camera nhìn sang [1.2, ...] -> Kho nằm trọn vẹn ở nửa bên PHẢI!
    cam: { pos: [1.2, 4.0, 6.6] as [number, number, number], target: [1.2, 0.8, 2.6] as [number, number, number] },
  },
  {
    id: 4,
    nodeCode: 'SOL-02',
    tag: 'GIẢI PHÁP 02 · ĐẤU GIÁ CƯỚC 3PL',
    title: 'Rate Shopping: Đấu Giá Cước Thời Gian Thực',
    subtitle: 'Tích hợp sẵn GHN, GHTK, Viettel Post, Ninja Van',
    description:
      'Không còn chọn hãng vận chuyển bằng cảm tính. Rule Engine so sánh bảng cước của 4+ đơn vị vận chuyển theo từng gram trọng lượng và địa chỉ người nhận. Tự động chọn hãng rẻ nhất, giao nhanh nhất trong 15ms.',
    nodeBadge: '💰 TIẾT KIỆM 15% – 28% CƯỚC PHÍ',
    accentColor: '#00B4FF',
    align: 'right' as const, // Thẻ chữ bên PHẢI
    stats: [
      { value: '-25%', label: 'Chi phí cước' },
      { value: '4+ 3PL', label: 'Hãng vận chuyển' },
      { value: '< 200ms', label: 'Tạo mã vận đơn' },
    ],
    hudPills: [
      { icon: '💰', text: 'Tiết kiệm trung bình 3.000đ – 8.000đ trên mỗi đơn hàng' },
      { icon: '🔗', text: 'Tự động đẩy API lấy mã vận đơn trực tiếp sang GHTK, GHN, Viettel Post' },
    ],
    cta: 'Xem cấu hình Rule Engine',
    ctaLink: '#features',
    // Node ở [-2.6, 0, 2.6]. Camera nhìn sang [-1.2, ...] -> Kho nằm trọn vẹn ở nửa bên TRÁI!
    cam: { pos: [-1.2, 4.0, 6.6] as [number, number, number], target: [-1.2, 0.8, 2.6] as [number, number, number] },
  },
  {
    id: 5,
    nodeCode: 'CORE',
    tag: 'TRỌNG TÂM · TRUNG TÂM ĐIỀU PHỐI',
    title: 'SmartChain: Lõi Điều Phối Hợp Nhất Toàn Diện',
    subtitle: 'Stream Processing · 100% Phát hiện Lệch cước & Gian lận',
    description:
      'Toàn bộ dữ liệu mạng lưới đổ về Lõi Điều Phối SmartChain. Đối soát 1.000.000 dòng file Excel từ các hãng vận chuyển hoàn tất trong 30 giây thay vì 3 ngày kế toán thức trắng. Bắt chính xác 100% lệch cân nặng và tiền COD.',
    nodeBadge: '⚡ SMARTCHAIN ORCHESTRATION ENGINE',
    accentColor: '#00E599',
    align: 'left' as const, // Thẻ chữ bên TRÁI
    stats: [
      { value: '99.99%', label: 'Độ chính xác' },
      { value: '30s', label: 'Thời gian đối soát' },
      { value: '1M+ Dòng', label: 'Xử lý dữ liệu' },
    ],
    hudPills: [
      { icon: '🎯', text: 'Tự động phát hiện chênh lệch trọng lượng thực tế và cước khống' },
      { icon: '📊', text: 'Báo cáo doanh thu, chi phí logistics và tiền COD về tài khoản tức thì' },
    ],
    cta: 'Bắt đầu sử dụng SmartChain',
    ctaLink: '/login',
    // Center Core ở [0, 0, 0]. Camera nhìn sang [-1.4, ...] -> Lõi nằm trọn vẹn ở nửa bên PHẢI!
    cam: { pos: [-1.4, 3.8, 4.8] as [number, number, number], target: [-1.4, 0.85, 0] as [number, number, number] },
  },
] as const;

export default function LandingStories({
  canvasRef,
}: {
  canvasRef: RefObject<LandingCanvasHandle | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const activeIdxRef = useRef<number>(0);
  // Use ref + direct DOM mutation instead of React state to avoid re-render on every scroll tick
  const progressBarRef = useRef<HTMLDivElement>(null);
  const currentAccentRef = useRef<string>(SPATIAL_STOPS[0].accentColor);

  useEffect(() => {
    const totalStops = SPATIAL_STOPS.length;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.1,
        onUpdate: (self) => {
          const p = self.progress;

          // Determine current spatial stop index
          const rawIdx = p * totalStops;
          const stopIdx = Math.min(Math.floor(rawIdx), totalStops - 1);

          if (activeIdxRef.current !== stopIdx) {
            activeIdxRef.current = stopIdx;
            setActiveIdx(stopIdx);
            // Update accent ref for progress bar color sync
            currentAccentRef.current = SPATIAL_STOPS[stopIdx].accentColor;
          }

          // Direct DOM mutation — zero React re-render cost
          if (progressBarRef.current) {
            const accent = SPATIAL_STOPS[stopIdx].accentColor;
            progressBarRef.current.style.width = `${p * 100}%`;
            progressBarRef.current.style.background = accent;
            progressBarRef.current.style.boxShadow = `0 0 12px ${accent}`;
          }

          // Smooth 3D Camera Drone Flight
          if (canvasRef.current) {
            const cur = SPATIAL_STOPS[stopIdx];
            const next = SPATIAL_STOPS[Math.min(stopIdx + 1, totalStops - 1)];
            const t = rawIdx - stopIdx;

            const lerp = (a: number, b: number) => a + (b - a) * t;

            canvasRef.current.setCameraPos(
              lerp(cur.cam.pos[0], next.cam.pos[0]),
              lerp(cur.cam.pos[1], next.cam.pos[1]),
              lerp(cur.cam.pos[2], next.cam.pos[2]),
            );
            canvasRef.current.setCameraTarget(
              lerp(cur.cam.target[0], next.cam.target[0]),
              lerp(cur.cam.target[1], next.cam.target[1]),
              lerp(cur.cam.target[2], next.cam.target[2]),
            );
            canvasRef.current.setAccentColor(cur.accentColor);
            canvasRef.current.setSceneIndex(stopIdx);
          }
        },
      });
    }, containerRef);

    return () => ctx.revert();
  }, [canvasRef]);

  const currentStop = SPATIAL_STOPS[activeIdx];

  const handleJumpToStop = (idx: number) => {
    if (!containerRef.current) return;
    const totalH = containerRef.current.scrollHeight - window.innerHeight;
    const targetY = containerRef.current.offsetTop + (idx / SPATIAL_STOPS.length) * totalH + 10;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  };

  return (
    <div
      id="story-container"
      ref={containerRef}
      className="relative w-full pointer-events-none"
      style={{ height: `${SPATIAL_STOPS.length * 85}vh` }}
    >
      {/* ── Sticky Fullscreen Viewport ───────────────────────────────────── */}
      <div className="sticky top-0 h-screen w-full flex items-center overflow-hidden pointer-events-none">
        
        {/* ── STOP 0: Clean 3D Hero View with Floating Action Guide ───────── */}
        {activeIdx === 0 && (
          <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 relative z-20 pointer-events-none flex flex-col items-center justify-end pb-8 sm:pb-10 h-full">
            <div className="flex flex-col items-center gap-2.5 text-center animate-fadeIn pointer-events-auto">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11px] font-mono font-bold text-emerald-400 border border-emerald-500/30" style={{ background: 'rgba(2,44,28,0.9)', boxShadow: '0 0 25px rgba(0,229,153,0.2)' }}>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>HỆ THỐNG ĐIỀU PHỐI LOGISTICS ĐA KHO THÔNG MINH</span>
              </div>

              <h1
                className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 tracking-tight"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Khám Phá Mạng Lưới SmartChain
              </h1>

              <p className="text-[11px] sm:text-xs text-slate-300 font-mono flex items-center gap-2">
                <span>🖱️</span>
                <span>Lăn chuột hoặc Click trực tiếp vào 4 điểm nút & Lõi trung tâm để khám phá</span>
              </p>

              {/* Bouncing scroll prompt */}
              <button
                type="button"
                onClick={() => handleJumpToStop(1)}
                className="mt-1 flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold text-slate-300 hover:text-white border border-white/15 cursor-pointer transition-colors" style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <span>Bắt đầu tham quan</span>
                <span>↓</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STOPS 1-5: AR Spatial Inspector HUD (Alternating Left / Right) ── */}
        {activeIdx > 0 && (
          <div
            className={`w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-10 lg:px-12 xl:px-16 relative z-20 pointer-events-none flex ${
              currentStop.align === 'right' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div className="w-full sm:max-w-[430px] lg:max-w-[460px] pt-16 sm:pt-14 md:pt-16 pointer-events-auto">
              <div
                key={currentStop.id}
                className="flex flex-col gap-3 sm:gap-3.5 p-4 sm:p-5 sm:p-6 rounded-2xl border transition-[border-color,box-shadow] duration-300 animate-fadeIn max-h-[78vh] overflow-y-auto"
                style={{
                  background: 'rgba(5, 11, 20, 0.92)',
                  borderColor: `${currentStop.accentColor}35`,
                  boxShadow: `0 0 30px ${currentStop.accentColor}12, 0 16px 40px rgba(0,0,0,0.6)`,
                }}
              >
                {/* Header: Node Code + Chapter Tag */}
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ background: currentStop.accentColor }}
                    />
                    <span
                      className="text-[10.5px] font-mono font-bold tracking-[0.2em] uppercase"
                      style={{ color: currentStop.accentColor }}
                    >
                      {currentStop.tag}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-slate-300 bg-white/10 border border-white/10">
                    {currentStop.nodeCode}
                  </span>
                </div>

                {/* Title */}
                <h2
                  className="text-xl sm:text-[1.8rem] lg:text-[1.95rem] font-bold text-white leading-[1.18] tracking-tight"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {currentStop.title}
                </h2>

                {/* Subtitle Accent */}
                <div
                  className="text-xs sm:text-[13px] font-semibold tracking-wide font-mono"
                  style={{ color: currentStop.accentColor }}
                >
                  {currentStop.subtitle}
                </div>

                {/* Description Paragraph */}
                <p
                  className="text-xs sm:text-[13px] leading-relaxed text-slate-300 font-normal"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {currentStop.description}
                </p>

                {/* Tactical HUD Pills */}
                <div className="flex flex-col gap-2 pt-0.5">
                  {currentStop.hudPills.map((pill, pi) => (
                    <div
                      key={pi}
                      className="flex items-start gap-2.5 px-3 py-2 rounded-lg border"
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <span className="text-sm shrink-0">{pill.icon}</span>
                      <span className="text-[11.5px] sm:text-xs text-slate-300 leading-snug">
                        {pill.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Stats Row */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  {currentStop.stats.map((s, si) => (
                    <div key={si} className="text-center">
                      <div
                        className="text-lg sm:text-xl font-bold font-mono tracking-tight"
                        style={{ color: currentStop.accentColor }}
                      >
                        {s.value}
                      </div>
                      <div className="text-[9px] sm:text-[9.5px] text-slate-400 uppercase tracking-wider font-mono mt-0.5">
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                <div className="pt-0.5">
                  <a
                    href={currentStop.ctaLink}
                    className="group flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition-opacity duration-200 active:scale-[0.98]"
                    style={{
                      background: currentStop.accentColor,
                      color: '#050B14',
                      boxShadow: `0 0 25px ${currentStop.accentColor}55`,
                    }}
                  >
                    <span>{currentStop.cta}</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Bottom/Side Neon Scroll Progress Bar (DOM-mutated, zero React cost) ── */}
      <div
        className="fixed bottom-0 left-0 right-0 h-[3px] z-50 pointer-events-none"
        style={{ background: 'rgba(255, 255, 255, 0.06)' }}
      >
        <div
          ref={progressBarRef}
          className="h-full"
          style={{
            width: '0%',
            background: SPATIAL_STOPS[0].accentColor,
          }}
        />
      </div>

      {/* ── Dot Navigation: bottom-center on mobile, right-side on sm+ ───── */}
      <nav
        aria-label="Spatial Tour Navigation"
        className="fixed bottom-5 sm:bottom-auto left-1/2 sm:left-auto -translate-x-1/2 sm:translate-x-0 sm:right-6 md:right-10 sm:top-1/2 sm:-translate-y-1/2 flex flex-row sm:flex-col gap-2.5 sm:gap-3 z-50 p-2 sm:p-2.5 rounded-full backdrop-blur-md border border-white/10 pointer-events-auto"
        style={{ background: 'rgba(5, 11, 20, 0.65)' }}
      >
        {SPATIAL_STOPS.map((stop, i) => {
          const isActive = activeIdx === i;
          return (
            <button
              key={stop.id}
              type="button"
              onClick={() => handleJumpToStop(i)}
              className="group relative flex items-center justify-center p-1 cursor-pointer"
              aria-label={`Jump to ${stop.nodeCode}`}
            >
              {/* Tooltip Label on hover — hidden on mobile, shown right on sm+ */}
              <span className="hidden sm:block absolute right-8 px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-white bg-[#050B14]/90 border border-white/15 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
                {stop.nodeCode}: {stop.tag}
              </span>

              {/* Dot indicator */}
              <span
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all duration-300"
                style={{
                  background: isActive ? stop.accentColor : 'rgba(255, 255, 255, 0.25)',
                  transform: isActive ? 'scale(1.5)' : 'scale(1)',
                  boxShadow: isActive ? `0 0 10px ${stop.accentColor}` : 'none',
                }}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
