/**
 * Build-time preview flag, exposed as an ordinary module export.
 *
 * The Angular builder replaces the bare `COLOSSUS_PREVIEW` identifier via
 * `define` in angular.json (`false` for production, `true` for the `mockup`
 * configuration), so the branches below are still dead-code-eliminated.
 *
 * The declaration is local to this module rather than relying solely on the
 * ambient one in `src/preview.d.ts`: an ambient global only type-checks when the
 * `.d.ts` happens to be part of the compilation, which is not guaranteed for
 * every `tsc --noEmit` invocation (an explicit file list, for instance, drops
 * it and every call site fails with TS2304). Importing `IS_PREVIEW` makes the
 * declaration travel with the import, so any file set compiles.
 *
 * `typeof` guards the lookup so an unreplaced build (plain `tsc`, a bare unit
 * test runner) evaluates to `false` instead of throwing a ReferenceError.
 */
declare const COLOSSUS_PREVIEW: boolean;

export const IS_PREVIEW: boolean =
  typeof COLOSSUS_PREVIEW !== 'undefined' && COLOSSUS_PREVIEW === true;
