// ضعه مرة واحدة داخل <body> في app/layout.tsx:  <SiteJsonLd />
// وفي الصفحة الرئيسية بعد قسم الأسئلة: <FaqJsonLd items={faqs} />
import { SITE_URL, SITE_NAME, SITE_NAME_AR, SITE_DESCRIPTION, WHATSAPP } from "@/lib/site";

const graph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      alternateName: SITE_NAME_AR,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      contactPoint: {
        "@type": "ContactPoint",
        telephone: WHATSAPP,
        contactType: "customer support",
        availableLanguage: ["Arabic"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: "ar",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS, Windows, macOS",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#org` },
      offers: [
        { "@type": "Offer", name: "أساسية - موبايل وكمبيوتر", price: "299", priceCurrency: "EGP" },
        { "@type": "Offer", name: "احترافية - موبايل وكمبيوتر", price: "599", priceCurrency: "EGP" },
        { "@type": "Offer", name: "أساسية - ملابس وأحذية", price: "349", priceCurrency: "EGP" },
        { "@type": "Offer", name: "احترافية - ملابس وأحذية", price: "699", priceCurrency: "EGP" },
      ],
      // aggregateRating اتشال: تقييمات غير حقيقية = عقوبة يدوية من جوجل. رجّعه لما يبقى عندك تقييمات فعلية ظاهرة في الصفحة.
    },
  ],
};

export function SiteJsonLd() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />;
}

export function FaqJsonLd({ items }: { items: { q: string; a: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
