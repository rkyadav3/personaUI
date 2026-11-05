/** Leave room for the panel's lower edge inside the visible viewport, including an open keyboard. */
export function chatPanelHeight(top, { height, offsetTop = 0 }) {
  return Math.max(200, Math.round(height + offsetTop - top - 16));
}

export const shouldSubmitChat = event => event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229;
