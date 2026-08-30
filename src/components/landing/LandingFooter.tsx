const FOOTER_LINKS = {
  Product: ['Smart Routing', 'Rate Shopping', 'Order Split', 'Reconciliation', 'Analytics'],
  Integrations: ['GHN API', 'GHTK API', 'Viettel Post', 'Ninja Van', 'Webhook SDK'],
  Resources: ['API Documentation', 'Developer Guide', 'System Status', 'Changelog'],
  Company: ['About SmartChain', 'Careers', 'Contact'],
} as const;

export default function LandingFooter() {
  return (
    <footer
      className="relative border-t py-20 px-4 md:px-8 lg:px-16"
      style={{
        background: '#050B14',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          {/* Brand block */}
          <div className="lg:col-span-1">
            <a href="/" className="flex items-center gap-2.5 mb-4">
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm"
                style={{ background: '#00E599', color: '#050B14' }}
              >
                SC
              </span>
              <span
                className="font-bold text-white"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Smart<span style={{ color: '#00E599' }}>Chain</span>
              </span>
            </a>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[22ch]">
              Automated Logistics Orchestration System cho e-commerce enterprise Việt Nam.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4
                className="text-sm font-semibold text-white mb-4"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-gray-500 hover:text-white transition-colors duration-200"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs text-gray-600">
            © 2026 SmartChain · SEP490 SE_34 · FPT University Da Nang
          </p>
          <div className="flex items-center gap-6">
            {['Privacy Policy', 'Terms of Service', 'API Terms'].map((l) => (
              <a
                key={l}
                href="#"
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
