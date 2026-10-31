import 'open-glass-ui/styles.css';
import { GlassSystemProvider } from 'open-glass-ui';
import Backdrop from './Backdrop.jsx';

/** One provider + wallpaper for every admin-style page (layout, login, public profile). */
export default function GlassShell({ children }) {
  return (
    <GlassSystemProvider renderer="auto" theme={{ appearance: 'dark', theme: { preset: 'teal' } }}>
      <Backdrop />
      {children}
    </GlassSystemProvider>
  );
}
