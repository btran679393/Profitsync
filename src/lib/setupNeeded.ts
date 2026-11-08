// When a feature's one-time database update hasn't been run yet: tell the
// developer how to fix it (server log only) and give the customer a plain
// message with no technical details.
export function setupNeeded(feature: string, sqlFile: string) {
  console.error(`Setup needed for "${feature}": run ${sqlFile} in Supabase → SQL Editor.`);
  return `${feature} ${/s$/.test(feature) ? "aren't" : "isn't"} available yet. Please try again later.`;
}
