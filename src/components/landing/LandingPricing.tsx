

const PRICING_TIERS = [
  {
    name: 'Starter',
    tag: 'DÀNH CHO SHOP TĂNG TRƯỞNG',
    price: '2.490.000',
    unit: 'đ / tháng',
    desc: 'Tự động hóa phân bổ kho và kết nối 2 đơn vị vận chuyển chính.',
    popular: false,
    color: '#CBD5E1',
    features: [
      'Tối đa 5.000 đơn hàng / tháng',
      'Quản lý 2 Hub kho hàng',
      'Định tuyến Smart Routing cơ bản',
      'Kết nối 2 hãng vận chuyển 3PL',
      'Đối soát tự động định kỳ tuần',
      'Hỗ trợ kỹ thuật qua Ticket & Email',
    ],
    cta: 'Dùng thử 14 ngày',
    ctaLink: '/login',
  },
  {
    name: 'Growth Pro',
    tag: 'DOANH NGHIỆP ĐA KHO',
    price: '6.890.000',
    unit: 'đ / tháng',
    desc: 'Tối ưu toàn diện 4+ Hub kho, đấu giá cước 3PL và đối soát real-time.',
    popular: true,
    color: '#00E599',
    features: [
      'Tối đa 50.000 đơn hàng / tháng',
      'Không giới hạn số lượng Hub kho',
      'Smart Routing Haversine < 50ms',
      'Tự động tách Sub-Orders & phân bổ COD',
      'Đấu giá cước Rate Shopping 4+ 3PL',
      'Stream Reconciliation đối soát 30s',
      'Hỗ trợ kỹ thuật 24/7 qua Hotline & Telegram',
    ],
    cta: 'Bắt đầu với Growth Pro',
    ctaLink: '/login',
  },
  {
    name: 'Enterprise',
    tag: 'TẬP ĐOÀN & THƯƠNG HIỆU LỚN',
    price: 'Tùy chỉnh',
    unit: 'theo quy mô',
    desc: 'Hạ tầng Dedicated riêng biệt, cam kết SLA 99.99% và tích hợp ERP tùy biến.',
    popular: false,
    color: '#00B4FF',
    features: [
      '1.000.000+ đơn hàng / tháng',
      'Dedicated Server & Database cô lập',
      'Tích hợp tùy biến SAP, Oracle, Odoo ERP',
      'Thuật toán định tuyến AI riêng theo yêu cầu',
      'Cam kết SLA 99.99% Uptime',
      'Quản lý tài khoản chuyên trách (Account Manager)',
      'Hợp đồng bảo mật & Ký quỹ tài chính',
    ],
    cta: 'Liên hệ Tư Vấn Enterprise',
    ctaLink: '/login',
  },
];

export default function LandingPricing() {
  return (
    <section id="pricing" className="relative py-28 px-6 sm:px-10 lg:px-16 max-w-[1360px] mx-auto z-20">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-3 mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-mono font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>BẢNG GIÁ MINH BẠCH · KHÔNG CHI PHÍ ẨN</span>
        </div>

        <h2
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Đầu Tư Một Lần, Tiết Kiệm <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">25% Chi Phí</span> Mỗi Tháng
        </h2>

        <p className="text-sm sm:text-base text-slate-400 max-w-[60ch] leading-relaxed">
          Linh hoạt theo quy mô vận hành. Hoàn vốn ngay trong tháng đầu tiên nhờ giảm chi phí lệch cước và đơn hoàn.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        {PRICING_TIERS.map((tier, idx) => (
          <div
            key={tier.name}
            className={`relative flex flex-col justify-between p-8 rounded-3xl border transition-all duration-300 ${
              tier.popular ? 'lg:-translate-y-2' : 'hover:-translate-y-1'
            }`}
            style={{
              background: tier.popular ? 'rgba(5, 15, 28, 0.9)' : 'rgba(5, 11, 20, 0.75)',
              borderColor: tier.popular ? '#00E599' : 'rgba(255, 255, 255, 0.1)',
              boxShadow: tier.popular
                ? '0 0 50px rgba(0, 229, 153, 0.2), 0 20px 50px rgba(0, 0, 0, 0.6)'
                : '0 8px 30px rgba(0, 0, 0, 0.4)',
              willChange: 'transform, opacity',
              contain: 'layout',
            }}
          >
            {tier.popular && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider text-black bg-[#00E599] shadow-lg">
                ★ LỰA CHỌN PHỔ BIẾN NHẤT
              </div>
            )}

            <div>
              {/* Header */}
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1">
                {tier.tag}
              </div>
              <h3 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {tier.name}
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-300/80 mb-6 leading-relaxed">
                {tier.desc}
              </p>

              {/* Price */}
              <div className="flex items-baseline gap-1.5 pb-6 border-b border-white/10 mb-6">
                <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono">
                  {tier.price}
                </span>
                <span className="text-xs text-slate-400 font-mono">{tier.unit}</span>
              </div>

              {/* Features List */}
              <ul className="flex flex-col gap-3 mb-8">
                {tier.features.map((feat, fi) => (
                  <li key={fi} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-300">
                    <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA Button */}
            <a
              href={tier.ctaLink}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-xs sm:text-sm tracking-wider uppercase transition-all duration-300 active:scale-98"
              style={{
                background: tier.popular ? '#00E599' : 'rgba(255, 255, 255, 0.08)',
                color: tier.popular ? '#050B14' : '#ffffff',
                border: tier.popular ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: tier.popular ? '0 0 25px rgba(0, 229, 153, 0.4)' : 'none',
              }}
            >
              <span>{tier.cta}</span>
              <span>→</span>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
