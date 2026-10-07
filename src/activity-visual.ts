import type { Activity } from "./default-activity";

/** One shared source for both teacher previews and student activity cards. */
export function activityCover(activity: Activity): string {
  if (activity.coverImageUrl) return activity.coverImageUrl;
  if (activity.imageUrl) return activity.imageUrl;
  const candidates = [
    ...(activity.pairs || []).flatMap(pair => [pair.left?.imageUrl, pair.right?.imageUrl]),
    ...(activity.questions || []).map(item => item.imageUrl),
    ...(activity.items || []).map(item => item.imageUrl),
    ...(activity.steps || []).map(item => item.imageUrl),
    ...(activity.sentences || []).map(item => item.imageUrl),
    ...(activity.wheelEntries || []).map(item => item.imageUrl),
  ];
  return candidates.find((image): image is string => Boolean(image)) || "";
}

export function activityTheme(activity: Activity): NonNullable<Activity["cardTheme"]> {
  return activity.cardTheme || "mint";
}
