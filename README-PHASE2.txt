POS v2 — Phase 2 (cumulative: includes Phases 0 + 1)

1) Extract over the project root (same paths).
2) prisma/schema.prisma — apply the small block (Sale: subtotal, discount, note, clientRef + @@unique):
      git apply prisma-schema.patch      (or copy the 5 fields + the @@unique line by hand)
3) Run the migration BEFORE deploying the API:
      prisma/migrations/20260929_pos_v2_discount_note_clientref/migration.sql   (additive only)
   then: npx prisma generate
4) Tests:   bun test src/lib/pos     and     bun test tests/pos   (run the second one alone)
5) Try v2:  /pos?pos=v2      Roll back: /pos?pos=legacy
