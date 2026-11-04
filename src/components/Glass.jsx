// Drop-in replacement for open-glass-ui's <Glass>: same props (`as`, className, style), now the liquid-glass material.
import LiquidGlass from './LiquidGlass.jsx';
export const Glass = ({ material, ...p }) => <LiquidGlass {...p} />;
export default Glass;
