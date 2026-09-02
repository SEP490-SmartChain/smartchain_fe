

const ARCH_LAYERS = [
  {
    step: '01',
    name: 'Ingestion & Webhook Gateway',
    tag: 'TẦNG KẾT NỐI ĐA KÊNH',
    desc: 'Tiếp nhận 10.000+ đơn/s qua Webhook từ Shopee, TikTok Shop, Lazada, WooCommerce, Shopify và ERP nội bộ với độ trễ < 10ms.',
    badge: '< 10ms Latency',
    color: '#00E599',
    tech: ['Kafka Stream', 'Webhook Validator', 'Idempotency Key'],
  },
  {
    step: '02',
    name: 'Haversine Spatial & Inventory Matrix',
    tag: 'ĐỊNH TUYẾN KHO THÔNG MINH',
    desc: 'Tính toán tọa độ người nhận theo công thức Haversine, quét tồn kho thời gian thực ở 4 Hub và tự động phân bổ đơn hoặc chia tách Sub-Orders.',
    badge: '< 50ms Processing',
    color: '#00B4FF',
    tech: ['Spatial Index (PostGIS)', 'Haversine Matrix', 'Sub-Order Engine'],
  },
  {
    step: '03',
    name: 'Dynamic 3PL Rate Shopping Engine',
    tag: 'ĐẤU GIÁ CƯỚC THỜI GIAN THỰC',
    desc: 'Đấu giá cước trực tiếp với GHN, GHTK, Viettel Post, Ninja Van theo gram trọng lượng và cam kết SLA, tự động chọn đơn vị tối ưu nhất.',
    badge: '15-28% Cost Saving',
    color: '#FFB800',
    tech: ['Multi-Carrier API', 'Rule Engine', 'Dynamic Tariff Cache'],
  },
  {
    step: '04',
    name: 'Stream Reconciliation & Audit Trail',
    tag: 'ĐỐI SOÁT DỮ LIỆU TRIỆU DÒNG',
    desc: 'Xử lý file đối soát 1.000.000 dòng trong 30 giây, tự động phát hiện chênh lệch trọng lượng thực tế, cước phát sinh và tiền COD thu hộ.',
    badge: '99.99% Accuracy',
    color: '#00E599',
    tech: ['Stream Processing', 'Audit Ledger', 'Dispute Automation'],
  },
];

export default function LandingArchitecture() {
  return (
    <section id="architecture" className="relative py-28 px-6 sm:px-10 lg:px-16 max-w-[1360px] mx-auto z-20">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-3 mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-mono font-bold text-cyan-400 border border-cyan-500/30" style={{ background: 'rgba(8,30,45,0.95)' }}>
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>KIẾN TRÚC HỆ THỐNG ENTERPRISE</span>
        </div>

        <h2
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Hạ Tầng Xử Lý Phân Tán <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">Siêu Tốc</span>
        </h2>

        <p className="text-sm sm:text-base text-slate-400 max-w-[60ch] leading-relaxed">
          Được thiết kế theo kiến trúc hướng sự kiện (Event-Driven Microservices), đảm bảo khả năng mở rộng hàng triệu đơn hàng mỗi ngày mà không có điểm nghẽn.
        </p>
      </div>

      {/* Architecture Flow Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {ARCH_LAYERS.map((layer, idx) => (
          <div
            key={layer.step}
            className="group relative flex flex-col justify-between p-6 rounded-2xl border transition-transform duration-300 hover:-translate-y-1.5"
            style={{
              background: 'rgba(5, 11, 20, 0.75)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              contain: 'layout',
            }}
          >
            {/* Top Tag */}
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <span className="text-2xl font-mono font-black" style={{ color: layer.color }}>
                  {layer.step}
                </span>
                <span
                  className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border"
                  style={{
                    color: layer.color,
                    borderColor: `${layer.color}40`,
                    background: `${layer.color}15`,
                  }}
                >
                  {layer.badge}
                </span>
              </div>

              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1">
                {layer.tag}
              </div>

              <h3
                className="text-base sm:text-lg font-bold text-white mb-3 group-hover:text-cyan-300 transition-colors"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {layer.name}
              </h3>

              <p className="text-xs sm:text-[13px] text-slate-300/80 leading-relaxed font-normal">
                {layer.desc}
              </p>
            </div>

            {/* Tech Stack Pills */}
            <div className="flex flex-wrap gap-1.5 pt-6 border-t border-white/10 mt-6">
              {layer.tech.map((t, ti) => (
                <span
                  key={ti}
                  className="px-2 py-0.5 rounded text-[9.5px] font-mono text-slate-300 bg-white/5 border border-white/10"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
