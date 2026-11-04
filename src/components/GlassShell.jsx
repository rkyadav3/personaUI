import 'open-glass-ui/styles.css';
import { GlassSystemProvider } from 'open-glass-ui';
import Backdrop from './Backdrop.jsx';

/** One provider + wallpaper for every admin-style page (layout, login, public profile). */
export default function GlassShell({ children, studio = false }) {
  return (
    <GlassSystemProvider renderer="auto" theme={{ appearance: 'light', theme: { preset: 'violet' } }}>
      {!studio && <Backdrop />}
      {children}
    </GlassSystemProvider>
  );
}
