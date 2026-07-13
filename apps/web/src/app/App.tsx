import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AppProviders } from './providers/AppProviders';
import '../styles/globals.css';

/**
 * App root.
 *
 * AppProviders wraps RouterProvider so that QueryClientProvider,
 * Toaster, PWA prompts, and Realtime sync are available globally
 * — even before any route loads.
 */
export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
