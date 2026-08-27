/**
 * Ambient declarations for non-code imports.
 *
 * Next.js already declares `*.css` through `next-env.d.ts`, but TypeScript 7
 * added TS2882 — a SIDE-EFFECT import (`import './x.css'`, no bindings) now
 * needs a module declaration of its own, and the wildcard Next provides is not
 * matched for that form.
 *
 * Declared here rather than in `next-env.d.ts`, which is generated and carries
 * a "should not be edited" notice.
 */
declare module '*.css';
declare module '*.scss';
