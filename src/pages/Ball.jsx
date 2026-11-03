import PublicProfile from './PublicProfile.jsx';

/**
 * Unified single-page experience combining both the Persona Chatbot and the Public Profile.
 * Visiting /u/:slug opens the unified page with initial focus on the AI Assistant.
 */
export default function Ball() {
  return <PublicProfile initialChatFocus={true} />;
}
