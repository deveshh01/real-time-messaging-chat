/**
 * Ambient fallback types for `@tensorflow/tfjs-node` and `nsfwjs`.
 *
 * Both are optionalDependencies (native modules) used ONLY inside
 * src/server/services/moderation/image/nsfwProvider.ts via a webpack-ignored
 * dynamic import, specifically so the app builds and runs even when they
 * aren't installed (moderation then fails closed at runtime instead of
 * failing the build). TypeScript's module resolution still needs *some*
 * type for the module specifier at compile time, though -- without this file,
 * `tsc`/`next build`'s type-check step fails with "Cannot find module ... or
 * its corresponding type declarations" whenever these packages are absent.
 *
 * TypeScript prefers a real package's own shipped types over this ambient
 * declaration when the package IS installed and resolvable, so this is a
 * pure fallback and never hides a genuine type error in installed code.
 */
declare module "@tensorflow/tfjs-node" {
  const tfjsNode: any;
  export = tfjsNode;
}

declare module "nsfwjs" {
  const nsfwjs: any;
  export = nsfwjs;
}
