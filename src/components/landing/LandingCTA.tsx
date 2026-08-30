import { motion } from 'motion/react';

export default function LandingCTA() {
  return (
    <section
      className="relative py-40 px-4 overflow-hidden"
      style={{ background: '#050B14' }}
      aria-labelledby="cta-headline"
    >
      {/* Background orbs */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 55% 55% at 50% 50%, rgba(0,229,153,0.09) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: 'rgba(0,180,255,0.05)',
          filter: 'blur(80px)',
        }}
      />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Headline */}
        <motion.h2
          id="cta-headline"
          className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-white leading-none mb-6"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Sẵn sàng làm chủ
          <br />
          <span style={{ color: '#00E599', textShadow: '0 0 60px rgba(0,229,153,0.35)' }}>
            chuỗi cung ứng?
          </span>
        </motion.h2>

        <motion.p
          className="text-gray-400 leading-relaxed text-lg mb-12 max-w-[48ch] mx-auto"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.65, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          Tham gia cùng các doanh nghiệp đang vận hành hàng nghìn đơn hàng mỗi ngày với SmartChain — không còn kẹt đơn, không còn lệch tiền.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-4"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.65, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <a
            href="/login"
            className="group flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-base active:scale-[0.97] transition-all"
            style={{
              background: '#00E599',
              color: '#050B14',
              boxShadow: '0 0 40px rgba(0,229,153,0.4)',
              transitionDuration: '400ms',
              transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            Bắt đầu dùng SmartChain
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center bg-black/15 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300"
              aria-hidden="true"
            >
              →
            </span>
          </a>
          <a
            href="#features"
            className="flex items-center gap-2 px-8 py-4 rounded-full text-sm font-medium text-white border border-white/15 hover:border-white/40 transition-all"
            style={{
              transitionDuration: '400ms',
              transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            Xem tài liệu kỹ thuật
          </a>
        </motion.div>

        {/* Trust note */}
        <motion.p
          className="mt-8 text-xs text-gray-600"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          Không yêu cầu thẻ tín dụng · Hỗ trợ onboarding miễn phí 30 ngày
        </motion.p>
      </div>
    </section>
  );
}
