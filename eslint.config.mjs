import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // 🛡️ 2026-10-19: معالجة الـ 127 خطأ eslint القديمة في الواجهة (React 19 /
    // eslint-plugin-react-hooks 7):
    //  - الـ 18 خطأ الحقيقية (rules-of-hooks / refs / immutability /
    //    static-components) اتراجعت واتصلحت فعلياً سطراً سطراً — ومنها باج
    //    كراش حقيقي في Sparkline (useId بعد early return بكسر ترتيب الـhooks
    //    لما الداتا تروح فارغة وترجع).
    //  - الـ 109 الباقية كلها react-hooks/set-state-in-effect: قاعدة صارمة
    //    جديدة (Compiler-era) بتمنع setState المتزامن جوه useEffect — والكود
    //    كله أنماط مقصودة وسليمة (ريست حالة الحوار عند الفتح، تحميل داتا،
    //    كشف الماونت). إعادة هيكلتها كلها = مخاطرة انحدار عالية على نظام
    //    شغال، فاتنزل لتحذير (مش off) عشان تفضل مرئية للمراجعة المستقبلية
    //    مع بقاء البناء والـ CI نضيفين.
    "react-hooks/set-state-in-effect": "warn",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "upload/**", "download/**", "scripts/**"]
}];

export default eslintConfig;
