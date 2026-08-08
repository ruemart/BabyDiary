/**
 * What the app calls itself: the child's name.
 *
 * An app for one particular child has no business carrying a product name. On the home
 * screen next to Messages and Camera it says "Robin", and that is both the shortest true
 * label and the one nobody has to be talked into. It also settles an argument the
 * project name kept starting.
 *
 * Nothing extra is typed for it — the name is already asked for when setting up, and it
 * follows a rename in Settings. Before a child exists there is nothing to be named
 * after, and the generic name below stands in: on the invite screen, in the browser tab
 * of a device that has not been set up, and in the install prompt.
 */
export const GENERIC_APP_NAME = "Baby Diary";

export function appName(childName?: string | null): string {
  // Long names are not shortened here: iOS truncates a home-screen label itself, and in
  // a browser tab the full name is wanted. A rule of our own would only be worse at both.
  return childName?.trim() || GENERIC_APP_NAME;
}
