import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import '../styles/globals.css';

/**
 * App root.
 *
 * Notes:
 *  - We export the router (not JSX) so React Router v6 can manage data loading.
 *  - Theme + locale are applied in AppProviders (mounted inside router tree).
 *  - PWA registration handled automatically by VitePWA plugin.
 */
export function App() {
  return <RouterProvider router={router} />;
}
