🚀 1. Cấu hình Next.js chuẩn production
✅ Nên dùng:
App Router (/app) thay vì /pages
Server Components (giảm JS bundle)
Static Generation (SSG) nếu nội dung không đổi
Edge runtime nếu cần tốc độ global
Ví dụ cấu trúc:
app/
  layout.tsx
  page.tsx
  (landing)/
    page.tsx
⚡ 2. Tối ưu tốc độ load (Core Web Vitals)
🔥 Những thứ bắt buộc:
Dùng next/image
Lazy load component nặng (dynamic import)
Không dùng quá nhiều client component
Font: dùng next/font (không load từ Google trực tiếp)
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })
⚠️ Sai lầm phổ biến:
Import library lớn (moment, lodash full)
Render quá nhiều JS ở client
Không cache API
🔍 3. SEO chuẩn (rất quan trọng)
Dùng metadata trong App Router:
export const metadata = {
  title: "Landing Page",
  description: "Mô tả chuẩn SEO",
  openGraph: {
    title: "Landing Page",
    description: "Mô tả OG",
    images: ["/og-image.png"],
  },
}
Bắt buộc phải có:
<h1> duy nhất
Semantic HTML (section, article…)
Sitemap.xml
Robots.txt
🧠 4. Rendering strategy (quyết định performance)
Loại	Khi dùng
SSG	Landing page, blog
SSR	Data dynamic
ISR	Update định kỳ

👉 Landing page → SSG + cache CDN

📦 5. Bundle tối ưu

Dùng:

next build
next analyze (bundle size)
🧪 6. Tool test performance & SEO
🔹 1. Google Lighthouse
Có sẵn trong Chrome DevTools
Test:
Performance
SEO
Accessibility
🔹 2. PageSpeed Insights
Test thực tế (field data)
Rất quan trọng cho SEO
🔹 3. GTmetrix
Xem waterfall (file load)
🔹 4. WebPageTest
Test từ nhiều location
🧩 7. Tips nâng cao (pro-level)
CDN: dùng Vercel hoặc Cloudflare
Enable caching header:
Cache-Control: public, max-age=31536000, immutable
Prefetch link:
<Link href="/pricing" prefetch>
Critical CSS (Next đã optimize khá tốt)
🧱 8. Checklist production-ready

✔ TTFB < 200ms
✔ LCP < 2.5s
✔ CLS ~ 0
✔ JS bundle < 200kb (ideal)
✔ Image WebP / AVIF
✔ Không blocking script

👉 Nếu bạn muốn tối ưu sâu hơn

Mình có thể:

Review code Next.js của bạn
Setup boilerplate chuẩn SEO + performance
Hoặc build sẵn landing page template production-ready