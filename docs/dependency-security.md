# Dependency verification

Updated Vite to 7.3.8 with the compatible React plugin 5.2.0 and React Router to 7.18.5. Runtime is pinned to Node 24.x for Vercel and local development.

Quill 2.0.3 has an HTML-export XSS advisory. The react-quill-new wrapper remains on 3.8.3 with an override to the unaffected Quill 2.0.2 release; this preserves the existing editor API. Revisit the override when upstream publishes a patched release.

Verification: npm audit reports zero vulnerabilities; 537 regression tests and production build pass. The actual rich text editor opened and accepted an edited draft in the local browser.

The pasted Vercel log reached Build Completed and Deploying outputs. Its cache-dir and install-script approval messages were warnings rather than application build failures; the excerpt did not show the final deployment result.
