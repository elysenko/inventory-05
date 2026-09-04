/**
 * Build-time constant injected by the Angular `define` option (see angular.json).
 *
 *   - default / production build : `false`  → every `if (COLOSSUS_PREVIEW)` branch
 *                                             is dead-code-eliminated from the bundle.
 *   - `mockup` configuration      : `true`  → static-preview affordances are compiled in.
 *
 * It is deliberately a build-time literal rather than an `environment.preview`
 * flag so preview-only code cannot ship to production.
 */
declare const COLOSSUS_PREVIEW: boolean;
