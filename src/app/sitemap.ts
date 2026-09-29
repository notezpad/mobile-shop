import type { MetadataRoute } from "next";
import { SITE_URL, PAGES } from "@/lib/site";

// تاريخ ثابت — حدّثه لما تعدّل المحتوى (التاريخ المتغير كل ساعة بيخلي جوجل يتجاهله)
const LAST_UPDATED = new Date("2026-09-29");

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: LAST_UPDATED,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
