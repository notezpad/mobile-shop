/**
 * Placeholder for Supabase generated types.
 *
 * Will be generated via `pnpm db:gen-types` after linking the Supabase project:
 *   supabase gen types typescript --linked > ./src/generated/database.types.ts
 *
 * Until then, this permissive definition lets the worker compile against our
 * shared types. All row types are inferred as `Record<string, unknown>`-ish,
 * so services must cast results to the concrete types from @mobile-shop/shared.
 */
export type Database = {
  public: {
    Tables: {
      [_ in string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: unknown[];
      };
    };
    Views: {
      [_ in string]: {
        Row: Record<string, unknown>;
        Relationships: unknown[];
      };
    };
    Functions: {
      [_ in string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      [_ in string]: string;
    };
    CompositeTypes: {
      [_ in string]: {
        [_ in string]: unknown;
      };
    };
  };
};
