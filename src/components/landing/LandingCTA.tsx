export default function LandingCTA() {
  return (
    <section
      className="relative py-20 md:py-32 lg:py-40 px-4 overflow-hidden"
      style={{ background: '#050B14' }}
      aria-labelledby="cta-headline"
    >
      {/* Background: radial gradient only — no filter:blur() orb (GPU-expensive during scroll) */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,229,153,0.07) 0%, rgba(0,180,255,0.03) 60%, transparent 80%)',
        }}
      />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Headline — plain CSS fade-in, no Motion overhead */}
        <h2
          id="cta-headline"
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tighter text-white leading-[1.1] mb-5 md:mb-6 animate-[fadeUp_0.8s_ease-out_both]"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Sẵn sàng làm chủ
          <br />
          <span style={{ color: '#00E599' }}>
            chuỗi cung ứng?
          </span>
        </h2>

        <p
          className="text-gray-400 leading-relaxed text-sm sm:text-base lg:text-lg mb-8 md:mb-12 max-w-[48ch] mx-auto px-2 sm:px-0 animate-[fadeUp_0.65s_0.1s_ease-out_both]"
        >
          Tham gia cùng các doanh nghiệp đang vận hành hàng nghìn đơn hàng mỗi ngày với SmartChain — không còn kẹt đơn, không còn lệch tiền.
        </p>

        {/* CTA buttons */}
        <div
          className="flex flex-wrap items-center justify-center gap-4 animate-[fadeUp_0.65s_0.2s_ease-out_both]"
        >
          <a
            href="/login"
            className="group flex items-center gap-2 sm:gap-3 px-6 sm:px-8 py-3 sm:py-4 rounded-full font-semibold text-sm sm:text-base active:scale-[0.97] transition-transform"
            style={{
              background: '#00E599',
              color: '#050B14',
              boxShadow: '0 0 28px rgba(0,229,153,0.35)',
            }}
          >
            Bắt đầu dùng SmartChain
            <span
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-black/15 group-hover:translate-x-0.5 transition-transform duration-200"
              aria-hidden="true"
            >
              →
            </span>
          </a>
          <a
            href="#features"
            className="flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded-full text-xs sm:text-sm font-medium text-white border border-white/15 hover:border-white/40 transition-colors"
          >
            Xem tài liệu kỹ thuật
          </a>
        </div>

        {/* Trust note */}
        <p className="mt-8 text-xs text-gray-600 animate-[fadeIn_0.5s_0.4s_ease-out_both]">
          Không yêu cầu thẻ tín dụng · Hỗ trợ onboarding miễn phí 30 ngày
        </p>
      </div>
    </section>
  );
}
