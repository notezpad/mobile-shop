POS v2 — Phase 3 (cumulative: includes Phases 0 + 1 + 2)

1) Extract over the project root (same paths).
2) prisma/schema.prisma — apply prisma-schema.patch (covers Phase 2 AND 3 changes; skip hunks you already applied):
      Sale:   subtotal, discount, note, clientRef, @@unique([tenantId, clientRef])      (Phase 2)
      Tenant: posRequireShift, posEmployeeMaxDiscountPct, posManagerPinHash,
              posPinFailCount, posPinLockedUntil, cashShifts relation                    (Phase 3)
      model CashShift                                                                    (Phase 3)
3) Run BOTH migrations (in order) BEFORE deploying the code, then `npx prisma generate`:
      prisma/migrations/20260929_pos_v2_discount_note_clientref/migration.sql
      prisma/migrations/20260930_pos_v3_shifts_and_approval/migration.sql
   (additive only — every new column is nullable/defaulted; nothing existing changes)
4) Tests:  bun test src/lib/pos      bun test tests/pos   (run tests/pos on its own — it mocks modules process-wide)
5) Try v2: /pos?pos=v2     Roll back: /pos?pos=legacy
6) Turn the new rules on (manager only): POS → ⋮ menu → "إعدادات نقطة البيع"
      - set the manager PIN FIRST, then the cashier discount limit (a limit with no PIN blocks cashiers above it)
