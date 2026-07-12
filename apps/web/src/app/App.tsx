import { AppRouter } from './router';
import '../styles/globals.css';

/**
 * App root.
 *
 * Notes:
 *  - AppRouter wraps the router tree in AppProviders (QueryClientProvider, Toaster, etc.)
 *    then renders RouterProvider inside it, so every route has access to React Query,
 *    theme/locale sync, and the other app-level providers.
 *  - PWA registration handled automatically by VitePWA plugin.
 */
export function App() {
  return <AppRouter />;
}
