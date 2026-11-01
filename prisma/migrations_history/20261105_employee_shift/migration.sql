-- 🕐 (التحديث الحادي والعشرين) وردية الموظف — ربط الموظف بوردية من ورديات
-- فرعه المعرّفة (صباحي/مسائي/ليلي...). اسم نصي snapshot زي نمط ShiftSession
-- و ShiftClosure — بدون علاقة FK لأن ورديات الفرع مخزّنة JSON على Branch.
-- بتتحدد من شاشة الموظفين، وبتظهر للموظف في صفحة «ملفي».

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "shiftName" TEXT;
