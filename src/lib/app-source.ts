// The app's slug, as one exported value.
//
// The payment helper and the payment create route each declare their OWN copy
// of this string — the drift `tec-template-base` created this file to prevent,
// and which every app cloned before it existed. They are deliberately NOT
// touched here: rewriting a live payment path is its own change with its own
// blast radius, and this one is about counting visits honestly.
//
// So this is the canonical place now, and pointing those two at it is a small
// follow-up with an obvious target rather than a search.
export const APP_SOURCE = 'explorer';
